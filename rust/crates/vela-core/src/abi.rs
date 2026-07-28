//! Runtime calldata decoding — the trust root of clear signing.
//!
//! Replaces the hand-rolled dynamic-offset decoder in src/services/abi-decode.ts
//! with alloy-dyn-abi's fuzz-tested one. What this module returns is what the
//! user reads on the signing sheet before approving; leaf rendering rules are
//! pinned by contracts/core-api.md and `tests/vectors/abi.json`.
//!
//! One deliberately hand-written piece: the signature NAME splitter. alloy's
//! human-readable grammar rejects named tuple components (`(address a,uint256 b) x`),
//! which our clear-signing descriptors use for display labels. The splitter only
//! extracts names and canonical type text — every consensus-relevant step
//! (canonical form, selector, offsets, decoding) still goes through alloy.

use crate::CoreError;
use alloy_dyn_abi::{DynSolType, DynSolValue, JsonAbiExt as _};
use alloy_json_abi::Function;
use alloy_primitives::{I256, U256};
use serde::{Deserialize, Serialize};

/// Recursive decoded-calldata tree (FFI type — identical shape on every
/// binding surface; uniffi 0.32 handles the recursion, tsify mirrors it in TS).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AbiValue {
    /// Canonical solidity kind: "address" | "uint256" | "bytes" | "tuple" | "uint256[]" | …
    pub kind: String,
    /// Param/component name from the signature ("" when unnamed or array element).
    pub name: String,
    /// Leaf payload (checksummed address, minimal 0x-hex, "true"/"false", utf8 string); "" on non-leaves.
    pub value: String,
    /// Empty for leaves.
    pub children: Vec<AbiValue>,
}

/// Canonical form of a human-readable signature: names stripped, whitespace
/// removed, `uint`/`int` aliases normalized to `uint256`/`int256`.
pub fn canonicalize_signature(sig: &str) -> Result<String, CoreError> {
    Ok(parse_function(sig)?.0.signature())
}

/// 4-byte selector over the canonical signature, 0x-hex.
pub fn compute_selector(sig: &str) -> Result<String, CoreError> {
    let (f, _) = parse_function(sig)?;
    Ok(format!("0x{}", hex::encode(f.selector())))
}

/// Does `calldata`'s selector match `sig`? Short calldata (< 4 bytes) is
/// simply "no match", mirroring the legacy matcher.
pub fn match_selector(sig: &str, calldata: &[u8]) -> Result<bool, CoreError> {
    let (f, _) = parse_function(sig)?;
    if calldata.len() < 4 {
        return Ok(false);
    }
    Ok(calldata[..4] == f.selector()[..])
}

/// Decode calldata against a human-readable signature into the recursive tree.
///
/// Verifies the 4-byte selector against the canonical signature, strips it,
/// then decodes strictly: truncated or malformed calldata is an error, never
/// zero-padded (enumerated divergence vs the legacy decoder).
pub fn decode_calldata(sig: &str, calldata: &[u8]) -> Result<AbiValue, CoreError> {
    let (f, names) = parse_function(sig)?;
    if calldata.len() < 4 {
        return Err(CoreError::AbiDecode(format!(
            "calldata too short for a selector: {} bytes",
            calldata.len()
        )));
    }
    if calldata[..4] != f.selector()[..] {
        return Err(CoreError::AbiDecode(format!(
            "selector mismatch: calldata 0x{}, signature `{}` → 0x{}",
            hex::encode(&calldata[..4]),
            f.signature(),
            hex::encode(f.selector()),
        )));
    }
    let values = f
        .abi_decode_input(&calldata[4..])
        .map_err(|e| CoreError::AbiDecode(format!("`{}`: {e}", f.signature())))?;
    if values.len() != f.inputs.len() || values.len() != names.len() {
        return Err(CoreError::AbiDecode(format!(
            "decoded {} values for {} params",
            values.len(),
            f.inputs.len()
        )));
    }
    let types = f
        .inputs
        .iter()
        .map(|p| {
            DynSolType::parse(&p.selector_type()).map_err(|e| {
                CoreError::Internal(format!("canonical param `{}` unparseable: {e}", p.ty))
            })
        })
        .collect::<Result<Vec<_>, _>>()?;
    let children = types
        .iter()
        .zip(values.iter())
        .zip(names.iter())
        .map(|((ty, value), name)| build_node(ty, name, value))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(AbiValue {
        kind: "tuple".to_owned(),
        name: String::new(),
        value: String::new(),
        children,
    })
}

// ---------------------------------------------------------------------------
// Signature splitting (names + canonical type text)
// ---------------------------------------------------------------------------

