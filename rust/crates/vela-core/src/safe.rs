//! Counterfactual Safe + gas-splitter address assembly — the user's on-chain
//! identity across all supported chains.
//!
//! Port of src/services/safe-address.ts (itself a port of
//! SafeAddressComputer.swift — the drift class this crate retires). Deployment
//! constants are chain-independent; the splitter trio MUST stay byte-identical
//! to vela-relay/shared/contracts/splitter.ts (cross-repo contract). The
//! `compute_safe_address` identity vector
//! (`0x762EdA60D3B68755c271D608644650278f88329F`) is a release blocker:
//! existing users' addresses must never change.

use crate::error::CoreError;
use crate::primitives::{self, parse_address};
use crate::types::{P256PublicKey, SafeAddressInfo};
use alloy_primitives::keccak256;

pub const SAFE_PROXY_FACTORY: &str = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
pub const SAFE_SINGLETON: &str = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
pub const FALLBACK_HANDLER: &str = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";
pub const ENTRY_POINT: &str = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";
pub const SAFE_4337_MODULE: &str = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226";
pub const SAFE_MODULE_SETUP: &str = "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47";
pub const WEBAUTHN_SIGNER: &str = "0x94a4F6affBd8975951142c3999aEAB7ecee555c2";
pub const MULTI_SEND: &str = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

/// Safe v1.4.1 SafeProxyFactory proxy creation code (bare hex, no 0x).
pub const PROXY_CREATION_CODE: &str = "608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564";

/// Constructor tail `CODECOPY; RETURN; INVALID` — the runtime region starts
/// right after it. Derived, never hardcoded, so creation/runtime cannot drift.
const PROXY_RUNTIME_SEPARATOR: &str = "6000396000f3fe";
/// Declared by the constructor's `PUSH1 0xab`.
const PROXY_RUNTIME_LEN_BYTES: usize = 0xab;

/// Deployed (runtime) bytecode of a Safe v1.4.1 proxy, 0x-prefixed — what
/// `eth_getCode` returns for any proxy from this factory (singleton lives in
/// storage, not code). Used to present counterfactual accounts as contracts.
pub fn safe_proxy_runtime_code() -> Result<String, CoreError> {
    let start = PROXY_CREATION_CODE
        .find(PROXY_RUNTIME_SEPARATOR)
        .ok_or_else(|| CoreError::Internal("proxy runtime separator not found".to_owned()))?
        + PROXY_RUNTIME_SEPARATOR.len();
    let end = start + PROXY_RUNTIME_LEN_BYTES * 2;
    let runtime = PROXY_CREATION_CODE
        .get(start..end)
        .ok_or_else(|| CoreError::Internal("proxy runtime region out of range".to_owned()))?;
    Ok(format!("0x{runtime}"))
}

// MARK: VelaGasSettlementSplitter — MUST stay byte-identical to
// vela-relay/shared/contracts/splitter.ts (see safe-address.ts CRITICAL note).

pub const VELA_SPLITTER_FACTORY: &str = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
/// keccak256("vela.gas-settlement-splitter.v1") — bare hex, matches the bundler.
pub const VELA_SPLITTER_SALT: &str =
    "650cb20978a0e7efdcf6f077240c609a59f2f02401ed16fb4a222a2b51cb9720";
/// Pinned metadata-light / PUSH0-free forge build — bare hex, matches the bundler.
pub const VELA_SPLITTER_CREATION_CODE: &str = "60a060405234801561001057600080fd5b506040516105f13803806105f183398181016040528101906100329190610135565b600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1603610098576040517fd92e233d00000000000000000000000000000000000000000000000000000000815260040160405180910390fd5b8073ffffffffffffffffffffffffffffffffffffffff1660808173ffffffffffffffffffffffffffffffffffffffff168152505050610162565b600080fd5b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b6000610102826100d7565b9050919050565b610112816100f7565b811461011d57600080fd5b50565b60008151905061012f81610109565b92915050565b60006020828403121561014b5761014a6100d2565b5b600061015984828501610120565b91505092915050565b60805161045f6101926000396000818161010a01528181610199015281816101fa01526102b5015261045f6000f3fe6080604052600436106100225760003560e01c806361d027b31461028857610283565b36610283576000329050600060023461003b9190610310565b905060008111156100f85760008273ffffffffffffffffffffffffffffffffffffffff168260405161006c90610372565b60006040518083038185875af1925050503d80600081146100a9576040519150601f19603f3d011682016040523d82523d6000602084013e6100ae565b606091505b50509050806100f65782826040517f1c43b9760000000000000000000000000000000000000000000000000000000081526004016100ed9291906103d7565b60405180910390fd5b505b600047905060008111156101f85760007f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff168260405161014c90610372565b60006040518083038185875af1925050503d8060008114610189576040519150601f19603f3d011682016040523d82523d6000602084013e61018e565b606091505b50509050806101f6577f0000000000000000000000000000000000000000000000000000000000000000826040517f1c43b9760000000000000000000000000000000000000000000000000000000081526004016101ed9291906103d7565b60405180910390fd5b505b7f000000000000000000000000000000000000000000000000000000000000000073ffffffffffffffffffffffffffffffffffffffff168373ffffffffffffffffffffffffffffffffffffffff167fa4e98e523c3e239a66755f9f6a3d3559544e2da7102a26ec45994c3a29599d4234858560405161027993929190610400565b60405180910390a3005b600080fd5b34801561029457600080fd5b5061029d6102b3565b6040516102aa9190610437565b60405180910390f35b7f000000000000000000000000000000000000000000000000000000000000000081565b6000819050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052601260045260246000fd5b600061031b826102d7565b9150610326836102d7565b925082610336576103356102e1565b5b828204905092915050565b600081905092915050565b50565b600061035c600083610341565b91506103678261034c565b600082019050919050565b600061037d8261034f565b9150819050919050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006103b282610387565b9050919050565b6103c2816103a7565b82525050565b6103d1816102d7565b82525050565b60006040820190506103ec60008301856103b9565b6103f960208301846103c8565b9392505050565b600060608201905061041560008301866103c8565b61042260208301856103c8565b61042f60408301846103c8565b949350505050565b600060208201905061044c60008301846103b9565b9291505056fea164736f6c634300081c000a";

