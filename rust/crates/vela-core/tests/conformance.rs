//! Conformance corpus runner.
//!
//! Replays `tests/vectors/*.json` (extracted from the production TypeScript
//! implementations by `scripts/dump-vectors/` in the app repo) against this
//! crate. Schema: specs/001-rust-core-bindings/contracts/conformance-vectors.md.
//!
//! A red test here means a byte divergence from shipping wallet behavior —
//! treat as a release blocker, not a flaky test.

use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

#[derive(Deserialize)]
struct SuiteFile {
    suite: String,
    cases: Vec<Case>,
}

#[derive(Deserialize)]
struct Case {
    name: String,
    #[serde(rename = "fn")]
    func: String,
    input: Value,
    expect: Value,
    #[allow(dead_code)]
    divergence: Option<Value>,
}

/// The corpus is five suites, discovered by scanning the directory. Every runner
/// asserts that exact set is present: without it, a vector file lost to a bad merge
/// or a partial checkout would make all four surfaces report "green" over a corpus
/// that had silently shrunk — the precise false confidence this feature exists to
/// prevent.
const REQUIRED_SUITES: [&str; 5] = ["abi", "eip712", "primitives", "safe", "webauthn"];

fn vectors_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/vectors")
}

// ---------------------------------------------------------------------------
// Input/expect helpers
// ---------------------------------------------------------------------------

fn in_str(input: &Value, key: &str) -> Result<String, String> {
    input
        .get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or_else(|| format!("missing string input `{key}`"))
}

fn in_bytes(input: &Value, key: &str) -> Result<Vec<u8>, String> {
    let s = in_str(input, key)?;
    let clean = s.strip_prefix("0x").unwrap_or(&s);
    hex_decode(clean).map_err(|e| format!("bad hex in input `{key}`: {e}"))
}

fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
    if s.len() % 2 != 0 {
        return Err("odd length".to_owned());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| e.to_string()))
        .collect()
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(2 + bytes.len() * 2);
    out.push_str("0x");
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// The expected error code if this case expects an error.
fn expected_error(expect: &Value) -> Option<&str> {
    expect.get("error").and_then(Value::as_str)
}

/// Compare a fallible bytes-returning call against the expectation.
fn check_bytes(
    expect: &Value,
    actual: Result<Vec<u8>, vela_core::CoreError>,
) -> Result<(), String> {
    check_with(expect, actual.map(|b| Value::String(hex_encode(&b))))
}

/// Compare a fallible string-returning call against the expectation.
fn check_string(
    expect: &Value,
    actual: Result<String, vela_core::CoreError>,
) -> Result<(), String> {
    check_with(expect, actual.map(Value::String))
}

/// Core comparison: expectation is either {error: code} or {value: <json>} /
/// an object of named fields (compared by the caller via `check_object`).
fn check_with(expect: &Value, actual: Result<Value, vela_core::CoreError>) -> Result<(), String> {
    match (expected_error(expect), actual) {
        (Some(code), Err(e)) => {
            if e.code() == code {
                Ok(())
            } else {
                Err(format!(
                    "expected error {code}, got error {} ({e})",
                    e.code()
                ))
            }
        }
        (Some(code), Ok(v)) => Err(format!("expected error {code}, got Ok({v})")),
        (None, Err(e)) => Err(format!("expected success, got error {} ({e})", e.code())),
        (None, Ok(v)) => {
            let want = expect
                .get("value")
                .ok_or_else(|| "expectation missing `value`".to_owned())?;
            if values_equal(want, &v) {
                Ok(())
            } else {
                Err(format!("expected {want}, got {v}"))
            }
        }
    }
}

/// Compare a fallible struct-returning call (serialized to JSON) field-by-field
/// against every non-error key in the expectation object.
fn check_object(expect: &Value, actual: Result<Value, vela_core::CoreError>) -> Result<(), String> {
    match (expected_error(expect), actual) {
        (Some(code), Err(e)) => {
            if e.code() == code {
                Ok(())
            } else {
                Err(format!(
                    "expected error {code}, got error {} ({e})",
                    e.code()
                ))
            }
        }
        (Some(code), Ok(v)) => Err(format!("expected error {code}, got Ok({v})")),
        (None, Err(e)) => Err(format!("expected success, got error {} ({e})", e.code())),
        (None, Ok(actual_obj)) => {
            let expect_obj = expect
                .as_object()
                .ok_or_else(|| "expectation is not an object".to_owned())?;
            for (key, want) in expect_obj {
                let got = actual_obj
                    .get(key)
                    .ok_or_else(|| format!("actual result missing field `{key}`"))?;
                if !values_equal(want, got) {
                    return Err(format!("field `{key}`: expected {want}, got {got}"));
                }
            }
            Ok(())
        }
    }
}

