package app.getvela.wallet.feature.onboarding.core

import android.content.Context
import android.os.SystemClock
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialUnsupportedException
import androidx.credentials.exceptions.NoCredentialException
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import androidx.credentials.exceptions.publickeycredential.GetPublicKeyCredentialDomException
import java.security.SecureRandom
import java.util.UUID
import kotlinx.coroutines.delay
import org.json.JSONArray
import org.json.JSONObject
import uniffi.vela_core_uniffi.fromBase64url
import uniffi.vela_core_uniffi.fromHex
import uniffi.vela_core_uniffi.toBase64url
import uniffi.vela_core_uniffi.toHex

/**
 * Every WebAuthn ceremony this app performs, and nothing else.
 *
 * Android reaches WebAuthn through Credential Manager, whose request and
 * response are **the same WebAuthn JSON the web path builds** — so the document
 * below is not an Android translation of the browser's options, it is the same
 * document. That is the point: a difference here produces a credential the other
 * three clients cannot use, and a wallet IS its key set.
 *
 * Nothing here decides what a failure means. It classifies the platform's
 * exception into the vocabulary the core branches on ([FailureKind]) and stops.
 */
class PasskeyExecutor(
    private val context: Context,
    /**
     * The relying party. A passkey is bound to it: change it and every existing
     * wallet becomes unreachable from this app.
     */
    val relyingPartyId: String = RELYING_PARTY,
) {
    private val manager: CredentialManager? =
        runCatching { CredentialManager.create(context) }.getOrNull()

    /** When this app last minted a credential, and which one (see `assert`). */
    private var mintedAt: Long = 0
    private var mintedCredentialIdHex: String? = null

    /**
     * Whether a passkey ceremony can be attempted at all.
     *
     * The question is whether the SERVICE is reachable, not whether a credential
     * exists or a provider is currently enrolled. Answering `false` for "no
     * passkeys saved yet" would make the core raise "this device cannot create a
     * wallet" on a device that can — and leave no way back, because a person
     * cannot enrol a credential from inside a flow that refuses to start.
     */
    fun supported(): Boolean = manager != null

    /** `navigator.credentials.create()`, in Credential Manager's clothes. */
    suspend fun register(
        name: String,
        excludeCredentialIds: List<String>,
        method: KeyMethod,
    ): Registration {
        val credentialManager = manager ?: throw PasskeyFailure(
            FailureKind.NotSupported,
            "Credential Manager is unavailable on this device",
        )

        val request = JSONObject().apply {
            put("rp", JSONObject().put("id", relyingPartyId).put("name", RELYING_PARTY_NAME))
            put(
                "user",
                JSONObject()
                    .put("id", toBase64url(encodeUserHandle(name).toByteArray(Charsets.UTF_8)))
                    .put("name", name)
                    .put("displayName", name),
            )
            put("challenge", toBase64url(random(CHALLENGE_BYTES)))
            // ES256 (P-256) ONLY, deliberately without an RS256 fallback. The
            // on-chain verifier is the RIP-7212 P-256 precompile and
            // two-signature recovery is ECDSA math, so an RSA credential can
            // never become a working wallet: it would pass creation and then die
            // during key extraction — after minting an orphan passkey in the
            // person's provider. Restricting the list makes an RSA-only
            // authenticator fail up front instead.
            put(
                "pubKeyCredParams",
                JSONArray().put(JSONObject().put("type", PUBLIC_KEY).put("alg", ES256)),
            )
            if (excludeCredentialIds.isNotEmpty()) {
                // A multi-key wallet registers each founding key separately, and
                // the provider must refuse to silently REPLACE an earlier one —
                // the Safe address depends on every key in the set.
                put(
                    "excludeCredentials",
                    JSONArray().apply {
                        excludeCredentialIds.forEach { id ->
                            put(JSONObject().put("type", PUBLIC_KEY).put("id", base64urlOfHex(id)))
                        }
                    },
                )
            }
            put(
                "authenticatorSelection",
                JSONObject()
                    .put("residentKey", "required")
                    // WebAuthn L2 5.4.4: set iff residentKey is 'required'. A
                    // client that honours only the L1 boolean would otherwise
                    // silently mint a NON-discoverable credential (issue #1).
                    .put("requireResidentKey", true)
                    .put("userVerification", "required")
                    .apply {
                        // Unlike the browser, this client OWNS the picker, so the
                        // person's choice has to be honoured here or it means
                        // nothing. `Hybrid` never arrives: the key screen offers
                        // it as present-and-unavailable rather than issuing a
                        // ceremony no transport can run.
                        attachmentFor(method)?.let { put("authenticatorAttachment", it) }
                    },
            )
            put("attestation", "direct")
            put("extensions", JSONObject().put("credProps", true))
        }

        val response = try {
            credentialManager.createCredential(
                context = context,
                request = CreatePublicKeyCredentialRequest(request.toString()),
            )
        } catch (error: CreateCredentialException) {
            throw classifyCreate(error)
        }

        val json = JSONObject(
            response.data.getString(BUNDLE_REGISTRATION_RESPONSE)
                ?: throw PasskeyFailure(FailureKind.Other, "No credential returned"),
        )

        // Sign-in and cross-device recovery both need a discoverable credential:
        // a non-discoverable one signs fine when pinned by id but never appears
        // in the picker and never syncs, so the wallet would die with this
        // device. Fail HERE, before anything is saved or funded. An absent `rk`
        // means the provider cannot say — give it the benefit of the doubt.
        val credProps = json.optJSONObject("clientExtensionResults")?.optJSONObject("credProps")
        if (credProps != null && credProps.has("rk") && !credProps.optBoolean("rk", true)) {
            throw PasskeyFailure(
                FailureKind.NotDiscoverable,
                "Authenticator created a non-discoverable credential",
            )
        }

        val inner = json.getJSONObject("response")
        val credentialIdHex = hexOfBase64url(json.getString("rawId"))
        // When this credential was minted, and which one it was. The very next
        // thing the create flow does is ASK FOR IT BACK (the membership proof),
        // and on Android the provider is not always ready to answer yet — see
        // `assert`.
        mintedAt = SystemClock.elapsedRealtime()
        mintedCredentialIdHex = credentialIdHex
        return Registration(
            credentialIdHex = credentialIdHex,
            attestationObjectHex = hexOfBase64url(inner.getString("attestationObject")),
            clientDataJsonHex = hexOfBase64url(inner.getString("clientDataJSON")),
            authenticatorAttachment = json.optString("authenticatorAttachment"),
            transports = inner.optJSONArray("transports").strings().joinToString(","),
        )
    }

    /**
     * An assertion. [credentialIdHex] pins it to one credential; `null` is the
     * "who are you?" ceremony sign-in starts with.
     *
     * ## The freshly-minted-credential race (Android only)
     *
     * The create flow signs a membership proof with the passkey it minted
     * seconds earlier. Credential Manager answers a get by asking every
     * installed provider what it has for this rpId — and a provider answers
     * from its own INDEX, which it updates asynchronously after a create. On a
     * phone with several providers (this one has Google Password Manager,
     * Samsung Pass, a YubiKey provider and our own security-keys app) the
     * first get after a create can arrive before the one that stored the
     * credential has indexed it. Nobody returns an entry, and the system draws
     * its "no passkeys available" sheet over a wallet whose passkey was made
     * moments ago. Cancelling and pressing the row's confirm — which sends the
     * IDENTICAL request — then works, because the seconds spent tapping were
     * what the provider needed (founder-found on device 2026-08-25; iOS does
     * not do this).
     *
     * Two things stop that sheet from ever being drawn:
     *
     * * A pinned get for a credential we JUST minted waits until the mint is
     *   at least [SETTLE_AFTER_CREATE_MS] old. The app is showing "creating
     *   your wallet" at that moment, so the wait costs nothing visible.
     * * Pinned attempts ask with `preferImmediatelyAvailableCredentials`, which
     *   makes Credential Manager throw instead of drawing the fallback UI when
     *   no provider has an entry. That turns "an unexplained sheet" into
     *   "retry in a moment", which is what the situation actually is. Only the
     *   LAST attempt drops the flag, so a genuinely-missing credential still
     *   reaches the platform's own UI, where "use another device" lives.
     *
     * An UNPINNED assertion does none of this: there, "no credential" is the
     * honest answer to "who are you?" on a device with no wallet, and the
     * platform's UI is exactly what should be shown.
     */
    suspend fun assert(
        challenge: ByteArray,
        credentialIdHex: String?,
        /**
         * WHERE the credential lives, as its authenticator reported at
         * registration (`hybrid,internal`, `usb,nfc`, …), or empty when unknown.
         *
         * **This is load-bearing, not a hint.** An `allowCredentials` entry with
         * no transports leaves Credential Manager to guess where to look, and it
         * guesses REMOVABLE SECURITY KEY: a passkey living in Apple Passwords on
         * another phone drew "Connect your security key", which is a dead end
         * the person cannot answer — they have no key to plug in, and the route
         * that would work (scan the QR with the phone that holds it) is never
         * offered (device-found 2026-08-26). With `hybrid` present the platform
         * offers that route; with `usb` it offers the sheet a security key
         * owner actually wants.
         */
        transports: String = "",
    ): Assertion {
        val credentialManager = manager ?: throw PasskeyFailure(
            FailureKind.NotSupported,
            "Credential Manager is unavailable on this device",
        )

        val request = JSONObject().apply {
            put("challenge", toBase64url(challenge))
            put("rpId", relyingPartyId)
            put("userVerification", "required")
            if (credentialIdHex != null) {
                val descriptor = JSONObject()
                    .put("type", PUBLIC_KEY)
                    .put("id", base64urlOfHex(credentialIdHex))
                val hints = transports.split(',')
                    .map { it.trim() }
                    .filter { it.isNotEmpty() }
                if (hints.isNotEmpty()) {
                    descriptor.put("transports", JSONArray(hints))
                }
                put("allowCredentials", JSONArray().put(descriptor))
            }
        }

        val options = listOf(GetPublicKeyCredentialOption(request.toString()))
        val response = if (credentialIdHex == null) {
            try {
                credentialManager.getCredential(
                    context = context,
                    request = GetCredentialRequest(options),
                )
            } catch (error: GetCredentialException) {
                throw classifyGet(error)
            }
        } else {
            settleAfterMint(credentialIdHex)
            getPinned(credentialManager, options)
        }

        val credential = response.credential as? PublicKeyCredential
            ?: throw PasskeyFailure(FailureKind.Other, "No credential returned")
        val json = JSONObject(credential.authenticationResponseJson)
        val inner = json.getJSONObject("response")

        return Assertion(
            credentialIdHex = hexOfBase64url(json.getString("rawId")),
            // `signatureDerHex`, not `signatureHex`: the provider hands back a
            // DER signature and the core normalises it (including low-S) itself.
            // Naming it otherwise would invite a shell to "helpfully" convert.
            signatureDerHex = hexOfBase64url(inner.getString("signature")),
            authenticatorDataHex = hexOfBase64url(inner.getString("authenticatorData")),
            clientDataJsonHex = hexOfBase64url(inner.getString("clientDataJSON")),
            // Absent, not empty: no user handle is a different fact from an empty
            // one, and the core's name resolution branches on it.
            userIdHex = inner.nullableString("userHandle")?.let { hexOfBase64url(it) },
            authenticatorAttachment = json.optString("authenticatorAttachment"),
        )
    }

    /**
     * Do not ask a provider for a credential it may still be writing down.
     * Only ever waits after THIS app minted THAT credential, so a sign-in or a
     * later signature is never delayed.
     */
    private suspend fun settleAfterMint(credentialIdHex: String) {
        if (!credentialIdHex.equals(mintedCredentialIdHex, ignoreCase = true)) return
        val since = SystemClock.elapsedRealtime() - mintedAt
        if (since in 0 until SETTLE_AFTER_CREATE_MS) {
            delay(SETTLE_AFTER_CREATE_MS - since)
        }
    }

    /**
     * The pinned get, retried while providers catch up. Attempts before the
     * last one ask for an immediately-available credential only, so a miss
     * throws instead of drawing the platform's "no passkeys" sheet.
     */
    private suspend fun getPinned(
        credentialManager: CredentialManager,
        options: List<GetPublicKeyCredentialOption>,
    ): GetCredentialResponse {
        var attempt = 0
        while (true) {
            val last = attempt == RETRY_BACKOFF_MS.size
            try {
                return credentialManager.getCredential(
                    context = context,
                    request = GetCredentialRequest(
                        credentialOptions = options,
                        preferImmediatelyAvailableCredentials = !last,
                    ),
                )
            } catch (error: NoCredentialException) {
                if (last) throw classifyGet(error)
                delay(RETRY_BACKOFF_MS[attempt])
                attempt += 1
            } catch (error: GetCredentialException) {
                throw classifyGet(error)
            }
        }
    }

    fun random(bytes: Int): ByteArray = ByteArray(bytes).also(secureRandom::nextBytes)

    /**
     * `name` + NUL + `uuid` — the handle shape every Vela client mints and
     * `Assertion::user_name` in the core parses back. A handle without the NUL
     * separator, or without a uuid tail, is read as a credential this app did
     * not create, and its name is discarded rather than shown.
     */
    private fun encodeUserHandle(name: String): String = name + NUL + UUID.randomUUID()

    private fun attachmentFor(method: KeyMethod): String? = when (method) {
        // The platform authenticator is Credential Manager's default, and naming
        // it explicitly would EXCLUDE a provider that is neither platform nor
        // roaming — which is the common case on Android, where the credential
        // usually lives in a password manager rather than in the device itself.
        KeyMethod.Platform -> null
        KeyMethod.SecurityKey -> "cross-platform"
        KeyMethod.Hybrid -> null
    }

    private companion object {
        const val RELYING_PARTY = "getvela.app"
        const val RELYING_PARTY_NAME = "Vela Wallet"
        const val PUBLIC_KEY = "public-key"
        const val ES256 = -7
        const val CHALLENGE_BYTES = 32

        /**
         * How old a mint must be before this app asks for it back. Spent
         * behind the "creating your wallet" screen, so it costs no visible
         * time; a provider that is slower than this is covered by the retries.
         */
        const val SETTLE_AFTER_CREATE_MS = 1_200L

        /**
         * Waits between pinned attempts. Four tries over ~4.2 s in total, then
         * one final attempt that lets the platform speak for itself.
         */
        val RETRY_BACKOFF_MS = longArrayOf(600L, 1_200L, 2_400L)
        const val NUL = '\u0000'

        /**
         * Where Credential Manager puts the registration response JSON. There is
         * no typed accessor for it the way there is for an assertion, so the key
         * is spelled out once, here.
         */
        const val BUNDLE_REGISTRATION_RESPONSE =
            "androidx.credentials.BUNDLE_KEY_REGISTRATION_RESPONSE_JSON"

        val secureRandom = SecureRandom()
    }
}

