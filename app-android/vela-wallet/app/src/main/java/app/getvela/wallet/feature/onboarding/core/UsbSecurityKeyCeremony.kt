package app.getvela.wallet.feature.onboarding.core

import android.content.Context
import app.getvela.wallet.core.diagnostics.VelaLog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import uniffi.vela_core_uniffi.CtapAssertion
import uniffi.vela_core_uniffi.CtapCeremonyHost
import uniffi.vela_core_uniffi.CtapCredentialChoice
import uniffi.vela_core_uniffi.CtapException
import uniffi.vela_core_uniffi.CtapPinRequest
import uniffi.vela_core_uniffi.CtapRegistration
import uniffi.vela_core_uniffi.ctapAssert
import uniffi.vela_core_uniffi.ctapRegister
import java.security.SecureRandom

/**
 * The app-owned CTAP2 ceremony over USB — the GMS-free security-key path.
 *
 * The whole protocol runs in Rust (`vela_core::ctap`, the same code the desktop
 * runs); this class is the Android side of its two seams:
 *
 *  * the transport ([UsbHidTransport], which becomes the Rust cable's port), and
 *  * the person and the platform ([CtapCeremonyHost] — PIN, wallet picker,
 *    randomness, the touch prompt).
 *
 * It is deliberately parallel to [SecurityKeyCeremony], which runs the GMS
 * FIDO2 path: same shape, different route. The executor picks THIS one when a
 * USB FIDO key is plugged in, so a phone without Google services can still make
 * and use a wallet with a hardware key.
 *
 * The ceremony call blocks (it is the Rust protocol driving callbacks), so it
 * runs on [Dispatchers.IO]; the host callbacks bridge back to the UI through
 * [Prompts], blocking the IO thread until the person answers — exactly the way
 * the desktop's ceremony thread blocks on its channel.
 */
