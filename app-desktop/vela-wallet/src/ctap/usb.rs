//! The USB cable, and nothing else.
//!
//! Framing and CBOR come from [`vela_core::ctap`]; this module opens the
//! device, writes 64-byte reports, reads 64-byte reports, and knows when to
//! stop waiting. If a rule about what a byte MEANS ever appears in this file,
//! it is in the wrong place — that rule belongs in the core, where the other
//! four clients can reach it too.
//!
//! ## Why HID and not raw USB
//!
//! FIDO over USB is a HID protocol. On macOS the kernel's HID driver owns the
//! device, so a raw-USB crate cannot claim the interface at all; `hidapi`
//! wraps IOKit, Linux `hidraw` and the Windows HID API behind one enumeration
//! that reports `usage_page` / `usage`, which is exactly the filter FIDO needs
//! (research D3).

use std::sync::Arc;
use std::time::{Duration, Instant};

use hidapi::{HidApi, HidDevice};

use vela_core::ctap::hid::{self, CtapHidCommand, Message, Reassembler, BROADCAST_CHANNEL};
use vela_core::ctap::{split_response, Status, HID_REPORT_SIZE};

/// The HID usage page every FIDO authenticator declares, and the usage within
/// it. A keyboard, a mouse and a webcam all also enumerate as HID devices; this
/// pair is what separates a security key from the rest of the bus.
const FIDO_USAGE_PAGE: u16 = 0xf1d0;
const FIDO_USAGE: u16 = 0x01;

/// How long one report read blocks before the loop checks its deadline again.
/// Short enough that a cancelled ceremony stops promptly, long enough not to
/// spin.
const READ_SLICE: Duration = Duration::from_millis(250);

/// How long a whole exchange may take. Long, because most of it is a person
/// noticing the key is blinking and putting a finger on it — the CTAP2 spec's
/// own user-presence budget is 30 seconds and an authenticator may renew it.
const EXCHANGE_TIMEOUT: Duration = Duration::from_secs(120);

/// What can go wrong on the cable. Everything here is a device, a driver or a
/// person walking away — the executor turns each into the failure variant the
/// operation owes, and never lets one reach the effect loop as a panic.
#[derive(Debug)]
pub enum UsbError {
    /// No FIDO authenticator is plugged in. Its own variant because it is the
    /// one failure the desktop client must be able to say in words: without a
    /// system passkey service, a missing key is not "something went wrong", it
    /// is the whole story.
    NoKeyPresent,
    /// The HID subsystem itself is unavailable — no permission to enumerate,
    /// or a driver that is not there.
    Hid(String),
    /// The device answered something CTAPHID cannot parse.
    Framing(hid::HidError),
    /// The device stopped answering.
    TimedOut,
    /// The authenticator refused: a CTAP status byte, kept as its number.
    Ctap(Status),
    /// Encoding a request failed, which means a bug in this client rather than
    /// in the device.
    Encode(String),
}

impl std::fmt::Display for UsbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NoKeyPresent => write!(f, "no security key is plugged in"),
            Self::Hid(message) => write!(f, "USB HID unavailable: {message}"),
            Self::Framing(error) => write!(f, "the security key sent a malformed reply: {error:?}"),
            Self::TimedOut => write!(f, "the security key stopped responding"),
            Self::Ctap(status) => write!(f, "the security key refused: {status:?}"),
            Self::Encode(message) => write!(f, "could not encode a CTAP2 request: {message}"),
        }
    }
}

/// Told when the authenticator is waiting for a finger, and when it stops.
///
/// A `KEEPALIVE` carrying `UP_NEEDED` is the only moment a client can honestly
/// say "touch your key" — before it, the device has not asked; after the
/// answer, the moment has passed. `Send + Sync` because the exchange runs on a
/// background thread and the screen it updates does not.
pub type TouchNotifier = Arc<dyn Fn(bool) + Send + Sync>;

/// `KEEPALIVE` status: the authenticator is waiting for user presence.
const KEEPALIVE_UP_NEEDED: u8 = 0x02;

/// One open conversation with one authenticator.
pub struct SecurityKey {
    device: HidDevice,
    channel: u32,
    /// What the device says about itself. Read once, at open: the PIN protocol
    /// and the `rk` capability both come from here, and asking twice would let
    /// a ceremony act on a different answer than the one it decided with.
    product: String,
}

impl SecurityKey {
    /// Open the first FIDO authenticator on the bus.
    ///
    /// "First" rather than "the one you meant": telling two plugged-in keys
    /// apart requires `authenticatorSelection`, which asks the person to touch
    /// one — a ceremony inside a ceremony. One key is the overwhelmingly common
    /// case and the second is a recorded follow-up, not a silent wrong guess:
    /// [`count`] lets a caller see how many are present.
    pub fn open_first(nonce: [u8; 8]) -> Result<Self, UsbError> {
        let api = HidApi::new().map_err(|error| UsbError::Hid(error.to_string()))?;
        let info = api
            .device_list()
            .find(|device| device.usage_page() == FIDO_USAGE_PAGE && device.usage() == FIDO_USAGE)
            .ok_or(UsbError::NoKeyPresent)?;
        let product = info.product_string().unwrap_or("security key").to_owned();
        let device = info
            .open_device(&api)
            .map_err(|error| UsbError::Hid(error.to_string()))?;

        let mut key = Self {
            device,
            channel: BROADCAST_CHANNEL,
            product,
        };
        key.channel = key.init(nonce)?;
        Ok(key)
    }

