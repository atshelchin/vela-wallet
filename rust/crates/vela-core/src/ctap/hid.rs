//! CTAPHID framing (CTAP 2.1 §11.2).
//!
//! A message is split across 64-byte reports: one initialization packet
//! carrying the command and the total length, then continuation packets
//! numbered from zero. This module does both halves — build the packets for a
//! request, reassemble a response from packets as they arrive — and touches
//! nothing else.
//!
//! The reassembler is a state machine rather than a loop because the shell owns
//! the read: it hands over one report at a time, whenever the device produces
//! one, and asks whether the message is complete yet.

/// Every CTAPHID report is exactly this long, in both directions.
pub const HID_REPORT_SIZE: usize = 64;

/// Channel id, command, and the byte-count header.
const INIT_HEADER: usize = 4 + 1 + 2;
/// Channel id and sequence number.
const CONT_HEADER: usize = 4 + 1;

const INIT_PAYLOAD: usize = HID_REPORT_SIZE - INIT_HEADER;
const CONT_PAYLOAD: usize = HID_REPORT_SIZE - CONT_HEADER;

/// The most a single CTAPHID message can carry: one init packet plus the 128
/// continuations a 7-bit sequence number can address.
pub const MAX_MESSAGE_LEN: usize = INIT_PAYLOAD + 128 * CONT_PAYLOAD;

/// The channel every conversation starts on, before `INIT` allocates a real one.
pub const BROADCAST_CHANNEL: u32 = 0xffff_ffff;

/// The commands this client sends or recognises.
///
/// The high bit marks an initialization packet on the wire; it is set when a
/// packet is built and masked off when one is parsed, so the values here are
/// the spec's own numbers.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum CtapHidCommand {
    Ping = 0x01,
    /// CTAP1/U2F framing. Recognised so a response can be classified; never sent.
    Msg = 0x03,
    Init = 0x06,
    Wink = 0x08,
    /// The one that carries CTAP2: a CBOR request out, a CBOR response back.
    Cbor = 0x10,
    Cancel = 0x11,
    /// "Still working" — the device asking for more time, not an answer.
    KeepAlive = 0x3b,
    Error = 0x3f,
}

impl CtapHidCommand {
    fn from_byte(byte: u8) -> Option<Self> {
        Some(match byte {
            0x01 => Self::Ping,
            0x03 => Self::Msg,
            0x06 => Self::Init,
            0x08 => Self::Wink,
            0x10 => Self::Cbor,
            0x11 => Self::Cancel,
            0x3b => Self::KeepAlive,
            0x3f => Self::Error,
            _ => return None,
        })
    }
}

/// What can go wrong reassembling a message. Every variant is a device or a
/// cable misbehaving — none of them is a user error.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HidError {
    /// A report was not exactly [`HID_REPORT_SIZE`] bytes.
    ReportSize(usize),
    /// The payload is longer than CTAPHID can address.
    TooLong(usize),
    /// A continuation arrived before any initialization packet.
    UnexpectedContinuation,
    /// The sequence number skipped or repeated. Dropping a packet silently
    /// would splice two halves of different messages together.
    SequenceOutOfOrder { expected: u8, got: u8 },
    /// A packet for a channel this conversation does not own.
    ForeignChannel { expected: u32, got: u32 },
    /// An initialization packet whose command byte is not one we know.
    UnknownCommand(u8),
    /// The device declared a length it then did not send.
    Truncated { declared: usize, got: usize },
}

/// The packets one request becomes, in order.
///
/// Returned as a vector rather than an iterator because a shell writes them all
/// before reading anything, and a partially-written message is not a state
/// worth being able to represent.
pub type Frames = Vec<[u8; HID_REPORT_SIZE]>;

