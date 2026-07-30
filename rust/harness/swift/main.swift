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

/// Strict hex decode, mirroring `in_bytes` in conformance.rs.
///
/// It must THROW rather than substitute. Returning zeros for junk (`?? 0`) or
/// trapping on an odd length would let a case that never received its real
/// input still satisfy its expectation — the harness would report green over
/// arguments the corpus never specified. Kotlin and Rust are both strict here;
/// Swift silently substituting made 34 of 195 cases pass regardless of input.
func bytes(_ s: String) throws -> Data {
    let clean = s.hasPrefix("0x") ? String(s.dropFirst(2)) : s
    guard clean.count % 2 == 0 else { throw BadInput(detail: "odd-length hex `\(s)`") }
    var out = Data(capacity: clean.count / 2)
    var index = clean.startIndex
    while index < clean.endIndex {
        let next = clean.index(index, offsetBy: 2)
        guard let byte = UInt8(clean[index..<next], radix: 16) else {
            throw BadInput(detail: "bad hex pair `\(clean[index..<next])` in `\(s)`")
        }
        out.append(byte)
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
    case .InvalidIdenticonSeed: return "InvalidIdenticonSeed"
    case .Internal: return "Internal"
    }
}

func errorMessage(_ error: CoreError) -> String {
    switch error {
    case .InvalidHex(let m), .InvalidBase64Url(let m), .InvalidQuantity(let m),
         .InvalidAddress(let m), .InvalidSignature(let m), .InvalidCbor(let m),
         .InvalidCoseKey(let m), .InvalidClientData(let m), .InvalidPublicKey(let m),
         .AbiParse(let m), .AbiDecode(let m), .Eip712Parse(let m),
         .Eip712NonCanonicalDomain(let m), .InvalidIdenticonSeed(let m), .Internal(let m):
        return m
    }
}

struct NoDispatch: Error { let fn: String }
struct BadInput: Error { let detail: String }

// ---------------------------------------------------------------------------
// Dispatch — one arm per contracts/core-api.md function (mirrors conformance.rs)
// ---------------------------------------------------------------------------

/// A required string input. Missing means the corpus and this dispatch disagree
/// about the input key — a case that ran on "" would prove nothing.
func str(_ input: [String: Any], _ key: String) throws -> String {
    guard let v = input[key] as? String else { throw BadInput(detail: "missing string input `\(key)`") }
    return v
}

func data(_ input: [String: Any], _ key: String) throws -> Data { try bytes(try str(input, key)) }

func bool(_ input: [String: Any], _ key: String) throws -> Bool {
    guard let v = input[key] as? Bool else { throw BadInput(detail: "missing bool input `\(key)`") }
    return v
}