    /// How many FIDO authenticators are plugged in. Zero is the answer the
    /// "no key present" sheet is built around.
    pub fn count() -> usize {
        let Ok(api) = HidApi::new() else {
            return 0;
        };
        api.device_list()
            .filter(|device| device.usage_page() == FIDO_USAGE_PAGE && device.usage() == FIDO_USAGE)
            .count()
    }

    /// The device's product string, for the message a failure sheet shows.
    pub fn product(&self) -> &str {
        &self.product
    }

    /// `CTAPHID_INIT` on the broadcast channel: the device echoes the nonce and
    /// allocates a channel for the rest of the conversation.
    ///
    /// The nonce is checked. Two clients can be talking to the same key at once
    /// — a browser and this app — and both see every broadcast reply; without
    /// the echo check this client would happily adopt the OTHER client's
    /// channel and then interleave with it.
    fn init(&mut self, nonce: [u8; 8]) -> Result<u32, UsbError> {
        let reply = self.exchange(CtapHidCommand::Init, &nonce, None)?;
        if reply.len() < 17 || reply[..8] != nonce {
            return Err(UsbError::Framing(hid::HidError::Truncated {
                declared: 17,
                got: reply.len(),
            }));
        }
        Ok(u32::from_be_bytes([reply[8], reply[9], reply[10], reply[11]]))
    }

    /// Send a CTAP2 request and return its response body, or the status the
    /// authenticator refused with.
    pub fn cbor(
        &mut self,
        request: &[u8],
        touch: Option<&TouchNotifier>,
    ) -> Result<Vec<u8>, UsbError> {
        let payload = self.exchange(CtapHidCommand::Cbor, request, touch)?;
        let (status, body) = split_response(&payload).map_err(|error| {
            UsbError::Encode(format!("response is not a CTAP2 message: {error:?}"))
        })?;
        if !status.is_success() {
            return Err(UsbError::Ctap(status));
        }
        Ok(body.to_vec())
    }

    /// Tell the authenticator to abandon whatever it is waiting for.
    ///
    /// Best effort by construction: this is sent when a person walks away from
    /// a blinking key, and the only thing worse than a failed cancel is a
    /// failed cancel that becomes its own error message.
    pub fn cancel(&mut self) {
        if let Ok(frames) = hid::encode(self.channel, CtapHidCommand::Cancel, &[]) {
            for frame in frames {
                let _ = self.write(&frame);
            }
        }
    }

    /// One request out, one message back, with `KEEPALIVE` absorbed.
    fn exchange(
        &mut self,
        command: CtapHidCommand,
        payload: &[u8],
        touch: Option<&TouchNotifier>,
    ) -> Result<Vec<u8>, UsbError> {
        let frames = hid::encode(self.channel, command, payload)
            .map_err(|error| UsbError::Framing(error))?;
        for frame in &frames {
            self.write(frame)?;
        }

        let deadline = Instant::now() + EXCHANGE_TIMEOUT;
        let mut reassembler = Reassembler::new();
        let mut announced_touch = false;
        let mut report = [0u8; HID_REPORT_SIZE];

        let outcome = loop {
            if Instant::now() >= deadline {
                break Err(UsbError::TimedOut);
            }
            let read = self
                .device
                .read_timeout(&mut report, READ_SLICE.as_millis() as i32)
                .map_err(|error| UsbError::Hid(error.to_string()))?;
            if read == 0 {
                continue;
            }
            if read != HID_REPORT_SIZE {
                break Err(UsbError::Framing(hid::HidError::ReportSize(read)));
            }

            match reassembler.push(&report) {
                Ok(None) => continue,
                Ok(Some(Message {
                    command: CtapHidCommand::KeepAlive,
                    payload,
                    ..
                })) => {
                    // Not an answer — the device asking for more time, and
                    // (with UP_NEEDED) the one honest moment to say "touch it".
                    if payload.first() == Some(&KEEPALIVE_UP_NEEDED) && !announced_touch {
                        announced_touch = true;
                        if let Some(notify) = touch {
                            notify(true);
                        }
                    }
                    continue;
                }
                Ok(Some(Message {
                    command: CtapHidCommand::Error,
                    payload,
                    ..
                })) => {
                    break Err(UsbError::Ctap(Status::from_byte(
                        payload.first().copied().unwrap_or(0x7f),
                    )));
                }
                Ok(Some(message)) => break Ok(message.payload),
                Err(error) => break Err(UsbError::Framing(error)),
            }
        };

        // Whatever happened, the key is no longer waiting for a finger. Leaving
        // a "touch your key" prompt up after a failure is how a screen ends up
        // asking for something that can no longer happen.
        if announced_touch {
            if let Some(notify) = touch {
                notify(false);
            }
        }
        outcome
    }

    /// One report out.
    ///
    /// The leading zero is a REPORT ID, not padding. `hid_write` always reads
    /// the first byte as one, and a device that uses no report ids expects 0 —
    /// drop it and every write is off by one byte, which presents as an
    /// authenticator that answers `INVALID_COMMAND` to everything.
    fn write(&self, frame: &[u8; HID_REPORT_SIZE]) -> Result<(), UsbError> {
        let mut buffer = [0u8; HID_REPORT_SIZE + 1];
        buffer[1..].copy_from_slice(frame);
        self.device
            .write(&buffer)
            .map(|_| ())
            .map_err(|error| UsbError::Hid(error.to_string()))
    }
}