/// Strict uncompressed P-256 public-key parse: optional 0x, optional 04 SEC1
/// tag, then exactly 64 bytes of x‖y. Format validation only — no curve check
/// (keys here come from the passkey layer; on-curve checks live in webauthn
/// extraction/recovery where keys originate). The TS original returned empty
/// arrays on bad input — enumerated divergence.
pub fn parse_public_key(hex: &str) -> Result<P256PublicKey, CoreError> {
    let clean = hex.strip_prefix("0x").unwrap_or(hex);
    let clean = clean.strip_prefix("04").unwrap_or(clean);
    if clean.len() != 128 {
        return Err(CoreError::InvalidPublicKey(format!(
            "expected 128 hex chars of x‖y, got {}",
            clean.len()
        )));
    }
    let bytes = primitives::from_hex(clean)
        .map_err(|_| CoreError::InvalidPublicKey("not valid hex".to_owned()))?;
    Ok(P256PublicKey {
        x: bytes[..32].to_vec(),
        y: bytes[32..].to_vec(),
    })
}

/// One MultiSend sub-transaction:
/// `operation(1) ‖ to(20) ‖ value(32, zero) ‖ dataLen(32) ‖ data`.
fn encode_multisend_tx(to: &str, data: &[u8], operation: u8) -> Result<Vec<u8>, CoreError> {
    let to_addr = parse_address(to)?;
    let mut out = Vec::with_capacity(85 + data.len());
    out.push(operation);
    out.extend_from_slice(to_addr.as_slice());
    out.extend_from_slice(&[0u8; 32]);
    out.extend_from_slice(&primitives::abi_encode_uint256(&format!(
        "{:x}",
        data.len()
    ))?);
    out.extend_from_slice(data);
    Ok(out)
}

/// Safe.setup() calldata: owners=[WEBAUTHN_SIGNER], threshold=1, `to`=MultiSend
/// delegatecall packing (1) SAFE_MODULE_SETUP.enableModules([SAFE_4337_MODULE])
/// and (2) WEBAUTHN_SIGNER.configure((x,y,verifiers=0x100 — the RIP-7212
/// precompile address)); fallbackHandler = SAFE_4337_MODULE.
fn encode_setup_data(x: &[u8], y: &[u8]) -> Result<Vec<u8>, CoreError> {
    let enable_modules = {
        let mut d = primitives::function_selector("enableModules(address[])")?;
        d.extend_from_slice(&primitives::abi_encode_uint256("0x20")?);
        d.extend_from_slice(&primitives::abi_encode_uint256("0x1")?);
        d.extend_from_slice(&primitives::abi_encode_address(SAFE_4337_MODULE)?);
        d
    };
    let configure = {
        let mut d = primitives::function_selector("configure((uint256,uint256,uint176))")?;
        d.extend_from_slice(&primitives::abi_encode_bytes32(x)?);
        d.extend_from_slice(&primitives::abi_encode_bytes32(y)?);
        d.extend_from_slice(&primitives::abi_encode_uint256("100")?); // RIP-7212 precompile @ 0x100
        d
    };

    let mut packed = encode_multisend_tx(SAFE_MODULE_SETUP, &enable_modules, 1)?;
    packed.extend_from_slice(&encode_multisend_tx(WEBAUTHN_SIGNER, &configure, 1)?);

    let multi_send_data = {
        let mut d = primitives::function_selector("multiSend(bytes)")?;
        d.extend_from_slice(&primitives::abi_encode_uint256("0x20")?);
        d.extend_from_slice(&primitives::abi_encode_uint256(&format!(
            "{:x}",
            packed.len()
        ))?);
        d.extend_from_slice(&packed);
        let padding = (32 - (packed.len() % 32)) % 32;
        d.extend_from_slice(&vec![0u8; padding]);
        d
    };

    let mut out = primitives::function_selector(
        "setup(address[],uint256,address,bytes,address,address,uint256,address)",
    )?;
    out.extend_from_slice(&primitives::abi_encode_uint256("0x100")?); // owners offset (256)
    out.extend_from_slice(&primitives::abi_encode_uint256("0x1")?); // threshold
    out.extend_from_slice(&primitives::abi_encode_address(MULTI_SEND)?);
    out.extend_from_slice(&primitives::abi_encode_uint256("0x140")?); // data offset (256+64)
    out.extend_from_slice(&primitives::abi_encode_address(SAFE_4337_MODULE)?); // fallbackHandler
    out.extend_from_slice(&primitives::abi_encode_address(
        "0x0000000000000000000000000000000000000000",
    )?);
    out.extend_from_slice(&primitives::abi_encode_uint256("0x0")?);
    out.extend_from_slice(&primitives::abi_encode_address(
        "0x0000000000000000000000000000000000000000",
    )?);
    out.extend_from_slice(&primitives::abi_encode_uint256("0x1")?); // owners.length
    out.extend_from_slice(&primitives::abi_encode_address(WEBAUTHN_SIGNER)?);
    out.extend_from_slice(&primitives::abi_encode_uint256(&format!(
        "{:x}",
        multi_send_data.len()
    ))?);
    out.extend_from_slice(&multi_send_data);
    let padding = (32 - (multi_send_data.len() % 32)) % 32;
    out.extend_from_slice(&vec![0u8; padding]);
    Ok(out)
}

