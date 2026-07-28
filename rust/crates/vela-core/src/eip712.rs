//! EIP-712 typed-data hashing — the digest the passkey signs for
//! `eth_signTypedData_v4`.
//!
//! Wraps alloy-dyn-abi's `TypedData` for struct hashing, but does NOT hand it
//! the raw payload: alloy computes the domain separator from its fixed
//! five-field `Eip712Domain` struct (all populated fields, declared type
//! ignored), while EIP-712 — and every verifier built on eth-sig-util/viem,
//! including the legacy TS hasher — encodes exactly the fields the payload's
//! `types.EIP712Domain` declares. Handing alloy a payload whose declared and
//! populated domain fields differ produces a valid-looking digest the dApp's
//! verifier can never reconstruct, so `normalize_payload` reconciles the two
//! before hashing (and refuses the cases where the legacy hasher itself
//! produced garbage). Value coercion is also pre-normalized: MetaMask-style
//! under-width `address`/`bytesN` values are padded the way the legacy hasher
//! padded them, instead of being rejected by alloy's strict coercion.

use crate::CoreError;
use alloy_dyn_abi::eip712::TypedData;
use serde_json::{Map, Value};

/// (field name, exact type) — EIP-712 mandated order.
const CANONICAL_DOMAIN: &[(&str, &str)] = &[
    ("name", "string"),
    ("version", "string"),
    ("chainId", "uint256"),
    ("verifyingContract", "address"),
    ("salt", "bytes32"),
];

/// Full `eth_signTypedData_v4` digest: `keccak256(0x1901 ‖ domainSeparator ‖ hashStruct(message))`
/// (domain-only payloads follow the MetaMask convention: `keccak256(0x1901 ‖ domainSeparator)`).
pub fn hash_typed_data(typed_data_json: &str) -> Result<Vec<u8>, CoreError> {
    let raw = normalize_payload(parse_payload(typed_data_json)?)?;
    let td: TypedData = serde_json::from_value(raw)
        .map_err(|e| CoreError::Eip712Parse(format!("typed data: {e}")))?;
    let hash = td
        .eip712_signing_hash()
        .map_err(|e| CoreError::Eip712Parse(format!("hashing failed: {e}")))?;
    Ok(hash.to_vec())
}

/// The EIP-712 `encodeType` string of the payload's primary type — exposed for
/// clear-signing display (e.g. "Mail(Person from,Person to,string contents)Person(…)").
pub fn encode_type(typed_data_json: &str) -> Result<String, CoreError> {
    let raw = normalize_payload(parse_payload(typed_data_json)?)?;
    let td: TypedData = serde_json::from_value(raw)
        .map_err(|e| CoreError::Eip712Parse(format!("typed data: {e}")))?;
    td.encode_type()
        .map_err(|e| CoreError::Eip712Parse(format!("encode_type failed: {e}")))
}

/// Parse the outer JSON; MetaMask-style payloads may be a JSON string that
/// itself contains the typed-data JSON — unwrap one level.
fn parse_payload(typed_data_json: &str) -> Result<Value, CoreError> {
    let raw: Value = serde_json::from_str(typed_data_json)
        .map_err(|e| CoreError::Eip712Parse(format!("not JSON: {e}")))?;
    match raw {
        Value::String(inner) => serde_json::from_str(&inner)
            .map_err(|e| CoreError::Eip712Parse(format!("stringified payload: {e}"))),
        other => Ok(other),
    }
}

/// Reconcile the payload with what alloy will do to it (see module docs):
/// validate + align the domain, then pad under-width scalar values.
fn normalize_payload(mut raw: Value) -> Result<Value, CoreError> {
    align_domain(&mut raw)?;
    normalize_values(&mut raw)?;
    Ok(raw)
}

