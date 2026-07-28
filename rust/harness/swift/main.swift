// Replays the conformance corpus through the uniffi-generated SWIFT bindings.
//
// `cargo test` proves the Rust crate matches the corpus, verify-web.mjs proves
// the shipped wasm does, and smoke-kotlin.sh proves the Kotlin bindings do;
// this is the fourth surface — the bindings the planned native iOS app will
// consume (spec SC-001). A green cargo test with a red run here would mean the
// FFI layer, not the core, diverged.
//
// Vectors: the JSON files under rust/crates/vela-core/tests/vectors
// Schema:  specs/001-rust-core-bindings/contracts/conformance-vectors.md

import Foundation

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func hex(_ data: Data) -> String {
    "0x" + data.map { String(format: "%02x", $0) }.joined()
}

func bytes(_ s: String) -> Data {
    let clean = s.hasPrefix("0x") ? String(s.dropFirst(2)) : s
    var out = Data(capacity: clean.count / 2)
    var index = clean.startIndex
    while index < clean.endIndex {
        let next = clean.index(index, offsetBy: 2)
        out.append(UInt8(clean[index..<next], radix: 16) ?? 0)
        index = next
    }
    return out
}

/// Canonical dictionary rendering of an AbiValue tree, matching the vector shape.
func abiValueToJson(_ v: AbiValue) -> [String: Any] {
    [
        "kind": v.kind,
        "name": v.name,
        "value": v.value,
        "children": v.children.map { abiValueToJson($0) },
    ]
}

/// Structural comparison — key order must NOT matter, and numbers/strings/bools
/// compare by their JSON meaning, not by Swift dynamic type.
func jsonEquals(_ a: Any?, _ b: Any?) -> Bool {
    if a == nil && b == nil { return true }
    // Exactly one side nil — an expectation naming a field the result does not
    // have (a typo'd or renamed key). This MUST report as a mismatch: the
    // force-unwrap below would trap and abort the whole run, so every case
    // after it would go unchecked while CI showed only a crash.
    if a == nil || b == nil { return false }
    if a is NSNull && b is NSNull { return true }
    if a is NSNull || b is NSNull { return false }
    if let ad = a as? [String: Any], let bd = b as? [String: Any] {
        if ad.count != bd.count { return false }
        for (k, av) in ad {
            guard let bv = bd[k], jsonEquals(av, bv) else { return false }
        }
        return true
    }
    if let aa = a as? [Any], let ba = b as? [Any] {
        if aa.count != ba.count { return false }
        for (i, av) in aa.enumerated() where !jsonEquals(av, ba[i]) { return false }
        return true
    }
    // Bools must not be compared as numbers: NSNumber bridges true to 1.
    let aIsBool = (a as? NSNumber).map { CFGetTypeID($0) == CFBooleanGetTypeID() } ?? false
    let bIsBool = (b as? NSNumber).map { CFGetTypeID($0) == CFBooleanGetTypeID() } ?? false
    if aIsBool != bIsBool { return false }
    if aIsBool { return (a as! NSNumber).boolValue == (b as! NSNumber).boolValue }
    return String(describing: a!) == String(describing: b!)
}

/// The CoreError variant name, as the corpus spells it.
func errorCode(_ error: CoreError) -> String {
    switch error {
    case .InvalidHex: return "InvalidHex"
    case .InvalidBase64Url: return "InvalidBase64Url"
    case .InvalidQuantity: return "InvalidQuantity"
    case .InvalidAddress: return "InvalidAddress"
    case .InvalidSignature: return "InvalidSignature"
    case .InvalidCbor: return "InvalidCbor"
    case .InvalidCoseKey: return "InvalidCoseKey"
    case .InvalidClientData: return "InvalidClientData"
    case .InvalidPublicKey: return "InvalidPublicKey"
    case .AbiParse: return "AbiParse"
    case .AbiDecode: return "AbiDecode"
    case .Eip712Parse: return "Eip712Parse"
    case .Eip712NonCanonicalDomain: return "Eip712NonCanonicalDomain"
    case .Internal: return "Internal"
    }
}

func errorMessage(_ error: CoreError) -> String {
    switch error {
    case .InvalidHex(let m), .InvalidBase64Url(let m), .InvalidQuantity(let m),
         .InvalidAddress(let m), .InvalidSignature(let m), .InvalidCbor(let m),
         .InvalidCoseKey(let m), .InvalidClientData(let m), .InvalidPublicKey(let m),
         .AbiParse(let m), .AbiDecode(let m), .Eip712Parse(let m),
         .Eip712NonCanonicalDomain(let m), .Internal(let m):
        return m
    }
}

struct NoDispatch: Error { let fn: String }

// ---------------------------------------------------------------------------
// Dispatch — one arm per contracts/core-api.md function (mirrors conformance.rs)
// ---------------------------------------------------------------------------

func str(_ input: [String: Any], _ key: String) -> String { input[key] as? String ?? "" }
func data(_ input: [String: Any], _ key: String) -> Data { bytes(str(input, key)) }

