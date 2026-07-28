/**
 * Replays the conformance corpus through the uniffi-generated KOTLIN bindings.
 *
 * `cargo test` proves the Rust crate matches the corpus and verify-web.mjs
 * proves the shipped wasm does; this proves the third surface — the bindings
 * the planned native Android app will consume — agrees byte-for-byte
 * (spec SC-001). A green cargo test with a red run here would mean the FFI
 * layer, not the core, diverged.
 *
 * Vectors: the JSON files under rust/crates/vela-core/tests/vectors
 * Schema:  specs/001-rust-core-bindings/contracts/conformance-vectors.md
 */

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import uniffi.vela_core_uniffi.*

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fun hex(bytes: ByteArray): String {
    val sb = StringBuilder("0x")
    for (b in bytes) sb.append(String.format("%02x", b))
    return sb.toString()
}

/**
 * Strict hex decode, mirroring `in_bytes` in conformance.rs.
 *
 * An odd length must fail rather than silently drop the trailing nibble: a case
 * decoded from truncated input satisfies its expectation only by accident, and
 * the harness would report green over arguments the corpus never specified.
 */
fun bytes(s: String): ByteArray {
    val clean = if (s.startsWith("0x")) s.substring(2) else s
    require(clean.length % 2 == 0) { "odd-length hex `$s`" }
    val out = ByteArray(clean.length / 2)
    for (i in out.indices) {
        out[i] = clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
    }
    return out
}

/** Canonical JSON rendering of an AbiValue tree, matching the vector shape. */
fun abiValueToJson(v: AbiValue): JSONObject {
    val children = JSONArray()
    for (c in v.children) children.put(abiValueToJson(c))
    return JSONObject()
        .put("kind", v.kind)
        .put("name", v.name)
        .put("value", v.value)
        .put("children", children)
}

/** Structural comparison — key order must NOT matter. */
fun jsonEquals(a: Any?, b: Any?): Boolean {
    if (a is JSONObject && b is JSONObject) {
        if (a.length() != b.length()) return false
        for (k in a.keys()) {
            if (!b.has(k)) return false
            if (!jsonEquals(a.get(k), b.get(k))) return false
        }
        return true
    }
    if (a is JSONArray && b is JSONArray) {
        if (a.length() != b.length()) return false
        for (i in 0 until a.length()) if (!jsonEquals(a.get(i), b.get(i))) return false
        return true
    }
    if (a is Boolean || b is Boolean) return a == b
    if (a == JSONObject.NULL || b == JSONObject.NULL) return a == b
    return a?.toString() == b?.toString()
}

/** The CoreError variant name, as the corpus spells it. */
fun errorCode(e: CoreException): String = e.javaClass.simpleName

// ---------------------------------------------------------------------------
// Dispatch — one arm per contracts/core-api.md function (mirrors conformance.rs)
// ---------------------------------------------------------------------------

