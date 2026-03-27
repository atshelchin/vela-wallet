package app.getvela.wallet.service

import android.app.Activity
import android.util.Log
import androidx.credentials.*
import androidx.credentials.exceptions.*
import org.json.JSONObject
import java.security.SecureRandom
import android.util.Base64

private const val TAG = "PasskeyService"

/**
 * Handles Passkey (WebAuthn) registration, authentication, and signing
 * via Android Credential Manager API.
 *
 * Port of iOS PasskeyService — same relying party, same userID encoding.
 */
class PasskeyService {

    companion object {
        const val RELYING_PARTY = "getvela.app"

        /** Encode: "username\0uuid" → ByteArray for userID */
        fun encodeUserID(name: String): ByteArray {
            val combined = "$name\u0000${java.util.UUID.randomUUID()}"
            return combined.toByteArray()
        }

        /** Decode: ByteArray → username (everything before first \0) */
        fun decodeUserName(userID: ByteArray): String? {
            val str = String(userID)
            return str.split("\u0000").firstOrNull()
        }
    }

    data class PasskeyResult(
        val credentialId: ByteArray,
        val publicKeyDer: ByteArray? = null,  // registration only
        val signature: ByteArray? = null,      // assertion only
        val authenticatorData: ByteArray? = null,
        val clientDataJSON: ByteArray? = null,
        val userID: ByteArray? = null,
        val attestationObject: ByteArray? = null,
    )

    // MARK: - Registration

