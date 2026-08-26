//! CTAP2 over ISO 7816 APDUs — the smart-card / NFC framing, generic over the
//! wire.
//!
//! FIDO has two binding families. [`super::hid_cable`] is one: 64-byte reports
//! over USB HID. This is the other: CTAP2 commands wrapped in ISO 7816-4 APDUs,
//! which is how a security key is reached over **NFC** and over **CCID** (the
//! USB-C smart-card interface). The two are byte-identical — SELECT the FIDO
//! applet, send `NFCCTAP_MSG`, poll the `0x9100` keepalive, chain long replies
//! with `GET RESPONSE` — so one cable serves iOS CCID (`TKSmartCard`), iOS NFC
//! (`CoreNFC`) and Android NFC (`IsoDep`). It was proven on device in the
//! founder's demo (`SmartCardCtapDevice.swift`); this is the port into the
//! core, so the ceremony above it is the SAME one the HID path runs.
//!
//! The transport is an [`ApduPort`]: transmit one command APDU, get back the
//! response bytes and the two status-word bytes. It does NO chaining or
//! keepalive polling itself — that loop is here, so every APDU transport gets
//! it identically. `TKSmartCard.transmit` and `NFCISO7816Tag.sendCommand` are
//! each one `transmit`.

use crate::ctap::commands::split_response;
use crate::ctap::ceremony::{Cable, CableError, TouchAnnouncer, TouchKind};

/// The FIDO applet's AID: RID `0xA000000647` ‖ PIX `0x2F0001`. `SELECT`ed once
/// when the cable opens.
pub const FIDO_AID: [u8; 8] = [0xA0, 0x00, 0x00, 0x06, 0x47, 0x2F, 0x00, 0x01];

const CLA: u8 = 0x80;
const INS_MSG: u8 = 0x10; // NFCCTAP_MSG
const INS_GET_RESPONSE: u8 = 0x11; // NFCCTAP_GETRESPONSE (keepalive poll)
const P1_MSG: u8 = 0x00; // python-fido2 uses 0x80; YubiKey accepts both, NFC uses 0x00
const SW_OK: u16 = 0x9000;
const SW_KEEPALIVE: u16 = 0x9100;
const KEEPALIVE_UP_NEEDED: u8 = 0x02;
const MAX_POLLS: usize = 300; // ~30 s at the transport's ~100 ms poll cadence

/// One APDU exchange with one card. The port owns exactly the I/O — moving one
/// command APDU out and its response in — and owns the poll delay between
/// keepalive reads (a clock is I/O; the core has none). It owns no protocol:
/// applet selection, the keepalive loop and `GET RESPONSE` chaining are
/// [`ApduCable`]'s, so NFC and CCID get them identically.
pub trait ApduPort {
    /// Transmit one command APDU; return the full response INCLUDING the two
    /// trailing status-word bytes. No 61xx chaining and no keepalive handling
    /// here — the cable drives both.
    fn transmit(&mut self, apdu: &[u8]) -> Result<Vec<u8>, ApduError>;
    /// Sleep the transport's keepalive poll interval (≈100 ms). Called only
    /// between `0x9100` keepalives — the one place the loop must wait.
    fn poll_delay(&mut self);
    /// The device's product string, for a failure's sentence.
    fn product(&self) -> &str;
    /// A stable identity, for the PIN cache. Never shown.
    fn path(&self) -> &str;
}

/// What the transport itself can report.
#[derive(Debug)]
pub enum ApduError {
    /// No reader or card is present.
    NoCard,
    /// The response was shorter than the two status-word bytes.
    Short,
    /// The transport failed in its own words.
    Io(String),
}

/// An APDU cable: a port whose FIDO applet has been selected.
pub struct ApduCable<P: ApduPort> {
    port: P,
    touch: Option<TouchKind>,
    on_touch: Option<TouchAnnouncer>,
}

