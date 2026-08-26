//! CTAPHID over a byte port — the framing conversation, generic over the wire.
//!
//! [`super::hid`] is the packet layer: split a message into 64-byte reports,
//! reassemble one from reports, name a status. This module is the *exchange*
//! above it — allocate a channel with `INIT`, write the reports, read until a
//! whole message comes back, absorb keepalives and surface the one honest
//! moment to say "touch your key". It is exactly the loop that grew up in the
//! desktop client's `usb.rs`, lifted so Android's `android.hardware.usb` path
//! drives the *same* framing instead of re-writing it in Kotlin.
//!
//! The transport is a [`HidPort`]: write one 64-byte report, read one (with a
//! deadline it owns, because a timeout is I/O and the core has no clock), and
//! say what the device is called. A desktop `hidapi` handle is one; an Android
//! USB connection is another. Everything a person or a protocol decides — when
//! to retry, what a status means, whether a credential is discoverable — lives
//! above this, in [`super::ceremony`].

use crate::ctap::commands::{split_response, Status};
use crate::ctap::hid::{
    self, CtapHidCommand, HidError, Message, Reassembler, BROADCAST_CHANNEL, HID_REPORT_SIZE,
};
use crate::ctap::ceremony::{Cable, CableError, TouchAnnouncer, TouchKind};

/// `KEEPALIVE` status byte: the authenticator is waiting for user presence.
/// The one moment a client can honestly say "touch your key".
const KEEPALIVE_UP_NEEDED: u8 = 0x02;

/// Reading a report timed out at the transport, without the whole exchange
/// having timed out. Returned by [`HidPort::read_report`] so the cable can
/// tell "nothing yet, keep waiting" from "the device is gone".
#[derive(Debug)]
pub enum PortError {
    /// No report arrived within this read's slice. Not fatal — the cable loops
    /// until its own overall deadline.
    WouldBlock,
    /// The whole exchange budget is spent. The device stopped answering.
    TimedOut,
    /// The transport failed in its own words (a closed device, a USB error).
    Io(String),
}

/// One 64-byte-report conversation with one authenticator.
///
/// The port owns exactly the I/O: moving 64 bytes each way, and the clock that
/// decides when a read has waited long enough. It owns no protocol — framing,
/// channel allocation and keepalive handling are [`HidCable`]'s, so every
/// transport gets them identically.
pub trait HidPort {
    /// Write one 64-byte report. The report is the CTAPHID packet with NO
    /// report-id byte — a transport that needs one (hidapi does) prepends its
    /// own, because whether there is a report id is the transport's fact.
    fn write_report(&mut self, report: &[u8; HID_REPORT_SIZE]) -> Result<(), PortError>;
    /// Read one 64-byte report, blocking up to the port's own read slice.
    /// [`PortError::WouldBlock`] means the slice elapsed with nothing to read;
    /// the cable loops until the overall exchange deadline, which the port
    /// signals with [`PortError::TimedOut`].
    fn read_report(&mut self) -> Result<[u8; HID_REPORT_SIZE], PortError>;
    /// The device's product string, for the sentence a failure shows.
    fn product(&self) -> &str;
    /// A stable identity — a HID path, a USB address. For the PIN cache, never
    /// shown.
    fn path(&self) -> &str;
}

/// A CTAPHID cable: a port that has been through `INIT` and holds its channel.
pub struct HidCable<P: HidPort> {
    port: P,
    channel: u32,
    /// Set by the ceremony per exchange (via [`Cable::exchange`]); the cable
    /// carries it into the keepalive handler. A cable does not know which
    /// physical act a request will ask for — the ceremony does.
    touch: Option<TouchKind>,
    /// Reported through the `Cable` seam so the ceremony's `Host::note` can log
    /// the keepalive → touch transition without the cable holding a `Host`.
    on_touch: Option<TouchAnnouncer>,
}

impl<P: HidPort> HidCable<P> {
    /// Open the conversation: `CTAPHID_INIT` on the broadcast channel, echoing
    /// `nonce`, and adopt the channel the device allocates.
    ///
    /// The nonce echo is checked. Two clients can talk to one key at once — a
    /// browser and this app — and both see every broadcast reply; without the
    /// check this client would adopt the OTHER client's channel and interleave
    /// with it. `nonce` is the caller's (the shell's randomness); the core has
    /// none of its own.
    pub fn open(port: P, nonce: [u8; 8]) -> Result<Self, CableError> {
        // The channel is BROADCAST until `INIT` allocates one; `exchange_raw`
        // reads `self.channel`, so it is already correct for the INIT itself.
        let mut cable = Self {
            port,
            channel: BROADCAST_CHANNEL,
            touch: None,
            on_touch: None,
        };
        let reply = cable.exchange_raw(CtapHidCommand::Init, &nonce)?;
        if reply.len() < 17 || reply[..8] != nonce {
            return Err(CableError::Other(
                "CTAPHID_INIT reply did not echo the nonce".to_owned(),
            ));
        }
        cable.channel = u32::from_be_bytes([reply[8], reply[9], reply[10], reply[11]]);
        Ok(cable)
    }