    suspend fun register(activity: Activity, userName: String): PasskeyResult {
        val challenge = generateChallenge()
        val userId = Base64.encodeToString(encodeUserID(userName), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
        val challengeB64 = Base64.encodeToString(challenge, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

        val json = """
        {
            "rp": {"id": "$RELYING_PARTY", "name": "Vela Wallet"},
            "user": {"id": "$userId", "name": "$userName", "displayName": "$userName"},
            "challenge": "$challengeB64",
            "pubKeyCredParams": [{"type": "public-key", "alg": -7}],
            "authenticatorSelection": {
                "authenticatorAttachment": "platform",
                "residentKey": "required",
                "userVerification": "required"
            },
            "attestation": "direct"
        }
        """.trimIndent()

        val request = CreatePublicKeyCredentialRequest(json)
        val credentialManager = CredentialManager.create(activity)
        val result = credentialManager.createCredential(activity, request)

        return parseRegistrationResponse(result)
    }

    // MARK: - Authentication

    suspend fun authenticate(activity: Activity): PasskeyResult {
        val challenge = generateChallenge()
        val challengeB64 = Base64.encodeToString(challenge, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

        val json = """
        {
            "challenge": "$challengeB64",
            "rpId": "$RELYING_PARTY",
            "userVerification": "required"
        }
        """.trimIndent()

        val request = GetCredentialRequest(listOf(GetPublicKeyCredentialOption(json)))
        val credentialManager = CredentialManager.create(activity)
        val result = credentialManager.getCredential(activity, request)

        return parseAssertionResponse(result)
    }

    // MARK: - Sign Data

    suspend fun sign(activity: Activity, challenge: ByteArray): PasskeyResult {
        val challengeB64 = Base64.encodeToString(challenge, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

        val json = """
        {
            "challenge": "$challengeB64",
            "rpId": "$RELYING_PARTY",
            "userVerification": "required"
        }
        """.trimIndent()

        val request = GetCredentialRequest(listOf(GetPublicKeyCredentialOption(json)))
        val credentialManager = CredentialManager.create(activity)
        val result = credentialManager.getCredential(activity, request)

        return parseAssertionResponse(result)
    }

    // MARK: - Parse Responses

    private fun parseRegistrationResponse(result: CreateCredentialResponse): PasskeyResult {
        val publicKeyResult = result as CreatePublicKeyCredentialResponse
        val json = JSONObject(publicKeyResult.registrationResponseJson)
        val response = json.getJSONObject("response")

        val rawId = Base64.decode(json.getString("rawId"), Base64.URL_SAFE or Base64.NO_PADDING)
        val attestationObject = Base64.decode(
            response.getString("attestationObject"),
            Base64.URL_SAFE or Base64.NO_PADDING
        )
        val clientDataJSON = Base64.decode(
            response.getString("clientDataJSON"),
            Base64.URL_SAFE or Base64.NO_PADDING
        )

        return PasskeyResult(
            credentialId = rawId,
            attestationObject = attestationObject,
            clientDataJSON = clientDataJSON,
        )
    }

    private fun parseAssertionResponse(result: GetCredentialResponse): PasskeyResult {
        val credential = result.credential as PublicKeyCredential
        val json = JSONObject(credential.authenticationResponseJson)
        val response = json.getJSONObject("response")

        val rawId = Base64.decode(json.getString("rawId"), Base64.URL_SAFE or Base64.NO_PADDING)
        val authenticatorData = Base64.decode(
            response.getString("authenticatorData"),
            Base64.URL_SAFE or Base64.NO_PADDING
        )
        val signature = Base64.decode(
            response.getString("signature"),
            Base64.URL_SAFE or Base64.NO_PADDING
        )
        val clientDataJSON = Base64.decode(
            response.getString("clientDataJSON"),
            Base64.URL_SAFE or Base64.NO_PADDING
        )
        val userHandle = if (response.has("userHandle")) {
            Base64.decode(response.getString("userHandle"), Base64.URL_SAFE or Base64.NO_PADDING)
        } else null

        return PasskeyResult(
            credentialId = rawId,
            signature = signature,
            authenticatorData = authenticatorData,
            clientDataJSON = clientDataJSON,
            userID = userHandle,
        )
    }

    // MARK: - DER → Raw Signature

    fun derSignatureToRaw(derSig: ByteArray): ByteArray? {
        if (derSig.size < 6 || derSig[0] != 0x30.toByte()) return null
        var i = 2

        if (derSig[i] != 0x02.toByte()) return null
        i++
        val rLen = derSig[i].toInt() and 0xFF
        i++

        if (i + rLen >= derSig.size) return null
        var r = derSig.copyOfRange(i, i + rLen)
        i += rLen

        if (i >= derSig.size || derSig[i] != 0x02.toByte()) return null
        i++
        val sLen = derSig[i].toInt() and 0xFF
        i++

        if (i + sLen > derSig.size) return null
        var s = derSig.copyOfRange(i, i + sLen)

        // Strip leading zero padding
        if (r.size == 33 && r[0] == 0.toByte()) r = r.copyOfRange(1, 33)
        if (s.size == 33 && s[0] == 0.toByte()) s = s.copyOfRange(1, 33)

        // Pad to 32 bytes
        while (r.size < 32) r = byteArrayOf(0) + r
        while (s.size < 32) s = byteArrayOf(0) + s

        return r + s
    }

    // MARK: - CBOR Attestation Parsing

    fun extractPublicKeyFromAttestation(attestationObject: ByteArray): Pair<ByteArray, ByteArray>? {
        val authData = extractAuthData(attestationObject) ?: return null
        if (authData.size <= 37) return null
        val flags = authData[32].toInt() and 0xFF
        if (flags and 0x40 == 0) return null // no attested cred data

        if (authData.size <= 55) return null
        val credIdLen = ((authData[53].toInt() and 0xFF) shl 8) or (authData[54].toInt() and 0xFF)
        val coseKeyOffset = 55 + credIdLen
        if (authData.size <= coseKeyOffset) return null

        return extractP256FromCOSE(authData, coseKeyOffset)
    }

    private fun extractAuthData(cbor: ByteArray): ByteArray? {
        // Simplified CBOR parser: look for "authData" key in top-level map
        var i = 0
        if (i >= cbor.size) return null
        val major = (cbor[i].toInt() and 0xFF) shr 5
        val additional = cbor[i].toInt() and 0x1F
        if (major != 5) return null
        i++

        val mapCount = if (additional < 24) additional
        else if (additional == 24 && i < cbor.size) { val v = cbor[i].toInt() and 0xFF; i++; v }
        else return null

        for (entry in 0 until mapCount) {
            if (i >= cbor.size) return null
            val keyMajor = (cbor[i].toInt() and 0xFF) shr 5
            val keyAdd = cbor[i].toInt() and 0x1F
            i++

            if (keyMajor == 3) { // text string
                val keyLen = if (keyAdd < 24) keyAdd
                else if (keyAdd == 24 && i < cbor.size) { val v = cbor[i].toInt() and 0xFF; i++; v }
                else return null

                if (i + keyLen > cbor.size) return null
                val keyStr = String(cbor, i, keyLen)
                i += keyLen

                if (keyStr == "authData") {
                    if (i >= cbor.size) return null
                    val valMajor = (cbor[i].toInt() and 0xFF) shr 5
                    val valAdd = cbor[i].toInt() and 0x1F
                    i++
                    if (valMajor != 2) return null

                    val valLen = when {
                        valAdd < 24 -> valAdd
                        valAdd == 24 && i < cbor.size -> { val v = cbor[i].toInt() and 0xFF; i++; v }
                        valAdd == 25 && i + 1 < cbor.size -> {
                            val v = ((cbor[i].toInt() and 0xFF) shl 8) or (cbor[i+1].toInt() and 0xFF); i += 2; v
                        }
                        else -> return null
                    }

                    if (i + valLen > cbor.size) return null
                    return cbor.copyOfRange(i, i + valLen)
                } else {
                    i = skipCBORValue(cbor, i) ?: return null
                }
            } else {
                i = skipCBORValue(cbor, i - 1) ?: return null
                i = skipCBORValue(cbor, i) ?: return null
            }
        }
        return null
    }

    private fun extractP256FromCOSE(data: ByteArray, offset: Int): Pair<ByteArray, ByteArray>? {
        var i = offset
        if (i >= data.size) return null
        val major = (data[i].toInt() and 0xFF) shr 5
        val additional = data[i].toInt() and 0x1F
        if (major != 5) return null
        i++

        val mapCount = if (additional < 24) additional
        else if (additional == 24 && i < data.size) { val v = data[i].toInt() and 0xFF; i++; v }
        else return null

        var x: ByteArray? = null
        var y: ByteArray? = null

        for (entry in 0 until mapCount) {
            if (i >= data.size) return null
            val keyVal = readCBORInt(data, i)
            i = keyVal.second

            if (i >= data.size) return null
            if (keyVal.first == -2) {
                val bsResult = readCBORByteString(data, i) ?: return null
                x = bsResult.first; i = bsResult.second
            } else if (keyVal.first == -3) {
                val bsResult = readCBORByteString(data, i) ?: return null
                y = bsResult.first; i = bsResult.second
            } else {
                i = skipCBORValue(data, i) ?: return null
            }
        }

        val xData = x ?: return null
        val yData = y ?: return null
        if (xData.size != 32 || yData.size != 32) return null
        return Pair(xData, yData)
    }

    private fun readCBORInt(bytes: ByteArray, offset: Int): Pair<Int, Int> {
        var i = offset
        if (i >= bytes.size) return Pair(0, i)
        val major = (bytes[i].toInt() and 0xFF) shr 5
        val additional = bytes[i].toInt() and 0x1F
        i++
        val rawVal = if (additional < 24) additional
        else if (additional == 24 && i < bytes.size) { val v = bytes[i].toInt() and 0xFF; i++; v }
        else 0
        return if (major == 1) Pair(-1 - rawVal, i) else Pair(rawVal, i)
    }

    private fun readCBORByteString(bytes: ByteArray, offset: Int): Pair<ByteArray, Int>? {
        var i = offset
        if (i >= bytes.size) return null
        val major = (bytes[i].toInt() and 0xFF) shr 5
        val additional = bytes[i].toInt() and 0x1F
        i++
        if (major != 2) return null

        val len = when {
            additional < 24 -> additional
            additional == 24 && i < bytes.size -> { val v = bytes[i].toInt() and 0xFF; i++; v }
            additional == 25 && i + 1 < bytes.size -> {
                val v = ((bytes[i].toInt() and 0xFF) shl 8) or (bytes[i+1].toInt() and 0xFF); i += 2; v
            }
            else -> return null
        }

        if (i + len > bytes.size) return null
        return Pair(bytes.copyOfRange(i, i + len), i + len)
    }

    private fun skipCBORValue(bytes: ByteArray, offset: Int): Int? {
        var i = offset
        if (i >= bytes.size) return null
        val major = (bytes[i].toInt() and 0xFF) shr 5
        val additional = bytes[i].toInt() and 0x1F
        i++

        val value = when {
            additional < 24 -> additional
            additional == 24 && i < bytes.size -> { val v = bytes[i].toInt() and 0xFF; i++; v }
            additional == 25 && i + 1 < bytes.size -> {
                val v = ((bytes[i].toInt() and 0xFF) shl 8) or (bytes[i+1].toInt() and 0xFF); i += 2; v
            }
            additional == 26 && i + 3 < bytes.size -> {
                val v = ((bytes[i].toInt() and 0xFF) shl 24) or ((bytes[i+1].toInt() and 0xFF) shl 16) or
                    ((bytes[i+2].toInt() and 0xFF) shl 8) or (bytes[i+3].toInt() and 0xFF); i += 4; v
            }
            else -> return null
        }

        return when (major) {
            0, 1 -> i
            2, 3 -> i + value
            4 -> { var idx = i; repeat(value) { idx = skipCBORValue(bytes, idx) ?: return null }; idx }
            5 -> { var idx = i; repeat(value) { idx = skipCBORValue(bytes, idx) ?: return null; idx = skipCBORValue(bytes, idx) ?: return null }; idx }
            7 -> i
            else -> null
        }
    }

    private fun generateChallenge(): ByteArray {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return bytes
    }
}
