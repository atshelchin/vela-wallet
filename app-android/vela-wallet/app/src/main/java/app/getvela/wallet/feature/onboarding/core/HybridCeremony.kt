package app.getvela.wallet.feature.onboarding.core

import android.content.Context
import app.getvela.wallet.MainActivity
import app.getvela.wallet.core.diagnostics.VelaLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uniffi.vela_core_uniffi.CableFramePort
import uniffi.vela_core_uniffi.CtapCeremonyHost
import uniffi.vela_core_uniffi.CtapCredentialChoice
import uniffi.vela_core_uniffi.CtapException
import uniffi.vela_core_uniffi.CtapPinRequest
import uniffi.vela_core_uniffi.ctapAssertCable
import uniffi.vela_core_uniffi.ctapRegisterCable
import uniffi.vela_core_uniffi.cableConnectUrl
import uniffi.vela_core_uniffi.cableQrPayload
import java.security.SecureRandom

/**
 * "Sign in with your phone" — the caBLE / hybrid transport as INITIATOR.
 *
 * The Noise handshake and CTAP framing are the core's (`vela_core::cable`, the
 * same code the desktop and the other phone's authenticator run). This class is
 * the Android side of the three seams:
 *
 *  * the QR the OTHER phone scans ([qrPayload]);
 *  * the transport — a BLE scan for the responder's advert, then either an
 *    L2CAP CoC (CTAP 2.3, no internet) or a WebSocket tunnel (CTAP 2.2), as one
 *    [CableFramePort] ([HybridCableScanner] + [CableTransports]); and
 *  * the person ([CtapCeremonyHost] — randomness, and the "look at your phone"
 *    touch prompt; a phone-resident passkey needs no PIN from us).
 *
 * Deliberately parallel to [UsbSecurityKeyCeremony]: same shape, different
 * route. The executor picks THIS one for [KeyMethod.Hybrid] (the scan method).
 */
