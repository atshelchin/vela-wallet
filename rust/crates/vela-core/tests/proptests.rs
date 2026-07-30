//! Property tests: invariants that vectors can't pin (round-trips, idempotence,
//! never-panic on adversarial bytes). Grown module by module alongside
//! `conformance.rs`. Inventory: contracts/conformance-vectors.md §Invariants.

use proptest::prelude::*;
use vela_core::primitives as prim;

proptest! {
    // --- primitives: round-trips ------------------------------------------

    #[test]
    fn hex_round_trip(data in proptest::collection::vec(any::<u8>(), 0..256)) {
        let unprefixed = prim::to_hex(&data, false);
        let prefixed = prim::to_hex(&data, true);
        prop_assert_eq!(prim::from_hex(&unprefixed).ok(), Some(data.clone()));
        prop_assert_eq!(prim::from_hex(&prefixed).ok(), Some(data));
    }

    #[test]
    fn base64url_round_trip(data in proptest::collection::vec(any::<u8>(), 0..256)) {
        let encoded = prim::to_base64url(&data);
        // Output alphabet is url-safe, unpadded.
        prop_assert!(encoded.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'));
        prop_assert_eq!(prim::from_base64url(&encoded).ok(), Some(data));
    }

    // --- primitives: idempotence ------------------------------------------

    #[test]
    fn checksum_idempotent(bytes in proptest::array::uniform20(any::<u8>())) {
        let addr = prim::to_hex(&bytes, true);
        let first = prim::checksum_address(&addr).ok();
        prop_assert!(first.is_some());
        let first = first.unwrap_or_default();
        let second = prim::checksum_address(&first).ok();
        prop_assert_eq!(Some(first), second);
    }

    #[test]
    fn quantity_idempotent(n in any::<u128>()) {
        let q1 = prim::to_quantity(&n.to_string()).ok();
        prop_assert!(q1.is_some());
        let q1 = q1.unwrap_or_default();
        let q2 = prim::to_quantity(&q1).ok();
        prop_assert_eq!(Some(q1.clone()), q2);
        // Canonical: lowercase, minimal.
        prop_assert!(q1.starts_with("0x"));
        prop_assert!(!q1[2..].starts_with('0') || q1 == "0x0");
    }

    // --- primitives: strict decoders never panic on arbitrary input --------

    #[test]
    fn from_hex_total(s in "\\PC*") {
        let _ = prim::from_hex(&s);
    }

    #[test]
    fn from_base64url_total(s in "\\PC*") {
        let _ = prim::from_base64url(&s);
    }

    #[test]
    fn to_quantity_total(s in "\\PC*") {
        let _ = prim::to_quantity(&s);
    }

    // --- abi: strict decoder is total (Ok or CoreError, never a panic) -----

    #[test]
    fn signature_parse_total(s in "\\PC*") {
        let _ = vela_core::abi::canonicalize_signature(&s);
        let _ = vela_core::abi::compute_selector(&s);
    }

    #[test]
    fn decode_calldata_total(
        sig_junk in "\\PC{0,64}",
        calldata in proptest::collection::vec(any::<u8>(), 0..512),
    ) {
        // Arbitrary signature text + arbitrary calldata: must never panic.
        let _ = vela_core::abi::decode_calldata(&sig_junk, &calldata);
        // Well-formed signature + arbitrary calldata: must never panic.
        let _ = vela_core::abi::decode_calldata(
            "exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params)",
            &calldata,
        );
        let _ = vela_core::abi::decode_calldata("transfer(address to, uint256 value)", &calldata);
    }

    // --- webauthn: adversarial decoders are total ---------------------------

    #[test]
    fn attestation_extract_total(data in proptest::collection::vec(any::<u8>(), 0..512)) {
        let _ = vela_core::webauthn::extract_attestation_public_key(&data);
    }

    #[test]
    fn der_parse_total(data in proptest::collection::vec(any::<u8>(), 0..128)) {
        let _ = vela_core::webauthn::der_signature_to_raw_low_s(&data);
    }

    #[test]
    fn low_s_idempotent_on_valid_der(seed in proptest::array::uniform32(1u8..=255), msg in proptest::array::uniform32(any::<u8>())) {
        use p256::ecdsa::signature::hazmat::PrehashSigner as _;
        if let Ok(key) = p256::ecdsa::SigningKey::from_slice(&seed) {
            let sig: p256::ecdsa::Signature = match key.sign_prehash(&msg) {
                Ok(s) => s,
                Err(_) => return Ok(()),
            };
            let raw1 = vela_core::webauthn::der_signature_to_raw_low_s(sig.to_der().as_bytes());
            prop_assert!(raw1.is_ok());
            // Re-encoding the normalized signature and normalizing again is a fixpoint.
            if let Ok(raw) = raw1 {
                let sig2 = p256::ecdsa::Signature::from_slice(&raw);
                prop_assert!(sig2.is_ok());
                if let Ok(sig2) = sig2 {
                    let raw2 = vela_core::webauthn::der_signature_to_raw_low_s(sig2.to_der().as_bytes());
                    prop_assert_eq!(Ok(raw), raw2);
                }
            }
        }
    }
}

// Recovery round-trip is EC-heavy — keep the case count modest.
proptest! {
    #![proptest_config(ProptestConfig::with_cases(12))]

    /// RFC-6979 deterministic signing (no RNG) → two assertions from the same
    /// key must recover exactly that key; the same assertion twice must not.
    #[test]
    fn recovery_round_trip(
        seed in proptest::array::uniform32(1u8..=255),
        auth_a in proptest::collection::vec(any::<u8>(), 37..64),
        auth_b in proptest::collection::vec(any::<u8>(), 37..64),
        client_a in proptest::collection::vec(any::<u8>(), 1..96),
        client_b in proptest::collection::vec(any::<u8>(), 1..96),
    ) {
        use p256::ecdsa::signature::hazmat::PrehashSigner as _;
        let Ok(key) = p256::ecdsa::SigningKey::from_slice(&seed) else { return Ok(()); };

        let make = |auth: &[u8], client: &[u8]| -> Result<vela_core::WebAuthnAssertion, ()> {
            let prehash = vela_core::webauthn::webauthn_signing_hash(auth, client);
            let sig: p256::ecdsa::Signature = key.sign_prehash(&prehash).map_err(|_| ())?;
            Ok(vela_core::WebAuthnAssertion {
                authenticator_data: auth.to_vec(),
                client_data_json: client.to_vec(),
                signature_der: sig.to_der().as_bytes().to_vec(),
            })
        };
        let (Ok(a), Ok(b)) = (make(&auth_a, &client_a), make(&auth_b, &client_b)) else { return Ok(()); };
        prop_assume!(a.signature_der != b.signature_der);

        let recovered = vela_core::webauthn::recover_public_key_from_assertions(&a, &b);
        let point = key.verifying_key().to_sec1_point(false);
        let bytes = point.as_bytes();
        prop_assert_eq!(
            recovered,
            Ok(Some(vela_core::P256PublicKey { x: bytes[1..33].to_vec(), y: bytes[33..65].to_vec() }))
        );

        // Same assertion twice is deliberately never enough.
        prop_assert_eq!(vela_core::webauthn::recover_public_key_from_assertions(&a, &a), Ok(None));
    }
}

// ---------------------------------------------------------------------------
// identicon — invariants the corpus cannot express (spec 003-rust-identicon)
// ---------------------------------------------------------------------------

proptest! {
    /// No input panics, and the hash keeps its documented shape.
    #[test]
    fn identicon_hash_never_panics(seed in ".*") {
        let hash = vela_core::identicon::make_hash(&seed);
        prop_assert!((13..=17).contains(&hash.len()), "hash length {} out of range for {seed:?}", hash.len());
        // Stability: the same seed must always give the same hash.
        prop_assert_eq!(hash, vela_core::identicon::make_hash(&seed));
    }

    /// Arbitrary unicode, including astral planes and control characters.
    #[test]
    fn identicon_unicode_never_panics(seed in proptest::collection::vec(any::<char>(), 0..64)) {
        let seed: String = seed.into_iter().collect();
        let hash = vela_core::identicon::make_hash(&seed);
        prop_assert!((13..=17).contains(&hash.len()));

        // Params either succeed or return a typed error — never panic, never a
        // silently-wrong avatar.
        match vela_core::identicon::identicon_params(&seed) {
            Ok(params) => {
                // Every resolved colour is a real palette entry.
                prop_assert!(vela_core::identicon::COLORS.contains(&params.colors.main));
                prop_assert!(vela_core::identicon::BACKGROUND_COLORS.contains(&params.colors.background));
                prop_assert!(vela_core::identicon::COLORS.contains(&params.colors.accent));
                // Assembly is total once params exist.
                let svg = vela_core::identicon::assemble_svg_circular(&params);
                prop_assert!(svg.starts_with("<svg ") && svg.ends_with("</svg>"));
                prop_assert!(!svg.contains("undefined"));
            }
            Err(e) => prop_assert_eq!(e.code(), "InvalidIdenticonSeed"),
        }
    }

    /// Section addressing lands in 1..=21 for ANY index, including i64::MIN.
    #[test]
    fn identicon_section_index_always_resolves(index in any::<i64>()) {
        use vela_core::identicon::{section_svg, Section};
        for section in [Section::Face, Section::Sides, Section::Top, Section::Bottom] {
            let svg = section_svg(section, index);
            prop_assert!(svg.is_ok(), "section {section:?} index {index} failed to resolve");
            prop_assert!(!svg.unwrap_or("").is_empty());
        }
    }

    /// `normalize_seed` is idempotent and never exceeds the cap.
    #[test]
    fn identicon_normalize_seed_idempotent(seed in ".*") {
        let once = vela_core::identicon::normalize_seed(&seed).into_owned();
        let twice = vela_core::identicon::normalize_seed(&once).into_owned();
        prop_assert_eq!(&once, &twice);
        prop_assert!(once.chars().map(char::len_utf16).sum::<usize>() <= vela_core::identicon::SEED_MAX_UTF16_LEN);
        prop_assert!(!once.bytes().any(|b| b.is_ascii_uppercase()));
    }

    /// ryu-js output stays within the buffer the hash tail assumes.
    #[test]
    fn identicon_decimal_form_fits_buffer(bits in any::<u64>()) {
        let x = f64::from_bits(bits);
        if x.is_finite() {
            let mut buf = ryu_js::Buffer::new();
            prop_assert!(buf.format(x).len() <= 32, "Number::toString({x}) exceeded the 32-byte assumption");
        }
    }
}