/** The core's `FailureKind` vocabulary. */
enum class FailureKind(val wire: String) {
    Cancelled("cancelled"),
    NotSupported("not_supported"),
    NotDiscoverable("not_discoverable"),
    Other("other"),
}

/**
 * A ceremony that produced no credential, already classified.
 *
 * Classification is the ONE judgement call a shell makes, and it is deliberately
 * narrow: everything unrecognised becomes `other` carrying the platform's own
 * words, which the core forwards verbatim into the bug report.
 */
class PasskeyFailure(val kind: FailureKind, message: String) : Exception(message)

/** A completed registration, in the core's hex vocabulary. */
data class Registration(
    val credentialIdHex: String,
    val attestationObjectHex: String,
    val clientDataJsonHex: String,
    val authenticatorAttachment: String,
    val transports: String,
)

/** A completed assertion. */
data class Assertion(
    val credentialIdHex: String,
    val signatureDerHex: String,
    val authenticatorDataHex: String,
    val clientDataJsonHex: String,
    val userIdHex: String?,
    val authenticatorAttachment: String,
)

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

internal fun classifyCreate(error: CreateCredentialException): PasskeyFailure = when (error) {
    is CreateCredentialCancellationException ->
        PasskeyFailure(FailureKind.Cancelled, "User cancelled the operation")

    // No provider offered to create one, or the platform has no passkey support
    // at all. Both are "this device will not do it", which is the case the core's
    // `not_supported` path exists for.
    is CreateCredentialNoCreateOptionException, is CreateCredentialUnsupportedException ->
        PasskeyFailure(FailureKind.NotSupported, describe(error))

    is CreatePublicKeyCredentialDomException -> when (domType(error.domError)) {
        // With excludeCredentials set this means the chosen authenticator
        // already holds one of this wallet's founding keys.
        DOM_INVALID_STATE -> PasskeyFailure(
            FailureKind.Other,
            "This authenticator already holds one of this wallet's keys",
        )
        DOM_NOT_SUPPORTED -> PasskeyFailure(FailureKind.NotSupported, describe(error))
        DOM_NOT_ALLOWED -> PasskeyFailure(FailureKind.Cancelled, "User cancelled the operation")
        else -> PasskeyFailure(FailureKind.Other, describe(error))
    }

    else -> PasskeyFailure(FailureKind.Other, describe(error))
}