impl<P: ApduPort> ApduCable<P> {
    /// Open the conversation: `SELECT` the FIDO applet. The version string it
    /// returns (`U2F_V2` / `FIDO_2_0`) is discarded — `getInfo` is the real
    /// capability probe, and it runs through the ceremony like every other
    /// command.
    pub fn open(port: P) -> Result<Self, CableError> {
        let mut cable = Self {
            port,
            touch: None,
            on_touch: None,
        };
        let apdu = {
            let mut apdu = vec![0x00, 0xA4, 0x04, 0x00, FIDO_AID.len() as u8];
            apdu.extend_from_slice(&FIDO_AID);
            apdu
        };
        let (_, sw) = cable.transceive(&apdu)?;
        if sw != SW_OK {
            return Err(CableError::Other(format!(
                "SELECT FIDO applet failed: SW={sw:04X}"
            )));
        }
        Ok(cable)
    }

    /// Register the "touch your key" callback, fired once per exchange the
    /// first time the card asks for user presence.
    pub fn on_touch(&mut self, callback: TouchAnnouncer) {
        self.on_touch = Some(callback);
    }

    /// A silent CTAP2 exchange (no touch announcement) — the credential probe a
    /// targeted open uses.
    pub fn cbor_silent(&mut self, request: &[u8]) -> Result<Vec<u8>, CableError> {
        self.touch = None;
        self.cbor(request)
    }

    fn cbor(&mut self, request: &[u8]) -> Result<Vec<u8>, CableError> {
        let payload = self.ctap_msg(request)?;
        let (status, body) = split_response(&payload)
            .map_err(|error| CableError::Other(format!("not a CTAP2 message: {error:?}")))?;
        if !status.is_success() {
            return Err(CableError::Ctap(status));
        }
        Ok(body.to_vec())
    }

    /// One `NFCCTAP_MSG`, its keepalives polled and its long reply chained.
    fn ctap_msg(&mut self, payload: &[u8]) -> Result<Vec<u8>, CableError> {
        let mut out = Vec::new();
        let mut announced_touch = false;
        let mut polls = 0usize;
        let mut apdu = Self::first_command_apdu(payload)?;

        loop {
            let (data, sw) = self.transceive(&apdu)?;
            match sw {
                SW_OK => {
                    out.extend_from_slice(&data);
                    return Ok(out);
                }
                SW_KEEPALIVE => {
                    polls += 1;
                    if polls > MAX_POLLS {
                        return Err(CableError::TimedOut);
                    }
                    if !announced_touch && data.first() == Some(&KEEPALIVE_UP_NEEDED) {
                        announced_touch = true;
                        if let (Some(kind), Some(callback)) =
                            (self.touch, self.on_touch.as_mut())
                        {
                            callback(kind, self.port.product());
                        }
                    }
                    self.port.poll_delay();
                    apdu = vec![CLA, INS_GET_RESPONSE, 0x00, 0x00, 0x00];
                }
                // 61xx: more data waiting — ISO GET RESPONSE, `xx` bytes.
                sw if (sw & 0xFF00) == 0x6100 => {
                    out.extend_from_slice(&data);
                    let le = (sw & 0xFF) as u8;
                    apdu = vec![0x00, 0xC0, 0x00, 0x00, le];
                }
                other => {
                    return Err(CableError::Other(format!(
                        "NFCCTAP_MSG returned SW={other:04X}"
                    )));
                }
            }
        }
    }