/// The wallet identity: counterfactual Safe address + assembly ingredients.
pub fn compute_safe_address(x: &[u8], y: &[u8]) -> Result<SafeAddressInfo, CoreError> {
    if x.len() != 32 || y.len() != 32 {
        return Err(CoreError::InvalidPublicKey(format!(
            "coordinates must be 32 bytes each, got {}/{}",
            x.len(),
            y.len()
        )));
    }
    // saltNonce = keccak256(bytes32(x) ‖ bytes32(y))
    let mut xy = primitives::abi_encode_bytes32(x)?;
    xy.extend_from_slice(&primitives::abi_encode_bytes32(y)?);
    let salt_nonce = keccak256(&xy);

    let setup_data = encode_setup_data(x, y)?;

    // initCodeHash = keccak256(creationCode ‖ abi.encode(singleton))
    let mut deployment_code = primitives::from_hex(PROXY_CREATION_CODE)
        .map_err(|_| CoreError::Internal("PROXY_CREATION_CODE not hex".to_owned()))?;
    deployment_code.extend_from_slice(&primitives::abi_encode_address(SAFE_SINGLETON)?);
    let init_code_hash = keccak256(&deployment_code);

    // salt = keccak256(bytes32(keccak256(setupData)) ‖ bytes32(saltNonce))
    let mut salt_input = keccak256(&setup_data).to_vec();
    salt_input.extend_from_slice(salt_nonce.as_slice());
    let salt = keccak256(&salt_input);

    let address = primitives::create2_address(
        SAFE_PROXY_FACTORY,
        salt.as_slice(),
        init_code_hash.as_slice(),
    )?;
    Ok(SafeAddressInfo {
        address,
        salt_nonce: salt_nonce.to_vec(),
        setup_data,
        init_code_hash: init_code_hash.to_vec(),
    })
}

/// CREATE2 init code for the splitter: `creationCode ‖ abi.encode(treasury)`.
fn splitter_init_code(treasury: &str) -> Result<Vec<u8>, CoreError> {
    let mut code = primitives::from_hex(VELA_SPLITTER_CREATION_CODE)
        .map_err(|_| CoreError::Internal("VELA_SPLITTER_CREATION_CODE not hex".to_owned()))?;
    code.extend_from_slice(&primitives::abi_encode_address(treasury)?);
    Ok(code)
}

/// Deterministic splitter address for a treasury — must equal the bundler's
/// computeSplitterAddress byte-for-byte.
pub fn compute_splitter_address(treasury_hex: &str) -> Result<String, CoreError> {
    let init_code_hash = keccak256(&splitter_init_code(treasury_hex)?);
    let salt = primitives::from_hex(VELA_SPLITTER_SALT)
        .map_err(|_| CoreError::Internal("VELA_SPLITTER_SALT not hex".to_owned()))?;
    primitives::create2_address(VELA_SPLITTER_FACTORY, &salt, init_code_hash.as_slice())
}

/// Raw Arachnid-factory deploy calldata: `salt(32) ‖ initCode`.
pub fn encode_splitter_deploy_call(treasury_hex: &str) -> Result<Vec<u8>, CoreError> {
    let mut out = primitives::from_hex(VELA_SPLITTER_SALT)
        .map_err(|_| CoreError::Internal("VELA_SPLITTER_SALT not hex".to_owned()))?;
    out.extend_from_slice(&splitter_init_code(treasury_hex)?);
    Ok(out)
}