internal fun classifyGet(error: GetCredentialException): PasskeyFailure = when (error) {
    is GetCredentialCancellationException ->
        PasskeyFailure(FailureKind.Cancelled, "User cancelled the operation")

    // "No credential" is NOT `not_supported`: the device is perfectly capable,
    // there is simply nothing here to sign in with. The core reads it as a
    // failed sign-in and offers creating a wallet, which is the right next step;
    // reading it as unsupported would tell the person their phone cannot do
    // something it had just done.
    is NoCredentialException -> PasskeyFailure(FailureKind.Other, describe(error))

    is GetCredentialUnsupportedException -> PasskeyFailure(FailureKind.NotSupported, describe(error))

    is GetPublicKeyCredentialDomException -> when (domType(error.domError)) {
        DOM_NOT_SUPPORTED -> PasskeyFailure(FailureKind.NotSupported, describe(error))
        DOM_NOT_ALLOWED -> PasskeyFailure(FailureKind.Cancelled, "User cancelled the operation")
        else -> PasskeyFailure(FailureKind.Other, describe(error))
    }

    else -> PasskeyFailure(FailureKind.Other, describe(error))
}

/**
 * The DOM error's identity.
 *
 * Matched by TYPE STRING rather than by class: the `androidx.credentials` DOM
 * error classes are final and carry the spec name in `type`, so the string is
 * the stable identity — and it is the same three names the web path branches on.
 */
private fun domType(domError: Any): String = runCatching {
    domError.javaClass.getMethod("getType").invoke(domError) as? String
}.getOrNull() ?: domError.javaClass.simpleName

private const val DOM_INVALID_STATE = "androidx.credentials.TYPE_INVALID_STATE_ERROR"
private const val DOM_NOT_SUPPORTED = "androidx.credentials.TYPE_NOT_SUPPORTED_ERROR"
private const val DOM_NOT_ALLOWED = "androidx.credentials.TYPE_NOT_ALLOWED_ERROR"

private fun describe(error: Throwable): String =
    error.message ?: error::class.simpleName ?: "Unknown passkey error"

// ---------------------------------------------------------------------------
// base64url and hex
// ---------------------------------------------------------------------------
//
// WebAuthn JSON is base64url everywhere; the core is hex everywhere. Both
// conversions go through vela-core, so a padding or alphabet difference cannot
// appear on one client only.

internal fun hexOfBase64url(value: String): String = toHex(fromBase64url(value), false)

internal fun base64urlOfHex(value: String): String = toBase64url(fromHex(value))

private fun JSONArray?.strings(): List<String> =
    if (this == null) emptyList() else (0 until length()).map { optString(it) }