    /// The command APDU carrying the CTAP request: a short APDU when it fits,
    /// an extended-length single-shot otherwise. Mirrors the demo's binding and
    /// python-fido2. CTAP requests never exceed the extended-length ceiling in
    /// practice, so short-APDU command chaining beyond 0xFFFF is not built.
    fn first_command_apdu(payload: &[u8]) -> Result<Vec<u8>, CableError> {
        if payload.is_empty() {
            return Ok(vec![CLA, INS_MSG, P1_MSG, 0x00, 0x00]);
        }
        if payload.len() <= 0xFF {
            let mut apdu = vec![CLA, INS_MSG, P1_MSG, 0x00, payload.len() as u8];
            apdu.extend_from_slice(payload);
            apdu.push(0x00); // Le
            return Ok(apdu);
        }
        if payload.len() <= 0xFFFF {
            let lc = payload.len() as u16;
            let mut apdu = vec![CLA, INS_MSG, P1_MSG, 0x00, 0x00];
            apdu.extend_from_slice(&lc.to_be_bytes()); // extended Lc
            apdu.extend_from_slice(payload);
            apdu.extend_from_slice(&[0x00, 0x00]); // extended Le
            return Ok(apdu);
        }
        Err(CableError::Other(
            "CTAP request too large for an extended-length APDU".to_owned(),
        ))
    }

    /// One raw transmit → (data-without-SW, status word).
    fn transceive(&mut self, apdu: &[u8]) -> Result<(Vec<u8>, u16), CableError> {
        let resp = self.port.transmit(apdu).map_err(apdu_error)?;
        if resp.len() < 2 {
            return Err(CableError::Other("APDU response shorter than a status word".to_owned()));
        }
        let sw = (u16::from(resp[resp.len() - 2]) << 8) | u16::from(resp[resp.len() - 1]);
        Ok((resp[..resp.len() - 2].to_vec(), sw))
    }
}

impl<P: ApduPort> Cable for ApduCable<P> {
    fn exchange(
        &mut self,
        request: &[u8],
        touch: Option<TouchKind>,
    ) -> Result<Vec<u8>, CableError> {
        self.touch = touch;
        self.cbor(request)
    }

    // APDU transports have no channel to cancel — abandoning the card (ending
    // the session, moving it out of the field) is the only "cancel", and that
    // is the transport's, above this layer.
    fn cancel(&mut self) {}

    fn product(&self) -> &str {
        self.port.product()
    }

    fn path(&self) -> &str {
        self.port.path()
    }
}