/// When `types.EIP712Domain` is declared, it — not the populated key set —
/// defines the separator. Enforce that the declaration is canonical, that
/// every declared field is actually populated, and drop populated fields the
/// payload did not declare (alloy would otherwise fold them into the
/// separator). An ABSENT domain type is fine: alloy derives it from the
/// populated canonical fields, exactly as the legacy hasher did.
fn align_domain(raw: &mut Value) -> Result<(), CoreError> {
    let Some(entries) = raw.pointer("/types/EIP712Domain") else {
        return Ok(());
    };
    let entries = entries
        .as_array()
        .ok_or_else(|| CoreError::Eip712Parse("types.EIP712Domain is not an array".to_owned()))?;

    let mut declared: Vec<String> = Vec::with_capacity(entries.len());
    let mut cursor = 0usize;
    for entry in entries {
        let (name, ty) = match (
            entry.pointer("/name").and_then(Value::as_str),
            entry.pointer("/type").and_then(Value::as_str),
        ) {
            (Some(n), Some(t)) => (n, t),
            _ => {
                return Err(CoreError::Eip712Parse(
                    "types.EIP712Domain entry missing name/type".to_owned(),
                ))
            }
        };
        // Advance through the canonical list until this field matches: enforces
        // both membership and EIP-712's mandated field order, and rejects
        // duplicates (a repeated field cannot match again after the cursor moved).
        let found = CANONICAL_DOMAIN[cursor.min(CANONICAL_DOMAIN.len())..]
            .iter()
            .position(|(n, _)| *n == name);
        match found {
            Some(offset) => {
                let (canon_name, canon_ty) = CANONICAL_DOMAIN[cursor + offset];
                if ty != canon_ty {
                    return Err(CoreError::Eip712NonCanonicalDomain(format!(
                        "field `{canon_name}` has type `{ty}`, expected `{canon_ty}`"
                    )));
                }
                cursor += offset + 1;
                declared.push(canon_name.to_owned());
            }
            None => {
                return Err(CoreError::Eip712NonCanonicalDomain(format!(
                    "field `{name}` is not a canonical EIP712Domain field, is out of order, or is duplicated"
                )));
            }
        }
    }

    let domain = raw
        .get_mut("domain")
        .and_then(Value::as_object_mut)
        .ok_or_else(|| CoreError::Eip712Parse("payload has no domain object".to_owned()))?;

    // Declared-but-unpopulated: the legacy hasher encoded the literal string
    // "undefined" here — a garbage separator no verifier reproduces. Refuse.
    for name in &declared {
        let populated = domain.get(name).is_some_and(|v| !v.is_null());
        if !populated {
            return Err(CoreError::Eip712NonCanonicalDomain(format!(
                "types.EIP712Domain declares `{name}` but domain does not populate it"
            )));
        }
    }
    // Populated-but-undeclared: alloy would fold these into the separator;
    // the declared type says they are not part of it.
    domain.retain(|k, v| {
        v.is_null()
            || declared.iter().any(|d| d == k)
            || !CANONICAL_DOMAIN.iter().any(|(n, _)| n == k)
    });
    Ok(())
}

/// Pad under-width `address` / `bytesN` values the way the legacy hasher did
/// (`address` left-padded to 20 bytes, `bytesN` right-padded to N), so payloads
/// that shipped fine before are not rejected by alloy's strict coercion.
fn normalize_values(raw: &mut Value) -> Result<(), CoreError> {
    let types: Map<String, Value> = raw
        .get("types")
        .and_then(Value::as_object)
        .cloned()
        .ok_or_else(|| CoreError::Eip712Parse("payload has no types map".to_owned()))?;
    let primary = raw
        .get("primaryType")
        .and_then(Value::as_str)
        .ok_or_else(|| CoreError::Eip712Parse("payload has no primaryType".to_owned()))?
        .to_owned();

    if let Some(domain) = raw.get_mut("domain") {
        normalize_struct(domain, "EIP712Domain", &types, 0)?;
    }
    if types.contains_key(&primary) {
        if let Some(message) = raw.get_mut("message") {
            normalize_struct(message, &primary, &types, 0)?;
        }
    }
    Ok(())
}

/// Depth cap mirrors the legacy hasher's MAX_TYPE_DEPTH — self-referential
/// types must terminate, not recurse forever.
const MAX_TYPE_DEPTH: usize = 256;

fn normalize_struct(
    value: &mut Value,
    type_name: &str,
    types: &Map<String, Value>,
    depth: usize,
) -> Result<(), CoreError> {
    if depth > MAX_TYPE_DEPTH {
        return Err(CoreError::Eip712Parse(
            "maximum type depth exceeded (circular type reference?)".to_owned(),
        ));
    }
    let Some(fields) = types.get(type_name).and_then(Value::as_array).cloned() else {
        // EIP712Domain is often undeclared; alloy derives it. Nothing to walk.
        if type_name == "EIP712Domain" {
            return normalize_domain_scalars(value);
        }
        return Ok(());
    };
    let Some(obj) = value.as_object_mut() else {
        return Ok(());
    };
    for field in &fields {
        let (Some(name), Some(ty)) = (
            field.pointer("/name").and_then(Value::as_str),
            field.pointer("/type").and_then(Value::as_str),
        ) else {
            continue;
        };
        if let Some(slot) = obj.get_mut(name) {
            normalize_typed_value(slot, ty, types, depth)?;
        }
    }
    Ok(())
}