func runCase(_ fn: String, _ input: [String: Any]) throws -> Any? {
    switch fn {
    // primitives
    case "keccak256": return hex(keccak256(data: try data(input, "data")))
    case "sha256": return hex(sha256(data: try data(input, "data")))
    case "to_hex": return toHex(data: try data(input, "data"), prefixed: try bool(input, "prefixed"))
    case "from_hex": return hex(try fromHex(s: try str(input, "s")))
    case "to_quantity": return try toQuantity(value: try str(input, "value"))
    case "checksum_address": return try checksumAddress(addressHex: try str(input, "address_hex"))
    case "function_selector": return hex(try functionSelector(signature: try str(input, "signature")))
    case "create2_address":
        return try create2Address(
            deployerHex: try str(input, "deployer_hex"),
            salt: try data(input, "salt"),
            initCodeHash: try data(input, "init_code_hash"))
    case "to_base64url": return toBase64url(data: try data(input, "data"))
    case "from_base64url": return hex(try fromBase64url(s: try str(input, "s")))
    case "abi_encode_address": return hex(try abiEncodeAddress(addressHex: try str(input, "address_hex")))
    case "abi_encode_uint256": return hex(try abiEncodeUint256(valueHex: try str(input, "value_hex")))
    case "abi_encode_bytes32": return hex(try abiEncodeBytes32(data: try data(input, "data")))

    // abi
    case "canonicalize_signature": return try canonicalizeSignature(sig: try str(input, "sig"))
    case "compute_selector": return try computeSelector(sig: try str(input, "sig"))
    case "match_selector":
        return try matchSelector(sig: try str(input, "sig"), calldata: try data(input, "calldata"))
    case "decode_calldata":
        return abiValueToJson(try decodeCalldata(sig: try str(input, "sig"), calldata: try data(input, "calldata")))

    // eip712
    case "hash_typed_data": return hex(try hashTypedData(typedDataJson: try str(input, "typed_data_json")))
    case "encode_type": return try encodeType(typedDataJson: try str(input, "typed_data_json"))

    // safe
    case "parse_public_key":
        let key = try parsePublicKey(hex: try str(input, "hex"))
        return ["x": hex(key.x), "y": hex(key.y)]
    case "compute_safe_address":
        let info = try computeSafeAddress(x: try data(input, "x"), y: try data(input, "y"))
        return [
            "address": info.address,
            "salt_nonce": hex(info.saltNonce),
            "setup_data": hex(info.setupData),
            "init_code_hash": hex(info.initCodeHash),
        ]
    case "compute_splitter_address":
        return try computeSplitterAddress(treasuryHex: try str(input, "treasury_hex"))
    case "encode_splitter_deploy_call":
        return hex(try encodeSplitterDeployCall(treasuryHex: try str(input, "treasury_hex")))
    case "safe_proxy_runtime_code": return try safeProxyRuntimeCode()

    // webauthn
    case "extract_attestation_public_key":
        let key = try extractAttestationPublicKey(attestationObject: try data(input, "attestation_object"))
        return ["x": hex(key.x), "y": hex(key.y)]
    case "der_signature_to_raw_low_s":
        return hex(try derSignatureToRawLowS(der: try data(input, "der")))
    case "validate_client_data":
        // An unrecognised kind must fail, not silently fall through to .get —
        // that would run every Create case against the Get rules.
        let kindName = try str(input, "kind")
        let kind: ClientDataKind
        switch kindName {
        case "Create": kind = .create
        case "Get": kind = .get
        default: throw BadInput(detail: "unknown ClientDataKind `\(kindName)`")
        }
        try validateClientData(
            kind: kind,
            clientDataJson: try data(input, "client_data_json"),
            authenticatorData: try data(input, "authenticator_data"))
        return true
    case "webauthn_signing_hash":
        return hex(webauthnSigningHash(
            authenticatorData: try data(input, "authenticator_data"),
            clientDataJson: try data(input, "client_data_json")))
    case "recover_public_key_from_assertions":
        guard let a = input["a"] as? [String: Any] else { throw BadInput(detail: "missing input `a`") }
        guard let b = input["b"] as? [String: Any] else { throw BadInput(detail: "missing input `b`") }
        let key = try recoverPublicKeyFromAssertions(
            a: WebAuthnAssertion(
                authenticatorData: try data(a, "authenticator_data"),
                clientDataJson: try data(a, "client_data_json"),
                signatureDer: try data(a, "signature_der")),
            b: WebAuthnAssertion(
                authenticatorData: try data(b, "authenticator_data"),
                clientDataJson: try data(b, "client_data_json"),
                signatureDer: try data(b, "signature_der")))
        guard let key else { return NSNull() }
        return "04" + String(hex(key.x).dropFirst(2)) + String(hex(key.y).dropFirst(2))

    // identicon (specs/003-rust-identicon). Params expectations carry section
    // INDICES; `sectionIndex` resolves the returned artwork back to one using the
    // table pinned by the corpus's own `section-table` group, so nothing here is
    // circular — both ends are anchored to the identicons-esm oracle.
    case "make_hash":
        return identiconMakeHash(seed: try str(input, "seed"))
    case "identicon_svg":
        return try identiconSvg(seed: try str(input, "seed"))
    case "identicon_svg_circular":
        return try identiconSvgCircular(seed: try str(input, "seed"))
    case "identicon_data_uri":
        return try identiconDataUri(seed: try str(input, "seed"))
    case "normalize_seed":
        return identiconNormalizeSeed(seed: try str(input, "seed"))
    case "identicon_params":
        let p = try identiconParams(seed: try str(input, "seed"))
        return [
            "main": p.main,
            "background": p.background,
            "accent": p.accent,
            "face": sectionIndex("face", p.face),
            "top": sectionIndex("top", p.top),
            "sides": sectionIndex("sides", p.sides),
            "bottom": sectionIndex("bottom", p.bottom),
        ] as [String: Any]

    default: throw NoDispatch(fn: fn)
    }
}