    /// Register a callback fired once per exchange the first time the device
    /// asks for user presence — the "touch your key" moment. Optional: the
    /// desktop announces it on a screen, a test ignores it.
    pub fn on_touch(&mut self, callback: TouchAnnouncer) {
        self.on_touch = Some(callback);
    }

    /// A silent CTAP2 exchange with no touch announcement — the credential
    /// probe (`up: false`) a targeted open uses, and the `authenticatorSelection`
    /// request a race sends. Exposed so a transport's device-selection logic
    /// can reach it without going through the ceremony.
    pub fn cbor_silent(&mut self, request: &[u8]) -> Result<Vec<u8>, CableError> {
        self.touch = None;
        self.cbor(request)
    }

    fn cbor(&mut self, request: &[u8]) -> Result<Vec<u8>, CableError> {
        let payload = self.exchange_raw(CtapHidCommand::Cbor, request)?;
        let (status, body) = split_response(&payload)
            .map_err(|error| CableError::Other(format!("not a CTAP2 message: {error:?}")))?;
        if !status.is_success() {
            return Err(CableError::Ctap(status));
        }
        Ok(body.to_vec())
    }

    /// One request out, one message back, keepalives absorbed. The touch
    /// announcement (if any) fires on the first `UP_NEEDED` keepalive and is
    /// withdrawn when the exchange ends however it ends.
    fn exchange_raw(
        &mut self,
        command: CtapHidCommand,
        payload: &[u8],
    ) -> Result<Vec<u8>, CableError> {
        let frames =
            hid::encode(self.channel, command, payload).map_err(framing)?;
        for frame in &frames {
            self.port.write_report(frame).map_err(port_error)?;
        }

        let mut reassembler = Reassembler::new();
        let mut announced_touch = false;

        let outcome = loop {
            let report = match self.port.read_report() {
                Ok(report) => report,
                Err(PortError::WouldBlock) => continue,
                Err(PortError::TimedOut) => break Err(CableError::TimedOut),
                Err(PortError::Io(detail)) => break Err(CableError::Other(detail)),
            };

            match reassembler.push(&report) {
                Ok(None) => continue,
                Ok(Some(Message {
                    command: CtapHidCommand::KeepAlive,
                    payload,
                    ..
                })) => {
                    if payload.first() == Some(&KEEPALIVE_UP_NEEDED) && !announced_touch {
                        announced_touch = true;
                        if let (Some(kind), Some(callback)) =
                            (self.touch, self.on_touch.as_mut())
                        {
                            callback(kind, self.port.product());
                        }
                    }
                    continue;
                }
                Ok(Some(Message {
                    command: CtapHidCommand::Error,
                    payload,
                    ..
                })) => {
                    break Err(CableError::Ctap(Status::from_byte(
                        payload.first().copied().unwrap_or(0x7f),
                    )));
                }
                Ok(Some(message)) => break Ok(message.payload),
                Err(error) => break Err(framing(error)),
            }
        };

        // The prompt is withdrawn by the ceremony (the exchange returning IS
        // the end of the touch moment); a cable draws no UI, so there is
        // nothing to take down here.
        let _ = announced_touch;
        outcome
    }

    /// Best-effort `CTAPHID_CANCEL`. Sent when a person walks away from a
    /// blinking key; a failed cancel is not worth its own error.
    fn cancel_raw(&mut self) {
        if let Ok(frames) = hid::encode(self.channel, CtapHidCommand::Cancel, &[]) {
            for frame in &frames {
                let _ = self.port.write_report(frame);
            }
        }
    }
}

impl<P: HidPort> Cable for HidCable<P> {
    fn exchange(
        &mut self,
        request: &[u8],
        touch: Option<TouchKind>,
    ) -> Result<Vec<u8>, CableError> {
        self.touch = touch;
        self.cbor(request)
    }

    fn cancel(&mut self) {
        self.cancel_raw();
    }

    fn product(&self) -> &str {
        self.port.product()
    }

    fn path(&self) -> &str {
        self.port.path()
    }
}

fn framing(error: HidError) -> CableError {
    CableError::Other(format!("CTAPHID framing error: {error:?}"))
}