fn apdu_error(error: ApduError) -> CableError {
    match error {
        ApduError::NoCard => CableError::NoKeyPresent,
        ApduError::Short => CableError::Other("APDU response too short".to_owned()),
        ApduError::Io(detail) => CableError::Other(detail),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ctap::commands::get_info_request;
    use std::collections::VecDeque;

    /// A scripted card: each `transmit` pops the next queued response.
    struct FakeCard {
        replies: VecDeque<Vec<u8>>,
        sent: Vec<Vec<u8>>,
        polls: usize,
    }

    impl FakeCard {
        fn new() -> Self {
            Self {
                replies: VecDeque::new(),
                sent: Vec::new(),
                polls: 0,
            }
        }
        /// Queue a response = data ‖ SW1 ‖ SW2.
        fn reply(&mut self, data: &[u8], sw: u16) {
            let mut r = data.to_vec();
            r.push((sw >> 8) as u8);
            r.push((sw & 0xFF) as u8);
            self.replies.push_back(r);
        }
    }

    impl ApduPort for FakeCard {
        fn transmit(&mut self, apdu: &[u8]) -> Result<Vec<u8>, ApduError> {
            self.sent.push(apdu.to_vec());
            self.replies.pop_front().ok_or(ApduError::NoCard)
        }
        fn poll_delay(&mut self) {
            self.polls += 1;
        }
        fn product(&self) -> &str {
            "Fake Card"
        }
        fn path(&self) -> &str {
            "ccid:0"
        }
    }

    fn open_selected() -> ApduCable<FakeCard> {
        let mut card = FakeCard::new();
        card.reply(b"FIDO_2_0", SW_OK); // SELECT reply
        ApduCable::open(card).expect("SELECT")
    }

    #[test]
    fn open_selects_the_fido_applet() {
        let cable = open_selected();
        assert_eq!(cable.product(), "Fake Card");
        // The first APDU is a SELECT by AID.
        assert_eq!(&cable.port.sent[0][0..4], &[0x00, 0xA4, 0x04, 0x00]);
    }

    #[test]
    fn a_failed_select_is_refused() {
        let mut card = FakeCard::new();
        card.reply(&[], 0x6A82); // file not found
        assert!(matches!(ApduCable::open(card), Err(CableError::Other(_))));
    }

    #[test]
    fn a_success_returns_the_body_without_the_status_byte() {
        let mut cable = open_selected();
        cable.port.reply(&[0x00, 0xa0], SW_OK); // CTAP status 0x00 then body 0xa0
        let body = cable.exchange(&get_info_request().unwrap(), None).unwrap();
        assert_eq!(body, vec![0xa0]);
    }

    #[test]
    fn a_ctap_error_status_becomes_a_ctap_error() {
        let mut cable = open_selected();
        cable.port.reply(&[0x31], SW_OK); // CTAP status 0x31, SW ok
        let result = cable.exchange(&get_info_request().unwrap(), None);
        assert!(matches!(result, Err(CableError::Ctap(_))));
    }

    #[test]
    fn keepalives_are_polled_and_the_touch_fires_once() {
        let mut cable = open_selected();
        let fired = std::rc::Rc::new(std::cell::Cell::new(0));
        let seen = std::rc::Rc::clone(&fired);
        cable.on_touch(Box::new(move |_, _| seen.set(seen.get() + 1)));
        cable.port.reply(&[KEEPALIVE_UP_NEEDED], SW_KEEPALIVE);
        cable.port.reply(&[KEEPALIVE_UP_NEEDED], SW_KEEPALIVE);
        cable.port.reply(&[0x00], SW_OK);
        let body = cable
            .exchange(&get_info_request().unwrap(), Some(TouchKind::Presence))
            .unwrap();
        assert!(body.is_empty());
        assert_eq!(fired.get(), 1, "announced once, not per keepalive");
        assert_eq!(cable.port.polls, 2, "each keepalive waits one poll interval");
    }

    #[test]
    fn a_long_reply_is_chained_with_get_response() {
        let mut cable = open_selected();
        // First block: two bytes + "0x61 03" = three more waiting.
        cable.port.reply(&[0x00, 0xAA], 0x6103);
        // GET RESPONSE block: the remaining three, SW ok.
        cable.port.reply(&[0xBB, 0xCC, 0xDD], SW_OK);
        let body = cable.exchange(&get_info_request().unwrap(), None).unwrap();
        // Status byte 0x00 stripped, the rest concatenated across both blocks.
        assert_eq!(body, vec![0xAA, 0xBB, 0xCC, 0xDD]);
        // The second APDU was an ISO GET RESPONSE.
        let last = cable.port.sent.last().unwrap();
        assert_eq!(&last[0..2], &[0x00, 0xC0]);
    }

    #[test]
    fn a_short_request_uses_a_short_apdu_with_an_le_byte() {
        let apdu = ApduCable::<FakeCard>::first_command_apdu(&[0xDE, 0xAD]).unwrap();
        assert_eq!(apdu, vec![CLA, INS_MSG, P1_MSG, 0x00, 0x02, 0xDE, 0xAD, 0x00]);
    }

    #[test]
    fn a_large_request_uses_an_extended_length_apdu() {
        let payload = vec![0x11u8; 300];
        let apdu = ApduCable::<FakeCard>::first_command_apdu(&payload).unwrap();
        // 5-byte extended header (CLA INS P1 00 00 then 2-byte Lc), payload, 2-byte Le.
        assert_eq!(&apdu[0..5], &[CLA, INS_MSG, P1_MSG, 0x00, 0x00]);
        assert_eq!(&apdu[5..7], &[0x01, 0x2C]); // 300
        assert_eq!(&apdu[apdu.len() - 2..], &[0x00, 0x00]);
    }
}