/// Display-name tree extracted from a human-readable signature. Mirrors the
/// legacy TS `AbiParam` shape; for arrays, `components` describes the element
/// tuple's names.
#[derive(Debug, Clone, Default)]
struct SigParam {
    ty: String,
    name: String,
    components: Vec<SigParam>,
}

/// Split `sig` into (alloy Function over the canonical form, per-param name trees).
fn parse_function(sig: &str) -> Result<(Function, Vec<SigParam>), CoreError> {
    let (fn_name, params) = split_signature(sig)?;
    let canonical = format!(
        "{fn_name}({})",
        params
            .iter()
            .map(canonical_type)
            .collect::<Vec<_>>()
            .join(",")
    );
    let f = Function::parse(&canonical)
        .map_err(|e| CoreError::AbiParse(format!("`{sig}` (canonical `{canonical}`): {e}")))?;
    Ok((f, params))
}

/// Unbalanced parentheses and empty parameter slots are hard errors: the
/// legacy TS splitter "repaired" both silently (dropping the last character of
/// an unclosed signature, skipping empty slots), which yields a signature —
/// and therefore a selector — the caller never wrote. Erroring here can only
/// cost a raw-calldata fallback on the signing sheet; guessing could match the
/// wrong function.
fn split_signature(sig: &str) -> Result<(String, Vec<SigParam>), CoreError> {
    let Some(paren_idx) = sig.find('(') else {
        return Ok((sig.to_owned(), Vec::new()));
    };
    let name = &sig[..paren_idx];
    let close = sig.rfind(')').ok_or_else(|| {
        CoreError::AbiParse(format!("unbalanced parentheses in signature `{sig}`"))
    })?;
    if close < paren_idx {
        return Err(CoreError::AbiParse(format!(
            "unbalanced parentheses in signature `{sig}`"
        )));
    }
    let body = &sig[paren_idx + 1..close];
    Ok((name.to_owned(), split_param_list(body)?))
}

fn split_param_list(body: &str) -> Result<Vec<SigParam>, CoreError> {
    if body.trim().is_empty() {
        return Ok(Vec::new());
    }
    let mut params = Vec::new();
    let mut depth = 0i32;
    let mut current = String::new();
    let mut push = |raw: &str| -> Result<(), CoreError> {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return Err(CoreError::AbiParse(format!(
                "empty parameter slot in `({body})`"
            )));
        }
        params.push(split_one_param(trimmed)?);
        Ok(())
    };
    for ch in body.chars() {
        match ch {
            '(' => {
                depth += 1;
                current.push(ch);
            }
            ')' => {
                depth -= 1;
                current.push(ch);
            }
            ',' if depth == 0 => {
                push(&current)?;
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    push(&current)?;
    Ok(params)
}

fn split_one_param(raw: &str) -> Result<SigParam, CoreError> {
    if let Some(rest) = raw.strip_prefix('(') {
        // Tuple: "(address a, uint256 b)[] name" — find the matching close paren.
        let mut depth = 1i32;
        let mut close_idx = None;
        for (i, ch) in rest.char_indices() {
            match ch {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        close_idx = Some(i + 1); // index into `raw`
                        break;
                    }
                }
                _ => {}
            }
        }
        let close_idx = close_idx.ok_or_else(|| {
            CoreError::AbiParse(format!("unbalanced parentheses in parameter `{raw}`"))
        })?;
        let tuple_body = raw.get(1..close_idx).unwrap_or("");
        let after = raw.get(close_idx + 1..).unwrap_or("").trim_start();
        let (array_suffix, name) = if after.starts_with('[') {
            match after.find(']') {
                Some(b) => (&after[..=b], after[b + 1..].trim()),
                None => {
                    return Err(CoreError::AbiParse(format!(
                        "unclosed array suffix in parameter `{raw}`"
                    )))
                }
            }
        } else {
            ("", after)
        };
        Ok(SigParam {
            ty: format!("tuple{array_suffix}"),
            name: name.to_owned(),
            components: split_param_list(tuple_body)?,
        })
    } else {
        let mut parts = raw.split_whitespace();
        let ty = parts.next().unwrap_or("").to_owned();
        let name = parts.collect::<Vec<_>>().join(" ");
        Ok(SigParam {
            ty,
            name,
            components: Vec::new(),
        })
    }
}

fn canonical_type(p: &SigParam) -> String {
    if let Some(suffix) = p.ty.strip_prefix("tuple") {
        let inner = p
            .components
            .iter()
            .map(canonical_type)
            .collect::<Vec<_>>()
            .join(",");
        format!("({inner}){suffix}")
    } else {
        p.ty.clone()
    }
}

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------

static NO_NAME: SigParam = SigParam {
    ty: String::new(),
    name: String::new(),
    components: Vec::new(),
};