class HybridCeremony(
    private val context: Context,
    private val prompts: UsbSecurityKeyCeremony.Prompts,
) {
    private val scanner = HybridCableScanner(context)
    private val secureRandom = SecureRandom()

    /** Fresh per-ceremony secrets: the QR both encodes and the handshake keys off. */
    class Session(val staticSeed: ByteArray, val qrSecret: ByteArray)

    fun newSession(): Session = Session(
        staticSeed = ByteArray(32).also(secureRandom::nextBytes),
        qrSecret = ByteArray(16).also(secureRandom::nextBytes),
    )

    /**
     * The `FIDO:/…` QR to render, or null if the fresh secrets were malformed
     * (the caller retries with a new [Session]). The payload is exactly
     * Chrome's shape — the BLE channel is chosen by the AUTHENTICATOR's advert
     * (its PSM suffix), never offered in the QR, because GMS's caBLE-v2.1
     * parser hard-rejects any QR whose key 6 is not its legacy bool
     * (device-found 2026-08-28).
     */
    fun qrPayload(session: Session, forGet: Boolean): String? = cableQrPayload(
        staticSeed = session.staticSeed,
        qrSecret = session.qrSecret,
        epochSeconds = System.currentTimeMillis() / 1000,
        forGet = forGet,
    )

    suspend fun register(
        session: Session,
        name: String,
        excludeCredentialIds: List<String>,
    ): Registration = runCeremony(session) { port, plaintext, host ->
        ctapRegisterCable(
            port, host, session.staticSeed, session.qrSecret, plaintext,
            HYBRID_PRODUCT, name, excludeCredentialIds,
        ).toRegistration()
    }

    suspend fun assert(
        session: Session,
        challenge: ByteArray,
        credentialIdHex: String?,
    ): Assertion = runCeremony(session) { port, plaintext, host ->
        ctapAssertCable(
            port, host, session.staticSeed, session.qrSecret, plaintext,
            HYBRID_PRODUCT, challenge, credentialIdHex ?: "",
        ).toAssertion()
    }

    /**
     * Grant Bluetooth, scan for the phone that scanned our QR, open the channel
     * the advert chose, and run [body] on the IO dispatcher. The ceremony call
     * blocks (Rust drives the callbacks), exactly like the USB path.
     */
    private suspend fun <T> runCeremony(
        session: Session,
        body: (CableFramePort, ByteArray, CtapCeremonyHost) -> T,
    ): T {
        val granted = (context as? MainActivity)?.requestBluetoothPermission() ?: false
        if (!granted) {
            throw PasskeyFailure(FailureKind.Cancelled, "Bluetooth permission was declined")
        }
        if (!scanner.bluetoothReady()) {
            // A radio that is merely OFF is not "not supported" — NotSupported
            // renders as the biometrics alert, a sentence about the wrong
            // subject (device-found on a OnePlus 5T, 2026-08-28). Ask the
            // system to turn it on (its dialog, its localization); declining is
            // a cancel, exactly like declining the permission above.
            val enabled = (context as? MainActivity)?.requestEnableBluetooth() ?: false
            if (!enabled || !awaitBluetoothReady()) {
                throw PasskeyFailure(FailureKind.Cancelled, "Bluetooth stayed off")
            }
        }
        if (!locationReadyForScan()) {
            // API ≤30 gates BLE SCAN RESULTS on location services — off means a
            // silent empty scan, which would misreport as "no phone answered"
            // after the full window. Explain first (an unannounced jump into
            // system settings reads as broken), then send the person to the
            // system toggle — there is no in-place enable dialog without GMS —
            // and continue when they return with it on. Declining either step
            // is a cancel, exactly like declining the permission above.
            val agreed = withContext(Dispatchers.IO) { prompts.askEnableLocation() }
            if (!agreed) {
                throw PasskeyFailure(FailureKind.Cancelled, "Location explainer declined")
            }
            (context as? MainActivity)?.openLocationSettings()
            if (!locationReadyForScan()) {
                throw PasskeyFailure(FailureKind.Cancelled, "Location stayed off")
            }
        }

        return withContext(Dispatchers.IO) {
            val hit = scanner.findResponder(session.qrSecret, SCAN_TIMEOUT_MS)
                ?: throw PasskeyFailure(
                    FailureKind.Other,
                    "No phone answered the code. Scan it with the other device and try again.",
                )

            val conn: CableConn = if (hit.advert.psm != null) {
                VelaLog.event("cable", "advert offers BLE (PSM ${hit.advert.psm}) — L2CAP CoC, no tunnel")
                L2capCableConn.connect(hit.device, hit.advert.psm!!.toInt())
            } else {
                val url = cableConnectUrl(session.staticSeed, session.qrSecret, hit.advert.plaintext)
                    ?: throw PasskeyFailure(FailureKind.Other, "the phone's advertisement named an unknown tunnel")
                VelaLog.event("cable", "advert has no PSM — WebSocket tunnel")
                WebSocketCableConn.connect(url, timeoutMs = TUNNEL_CONNECT_MS)
            }

            val port = CableConnPort(conn)
            val host = HostBridge(prompts, secureRandom)
            try {
                body(port, hit.advert.plaintext, host)
            } catch (error: CtapException) {
                throw error.toPasskeyFailure()
            } finally {
                runCatching { conn.close() }
                prompts.touchWaiting(null, "")
            }
        }
    }

    /**
     * The enable dialog answers OK when the adapter has ACCEPTED the turn-on,
     * which can be a beat before it reports enabled — poll briefly rather than
     * failing a scan the person just approved.
     */
    private suspend fun awaitBluetoothReady(): Boolean {
        repeat(20) {
            if (scanner.bluetoothReady()) return true
            kotlinx.coroutines.delay(100)
        }
        return scanner.bluetoothReady()
    }

    /**
     * On API ≤30 the platform withholds BLE scan results unless location
     * services are on (the runtime permission alone is not enough); 31+ with
     * BLUETOOTH_SCAN `neverForLocation` has no such gate.
     */
    private fun locationReadyForScan(): Boolean {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) return true
        val manager = context.getSystemService(Context.LOCATION_SERVICE)
            as? android.location.LocationManager ?: return false
        return androidx.core.location.LocationManagerCompat.isLocationEnabled(manager)
    }

    /** The [CtapCeremonyHost] for a phone-resident credential: no PIN, no picker
     *  (the phone runs its own), just randomness and the "look at your phone"
     *  prompt. */
    private class HostBridge(
        private val prompts: UsbSecurityKeyCeremony.Prompts,
        private val secureRandom: SecureRandom,
    ) : CtapCeremonyHost {
        override fun pin(request: CtapPinRequest): String? = null
        override fun pick(choices: List<CtapCredentialChoice>): UInt? = 0u
        override fun random(len: UInt): ByteArray =
            ByteArray(len.toInt()).also(secureRandom::nextBytes)
        override fun note(line: String) = VelaLog.event("cable.ctap", line)
        override fun touch(kind: String, product: String) = prompts.touchWaiting(kind, product)
    }

    private companion object {
        /** The person picks up the other phone, unlocks it, approves the prompt. */
        const val SCAN_TIMEOUT_MS = 90_000L
        const val TUNNEL_CONNECT_MS = 15_000L
        /** What the touch prompt names while the OTHER phone shows its sheet. */
        const val HYBRID_PRODUCT = "your phone"
    }
}
