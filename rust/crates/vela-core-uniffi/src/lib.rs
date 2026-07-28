//! uniffi 0.32 shell over vela-core → Kotlin (Android) + Swift (iOS).
//!
//! Thin by design: FFI mirror types + `#[uniffi::export]` wrappers, zero logic.
//! The mirrors convert 1:1 from vela-core's types; the recursive `AbiValue`
//! relies on uniffi 0.32's cycle detection (recursion is through `Vec`, so the
//! generated Swift struct/Kotlin data class need no special indirection).
//! Surface contract: specs/001-rust-core-bindings/contracts/core-api.md.

uniffi::setup_scaffolding!();

// ---------------------------------------------------------------------------
// Error (flat: foreign side sees variant + Display message)
// ---------------------------------------------------------------------------

#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum CoreError {
    #[error("{0}")]
    InvalidHex(String),
    #[error("{0}")]
    InvalidBase64Url(String),
    #[error("{0}")]
    InvalidQuantity(String),
    #[error("{0}")]
    InvalidAddress(String),
    #[error("{0}")]
    InvalidSignature(String),
    #[error("{0}")]
    InvalidCbor(String),
    #[error("{0}")]
    InvalidCoseKey(String),
    #[error("{0}")]
    InvalidClientData(String),
    #[error("{0}")]
    InvalidPublicKey(String),
    #[error("{0}")]
    AbiParse(String),
    #[error("{0}")]
    AbiDecode(String),
    #[error("{0}")]
    Eip712Parse(String),
    #[error("{0}")]
    Eip712NonCanonicalDomain(String),
    #[error("{0}")]
    Internal(String),
}

impl From<vela_core::CoreError> for CoreError {
    fn from(e: vela_core::CoreError) -> Self {
        use vela_core::CoreError as E;
        let msg = e.to_string();
        match e {
            E::InvalidHex(_) => CoreError::InvalidHex(msg),
            E::InvalidBase64Url(_) => CoreError::InvalidBase64Url(msg),
            E::InvalidQuantity(_) => CoreError::InvalidQuantity(msg),
            E::InvalidAddress(_) => CoreError::InvalidAddress(msg),
            E::InvalidSignature(_) => CoreError::InvalidSignature(msg),
            E::InvalidCbor(_) => CoreError::InvalidCbor(msg),
            E::InvalidCoseKey(_) => CoreError::InvalidCoseKey(msg),
            E::InvalidClientData(_) => CoreError::InvalidClientData(msg),
            E::InvalidPublicKey(_) => CoreError::InvalidPublicKey(msg),
            E::AbiParse(_) => CoreError::AbiParse(msg),
            E::AbiDecode(_) => CoreError::AbiDecode(msg),
            E::Eip712Parse(_) => CoreError::Eip712Parse(msg),
            E::Eip712NonCanonicalDomain(_) => CoreError::Eip712NonCanonicalDomain(msg),
            E::Internal(_) => CoreError::Internal(msg),
        }
    }
}

// ---------------------------------------------------------------------------
// Records / enums (mirrors of vela_core::types + AbiValue)
// ---------------------------------------------------------------------------

/// Recursive decoded-calldata tree (uniffi 0.32 auto-detects the cycle).
#[derive(Debug, Clone, uniffi::Record)]
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

#[derive(Debug, Clone, uniffi::Record)]
pub struct P256PublicKey {
    pub x: Vec<u8>,
    pub y: Vec<u8>,
}