fun runCase(fn: String, input: JSONObject): Any? = when (fn) {
    // primitives
    "keccak256" -> hex(keccak256(bytes(input.getString("data"))))
    "sha256" -> hex(sha256(bytes(input.getString("data"))))
    "to_hex" -> toHex(bytes(input.getString("data")), input.getBoolean("prefixed"))
    "from_hex" -> hex(fromHex(input.getString("s")))
    "to_quantity" -> toQuantity(input.getString("value"))
    "checksum_address" -> checksumAddress(input.getString("address_hex"))
    "function_selector" -> hex(functionSelector(input.getString("signature")))
    "create2_address" -> create2Address(
        input.getString("deployer_hex"),
        bytes(input.getString("salt")),
        bytes(input.getString("init_code_hash")),
    )
    "to_base64url" -> toBase64url(bytes(input.getString("data")))
    "from_base64url" -> hex(fromBase64url(input.getString("s")))
    "abi_encode_address" -> hex(abiEncodeAddress(input.getString("address_hex")))
    "abi_encode_uint256" -> hex(abiEncodeUint256(input.getString("value_hex")))
    "abi_encode_bytes32" -> hex(abiEncodeBytes32(bytes(input.getString("data"))))

    // abi
    "canonicalize_signature" -> canonicalizeSignature(input.getString("sig"))
    "compute_selector" -> computeSelector(input.getString("sig"))
    "match_selector" -> matchSelector(input.getString("sig"), bytes(input.getString("calldata")))
    "decode_calldata" -> abiValueToJson(
        decodeCalldata(input.getString("sig"), bytes(input.getString("calldata")))
    )

    // eip712
    "hash_typed_data" -> hex(hashTypedData(input.getString("typed_data_json")))
    "encode_type" -> encodeType(input.getString("typed_data_json"))

    // safe
    "parse_public_key" -> parsePublicKey(input.getString("hex")).let {
        JSONObject().put("x", hex(it.x)).put("y", hex(it.y))
    }
    "compute_safe_address" -> computeSafeAddress(
        bytes(input.getString("x")),
        bytes(input.getString("y")),
    ).let {
        JSONObject()
            .put("address", it.address)
            .put("salt_nonce", hex(it.saltNonce))
            .put("setup_data", hex(it.setupData))
            .put("init_code_hash", hex(it.initCodeHash))
    }
    "compute_splitter_address" -> computeSplitterAddress(input.getString("treasury_hex"))
    "encode_splitter_deploy_call" -> hex(encodeSplitterDeployCall(input.getString("treasury_hex")))
    "safe_proxy_runtime_code" -> safeProxyRuntimeCode()

    // webauthn
    "extract_attestation_public_key" ->
        extractAttestationPublicKey(bytes(input.getString("attestation_object"))).let {
            JSONObject().put("x", hex(it.x)).put("y", hex(it.y))
        }
    "der_signature_to_raw_low_s" -> hex(derSignatureToRawLowS(bytes(input.getString("der"))))
    "validate_client_data" -> {
        val kind = when (input.getString("kind")) {
            "Get" -> ClientDataKind.GET
            "Create" -> ClientDataKind.CREATE
            else -> throw IllegalArgumentException("unknown ClientDataKind")
        }
        validateClientData(
            kind,
            bytes(input.getString("client_data_json")),
            bytes(input.getString("authenticator_data")),
        )
        true
    }
    "webauthn_signing_hash" -> hex(
        webauthnSigningHash(
            bytes(input.getString("authenticator_data")),
            bytes(input.getString("client_data_json")),
        )
    )
    "recover_public_key_from_assertions" -> {
        val a = input.getJSONObject("a")
        val b = input.getJSONObject("b")
        val key = recoverPublicKeyFromAssertions(
            WebAuthnAssertion(
                bytes(a.getString("authenticator_data")),
                bytes(a.getString("client_data_json")),
                bytes(a.getString("signature_der")),
            ),
            WebAuthnAssertion(
                bytes(b.getString("authenticator_data")),
                bytes(b.getString("client_data_json")),
                bytes(b.getString("signature_der")),
            ),
        )
        if (key == null) JSONObject.NULL
        else "04" + hex(key.x).substring(2) + hex(key.y).substring(2)
    }

    else -> throw NoSuchElementException("no dispatch arm for fn `$fn` — add it to Harness.kt")
}

// ---------------------------------------------------------------------------

/**
 * The corpus is five suites, discovered by scanning the directory. Asserting the
 * exact set is what stops a vector file lost to a bad merge or a partial checkout
 * from making this harness report "green" over a corpus that silently shrank —
 * the precise false confidence this feature exists to prevent.
 */
val REQUIRED_SUITES = listOf("abi", "eip712", "primitives", "safe", "webauthn")