/// Split a message into the reports that carry it.
pub fn encode(channel: u32, command: CtapHidCommand, payload: &[u8]) -> Result<Frames, HidError> {
    if payload.len() > MAX_MESSAGE_LEN {
        return Err(HidError::TooLong(payload.len()));
    }

    let mut frames = Vec::new();
    let mut packet = [0u8; HID_REPORT_SIZE];
    packet[0..4].copy_from_slice(&channel.to_be_bytes());
    // The high bit is what distinguishes an initialization packet from a
    // continuation, whose first payload byte is a sequence number below 0x80.
    packet[4] = 0x80 | command as u8;
    let declared = u16::try_from(payload.len()).map_err(|_| HidError::TooLong(payload.len()))?;
    packet[5..7].copy_from_slice(&declared.to_be_bytes());

    let head = payload.len().min(INIT_PAYLOAD);
    packet[INIT_HEADER..INIT_HEADER + head].copy_from_slice(&payload[..head]);
    frames.push(packet);

    let mut sent = head;
    let mut sequence: u8 = 0;
    while sent < payload.len() {
        let mut cont = [0u8; HID_REPORT_SIZE];
        cont[0..4].copy_from_slice(&channel.to_be_bytes());
        cont[4] = sequence;
        let take = (payload.len() - sent).min(CONT_PAYLOAD);
        cont[CONT_HEADER..CONT_HEADER + take].copy_from_slice(&payload[sent..sent + take]);
        frames.push(cont);
        sent += take;
        sequence += 1;
    }

    Ok(frames)
}

/// One reassembled message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Message {
    pub channel: u32,
    pub command: CtapHidCommand,
    pub payload: Vec<u8>,
}

/// Reassembles one message from the reports a device produces.
///
/// The shell drives it: hand over each report as it arrives and act on what
/// comes back. `None` means "still collecting" — including for a KEEPALIVE,
/// which is a complete message in its own right and is returned as one, because
/// deciding whether to keep waiting is the shell's call and not this module's.
#[derive(Debug, Default)]
pub struct Reassembler {
    channel: Option<u32>,
    command: Option<CtapHidCommand>,
    declared: usize,
    buffer: Vec<u8>,
    next_sequence: u8,
}

impl Reassembler {
    pub fn new() -> Self {
        Self::default()
    }

    /// Feed one report. Returns the message once its declared length is met.
    pub fn push(&mut self, report: &[u8]) -> Result<Option<Message>, HidError> {
        if report.len() != HID_REPORT_SIZE {
            return Err(HidError::ReportSize(report.len()));
        }
        let channel = u32::from_be_bytes([report[0], report[1], report[2], report[3]]);
        let marker = report[4];

        if marker & 0x80 != 0 {
            // An initialization packet always starts a new message, even mid-
            // reassembly: the device abandoning one message to send another is
            // the device's prerogative, and holding the old bytes would splice
            // them together.
            let command = CtapHidCommand::from_byte(marker & 0x7f)
                .ok_or(HidError::UnknownCommand(marker & 0x7f))?;
            let declared = u16::from_be_bytes([report[5], report[6]]) as usize;
            if declared > MAX_MESSAGE_LEN {
                return Err(HidError::TooLong(declared));
            }
            let head = declared.min(INIT_PAYLOAD);
            self.channel = Some(channel);
            self.command = Some(command);
            self.declared = declared;
            self.buffer = report[INIT_HEADER..INIT_HEADER + head].to_vec();
            self.next_sequence = 0;
        } else {
            let expected_channel = self.channel.ok_or(HidError::UnexpectedContinuation)?;
            if channel != expected_channel {
                return Err(HidError::ForeignChannel {
                    expected: expected_channel,
                    got: channel,
                });
            }
            if marker != self.next_sequence {
                return Err(HidError::SequenceOutOfOrder {
                    expected: self.next_sequence,
                    got: marker,
                });
            }
            let remaining = self.declared - self.buffer.len();
            let take = remaining.min(CONT_PAYLOAD);
            self.buffer
                .extend_from_slice(&report[CONT_HEADER..CONT_HEADER + take]);
            self.next_sequence += 1;
        }

        if self.buffer.len() < self.declared {
            return Ok(None);
        }

        let message = Message {
            channel: self.channel.take().unwrap_or(channel),
            command: self
                .command
                .take()
                .ok_or(HidError::UnexpectedContinuation)?,
            payload: core::mem::take(&mut self.buffer),
        };
        self.declared = 0;
        self.next_sequence = 0;
        Ok(Some(message))
    }

    /// A message the device declared but never finished sending. The shell
    /// calls this when its read times out, so a truncated answer is reported as
    /// truncation rather than as silence.
    pub fn abandon(&mut self) -> Option<HidError> {
        self.command?;
        let error = HidError::Truncated {
            declared: self.declared,
            got: self.buffer.len(),
        };
        *self = Self::default();
        Some(error)
    }
}