/// Hex strings compare case-insensitively ONLY when both sides are plain
/// lowercase-vs-value mismatches would hide checksum bugs, so: exact string
/// compare, except numbers compare numerically.
fn values_equal(want: &Value, got: &Value) -> bool {
    want == got
}

// ---------------------------------------------------------------------------
// Dispatcher — one arm per contracts/core-api.md function, added module by module
// ---------------------------------------------------------------------------

fn in_bool(input: &Value, key: &str) -> Result<bool, String> {
    input
        .get(key)
        .and_then(Value::as_bool)
        .ok_or_else(|| format!("missing bool input `{key}`"))
}

fn run_case(case: &Case) -> Result<(), String> {
    use vela_core::primitives as prim;
    let input = &case.input;
    let expect = &case.expect;
    match case.func.as_str() {
        // --- primitives ---
        "keccak256" => check_bytes(expect, Ok(prim::keccak256(&in_bytes(input, "data")?))),
        "sha256" => check_bytes(expect, Ok(prim::sha256(&in_bytes(input, "data")?))),
        "checksum_address" => check_string(
            expect,
            prim::checksum_address(&in_str(input, "address_hex")?),
        ),
        "function_selector" => check_bytes(
            expect,
            prim::function_selector(&in_str(input, "signature")?),
        ),
        "create2_address" => check_string(
            expect,
            prim::create2_address(
                &in_str(input, "deployer_hex")?,
                &in_bytes(input, "salt")?,
                &in_bytes(input, "init_code_hash")?,
            ),
        ),
        "to_hex" => check_string(
            expect,
            Ok(prim::to_hex(
                &in_bytes(input, "data")?,
                in_bool(input, "prefixed")?,
            )),
        ),
        "from_hex" => check_bytes(expect, prim::from_hex(&in_str(input, "s")?)),
        "to_quantity" => check_string(expect, prim::to_quantity(&in_str(input, "value")?)),
        "to_base64url" => check_string(expect, Ok(prim::to_base64url(&in_bytes(input, "data")?))),
        "from_base64url" => check_bytes(expect, prim::from_base64url(&in_str(input, "s")?)),
        "abi_encode_address" => check_bytes(
            expect,
            prim::abi_encode_address(&in_str(input, "address_hex")?),
        ),
        "abi_encode_uint256" => check_bytes(
            expect,
            prim::abi_encode_uint256(&in_str(input, "value_hex")?),
        ),
        "abi_encode_bytes32" => {
            check_bytes(expect, prim::abi_encode_bytes32(&in_bytes(input, "data")?))
        }
        // --- abi ---
        "canonicalize_signature" => check_string(
            expect,
            vela_core::abi::canonicalize_signature(&in_str(input, "sig")?),
        ),
        "compute_selector" => check_string(
            expect,
            vela_core::abi::compute_selector(&in_str(input, "sig")?),
        ),
        "match_selector" => check_with(
            expect,
            vela_core::abi::match_selector(&in_str(input, "sig")?, &in_bytes(input, "calldata")?)
                .map(Value::Bool),
        ),
        "decode_calldata" => check_with(
            expect,
            vela_core::abi::decode_calldata(&in_str(input, "sig")?, &in_bytes(input, "calldata")?)
                .map(|tree| serde_json::to_value(tree).unwrap_or(Value::Null)),
        ),
        // --- eip712 ---
        "hash_typed_data" => check_bytes(
            expect,
            vela_core::eip712::hash_typed_data(&in_str(input, "typed_data_json")?),
        ),
        "encode_type" => check_string(
            expect,
            vela_core::eip712::encode_type(&in_str(input, "typed_data_json")?),
        ),
        // --- safe ---
        "parse_public_key" => check_object(
            expect,
            vela_core::safe::parse_public_key(&in_str(input, "hex")?)
                .map(|k| serde_json::json!({ "x": hex_encode(&k.x), "y": hex_encode(&k.y) })),
        ),
        "compute_safe_address" => check_object(
            expect,
            vela_core::safe::compute_safe_address(&in_bytes(input, "x")?, &in_bytes(input, "y")?)
                .map(|info| {
                    serde_json::json!({
                        "address": info.address,
                        "salt_nonce": hex_encode(&info.salt_nonce),
                        "setup_data": hex_encode(&info.setup_data),
                        "init_code_hash": hex_encode(&info.init_code_hash),
                    })
                }),
        ),
        "compute_splitter_address" => check_string(
            expect,
            vela_core::safe::compute_splitter_address(&in_str(input, "treasury_hex")?),
        ),
        "encode_splitter_deploy_call" => check_bytes(
            expect,
            vela_core::safe::encode_splitter_deploy_call(&in_str(input, "treasury_hex")?),
        ),
        "safe_proxy_runtime_code" => {
            check_string(expect, vela_core::safe::safe_proxy_runtime_code())
        }
        // --- webauthn ---
        "extract_attestation_public_key" => check_object(
            expect,
            vela_core::webauthn::extract_attestation_public_key(&in_bytes(
                input,
                "attestation_object",
            )?)
            .map(|k| serde_json::json!({ "x": hex_encode(&k.x), "y": hex_encode(&k.y) })),
        ),
        "der_signature_to_raw_low_s" => check_bytes(
            expect,
            vela_core::webauthn::der_signature_to_raw_low_s(&in_bytes(input, "der")?),
        ),
        "validate_client_data" => {
            let kind = match in_str(input, "kind")?.as_str() {
                "Get" => vela_core::ClientDataKind::Get,
                "Create" => vela_core::ClientDataKind::Create,
                other => return Err(format!("unknown ClientDataKind `{other}`")),
            };
            check_with(
                expect,
                vela_core::webauthn::validate_client_data(
                    kind,
                    &in_bytes(input, "client_data_json")?,
                    &in_bytes(input, "authenticator_data")?,
                )
                .map(|()| Value::Bool(true)),
            )
        }
        "webauthn_signing_hash" => check_bytes(
            expect,
            Ok(vela_core::webauthn::webauthn_signing_hash(
                &in_bytes(input, "authenticator_data")?,
                &in_bytes(input, "client_data_json")?,
            )),
        ),
        "recover_public_key_from_assertions" => {
            let assertion = |key: &str| -> Result<vela_core::WebAuthnAssertion, String> {
                let obj = input
                    .get(key)
                    .ok_or_else(|| format!("missing assertion input `{key}`"))?;
                Ok(vela_core::WebAuthnAssertion {
                    authenticator_data: in_bytes(obj, "authenticator_data")?,
                    client_data_json: in_bytes(obj, "client_data_json")?,
                    signature_der: in_bytes(obj, "signature_der")?,
                })
            };
            check_with(
                expect,
                vela_core::webauthn::recover_public_key_from_assertions(
                    &assertion("a")?,
                    &assertion("b")?,
                )
                .map(|opt| match opt {
                    Some(k) => Value::String(format!(
                        "04{}{}",
                        &hex_encode(&k.x)[2..],
                        &hex_encode(&k.y)[2..]
                    )),
                    None => Value::Null,
                }),
            )
        }
        other => Err(format!(
            "no dispatch arm for fn `{other}` — add it to conformance.rs"
        )),
    }
}