/// Domain values when the type is derived rather than declared.
fn normalize_domain_scalars(value: &mut Value) -> Result<(), CoreError> {
    let Some(obj) = value.as_object_mut() else {
        return Ok(());
    };
    for (name, ty) in CANONICAL_DOMAIN {
        if let Some(slot) = obj.get_mut(*name) {
            pad_scalar(slot, ty);
        }
    }
    Ok(())
}

fn normalize_typed_value(
    value: &mut Value,
    ty: &str,
    types: &Map<String, Value>,
    depth: usize,
) -> Result<(), CoreError> {
    if let Some(base) = array_base_type(ty) {
        if let Some(items) = value.as_array_mut() {
            for item in items {
                normalize_typed_value(item, base, types, depth + 1)?;
            }
        }
        return Ok(());
    }
    if types.contains_key(ty) {
        return normalize_struct(value, ty, types, depth + 1);
    }
    pad_scalar(value, ty);
    Ok(())
}

fn array_base_type(ty: &str) -> Option<&str> {
    let stripped = ty.strip_suffix(']')?;
    let open = stripped.rfind('[')?;
    // Only a trailing [] or [N] suffix, and the base must be non-empty.
    if stripped[open + 1..].bytes().all(|b| b.is_ascii_digit()) && open > 0 {
        Some(&ty[..open])
    } else {
        None
    }
}

