//! wasm-bindgen shell over vela-core → the Expo web app.
//!
//! Thin by design: DTO mirrors + `#[wasm_bindgen]` wrappers, zero logic.
//! Loading is synchronous `initSync` over a base64-embedded module (metro
//! cannot bundle wasm as ESM and Cloudflare Pages drops `node_modules` asset
//! paths — see specs/001-rust-core-bindings/research.md D7), so the TS facade
//! can call into the core without an async gate.
//!
//! Error contract: every fallible export rejects with `{ code, message }`
//! where `code` is the stable `CoreError` variant name the conformance corpus
//! uses — identical classification to the Kotlin/Swift bindings.

use serde::{Deserialize, Serialize};
use tsify::Tsify;
use wasm_bindgen::prelude::*;

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct CoreErrorJs {
    pub code: String,
    pub message: String,
}

fn err(e: vela_core::CoreError) -> JsValue {
    let payload = CoreErrorJs {
        code: e.code().to_owned(),
        message: e.to_string(),
    };
    serde_wasm_bindgen::to_value(&payload).unwrap_or_else(|_| JsValue::from_str(e.code()))
}

type JsResult<T> = Result<T, JsValue>;

// ---------------------------------------------------------------------------
// DTOs (same shapes as the uniffi records; AbiValue stays recursive)
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct AbiValue {
    pub kind: String,
    pub name: String,
    pub value: String,
    pub children: Vec<AbiValue>,
}

impl From<vela_core::AbiValue> for AbiValue {
    fn from(v: vela_core::AbiValue) -> Self {
        AbiValue {
            kind: v.kind,
            name: v.name,
            value: v.value,
            children: v.children.into_iter().map(Into::into).collect(),
        }
    }
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct P256PublicKey {
    /// 0x-hex, 32 bytes.
    pub x: String,
    /// 0x-hex, 32 bytes.
    pub y: String,
}

impl From<vela_core::P256PublicKey> for P256PublicKey {
    fn from(k: vela_core::P256PublicKey) -> Self {
        P256PublicKey {
            x: vela_core::primitives::to_hex(&k.x, true),
            y: vela_core::primitives::to_hex(&k.y, true),
        }
    }
}

#[derive(Serialize, Deserialize, Tsify)]
#[tsify(into_wasm_abi)]
pub struct SafeAddressInfo {
    pub address: String,
    /// 0x-hex, 32 bytes.
    pub salt_nonce: String,
    /// 0x-hex.
    pub setup_data: String,
    /// 0x-hex, 32 bytes.
    pub init_code_hash: String,
}

impl From<vela_core::SafeAddressInfo> for SafeAddressInfo {
    fn from(i: vela_core::SafeAddressInfo) -> Self {
        SafeAddressInfo {
            address: i.address,
            salt_nonce: vela_core::primitives::to_hex(&i.salt_nonce, true),
            setup_data: vela_core::primitives::to_hex(&i.setup_data, true),
            init_code_hash: vela_core::primitives::to_hex(&i.init_code_hash, true),
        }
    }
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

#[wasm_bindgen]
pub fn keccak256(data: &[u8]) -> Vec<u8> {
    vela_core::primitives::keccak256(data)
}

#[wasm_bindgen]
pub fn sha256(data: &[u8]) -> Vec<u8> {
    vela_core::primitives::sha256(data)
}

#[wasm_bindgen(js_name = toHex)]
pub fn to_hex(data: &[u8], prefixed: bool) -> String {
    vela_core::primitives::to_hex(data, prefixed)
}

#[wasm_bindgen(js_name = fromHex)]
pub fn from_hex(s: &str) -> JsResult<Vec<u8>> {
    vela_core::primitives::from_hex(s).map_err(err)
}

#[wasm_bindgen(js_name = toQuantity)]
pub fn to_quantity(value: &str) -> JsResult<String> {
    vela_core::primitives::to_quantity(value).map_err(err)
}

#[wasm_bindgen(js_name = checksumAddress)]
pub fn checksum_address(address_hex: &str) -> JsResult<String> {
    vela_core::primitives::checksum_address(address_hex).map_err(err)
}

#[wasm_bindgen(js_name = functionSelector)]
pub fn function_selector(signature: &str) -> JsResult<Vec<u8>> {
    vela_core::primitives::function_selector(signature).map_err(err)
}

#[wasm_bindgen(js_name = create2Address)]
pub fn create2_address(
    deployer_hex: &str,
    salt: &[u8],
    init_code_hash: &[u8],
) -> JsResult<String> {
    vela_core::primitives::create2_address(deployer_hex, salt, init_code_hash).map_err(err)
}

#[wasm_bindgen(js_name = toBase64Url)]
pub fn to_base64url(data: &[u8]) -> String {
    vela_core::primitives::to_base64url(data)
}

#[wasm_bindgen(js_name = fromBase64Url)]
pub fn from_base64url(s: &str) -> JsResult<Vec<u8>> {
    vela_core::primitives::from_base64url(s).map_err(err)
}

#[wasm_bindgen(js_name = abiEncodeAddress)]
pub fn abi_encode_address(address_hex: &str) -> JsResult<Vec<u8>> {
    vela_core::primitives::abi_encode_address(address_hex).map_err(err)
}

#[wasm_bindgen(js_name = abiEncodeUint256)]
pub fn abi_encode_uint256(value_hex: &str) -> JsResult<Vec<u8>> {
    vela_core::primitives::abi_encode_uint256(value_hex).map_err(err)
}

#[wasm_bindgen(js_name = abiEncodeBytes32)]
pub fn abi_encode_bytes32(data: &[u8]) -> JsResult<Vec<u8>> {
    vela_core::primitives::abi_encode_bytes32(data).map_err(err)
}

// ---------------------------------------------------------------------------
// abi
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = canonicalizeSignature)]
pub fn canonicalize_signature(sig: &str) -> JsResult<String> {
    vela_core::abi::canonicalize_signature(sig).map_err(err)
}