impl From<vela_core::P256PublicKey> for P256PublicKey {
    fn from(k: vela_core::P256PublicKey) -> Self {
        P256PublicKey { x: k.x, y: k.y }
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct SafeAddressInfo {
    pub address: String,
    pub salt_nonce: Vec<u8>,
    pub setup_data: Vec<u8>,
    pub init_code_hash: Vec<u8>,
}

impl From<vela_core::SafeAddressInfo> for SafeAddressInfo {
    fn from(i: vela_core::SafeAddressInfo) -> Self {
        SafeAddressInfo {
            address: i.address,
            salt_nonce: i.salt_nonce,
            setup_data: i.setup_data,
            init_code_hash: i.init_code_hash,
        }
    }
}

#[derive(Debug, Clone, uniffi::Record)]
pub struct WebAuthnAssertion {
    pub authenticator_data: Vec<u8>,
    pub client_data_json: Vec<u8>,
    pub signature_der: Vec<u8>,
}

impl From<WebAuthnAssertion> for vela_core::WebAuthnAssertion {
    fn from(a: WebAuthnAssertion) -> Self {
        vela_core::WebAuthnAssertion {
            authenticator_data: a.authenticator_data,
            client_data_json: a.client_data_json,
            signature_der: a.signature_der,
        }
    }
}

#[derive(Debug, Clone, Copy, uniffi::Enum)]
pub enum ClientDataKind {
    Create,
    Get,
}

impl From<ClientDataKind> for vela_core::ClientDataKind {
    fn from(k: ClientDataKind) -> Self {
        match k {
            ClientDataKind::Create => vela_core::ClientDataKind::Create,
            ClientDataKind::Get => vela_core::ClientDataKind::Get,
        }
    }
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn keccak256(data: Vec<u8>) -> Vec<u8> {
    vela_core::primitives::keccak256(&data)
}

#[uniffi::export]
pub fn sha256(data: Vec<u8>) -> Vec<u8> {
    vela_core::primitives::sha256(&data)
}

#[uniffi::export]
pub fn to_hex(data: Vec<u8>, prefixed: bool) -> String {
    vela_core::primitives::to_hex(&data, prefixed)
}

#[uniffi::export]
pub fn from_hex(s: String) -> Result<Vec<u8>, CoreError> {
    Ok(vela_core::primitives::from_hex(&s)?)
}

#[uniffi::export]
pub fn to_quantity(value: String) -> Result<String, CoreError> {
    Ok(vela_core::primitives::to_quantity(&value)?)
}

#[uniffi::export]
pub fn checksum_address(address_hex: String) -> Result<String, CoreError> {
    Ok(vela_core::primitives::checksum_address(&address_hex)?)
}

#[uniffi::export]
pub fn function_selector(signature: String) -> Result<Vec<u8>, CoreError> {
    Ok(vela_core::primitives::function_selector(&signature)?)
}

#[uniffi::export]
pub fn create2_address(
    deployer_hex: String,
    salt: Vec<u8>,
    init_code_hash: Vec<u8>,
) -> Result<String, CoreError> {
    Ok(vela_core::primitives::create2_address(
        &deployer_hex,
        &salt,
        &init_code_hash,
    )?)
}

#[uniffi::export]
pub fn to_base64url(data: Vec<u8>) -> String {
    vela_core::primitives::to_base64url(&data)
}

#[uniffi::export]
pub fn from_base64url(s: String) -> Result<Vec<u8>, CoreError> {
    Ok(vela_core::primitives::from_base64url(&s)?)
}

#[uniffi::export]
pub fn abi_encode_address(address_hex: String) -> Result<Vec<u8>, CoreError> {
    Ok(vela_core::primitives::abi_encode_address(&address_hex)?)
}

#[uniffi::export]
pub fn abi_encode_uint256(value_hex: String) -> Result<Vec<u8>, CoreError> {
    Ok(vela_core::primitives::abi_encode_uint256(&value_hex)?)
}

#[uniffi::export]
pub fn abi_encode_bytes32(data: Vec<u8>) -> Result<Vec<u8>, CoreError> {
    Ok(vela_core::primitives::abi_encode_bytes32(&data)?)
}

// ---------------------------------------------------------------------------
// abi
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn canonicalize_signature(sig: String) -> Result<String, CoreError> {
    Ok(vela_core::abi::canonicalize_signature(&sig)?)
}

#[uniffi::export]
pub fn compute_selector(sig: String) -> Result<String, CoreError> {
    Ok(vela_core::abi::compute_selector(&sig)?)
}

#[uniffi::export]
pub fn match_selector(sig: String, calldata: Vec<u8>) -> Result<bool, CoreError> {
    Ok(vela_core::abi::match_selector(&sig, &calldata)?)
}

#[uniffi::export]
pub fn decode_calldata(sig: String, calldata: Vec<u8>) -> Result<AbiValue, CoreError> {
    Ok(vela_core::abi::decode_calldata(&sig, &calldata)?.into())
}

// ---------------------------------------------------------------------------
// eip712
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn hash_typed_data(typed_data_json: String) -> Result<Vec<u8>, CoreError> {
    Ok(vela_core::eip712::hash_typed_data(&typed_data_json)?)
}

#[uniffi::export]
pub fn encode_type(typed_data_json: String) -> Result<String, CoreError> {
    Ok(vela_core::eip712::encode_type(&typed_data_json)?)
}

// ---------------------------------------------------------------------------
// safe
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn parse_public_key(hex: String) -> Result<P256PublicKey, CoreError> {
    Ok(vela_core::safe::parse_public_key(&hex)?.into())
}

#[uniffi::export]
pub fn compute_safe_address(x: Vec<u8>, y: Vec<u8>) -> Result<SafeAddressInfo, CoreError> {
    Ok(vela_core::safe::compute_safe_address(&x, &y)?.into())
}

#[uniffi::export]
pub fn compute_splitter_address(treasury_hex: String) -> Result<String, CoreError> {
    Ok(vela_core::safe::compute_splitter_address(&treasury_hex)?)
}

#[uniffi::export]
pub fn encode_splitter_deploy_call(treasury_hex: String) -> Result<Vec<u8>, CoreError> {
    Ok(vela_core::safe::encode_splitter_deploy_call(&treasury_hex)?)
}

#[uniffi::export]
pub fn safe_proxy_runtime_code() -> Result<String, CoreError> {
    Ok(vela_core::safe::safe_proxy_runtime_code()?)
}

// ---------------------------------------------------------------------------
// webauthn
// ---------------------------------------------------------------------------

#[uniffi::export]
pub fn extract_attestation_public_key(
    attestation_object: Vec<u8>,
) -> Result<P256PublicKey, CoreError> {
    Ok(vela_core::webauthn::extract_attestation_public_key(&attestation_object)?.into())
}

#[uniffi::export]
pub fn der_signature_to_raw_low_s(der: Vec<u8>) -> Result<Vec<u8>, CoreError> {
    Ok(vela_core::webauthn::der_signature_to_raw_low_s(&der)?)
}

#[uniffi::export]
pub fn validate_client_data(
    kind: ClientDataKind,
    client_data_json: Vec<u8>,
    authenticator_data: Vec<u8>,
) -> Result<(), CoreError> {
    Ok(vela_core::webauthn::validate_client_data(
        kind.into(),
        &client_data_json,
        &authenticator_data,
    )?)
}

#[uniffi::export]
pub fn webauthn_signing_hash(authenticator_data: Vec<u8>, client_data_json: Vec<u8>) -> Vec<u8> {
    vela_core::webauthn::webauthn_signing_hash(&authenticator_data, &client_data_json)
}

#[uniffi::export]
pub fn recover_public_key_from_assertions(
    a: WebAuthnAssertion,
    b: WebAuthnAssertion,
) -> Result<Option<P256PublicKey>, CoreError> {
    let result = vela_core::webauthn::recover_public_key_from_assertions(&a.into(), &b.into())?;
    Ok(result.map(Into::into))
}