/// Left-pad `address` hex to 20 bytes, right-pad `bytesN` hex to N bytes.
/// Anything else (or non-hex input) is left untouched for alloy to judge.
fn pad_scalar(value: &mut Value, ty: &str) {
    let Some(s) = value.as_str() else { return };
    let Some(body) = s.strip_prefix("0x") else {
        return;
    };
    if !body.bytes().all(|b| b.is_ascii_hexdigit()) {
        return;
    }
    let target_nibbles = if ty == "address" {
        40
    } else if let Some(n) = ty.strip_prefix("bytes") {
        match n.parse::<usize>() {
            Ok(n) if (1..=32).contains(&n) => n * 2,
            _ => return,
        }
    } else {
        return;
    };
    if body.len() >= target_nibbles {
        return;
    }
    let padded = if ty == "address" {
        format!("0x{}{body}", "0".repeat(target_nibbles - body.len()))
    } else {
        format!("0x{body}{}", "0".repeat(target_nibbles - body.len()))
    };
    *value = Value::String(padded);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn digest(json: &str) -> Result<String, String> {
        hash_typed_data(json)
            .map(|d| {
                let mut s = String::from("0x");
                for b in d {
                    s.push_str(&format!("{b:02x}"));
                }
                s
            })
            .map_err(|e| e.code().to_owned())
    }

    /// Domain-only signing (primaryType == "EIP712Domain") follows the
    /// MetaMask convention in alloy; the legacy TS hasher silently produced a
    /// nonstandard digest for these payloads (enumerated divergence #10).
    #[test]
    fn domain_only_payload_hashes() {
        let json = r#"{
            "types": {"EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "chainId", "type": "uint256"}
            ]},
            "primaryType": "EIP712Domain",
            "domain": {"name": "Vela", "chainId": 1},
            "message": {}
        }"#;
        assert!(digest(json).is_ok());
    }

    #[test]
    fn canonical_subsequence_accepted() {
        // name + chainId only (skipping version) is a valid ordered subsequence.
        let json = r#"{
            "types": {
                "EIP712Domain": [
                    {"name": "name", "type": "string"},
                    {"name": "chainId", "type": "uint256"}
                ],
                "M": [{"name": "v", "type": "uint256"}]
            },
            "primaryType": "M",
            "domain": {"name": "T", "chainId": 1},
            "message": {"v": 1}
        }"#;
        assert!(digest(json).is_ok());
    }

    #[test]
    fn stringified_payload_unwraps() {
        let inner = r#"{"types":{"M":[{"name":"v","type":"uint256"}]},"primaryType":"M","domain":{"name":"T"},"message":{"v":1}}"#;
        let wrapped = serde_json::to_string(inner).unwrap_or_default();
        assert_eq!(digest(&wrapped), digest(inner));
        assert!(digest(inner).is_ok());
    }

    /// The separator follows the DECLARED domain type: a populated field the
    /// payload did not declare must not change the digest (alloy alone would
    /// fold it in — the bug this module exists to prevent).
    #[test]
    fn undeclared_populated_domain_field_is_dropped() {
        let declared_only = r#"{
            "types": {"EIP712Domain": [{"name": "name", "type": "string"}],
                      "M": [{"name": "v", "type": "uint256"}]},
            "primaryType": "M", "domain": {"name": "T"}, "message": {"v": 1}
        }"#;
        let with_extra = r#"{
            "types": {"EIP712Domain": [{"name": "name", "type": "string"}],
                      "M": [{"name": "v", "type": "uint256"}]},
            "primaryType": "M",
            "domain": {"name": "T", "chainId": 1, "verifyingContract": "0x0000000000000000000000000000000000000001"},
            "message": {"v": 1}
        }"#;
        assert_eq!(digest(declared_only), digest(with_extra));
        assert!(digest(declared_only).is_ok());
    }

    /// Declared-but-unpopulated: the legacy hasher encoded the literal string
    /// "undefined". Refuse rather than reproduce garbage.
    #[test]
    fn declared_unpopulated_domain_field_is_refused() {
        let json = r#"{
            "types": {"EIP712Domain": [
                        {"name": "name", "type": "string"},
                        {"name": "version", "type": "string"}],
                      "M": [{"name": "v", "type": "uint256"}]},
            "primaryType": "M", "domain": {"name": "T"}, "message": {"v": 1}
        }"#;
        assert_eq!(digest(json), Err("Eip712NonCanonicalDomain".to_owned()));
    }

    /// Under-width address / bytesN values are padded like the legacy hasher
    /// did, not rejected by alloy's strict coercion.
    #[test]
    fn under_width_scalars_are_padded() {
        let short = r#"{
            "types": {"EIP712Domain": [{"name": "name", "type": "string"}],
                      "T": [{"name": "h", "type": "bytes32"}, {"name": "a", "type": "address"}]},
            "primaryType": "T", "domain": {"name": "D"},
            "message": {"h": "0x12", "a": "0x1"}
        }"#;
        let padded = r#"{
            "types": {"EIP712Domain": [{"name": "name", "type": "string"}],
                      "T": [{"name": "h", "type": "bytes32"}, {"name": "a", "type": "address"}]},
            "primaryType": "T", "domain": {"name": "D"},
            "message": {"h": "0x1200000000000000000000000000000000000000000000000000000000000000",
                        "a": "0x0000000000000000000000000000000000000001"}
        }"#;
        assert_eq!(digest(short), digest(padded));
        assert!(digest(short).is_ok());
    }

    /// Enumerated divergence #14: the legacy hasher used JS truthiness, so the
    /// JSON string "false" encoded as 1. alloy coerces it to the boolean it
    /// spells, which is what EIP-712 means; pin that so it cannot regress.
    #[test]
    fn stringified_bool_follows_its_spelling() {
        let payload = |b: &str| {
            format!(
                r#"{{"types": {{"EIP712Domain": [{{"name": "name", "type": "string"}}],
                               "M": [{{"name": "b", "type": "bool"}}]}},
                    "primaryType": "M", "domain": {{"name": "D"}}, "message": {{"b": {b}}}}}"#
            )
        };
        assert_eq!(digest(&payload("\"false\"")), digest(&payload("false")));
        assert_ne!(digest(&payload("\"false\"")), digest(&payload("true")));
    }

    /// Padding must reach into nested structs and arrays too.
    #[test]
    fn under_width_scalars_padded_in_nested_structs_and_arrays() {
        let json = r#"{
            "types": {"EIP712Domain": [{"name": "name", "type": "string"}],
                      "Inner": [{"name": "a", "type": "address"}],
                      "T": [{"name": "i", "type": "Inner"}, {"name": "hs", "type": "bytes32[]"}]},
            "primaryType": "T", "domain": {"name": "D"},
            "message": {"i": {"a": "0x2"}, "hs": ["0x34"]}
        }"#;
        assert!(digest(json).is_ok());
    }
}