#[wasm_bindgen(js_name = computeSelector)]
pub fn compute_selector(sig: &str) -> JsResult<String> {
    vela_core::abi::compute_selector(sig).map_err(err)
}

#[wasm_bindgen(js_name = matchSelector)]
pub fn match_selector(sig: &str, calldata: &[u8]) -> JsResult<bool> {
    vela_core::abi::match_selector(sig, calldata).map_err(err)
}

#[wasm_bindgen(js_name = decodeCalldata)]
pub fn decode_calldata(sig: &str, calldata: &[u8]) -> JsResult<AbiValue> {
    vela_core::abi::decode_calldata(sig, calldata)
        .map(Into::into)
        .map_err(err)
}

// ---------------------------------------------------------------------------
// eip712
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = hashTypedData)]
pub fn hash_typed_data(typed_data_json: &str) -> JsResult<Vec<u8>> {
    vela_core::eip712::hash_typed_data(typed_data_json).map_err(err)
}

#[wasm_bindgen(js_name = encodeType)]
pub fn encode_type(typed_data_json: &str) -> JsResult<String> {
    vela_core::eip712::encode_type(typed_data_json).map_err(err)
}

// ---------------------------------------------------------------------------
// safe
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = parsePublicKey)]
pub fn parse_public_key(hex: &str) -> JsResult<P256PublicKey> {
    vela_core::safe::parse_public_key(hex)
        .map(Into::into)
        .map_err(err)
}

#[wasm_bindgen(js_name = computeSafeAddress)]
pub fn compute_safe_address(x: &[u8], y: &[u8]) -> JsResult<SafeAddressInfo> {
    vela_core::safe::compute_safe_address(x, y)
        .map(Into::into)
        .map_err(err)
}

#[wasm_bindgen(js_name = computeSplitterAddress)]
pub fn compute_splitter_address(treasury_hex: &str) -> JsResult<String> {
    vela_core::safe::compute_splitter_address(treasury_hex).map_err(err)
}

#[wasm_bindgen(js_name = encodeSplitterDeployCall)]
pub fn encode_splitter_deploy_call(treasury_hex: &str) -> JsResult<Vec<u8>> {
    vela_core::safe::encode_splitter_deploy_call(treasury_hex).map_err(err)
}

#[wasm_bindgen(js_name = safeProxyRuntimeCode)]
pub fn safe_proxy_runtime_code() -> JsResult<String> {
    vela_core::safe::safe_proxy_runtime_code().map_err(err)
}

// ---------------------------------------------------------------------------
// webauthn
// ---------------------------------------------------------------------------

#[wasm_bindgen(js_name = extractAttestationPublicKey)]
pub fn extract_attestation_public_key(attestation_object: &[u8]) -> JsResult<P256PublicKey> {
    vela_core::webauthn::extract_attestation_public_key(attestation_object)
        .map(Into::into)
        .map_err(err)
}

#[wasm_bindgen(js_name = derSignatureToRawLowS)]
pub fn der_signature_to_raw_low_s(der: &[u8]) -> JsResult<Vec<u8>> {
    vela_core::webauthn::der_signature_to_raw_low_s(der).map_err(err)
}

/// `kind` is `"create"` or `"get"` (anything else errors — the caller is
/// choosing which contract-mirrored rule set applies).
#[wasm_bindgen(js_name = validateClientData)]
pub fn validate_client_data(
    kind: &str,
    client_data_json: &[u8],
    authenticator_data: &[u8],
) -> JsResult<()> {
    let kind = match kind {
        "create" => vela_core::ClientDataKind::Create,
        "get" => vela_core::ClientDataKind::Get,
        other => {
            return Err(err(vela_core::CoreError::InvalidClientData(format!(
                "unknown client data kind `{other}`"
            ))))
        }
    };
    vela_core::webauthn::validate_client_data(kind, client_data_json, authenticator_data)
        .map_err(err)
}

#[wasm_bindgen(js_name = webauthnSigningHash)]
pub fn webauthn_signing_hash(authenticator_data: &[u8], client_data_json: &[u8]) -> Vec<u8> {
    vela_core::webauthn::webauthn_signing_hash(authenticator_data, client_data_json)
}

/// Returns `null` when the two assertions do not pin down exactly one key
/// (different credentials, or the same signature twice) — that is a legitimate
/// outcome, not an error.
#[wasm_bindgen(js_name = recoverPublicKeyFromAssertions)]
pub fn recover_public_key_from_assertions(
    a_authenticator_data: &[u8],
    a_client_data_json: &[u8],
    a_signature_der: &[u8],
    b_authenticator_data: &[u8],
    b_client_data_json: &[u8],
    b_signature_der: &[u8],
) -> JsResult<Option<P256PublicKey>> {
    let a = vela_core::WebAuthnAssertion {
        authenticator_data: a_authenticator_data.to_vec(),
        client_data_json: a_client_data_json.to_vec(),
        signature_der: a_signature_der.to_vec(),
    };
    let b = vela_core::WebAuthnAssertion {
        authenticator_data: b_authenticator_data.to_vec(),
        client_data_json: b_client_data_json.to_vec(),
        signature_der: b_signature_der.to_vec(),
    };
    vela_core::webauthn::recover_public_key_from_assertions(&a, &b)
        .map(|opt| opt.map(Into::into))
        .map_err(err)
}
