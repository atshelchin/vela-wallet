//! CTAP2 over a smart-card reader — the removable key's *other* USB wire.
//!
//! A FIDO2 key on a USB port speaks two protocols at once. [`super::usb`] is
//! the familiar one: 64-byte HID reports on the FIDO usage page. This is the
//! other: the key's **CCID** (smart-card) interface, reached through PC/SC,
//! carrying the same CTAP2 commands wrapped in ISO 7816-4 APDUs. YubiKey
//! firmware 5.8+ exposes the FIDO applet there; the founder's demo proved the
//! framing on device, and [`vela_core::ctap::apdu_cable`] is the port of it.
//!
//! Everything about the PROTOCOL — SELECTing the applet, the `0x9100`
//! keepalive poll, `GET RESPONSE` chaining — lives in the core, where the NFC
//! transports share it. What lives here is the platform I/O: finding a reader,
//! connecting to the card in it, and moving one APDU.
//!
//! ## Why this matters most on Windows
//!
//! Since Windows 10 build 1903 a non-elevated process cannot open a FIDO HID
//! device; the OS reserves them for `webauthn.dll`. **PC/SC is not part of that
//! reservation.** The 0xF1D0 lockdown is a security descriptor on HID device
//! interfaces, and the smart-card subsystem is a different subsystem entirely —
//! `SCardEstablishContext` and `SCardTransmit` are ordinary unprivileged calls.
//!
//! So this is the one route on Windows where the wallet is its own CTAP client
//! for a key on the desk: its own picker, its own PIN prompt, its own touch
//! prompt, no system dialog, and no chance of the OS offering Windows Hello or
//! a phone in a sheet the person did not ask for. `webauthn.dll` stays as the
//! fallback for every key that does not answer here.
//!
//! ## Linux
//!
//! Not compiled. `pcsc-sys` links `libpcsclite`, which would put `pkgconf` and
//! `libpcsclite-dev` on every Linux build host and a `pcsc-lite` module in the
//! Flatpak manifest — a real cost for a platform whose HID path already works
//! for every key. Windows links `winscard.dll` and macOS the `PCSC` framework,
//! both of which ship with the OS, so those two pay nothing.

use std::time::Duration;

use pcsc::{Card, Context, Error as PcscError, Protocols, Scope, ShareMode};

use vela_core::ctap::apdu_cable::{ApduCable, ApduError, ApduPort};

/// The keepalive poll interval, matching what the core's loop expects (~100 ms,
/// and `MAX_POLLS` there budgets ~30 s of touch-waiting on top of it).
const POLL_INTERVAL: Duration = Duration::from_millis(100);

/// An open CTAP2 conversation with a card. Named because the shell holds one by
/// value across a ceremony, and `ApduCable<SmartCard>` names the transport twice.
pub type ApduCableOnCard = ApduCable<SmartCard>;

/// Why no FIDO card could be reached.
///
/// Every variant means the same thing to a caller — **nothing happened, try the
/// other wire** — which is the whole reason this is separate from a ceremony
/// failure. Once [`open_cable`] returns a cable, a failure is a real failure and
/// falling back would show a person a second dialog for a ceremony they already
/// answered.
#[derive(Debug)]
pub enum CcidError {
    /// The PC/SC service is not running, or there is no smart-card stack.
    Unavailable(String),
    /// No reader is attached. On Windows a YubiKey with CCID enabled IS a
    /// reader, so this usually means nothing is plugged in.
    NoReader,
    /// Readers exist; none holds a card whose FIDO applet answers `SELECT`.
    /// A YubiKey older than firmware 5.8 lands here, as does one with the CCID
    /// interface switched off in `ykman`.
    NoFidoApplet,
}

impl std::fmt::Display for CcidError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unavailable(detail) => write!(f, "the smart-card service is unavailable: {detail}"),
            Self::NoReader => write!(f, "no smart-card reader is attached"),
            Self::NoFidoApplet => write!(f, "no attached card offers a FIDO applet"),
        }
    }
}

