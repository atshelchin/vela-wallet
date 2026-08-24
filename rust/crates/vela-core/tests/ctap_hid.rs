//! CTAPHID framing — the wire, both directions.
//!
//! Every test here is about a way a message can be silently corrupted rather
//! than loudly rejected. Framing bugs do not crash: they hand the CBOR layer a
//! plausible-looking buffer that is two halves of different answers, and the
//! failure surfaces three layers away as "the authenticator sent nonsense".

use vela_core::ctap::hid::{
    encode, CtapHidCommand, HidError, Reassembler, BROADCAST_CHANNEL, HID_REPORT_SIZE,
    MAX_MESSAGE_LEN,
};

const CHANNEL: u32 = 0x1234_5678;

/// Feed every packet of a message back into a reassembler, as a device would.
fn round_trip(command: CtapHidCommand, payload: &[u8]) -> Vec<u8> {
    let frames = match encode(CHANNEL, command, payload) {
        Ok(frames) => frames,
        Err(error) => unreachable!("encode rejected a valid payload: {error:?}"),
    };
    let mut reassembler = Reassembler::new();
    let mut out = None;
    for frame in &frames {
        match reassembler.push(frame) {
            Ok(Some(message)) => {
                assert_eq!(message.channel, CHANNEL);
                assert_eq!(message.command, command);
                out = Some(message.payload);
            }
            Ok(None) => {}
            Err(error) => unreachable!("reassembly rejected its own encoding: {error:?}"),
        }
    }
    match out {
        Some(payload) => payload,
        None => unreachable!("a complete message never completed"),
    }
}