#[test]
fn conformance_corpus() {
    let dir = vectors_dir();
    if !dir.exists() {
        panic!(
            "no conformance corpus at {} — regenerate it with `npm run dump:vectors`",
            dir.display()
        );
    }
    let mut total = 0usize;
    let mut failures: Vec<String> = Vec::new();
    let mut seen_suites: Vec<String> = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(&dir)
        .map(|it| it.flatten().collect::<Vec<_>>())
        .unwrap_or_default();
    entries.sort_by_key(std::fs::DirEntry::file_name);
    for entry in entries {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let raw = match fs::read_to_string(&path) {
            Ok(r) => r,
            Err(e) => {
                failures.push(format!("{}: unreadable: {e}", path.display()));
                continue;
            }
        };
        let suite: SuiteFile = match serde_json::from_str(&raw) {
            Ok(s) => s,
            Err(e) => {
                failures.push(format!("{}: bad schema: {e}", path.display()));
                continue;
            }
        };
        seen_suites.push(suite.suite.clone());
        for case in &suite.cases {
            total += 1;
            if let Err(e) = run_case(case) {
                failures.push(format!(
                    "{}::{} [{}] — {e}",
                    suite.suite, case.name, case.func
                ));
            }
        }
    }
    seen_suites.sort();
    assert_eq!(
        seen_suites, REQUIRED_SUITES,
        "conformance corpus is not the expected set of suites (a dropped or renamed \
         vector file would otherwise pass silently with fewer cases)"
    );
    assert!(
        failures.is_empty(),
        "{} of {total} conformance cases FAILED:\n{}",
        failures.len(),
        failures.join("\n")
    );
    println!("conformance: {total} cases green");
}