func runCase(_ fn: String, _ input: [String: Any]) throws -> Any? {
    switch fn {
    // primitives
    case "keccak256": return hex(keccak256(data: data(input, "data")))
    case "sha256": return hex(sha256(data: data(input, "data")))
    case "to_hex": return toHex(data: data(input, "data"), prefixed: input["prefixed"] as? Bool ?? false)
    case "from_hex": return hex(try fromHex(s: str(input, "s")))
    case "to_quantity": return try toQuantity(value: str(input, "value"))
    case "checksum_address": return try checksumAddress(addressHex: str(input, "address_hex"))
    case "function_selector": return hex(try functionSelector(signature: str(input, "signature")))
    case "create2_address":
        return try create2Address(
            deployerHex: str(input, "deployer_hex"),
            salt: data(input, "salt"),
            initCodeHash: data(input, "init_code_hash"))
    case "to_base64url": return toBase64url(data: data(input, "data"))
    case "from_base64url": return hex(try fromBase64url(s: str(input, "s")))
    case "abi_encode_address": return hex(try abiEncodeAddress(addressHex: str(input, "address_hex")))
    case "abi_encode_uint256": return hex(try abiEncodeUint256(valueHex: str(input, "value_hex")))
    case "abi_encode_bytes32": return hex(try abiEncodeBytes32(data: data(input, "data")))

    // abi
    case "canonicalize_signature": return try canonicalizeSignature(sig: str(input, "sig"))
    case "compute_selector": return try computeSelector(sig: str(input, "sig"))
    case "match_selector":
        return try matchSelector(sig: str(input, "sig"), calldata: data(input, "calldata"))
    case "decode_calldata":
        return abiValueToJson(try decodeCalldata(sig: str(input, "sig"), calldata: data(input, "calldata")))

    // eip712
    case "hash_typed_data": return hex(try hashTypedData(typedDataJson: str(input, "typed_data_json")))
    case "encode_type": return try encodeType(typedDataJson: str(input, "typed_data_json"))

    // safe
    case "parse_public_key":
        let key = try parsePublicKey(hex: str(input, "hex"))
        return ["x": hex(key.x), "y": hex(key.y)]
    case "compute_safe_address":
        let info = try computeSafeAddress(x: data(input, "x"), y: data(input, "y"))
        return [
            "address": info.address,
            "salt_nonce": hex(info.saltNonce),
            "setup_data": hex(info.setupData),
            "init_code_hash": hex(info.initCodeHash),
        ]
    case "compute_splitter_address":
        return try computeSplitterAddress(treasuryHex: str(input, "treasury_hex"))
    case "encode_splitter_deploy_call":
        return hex(try encodeSplitterDeployCall(treasuryHex: str(input, "treasury_hex")))
    case "safe_proxy_runtime_code": return try safeProxyRuntimeCode()

    // webauthn
    case "extract_attestation_public_key":
        let key = try extractAttestationPublicKey(attestationObject: data(input, "attestation_object"))
        return ["x": hex(key.x), "y": hex(key.y)]
    case "der_signature_to_raw_low_s":
        return hex(try derSignatureToRawLowS(der: data(input, "der")))
    case "validate_client_data":
        let kind: ClientDataKind = str(input, "kind") == "Create" ? .create : .get
        try validateClientData(
            kind: kind,
            clientDataJson: data(input, "client_data_json"),
            authenticatorData: data(input, "authenticator_data"))
        return true
    case "webauthn_signing_hash":
        return hex(webauthnSigningHash(
            authenticatorData: data(input, "authenticator_data"),
            clientDataJson: data(input, "client_data_json")))
    case "recover_public_key_from_assertions":
        let a = input["a"] as? [String: Any] ?? [:]
        let b = input["b"] as? [String: Any] ?? [:]
        let key = try recoverPublicKeyFromAssertions(
            a: WebAuthnAssertion(
                authenticatorData: data(a, "authenticator_data"),
                clientDataJson: data(a, "client_data_json"),
                signatureDer: data(a, "signature_der")),
            b: WebAuthnAssertion(
                authenticatorData: data(b, "authenticator_data"),
                clientDataJson: data(b, "client_data_json"),
                signatureDer: data(b, "signature_der")))
        guard let key else { return NSNull() }
        return "04" + String(hex(key.x).dropFirst(2)) + String(hex(key.y).dropFirst(2))

    default: throw NoDispatch(fn: fn)
    }
}

// ---------------------------------------------------------------------------

let vectorsPath = CommandLine.arguments.count > 1
    ? CommandLine.arguments[1]
    : "crates/vela-core/tests/vectors"

let fileManager = FileManager.default
guard let names = try? fileManager.contentsOfDirectory(atPath: vectorsPath) else {
    FileHandle.standardError.write("smoke-swift: cannot read \(vectorsPath)\n".data(using: .utf8)!)
    exit(1)
}
let vectorFiles = names.filter { $0.hasSuffix(".json") }.sorted()
if vectorFiles.isEmpty {
    FileHandle.standardError.write("smoke-swift: no vector files in \(vectorsPath)\n".data(using: .utf8)!)
    exit(1)
}