class UsbSecurityKeyCeremony(
    private val context: Context,
    private val prompts: Prompts,
) {
    private val transport = UsbHidTransport(context)

    /** Is there a USB FIDO key plugged in for this path to use? */
    fun deviceAvailable(): Boolean = transport.fidoDevices().isNotEmpty()

    /**
     * The UI seam. The ViewModel implements it; every method BLOCKS the calling
     * (IO) thread until the person answers on the main thread, which is what a
     * synchronous CTAP host callback needs.
     */
    interface Prompts {
        /** Ask for the key's PIN. `null` is a dismissal. `retries` is -1 when
         *  the key would not say how many attempts are left. */
        fun askPin(product: String, retries: Int, isRetry: Boolean): String?

        /** One key holds several wallets — which? Returns the chosen index, or
         *  `null` for a dismissal. */
        fun askWhichWallet(choices: List<CtapCredentialChoice>): Int?

        /** The key is blinking. `kind` is "presence" / "fingerprint" /
         *  "select". Called with `null` clears the prompt. */
        fun touchWaiting(kind: String?, product: String)

        /** The hybrid scan needs system Location services (API ≤30) — explain
         *  why before jumping to settings. `true` means "take me there". Only
         *  the caBLE ceremony asks; the USB path never does, hence the default. */
        fun askEnableLocation(): Boolean = false

        /** No key present: show "insert your security key" and poll [probe]
         *  until one appears (`true`) or the person closes the sheet (`false`).
         *  [otgLooksOff] adds the OEM hint that the phone's OTG switch is off —
         *  the state that eats the key silently on phones that auto-disable
         *  OTG. Default `false` = surfaces that never show the sheet. */
        fun awaitKeyInsertion(otgLooksOff: Boolean, probe: () -> Boolean): Boolean = false
    }

    suspend fun register(
        name: String,
        excludeCredentialIds: List<String>,
    ): Registration = runCeremony { port, host ->
        ctapRegister(port, host, name, excludeCredentialIds).toRegistration()
    }

    suspend fun assert(
        challenge: ByteArray,
        credentialIdHex: String?,
    ): Assertion = runCeremony { port, host ->
        ctapAssert(port, host, challenge, credentialIdHex ?: "").toAssertion()
    }

    /**
     * Pick the device, get permission, open the port, and run [body] on the IO
     * dispatcher — mapping the classified Rust failure onto the shell's
     * [PasskeyFailure] so the core sees the same vocabulary the other paths
     * produce.
     */
    private suspend fun <T> runCeremony(
        body: (uniffi.vela_core_uniffi.UsbHidPort, CtapCeremonyHost) -> T,
    ): T {
        var device = transport.fidoDevices().firstOrNull()
        if (device == null) {
            // No key is a WAITABLE state, not a diagnosis: the person is
            // holding the key they are about to plug in — and NotSupported
            // rendered as the biometrics alert, a sentence about the wrong
            // subject entirely (device-found on a OnePlus 5T, 2026-08-28,
            // second occurrence — the first was Bluetooth-off on the scan
            // path). The sheet polls; plugging the key in continues the
            // ceremony by itself, closing the sheet is a cancel.
            val inserted = withContext(Dispatchers.IO) {
                prompts.awaitKeyInsertion(otgLooksOff = otgSwitchLooksOff()) {
                    transport.fidoDevices().isNotEmpty()
                }
            }
            if (!inserted) {
                throw PasskeyFailure(FailureKind.Cancelled, "No key was inserted")
            }
            device = transport.fidoDevices().firstOrNull() ?: throw PasskeyFailure(
                FailureKind.NotSupported,
                "No security key is plugged in. Insert one and try again.",
            )
        }
        if (!transport.hasPermission(device)) {
            VelaLog.event("usb.hid", "asking permission", "product" to (device.productName ?: "?"))
            val granted = transport.requestPermission(device)
            if (!granted) {
                throw PasskeyFailure(FailureKind.Cancelled, "USB permission was declined")
            }
        }
        return withContext(Dispatchers.IO) {
            val port = try {
                transport.open(device)
            } catch (error: UsbHidException) {
                throw PasskeyFailure(FailureKind.NotSupported, error.message ?: "USB open failed")
            }
            val host = HostBridge(prompts)
            try {
                body(port, host)
            } catch (error: CtapException) {
                throw error.toPasskeyFailure()
            } finally {
                prompts.touchWaiting(null, "")
            }
        }
    }

    /**
     * Does this phone's OTG switch look OFF? There is no Android API for the
     * toggle — it is an OEM concept — but OxygenOS mirrors it into a readable
     * settings key (`oem_otg_read`, 0 = off, verified on the OnePlus 5T whose
     * auto-off ate the key). Phones without the key read the default and show
     * no hint, which is the honest answer there.
     */
    private fun otgSwitchLooksOff(): Boolean {
        val resolver = context.contentResolver
        val system = android.provider.Settings.System.getInt(resolver, "oem_otg_read", 1)
        val global = android.provider.Settings.Global.getInt(resolver, "oem_otg_read", 1)
        return system == 0 || global == 0
    }

    /** The [CtapCeremonyHost], bridging Rust's synchronous callbacks to the UI. */
    private class HostBridge(private val prompts: Prompts) : CtapCeremonyHost {
        private val secureRandom = SecureRandom()

        override fun pin(request: CtapPinRequest): String? =
            prompts.askPin(request.product, request.retries, request.retry)

        override fun pick(choices: List<CtapCredentialChoice>): UInt? =
            prompts.askWhichWallet(choices)?.toUInt()

        override fun random(len: UInt): ByteArray =
            ByteArray(len.toInt()).also(secureRandom::nextBytes)

        override fun note(line: String) {
            VelaLog.event("usb.ctap", line)
        }

        override fun touch(kind: String, product: String) {
            prompts.touchWaiting(kind, product)
        }
    }
}

internal fun CtapRegistration.toRegistration() = Registration(
    credentialIdHex = credentialIdHex,
    attestationObjectHex = attestationObjectHex,
    clientDataJsonHex = clientDataJsonHex,
    authenticatorAttachment = authenticatorAttachment,
    transports = transports,
)

internal fun CtapAssertion.toAssertion() = Assertion(
    credentialIdHex = credentialIdHex,
    signatureDerHex = signatureDerHex,
    authenticatorDataHex = authenticatorDataHex,
    clientDataJsonHex = clientDataJsonHex,
    userIdHex = userIdHex.ifEmpty { null },
    authenticatorAttachment = authenticatorAttachment,
)

/** The core's `FailureKind`, from the classified CTAP error. Shared with the
 *  caBLE ceremony ([HybridCeremony]), which classifies the same errors. */
internal fun CtapException.toPasskeyFailure(): PasskeyFailure = when (this) {
    is CtapException.Cancelled -> PasskeyFailure(FailureKind.Cancelled, "User cancelled the operation")
    is CtapException.NotSupported -> PasskeyFailure(FailureKind.NotSupported, detail)
    is CtapException.NotDiscoverable -> PasskeyFailure(FailureKind.NotDiscoverable, detail)
    is CtapException.Other -> PasskeyFailure(FailureKind.Other, detail)
}