fn build_node(
    ty: &DynSolType,
    names: &SigParam,
    value: &DynSolValue,
) -> Result<AbiValue, CoreError> {
    let kind = kind_of(ty)?;
    let leaf = |v: String| AbiValue {
        kind: kind.clone(),
        name: names.name.clone(),
        value: v,
        children: Vec::new(),
    };
    match value {
        DynSolValue::Address(a) => Ok(leaf(a.to_checksum(None))),
        DynSolValue::Bool(b) => Ok(leaf(if *b { "true" } else { "false" }.to_owned())),
        DynSolValue::Uint(u, _) => Ok(leaf(uint_hex(*u))),
        DynSolValue::Int(i, _) => Ok(leaf(int_hex(*i))),
        DynSolValue::Bytes(b) => Ok(leaf(format!("0x{}", hex::encode(b)))),
        DynSolValue::FixedBytes(word, size) => Ok(leaf(format!(
            "0x{}",
            hex::encode(&word.as_slice()[..*size])
        ))),
        DynSolValue::String(s) => Ok(leaf(s.clone())),
        DynSolValue::Function(f) => Ok(leaf(format!("0x{}", hex::encode(f.as_slice())))),
        DynSolValue::Tuple(vals) => {
            let comp_types = match ty {
                DynSolType::Tuple(inner) => inner.as_slice(),
                _ => {
                    return Err(CoreError::Internal(format!(
                        "tuple value for non-tuple type {kind}"
                    )))
                }
            };
            if vals.len() != comp_types.len() {
                return Err(CoreError::Internal(format!(
                    "tuple arity mismatch: {} values, {} types",
                    vals.len(),
                    comp_types.len()
                )));
            }
            let children = vals
                .iter()
                .enumerate()
                .map(|(i, v)| {
                    let comp_names = names.components.get(i).unwrap_or(&NO_NAME);
                    build_node(&comp_types[i], comp_names, v)
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(AbiValue {
                kind,
                name: names.name.clone(),
                value: String::new(),
                children,
            })
        }
        DynSolValue::Array(vals) | DynSolValue::FixedArray(vals) => {
            let elem_ty = match ty {
                DynSolType::Array(inner) | DynSolType::FixedArray(inner, _) => inner.as_ref(),
                _ => {
                    return Err(CoreError::Internal(format!(
                        "array value for non-array type {kind}"
                    )))
                }
            };
            // Elements are unnamed; tuple elements inherit the array's component names.
            let elem_names = SigParam {
                ty: String::new(),
                name: String::new(),
                components: names.components.clone(),
            };
            let children = vals
                .iter()
                .map(|v| build_node(elem_ty, &elem_names, v))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(AbiValue {
                kind,
                name: names.name.clone(),
                value: String::new(),
                children,
            })
        }
        other => Err(CoreError::Internal(format!(
            "unsupported decoded value variant for {kind}: {other:?}"
        ))),
    }
}

/// Canonical solidity type name — the `kind` field consumers switch on.
/// Never falls through to a Debug string: an unhandled alloy variant would
/// leak e.g. "Function" (capital F) into the FFI contract.
fn kind_of(ty: &DynSolType) -> Result<String, CoreError> {
    Ok(match ty {
        DynSolType::Address => "address".to_owned(),
        DynSolType::Bool => "bool".to_owned(),
        DynSolType::Bytes => "bytes".to_owned(),
        DynSolType::String => "string".to_owned(),
        DynSolType::Function => "function".to_owned(),
        DynSolType::Uint(bits) => format!("uint{bits}"),
        DynSolType::Int(bits) => format!("int{bits}"),
        DynSolType::FixedBytes(size) => format!("bytes{size}"),
        DynSolType::Tuple(_) => "tuple".to_owned(),
        DynSolType::Array(inner) => format!("{}[]", kind_of(inner)?),
        DynSolType::FixedArray(inner, n) => format!("{}[{n}]", kind_of(inner)?),
        other => {
            return Err(CoreError::Internal(format!(
                "unsupported solidity type variant: {other:?}"
            )))
        }
    })
}

fn uint_hex(u: U256) -> String {
    if u.is_zero() {
        "0x0".to_owned()
    } else {
        format!("0x{u:x}")
    }
}

fn int_hex(i: I256) -> String {
    if i.is_zero() {
        "0x0".to_owned()
    } else if i.is_negative() {
        format!("-0x{:x}", i.unsigned_abs())
    } else {
        format!("0x{:x}", i.unsigned_abs())
    }
}

mod hex {
    pub fn encode(data: impl AsRef<[u8]>) -> String {
        let mut out = String::new();
        for b in data.as_ref() {
            out.push_str(&format!("{b:02x}"));
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Research open item: alias normalization must survive the full
    /// splitter → Function::parse → signature() round trip.
    #[test]
    fn uint_alias_normalizes() {
        assert_eq!(
            canonicalize_signature("transfer(address to, uint value)").as_deref(),
            Ok("transfer(address,uint256)")
        );
        assert_eq!(
            compute_selector("transfer(address to, uint value)").as_deref(),
            Ok("0xa9059cbb")
        );
    }

    /// Cases where the legacy TS decoder produced GARBAGE, so no oracle vector
    /// can exist (enumerated divergences #13–#15). These pins are the only
    /// guard against silently re-introducing the legacy behavior.
    mod legacy_was_wrong {
        use super::*;

        fn leaf_values(tree: &AbiValue) -> Vec<String> {
            if tree.children.is_empty() {
                vec![tree.value.clone()]
            } else {
                tree.children.iter().flat_map(leaf_values).collect()
            }
        }

        /// TS subtracted 2^N from the FULL 256-bit word for intN (N<256),
        /// rendering a ~2^256 garbage positive. Correct is sign extension.
        #[test]
        fn negative_sub_256_int_sign_extends() {
            let sig = "adjust(int8 d)";
            let mut calldata = compute_selector(sig)
                .and_then(|s| crate::primitives::from_hex(&s))
                .unwrap_or_default();
            calldata.extend_from_slice(&[0xffu8; 32]); // -1, canonically sign-extended
            let tree = decode_calldata(sig, &calldata);
            assert_eq!(tree.map(|t| leaf_values(&t)), Ok(vec!["-0x1".to_owned()]));
        }

        /// TS `isDynamic` missed fixed-size arrays OF dynamic types, so it read
        /// the head offset words as element data.
        #[test]
        fn fixed_array_of_dynamic_elements_decodes_per_spec() {
            let sig = "pair(string[2] names)";
            let mut calldata = compute_selector(sig)
                .and_then(|s| crate::primitives::from_hex(&s))
                .unwrap_or_default();
            let word = |n: u64| {
                let mut w = [0u8; 32];
                w[24..].copy_from_slice(&n.to_be_bytes());
                w
            };
            calldata.extend_from_slice(&word(0x20)); // offset to the (dynamic) fixed array
            calldata.extend_from_slice(&word(0x40)); // element 0 offset
            calldata.extend_from_slice(&word(0x80)); // element 1 offset
            calldata.extend_from_slice(&word(2)); // "hi".len()
            let mut hi = [0u8; 32];
            hi[..2].copy_from_slice(b"hi");
            calldata.extend_from_slice(&hi);
            calldata.extend_from_slice(&word(2)); // "yo".len()
            let mut yo = [0u8; 32];
            yo[..2].copy_from_slice(b"yo");
            calldata.extend_from_slice(&yo);
            let tree = decode_calldata(sig, &calldata);
            assert_eq!(
                tree.map(|t| leaf_values(&t)),
                Ok(vec!["hi".to_owned(), "yo".to_owned()])
            );
        }

        /// The `function` type must surface as the canonical lowercase kind,
        /// never alloy's Debug string.
        #[test]
        fn function_type_kind_is_canonical() {
            let sig = "callback(function cb)";
            let mut calldata = compute_selector(sig)
                .and_then(|s| crate::primitives::from_hex(&s))
                .unwrap_or_default();
            let mut word = [0u8; 32];
            word[..24].fill(0xab);
            calldata.extend_from_slice(&word);
            let tree = decode_calldata(sig, &calldata);
            assert_eq!(
                tree.map(|t| t.children.first().map(|c| c.kind.clone())),
                Ok(Some("function".to_owned()))
            );
        }

        /// Malformed signatures must ERROR, not be silently "repaired" into a
        /// different function (the legacy splitter dropped characters/slots).
        #[test]
        fn malformed_signatures_error() {
            assert!(canonicalize_signature("foo(address").is_err());
            assert!(canonicalize_signature("foo(address a,,uint256 b)").is_err());
            assert!(canonicalize_signature("foo((address a uint256 b)").is_err());
        }
    }

    /// Named tuple components — the exact grammar alloy rejects — must
    /// canonicalize through the splitter.
    #[test]
    fn named_tuple_components_canonicalize() {
        assert_eq!(
            canonicalize_signature(
                "swap(address executor, (address srcToken, address dstToken) desc)"
            )
            .as_deref(),
            Ok("swap(address,(address,address))")
        );
        assert_eq!(
            canonicalize_signature(
                "exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params)"
            )
            .as_deref(),
            Ok("exactInput((bytes,address,uint256,uint256))")
        );
    }
}