/// One card, as the core's APDU cable sees it.
pub struct SmartCard {
    card: Card,
    /// The PC/SC reader name — "Yubico YubiKey OTP+FIDO+CCID 0" and the like.
    /// It is the closest thing a card has to a product string, so it is what
    /// the PIN dialog names, and it is stable enough to key the PIN cache on.
    reader: String,
    /// Reused across exchanges rather than allocated per APDU. Sized for
    /// extended-length responses, which is what `getInfo` and a large
    /// attestation object need — a short buffer would truncate them.
    buffer: Vec<u8>,
}

impl ApduPort for SmartCard {
    fn transmit(&mut self, apdu: &[u8]) -> Result<Vec<u8>, ApduError> {
        // Disjoint field borrows: `transmit` takes `&self.card` and
        // `&mut self.buffer`, which is why the buffer can live in this struct.
        match self.card.transmit(apdu, &mut self.buffer) {
            Ok(response) => Ok(response.to_vec()),
            // The card left the field (or the key was pulled) mid-ceremony.
            Err(PcscError::NoSmartcard | PcscError::RemovedCard | PcscError::ReaderUnavailable) => {
                Err(ApduError::NoCard)
            }
            Err(error) => Err(ApduError::Io(error.to_string())),
        }
    }

    fn poll_delay(&mut self) {
        std::thread::sleep(POLL_INTERVAL);
    }

    fn product(&self) -> &str {
        &self.reader
    }

    fn path(&self) -> &str {
        &self.reader
    }
}

/// The first attached card whose FIDO applet answers, as an open cable.
///
/// **First, not chosen.** The HID path races several plugged-in keys and lets a
/// touch pick one; there is no CCID analogue here, because a reader has no
/// blink and PC/SC has no "which one did they touch". With one key in the port —
/// the case this is for — the two behave identically. With two, this takes the
/// first reader the resource manager lists.
pub fn open_cable() -> Result<ApduCable<SmartCard>, CcidError> {
    let context = Context::establish(Scope::User).map_err(|error| match error {
        // Windows reports a stopped Smart Card service this way; it is not the
        // same fact as "no reader", and a person can start the service.
        PcscError::NoService | PcscError::ServiceStopped => {
            CcidError::Unavailable(error.to_string())
        }
        other => CcidError::Unavailable(other.to_string()),
    })?;

    let readers = context
        .list_readers_owned()
        .map_err(|error| CcidError::Unavailable(error.to_string()))?;
    if readers.is_empty() {
        return Err(CcidError::NoReader);
    }

    for reader in readers {
        // EXCLUSIVE first. A ceremony is a sequence of APDUs that only means
        // anything while the FIDO applet stays selected, and anything else on
        // this machine that talks to the card — a background authenticator app
        // polling OATH, a PIV minidriver — would SELECT a different applet out
        // from under us. Exclusive is the cheap way to hold the session; shared
        // is the fallback, because a refused exclusive connect is not a reason
        // to give up on a key that is right there.
        let card = match connect(&context, &reader, ShareMode::Exclusive)
            .or_else(|_| connect(&context, &reader, ShareMode::Shared))
        {
            Ok(card) => card,
            Err(_) => continue,
        };

        let port = SmartCard {
            card,
            reader: reader.to_string_lossy().into_owned(),
            buffer: vec![0u8; pcsc::MAX_BUFFER_SIZE_EXTENDED],
        };
        // The core's `open` is what SELECTs the FIDO applet, so this is also
        // the probe: a card with no FIDO applet fails here and the loop moves
        // on. Its error is deliberately discarded — "this reader was not it" is
        // the only fact a caller can act on, and the last reader's status word
        // is not a better sentence than `NoFidoApplet`.
        if let Ok(cable) = ApduCable::open(port) {
            return Ok(cable);
        }
    }

    Err(CcidError::NoFidoApplet)
}

fn connect(
    context: &Context,
    reader: &std::ffi::CStr,
    mode: ShareMode,
) -> Result<Card, PcscError> {
    // `Protocols::ANY` lets the resource manager negotiate T=0 or T=1; the
    // cable above speaks APDUs and does not care which was chosen.
    context.connect(reader, mode, Protocols::ANY)
}