fun main(args: Array<String>) {
    val vectorsDir = File(args.getOrElse(0) { "crates/vela-core/tests/vectors" })
    val failures = mutableListOf<String>()
    var total = 0

    val files = vectorsDir.listFiles { f -> f.name.endsWith(".json") }?.sortedBy { it.name }
        ?: emptyList()
    if (files.isEmpty()) {
        System.err.println("smoke-kotlin: no vector files found in ${vectorsDir.absolutePath}")
        System.exit(1)
    }

    val seenSuites = mutableListOf<String>()
    for (file in files) {
        val suite = JSONObject(file.readText())
        val suiteName = suite.getString("suite")
        seenSuites.add(suiteName)
        val cases = suite.getJSONArray("cases")
        for (i in 0 until cases.length()) {
            total++
            val c = cases.getJSONObject(i)
            val name = c.getString("name")
            val fn = c.getString("fn")
            val input = c.getJSONObject("input")
            val expect = c.getJSONObject("expect")
            val label = "$suiteName::$name [$fn]"

            var actual: Any? = null
            var thrown: Throwable? = null
            try {
                actual = runCase(fn, input)
            } catch (e: Throwable) {
                thrown = e
            }

            val expectedError = if (expect.has("error")) expect.getString("error") else null
            if (expectedError != null) {
                when {
                    thrown == null -> failures.add("$label — expected error $expectedError, got $actual")
                    thrown !is CoreException ->
                        failures.add("$label — expected error $expectedError, got ${thrown.javaClass.name}: ${thrown.message}")
                    errorCode(thrown) != expectedError ->
                        failures.add("$label — expected error $expectedError, got ${errorCode(thrown)}")
                }
                continue
            }
            if (thrown != null) {
                failures.add("$label — expected success, threw ${thrown.javaClass.simpleName}: ${thrown.message}")
                continue
            }

            if (expect.has("value")) {
                if (!jsonEquals(expect.get("value"), actual)) {
                    failures.add("$label — expected ${expect.get("value")}, got $actual")
                }
            } else {
                // Field-wise object expectation (parse_public_key, compute_safe_address).
                val obj = actual as? JSONObject
                if (obj == null) {
                    failures.add("$label — expected an object result, got $actual")
                } else {
            // An expectation with no fields would pass over ANY result — the
            // corpus must never contain one, and if it does the harness has to
            // say so rather than count a case it never checked.
            val fields = expect.keys().asSequence().filter { it != "error" }.toList()
                    if (fields.isEmpty()) {
                        failures.add("$label — expectation has no fields to check")
                    }
                    for (k in fields) {
                        if (!jsonEquals(expect.get(k), obj.opt(k))) {
                            failures.add("$label — field `$k`: expected ${expect.get(k)}, got ${obj.opt(k)}")
                        }
                    }
                }
            }
        }
    }

    if (seenSuites.sorted() != REQUIRED_SUITES) {
        System.err.println("smoke-kotlin: corpus is not the expected suite set — got $seenSuites, want $REQUIRED_SUITES")
        System.exit(1)
    }
    if (failures.isNotEmpty()) {
        System.err.println("smoke-kotlin: ${failures.size} of $total cases FAILED:")
        failures.forEach { System.err.println("  $it") }
        System.exit(1)
    }
    println("smoke-kotlin: $total conformance cases green through the Kotlin bindings")

    // The uniffi flat-error Display message must survive into Kotlin
    // (uniffi issue #2699 reported it being dropped) — a wrong-but-present
    // message would make every native error report useless.
    try {
        fromHex("zz")
        System.err.println("smoke-kotlin: expected fromHex(\"zz\") to throw")
        System.exit(1)
    } catch (e: CoreException.InvalidHex) {
        val msg = e.message ?: ""
        if (!msg.contains("invalid hex pair")) {
            System.err.println("smoke-kotlin: flat-error message lost — got \"$msg\"")
            System.exit(1)
        }
        println("smoke-kotlin: flat-error Display message preserved (\"$msg\")")
    }
}