/// The corpus is five suites, discovered by scanning the directory. Asserting the
/// exact set is what stops a vector file lost to a bad merge or a partial checkout
/// from making this harness report "green" over a corpus that silently shrank —
/// the precise false confidence this feature exists to prevent.
let REQUIRED_SUITES = ["abi", "eip712", "primitives", "safe", "webauthn"]

var total = 0
var failures: [String] = []
var seenSuites: [String] = []

for name in vectorFiles {
    let raw = try Data(contentsOf: URL(fileURLWithPath: "\(vectorsPath)/\(name)"))
    guard let suite = try JSONSerialization.jsonObject(with: raw) as? [String: Any],
          let suiteName = suite["suite"] as? String,
          let cases = suite["cases"] as? [[String: Any]] else {
        failures.append("\(name) — bad schema")
        continue
    }
    seenSuites.append(suiteName)
    for c in cases {
        total += 1
        let caseName = c["name"] as? String ?? "?"
        let fn = c["fn"] as? String ?? "?"
        let input = c["input"] as? [String: Any] ?? [:]
        let expect = c["expect"] as? [String: Any] ?? [:]
        let label = "\(suiteName)::\(caseName) [\(fn)]"

        var actual: Any?
        var thrown: Error?
        do {
            actual = try runCase(fn, input)
        } catch {
            thrown = error
        }

        if let expectedError = expect["error"] as? String {
            switch thrown {
            case nil:
                failures.append("\(label) — expected error \(expectedError), got \(actual ?? "nil")")
            case let e as CoreError where errorCode(e) != expectedError:
                failures.append("\(label) — expected error \(expectedError), got \(errorCode(e))")
            case let e as CoreError:
                _ = e // matched
            case let e?:
                failures.append("\(label) — expected error \(expectedError), got \(e)")
            }
            continue
        }
        if let e = thrown {
            failures.append("\(label) — expected success, threw \(e)")
            continue
        }

        if let want = expect["value"] {
            if !jsonEquals(want, actual) {
                failures.append("\(label) — expected \(want), got \(actual ?? "nil")")
            }
        } else {
            guard let obj = actual as? [String: Any] else {
                failures.append("\(label) — expected an object result, got \(actual ?? "nil")")
                continue
            }
            for (k, want) in expect where k != "error" {
                if !jsonEquals(want, obj[k]) {
                    failures.append("\(label) — field `\(k)`: expected \(want), got \(obj[k] ?? "nil")")
                }
            }
        }
    }
}

if seenSuites.sorted() != REQUIRED_SUITES {
    FileHandle.standardError.write(
        "smoke-swift: corpus is not the expected suite set — got \(seenSuites.sorted()), want \(REQUIRED_SUITES)\n"
            .data(using: .utf8)!)
    exit(1)
}
if !failures.isEmpty {
    var out = "smoke-swift: \(failures.count) of \(total) cases FAILED:\n"
    for f in failures { out += "  \(f)\n" }
    FileHandle.standardError.write(out.data(using: .utf8)!)
    exit(1)
}
print("smoke-swift: \(total) conformance cases green through the Swift bindings")

// The recursive AbiValue must survive the boundary with its nesting intact —
// uniffi 0.32's cycle detection is what makes this type expressible at all.
let nested = try decodeCalldata(
    sig: "exactInput((bytes path,address recipient,uint256 amountIn,uint256 amountOutMinimum) params)",
    calldata: bytes(
        "0xb858183f"
        + "0000000000000000000000000000000000000000000000000000000000000020"
        + "0000000000000000000000000000000000000000000000000000000000000080"
        + "000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045"
        + "00000000000000000000000000000000000000000000000000000000000f4240"
        + "00000000000000000000000000000000000000000000000000000000000003e7"
        + "0000000000000000000000000000000000000000000000000000000000000006"
        + "aabbccddeeff0000000000000000000000000000000000000000000000000000"))
guard nested.children.count == 1, nested.children[0].children.count == 4 else {
    FileHandle.standardError.write("smoke-swift: recursive AbiValue lost its nesting\n".data(using: .utf8)!)
    exit(1)
}
print("smoke-swift: recursive AbiValue survives the boundary (tuple with 4 fields)")

// The uniffi flat-error message must reach Swift intact — a wrong-but-present
// message would make every native error report useless.
do {
    _ = try fromHex(s: "zz")
    FileHandle.standardError.write("smoke-swift: expected fromHex(\"zz\") to throw\n".data(using: .utf8)!)
    exit(1)
} catch let e as CoreError {
    let msg = errorMessage(e)
    guard msg.contains("invalid hex pair") else {
        FileHandle.standardError.write("smoke-swift: flat-error message lost — got \"\(msg)\"\n".data(using: .utf8)!)
        exit(1)
    }
    print("smoke-swift: flat-error message preserved (\"\(msg)\")")
}