/// Artwork -> 1-based index, built from the corpus's own `section-table` cases so
/// the compact index form used by every params expectation can be checked here too.
var fragmentIndex: [String: Int] = [:]

func sectionIndex(_ section: String, _ svg: String) -> Any {
    fragmentIndex["\(section):\(svg)"] ?? NSNull()
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
let REQUIRED_SUITES = [
    "abi", "eip712", "identicon", "identicon-bulk", "primitives", "safe", "webauthn",
]

/// Functions that exist in vela-core but are deliberately NOT on any binding surface
/// (specs/003-rust-identicon contracts/identicon-api.md): a test-only parity device,
/// plus helpers no Vela platform calls. Skipping is counted and reported — an
/// unreported skip is how a corpus quietly stops covering things.
let CORE_ONLY_FNS: Set<String> = [
    "identicon_params_js_compat", "section_svg", "create_identicon",
    "nimiq_is_valid_address", "constants",
]

var total = 0
var skipped = 0
var failures: [String] = []
var seenSuites: [String] = []

// Build the artwork index before dispatching anything that needs it.
if vectorFiles.contains("identicon.json"),
   let raw = try? Data(contentsOf: URL(fileURLWithPath: "\(vectorsPath)/identicon.json")),
   let doc = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
   let cases = doc["cases"] as? [[String: Any]] {
    for c in cases {
        guard let name = c["name"] as? String,
              name.hasPrefix("section-table/"),
              let expect = c["expect"] as? [String: Any],
              let value = expect["value"] as? String else { continue }
        let tail = name.dropFirst("section-table/".count)
        guard let sep = tail.lastIndex(of: "_"), let idx = Int(tail[tail.index(after: sep)...]) else { continue }
        fragmentIndex["\(tail[..<sep]):\(value)"] = idx
    }
    if fragmentIndex.count != 84 {
        FileHandle.standardError.write(
            "smoke-swift: expected 84 section-table cases, found \(fragmentIndex.count)\n".data(using: .utf8)!
        )
        exit(1)
    }
}

for name in vectorFiles {
    let raw = try Data(contentsOf: URL(fileURLWithPath: "\(vectorsPath)/\(name)"))
    guard let suite = try JSONSerialization.jsonObject(with: raw) as? [String: Any],
          let suiteName = suite["suite"] as? String else {
        failures.append("\(name) — bad schema")
        continue
    }
    seenSuites.append(suiteName)

    // The bulk identicon suite uses a compact `pairs` schema and its own runner.
    if let pairs = suite["pairs"] as? [[String]] {
        for pair in pairs where pair.count == 2 {
            total += 1
            let got = identiconMakeHash(seed: pair[0])
            if got != pair[1], failures.count < 10 {
                failures.append("\(suiteName)::makeHash — expected \(pair[1]), got \(got)")
            }
        }
        continue
    }

    guard let cases = suite["cases"] as? [[String: Any]] else {
        failures.append("\(name) — bad schema (no cases and no pairs)")
        continue
    }
    for c in cases {
        let caseName = c["name"] as? String ?? "?"
        let fn = c["fn"] as? String ?? "?"
        if CORE_ONLY_FNS.contains(fn) {
            skipped += 1
            continue
        }
        total += 1
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
            // An expectation with no fields would pass over ANY result.
            let fields = expect.filter { $0.key != "error" }
            if fields.isEmpty {
                failures.append("\(label) — expectation has no fields to check")
            }
            for (k, want) in fields {
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
print(
    "smoke-swift: \(total) conformance cases green through the Swift bindings "
        + "(\(skipped) skipped — core-only functions with no binding surface)"
)

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