fn port_error(error: PortError) -> CableError {
    match error {
        // A write that reports WouldBlock is a device that will not take the
        // report; treat it as gone rather than spin.
        PortError::TimedOut | PortError::WouldBlock => CableError::TimedOut,
        PortError::Io(detail) => CableError::Other(detail),
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
mod tests {
    use super::*;
    use crate::ctap::commands::get_info_request;
    use std::collections::VecDeque;

    /// A scripted port: it hands back reports from a queue and records what was
    /// written, so the framing conversation can be exercised with no hardware.
    struct FakePort {
        outbox: Vec<[u8; HID_REPORT_SIZE]>,
        inbox: VecDeque<Result<[u8; HID_REPORT_SIZE], PortError>>,
    }

    impl FakePort {
        fn new() -> Self {
            Self {
                outbox: Vec::new(),
                inbox: VecDeque::new(),
            }
        }
        fn reply(&mut self, report: [u8; HID_REPORT_SIZE]) {
            self.inbox.push_back(Ok(report));
        }
    }

    impl HidPort for FakePort {
        fn write_report(&mut self, report: &[u8; HID_REPORT_SIZE]) -> Result<(), PortError> {
            self.outbox.push(*report);
            Ok(())
        }
        fn read_report(&mut self) -> Result<[u8; HID_REPORT_SIZE], PortError> {
            self.inbox.pop_front().unwrap_or(Err(PortError::TimedOut))
        }
        fn product(&self) -> &str {
            "Fake Key"
        }
        fn path(&self) -> &str {
            "fake:0"
        }
    }

    /// Build an init-packet report on `channel` carrying `command` and `body`
    /// (short enough to fit one report), the way a device answers.
    fn init_report(channel: u32, command: CtapHidCommand, body: &[u8]) -> [u8; HID_REPORT_SIZE] {
        let mut report = [0u8; HID_REPORT_SIZE];
        report[0..4].copy_from_slice(&channel.to_be_bytes());
        report[4] = 0x80 | command as u8;
        report[5..7].copy_from_slice(&(body.len() as u16).to_be_bytes());
        report[7..7 + body.len()].copy_from_slice(body);
        report
    }

    const ALLOCATED: u32 = 0x0a0b_0c0d;

    fn init_reply(nonce: [u8; 8]) -> [u8; HID_REPORT_SIZE] {
        let mut body = nonce.to_vec();
        body.extend_from_slice(&ALLOCATED.to_be_bytes()); // channel
        body.extend_from_slice(&[0x02, 0x01, 0x00, 0x00, 0x00]); // proto/ver/caps
        init_report(BROADCAST_CHANNEL, CtapHidCommand::Init, &body)
    }

    fn open_fake(nonce: [u8; 8]) -> HidCable<FakePort> {
        let mut port = FakePort::new();
        port.reply(init_reply(nonce));
        HidCable::open(port, nonce).expect("INIT")
    }

    #[test]
    fn init_checks_the_nonce_echo_and_adopts_the_channel() {
        let cable = open_fake([0x11; 8]);
        assert_eq!(cable.channel, ALLOCATED);
        assert_eq!(cable.product(), "Fake Key");
    }

    #[test]
    fn a_wrong_nonce_echo_is_refused() {
        let mut port = FakePort::new();
        port.reply(init_reply([0x99; 8])); // device echoes a DIFFERENT nonce
        let opened = HidCable::open(port, [0x11; 8]);
        assert!(matches!(opened, Err(CableError::Other(_))));
    }

    #[test]
    fn a_cbor_success_returns_the_body_without_the_status_byte() {
        let mut cable = open_fake([0x22; 8]);
        // A CBOR response: status 0x00 (success) then a one-byte body.
        cable.port.reply(init_report(
            ALLOCATED,
            CtapHidCommand::Cbor,
            &[0x00, 0xa0],
        ));
        let body = cable.exchange(&get_info_request().unwrap(), None).unwrap();
        assert_eq!(body, vec![0xa0]);
    }

    #[test]
    fn a_cbor_error_status_becomes_a_ctap_error() {
        let mut cable = open_fake([0x33; 8]);
        // status 0x31 = PIN_INVALID → Status::PinRequired in this codebase's map.
        cable.port.reply(init_report(ALLOCATED, CtapHidCommand::Cbor, &[0x31]));
        let result = cable.exchange(&get_info_request().unwrap(), None);
        assert!(matches!(result, Err(CableError::Ctap(_))));
    }

    #[test]
    fn a_keepalive_is_absorbed_and_fires_the_touch_once() {
        let mut cable = open_fake([0x44; 8]);
        let fired = std::rc::Rc::new(std::cell::Cell::new(0));
        let seen = std::rc::Rc::clone(&fired);
        cable.on_touch(Box::new(move |_kind, _product| {
            seen.set(seen.get() + 1);
        }));
        // Two UP_NEEDED keepalives, then the real answer.
        cable
            .port
            .reply(init_report(ALLOCATED, CtapHidCommand::KeepAlive, &[KEEPALIVE_UP_NEEDED]));
        cable
            .port
            .reply(init_report(ALLOCATED, CtapHidCommand::KeepAlive, &[KEEPALIVE_UP_NEEDED]));
        cable
            .port
            .reply(init_report(ALLOCATED, CtapHidCommand::Cbor, &[0x00]));
        let body = cable
            .exchange(&get_info_request().unwrap(), Some(TouchKind::Presence))
            .unwrap();
        assert!(body.is_empty());
        assert_eq!(fired.get(), 1, "the touch is announced once, not per keepalive");
    }

    #[test]
    fn a_device_that_stops_answering_times_out() {
        let mut cable = open_fake([0x55; 8]);
        // No reply queued → the port returns TimedOut.
        let result = cable.exchange(&get_info_request().unwrap(), None);
        assert!(matches!(result, Err(CableError::TimedOut)));
    }
}