#[test]
fn a_payload_that_fits_one_packet_needs_one_packet() {
    let payload = [0xa1u8; 40];
    let frames = match encode(CHANNEL, CtapHidCommand::Cbor, &payload) {
        Ok(frames) => frames,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(frames.len(), 1);
    assert_eq!(frames[0].len(), HID_REPORT_SIZE);
    // The high bit is what tells a device this starts a message rather than
    // continuing one.
    assert_eq!(frames[0][4], 0x80 | CtapHidCommand::Cbor as u8);
    assert_eq!(
        u16::from_be_bytes([frames[0][5], frames[0][6]]) as usize,
        payload.len()
    );
    assert_eq!(round_trip(CtapHidCommand::Cbor, &payload), payload);
}

/// The case the framing exists for: a real `getInfo` response does not fit in
/// one report, and a wallet's `makeCredential` request does not either.
#[test]
fn a_long_payload_fragments_and_reassembles_byte_identically() {
    let payload: Vec<u8> = (0..1000u32).map(|i| (i % 251) as u8).collect();
    let frames = match encode(CHANNEL, CtapHidCommand::Cbor, &payload) {
        Ok(frames) => frames,
        Err(error) => unreachable!("{error:?}"),
    };
    assert!(frames.len() > 1, "1000 bytes cannot fit one 64-byte report");
    // Continuations are numbered from zero, and the sequence byte's high bit
    // must stay clear or the packet reads as a new message.
    for (index, frame) in frames.iter().skip(1).enumerate() {
        assert_eq!(frame[4], index as u8, "continuation {index} is misnumbered");
        assert_eq!(frame[4] & 0x80, 0);
    }
    assert_eq!(round_trip(CtapHidCommand::Cbor, &payload), payload);
}

#[test]
fn an_empty_payload_is_a_complete_message() {
    assert_eq!(round_trip(CtapHidCommand::Cancel, &[]), Vec::<u8>::new());
}

#[test]
fn the_largest_addressable_message_round_trips() {
    let payload = vec![0x5au8; MAX_MESSAGE_LEN];
    assert_eq!(
        round_trip(CtapHidCommand::Ping, &payload).len(),
        MAX_MESSAGE_LEN
    );
}

#[test]
fn a_payload_past_the_sequence_space_is_refused_rather_than_truncated() {
    let payload = vec![0u8; MAX_MESSAGE_LEN + 1];
    assert_eq!(
        encode(CHANNEL, CtapHidCommand::Ping, &payload),
        Err(HidError::TooLong(MAX_MESSAGE_LEN + 1))
    );
}

/// A dropped continuation is the corruption this whole module exists to catch:
/// accepting it would splice the message's head onto its tail with a hole in
/// the middle, and CBOR would then fail somewhere unrelated.
#[test]
fn a_skipped_continuation_is_an_error_not_a_hole() {
    let payload = vec![0x11u8; 300];
    let frames = match encode(CHANNEL, CtapHidCommand::Cbor, &payload) {
        Ok(frames) => frames,
        Err(error) => unreachable!("{error:?}"),
    };
    let mut reassembler = Reassembler::new();
    assert_eq!(reassembler.push(&frames[0]), Ok(None));
    // Skip frames[1] entirely.
    assert_eq!(
        reassembler.push(&frames[2]),
        Err(HidError::SequenceOutOfOrder {
            expected: 0,
            got: 1
        })
    );
}

#[test]
fn a_continuation_without_an_initialization_packet_is_refused() {
    let mut report = [0u8; HID_REPORT_SIZE];
    report[0..4].copy_from_slice(&CHANNEL.to_be_bytes());
    report[4] = 0; // sequence 0, no init seen
    let mut reassembler = Reassembler::new();
    assert_eq!(
        reassembler.push(&report),
        Err(HidError::UnexpectedContinuation)
    );
}

/// Two authenticators can share a bus. A continuation from the wrong channel
/// must not be appended to this conversation's buffer.
#[test]
fn a_continuation_from_another_channel_is_refused() {
    let payload = vec![0x22u8; 300];
    let frames = match encode(CHANNEL, CtapHidCommand::Cbor, &payload) {
        Ok(frames) => frames,
        Err(error) => unreachable!("{error:?}"),
    };
    let mut foreign = frames[1];
    foreign[0..4].copy_from_slice(&0xdead_beefu32.to_be_bytes());

    let mut reassembler = Reassembler::new();
    assert_eq!(reassembler.push(&frames[0]), Ok(None));
    assert_eq!(
        reassembler.push(&foreign),
        Err(HidError::ForeignChannel {
            expected: CHANNEL,
            got: 0xdead_beef,
        })
    );
}

#[test]
fn a_report_of_the_wrong_length_is_refused() {
    let mut reassembler = Reassembler::new();
    assert_eq!(reassembler.push(&[0u8; 32]), Err(HidError::ReportSize(32)));
}

#[test]
fn an_unknown_command_byte_is_refused() {
    let mut report = [0u8; HID_REPORT_SIZE];
    report[0..4].copy_from_slice(&CHANNEL.to_be_bytes());
    report[4] = 0x80 | 0x7e;
    let mut reassembler = Reassembler::new();
    assert_eq!(
        reassembler.push(&report),
        Err(HidError::UnknownCommand(0x7e))
    );
}

/// KEEPALIVE is a complete message, not a fragment. Whether to keep waiting is
/// the shell's decision — this layer only says what arrived.
#[test]
fn keepalive_is_delivered_as_its_own_message() {
    let frames = match encode(CHANNEL, CtapHidCommand::KeepAlive, &[0x01]) {
        Ok(frames) => frames,
        Err(error) => unreachable!("{error:?}"),
    };
    let mut reassembler = Reassembler::new();
    match reassembler.push(&frames[0]) {
        Ok(Some(message)) => {
            assert_eq!(message.command, CtapHidCommand::KeepAlive);
            assert_eq!(message.payload, vec![0x01]);
        }
        other => unreachable!("keepalive did not complete: {other:?}"),
    }
}

/// A device may abandon a message and start another. Holding the old bytes
/// would splice two answers together.
#[test]
fn a_new_initialization_packet_abandons_a_partial_message() {
    let long = vec![0x33u8; 300];
    let frames = match encode(CHANNEL, CtapHidCommand::Cbor, &long) {
        Ok(frames) => frames,
        Err(error) => unreachable!("{error:?}"),
    };
    let short = match encode(CHANNEL, CtapHidCommand::Error, &[0x2f]) {
        Ok(frames) => frames,
        Err(error) => unreachable!("{error:?}"),
    };

    let mut reassembler = Reassembler::new();
    assert_eq!(reassembler.push(&frames[0]), Ok(None));
    match reassembler.push(&short[0]) {
        Ok(Some(message)) => {
            assert_eq!(message.command, CtapHidCommand::Error);
            assert_eq!(message.payload, vec![0x2f]);
        }
        other => unreachable!("the second message did not complete: {other:?}"),
    }
}

/// A device that declares 300 bytes and sends 60 has not sent a short message;
/// it has sent an incomplete one, and the shell needs to hear the difference.
#[test]
fn abandoning_a_partial_message_reports_truncation() {
    let payload = vec![0x44u8; 300];
    let frames = match encode(CHANNEL, CtapHidCommand::Cbor, &payload) {
        Ok(frames) => frames,
        Err(error) => unreachable!("{error:?}"),
    };
    let mut reassembler = Reassembler::new();
    assert_eq!(reassembler.push(&frames[0]), Ok(None));
    assert_eq!(
        reassembler.abandon(),
        Some(HidError::Truncated {
            declared: 300,
            got: 57,
        })
    );
    // Abandoning twice is not an error — there is simply nothing in flight.
    assert_eq!(reassembler.abandon(), None);
}

/// The broadcast channel is how a conversation starts, before INIT allocates a
/// real one. It is an ordinary channel as far as framing is concerned.
#[test]
fn the_broadcast_channel_frames_like_any_other() {
    let nonce = [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08];
    let frames = match encode(BROADCAST_CHANNEL, CtapHidCommand::Init, &nonce) {
        Ok(frames) => frames,
        Err(error) => unreachable!("{error:?}"),
    };
    assert_eq!(frames.len(), 1);
    assert_eq!(&frames[0][0..4], &[0xff, 0xff, 0xff, 0xff]);
    let mut reassembler = Reassembler::new();
    match reassembler.push(&frames[0]) {
        Ok(Some(message)) => {
            assert_eq!(message.channel, BROADCAST_CHANNEL);
            assert_eq!(message.payload, nonce);
        }
        other => unreachable!("{other:?}"),
    }
}
