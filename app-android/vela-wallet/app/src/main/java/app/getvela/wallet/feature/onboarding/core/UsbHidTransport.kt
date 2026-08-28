package app.getvela.wallet.feature.onboarding.core

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import app.getvela.wallet.core.diagnostics.VelaLog
import kotlinx.coroutines.suspendCancellableCoroutine
import uniffi.vela_core_uniffi.HidReadOutcome
import uniffi.vela_core_uniffi.UsbHidPort
import kotlin.coroutines.resume

/**
 * The USB half of the app-owned CTAP path, and NOTHING else.
 *
 * The CTAPHID framing — INIT, the 64-byte packets, keepalives, reassembly —
 * lives in `vela_core::ctap::hid_cable` and runs in Rust, the same conversation
 * the desktop runs. This file is only the wire under it: find a FIDO device,
 * get permission, claim the interface, and move one 64-byte report each way.
 * If a rule about what a byte MEANS appears here, it is in the wrong place.
 *
 * **Why this exists at all.** Credential Manager is a provider picker, and on a
 * device without (full) GMS — GrapheneOS, CalyxOS, much of the China market —
 * there is no passkey provider to pick and no FIDO2 path at all. Talking to the
 * key over [`android.hardware.usb`] directly is the only way those phones can
 * use a hardware key: no Google service, no domain association, no OEM sheet.
 */
class UsbHidTransport(private val context: Context) {
    private val usb = context.getSystemService(Context.USB_SERVICE) as UsbManager

    /** The FIDO security keys plugged in right now (an HID interface with both
     *  an interrupt IN and an interrupt OUT endpoint). */
    fun fidoDevices(): List<UsbDevice> {
        val all = usb.deviceList.values.toList()
        val fido = all.filter { hidInterface(it) != null }
        // Logged because "no key plugged in" and "key plugged in but not
        // recognised" are indistinguishable to a person, and on a single-port
        // phone the USB port is often taken by the adb cable during a test. The
        // per-device line says what enumerated and whether it looked like FIDO.
        VelaLog.event(
            "usb.hid",
            "enumerated",
            "total" to all.size,
            "fido" to fido.size,
        )
        for (device in all) {
            VelaLog.event(
                "usb.hid",
                "device",
                "name" to (device.productName ?: "?"),
                "vid" to device.vendorId,
                "pid" to device.productId,
                "class" to device.deviceClass,
                "ifaces" to device.interfaceCount,
                "isFido" to (hidInterface(device) != null),
            )
        }
        return fido
    }

    fun hasPermission(device: UsbDevice): Boolean = usb.hasPermission(device)

    /**
     * Ask the OS for permission to open [device]. Blocks (suspends) until the
     * person answers the system dialog; `false` is a denial, which the caller
     * turns into a cancellation.
     */
    suspend fun requestPermission(device: UsbDevice): Boolean =
        suspendCancellableCoroutine { cont ->
            val action = context.packageName + ".USB_PERMISSION"
            val receiver = object : BroadcastReceiver() {
                override fun onReceive(c: Context, intent: Intent) {
                    if (intent.action != action) return
                    runCatching { context.unregisterReceiver(this) }
                    val granted =
                        intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                    if (cont.isActive) cont.resume(granted)
                }
            }
            registerReceiverCompat(receiver, IntentFilter(action))
            val piFlags =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                } else {
                    PendingIntent.FLAG_UPDATE_CURRENT
                }
            val pending = PendingIntent.getBroadcast(
                context,
                0,
                Intent(action).setPackage(context.packageName),
                piFlags,
            )
            cont.invokeOnCancellation { runCatching { context.unregisterReceiver(receiver) } }
            usb.requestPermission(device, pending)
        }

    /**
     * Open [device] as a [UsbHidPort] the Rust cable can drive. Throws
     * [UsbHidException] when the device has no usable FIDO interface or the
     * open is refused — the caller maps that to the ceremony's `not_supported`.
     */
    fun open(device: UsbDevice): UsbHidPort {
        val iface = hidInterface(device)
            ?: throw UsbHidException("This USB device has no FIDO HID interface.")
        var endpointIn: UsbEndpoint? = null
        var endpointOut: UsbEndpoint? = null
        for (i in 0 until iface.endpointCount) {
            val endpoint = iface.getEndpoint(i)
            if (endpoint.type == UsbConstants.USB_ENDPOINT_XFER_INT) {
                if (endpoint.direction == UsbConstants.USB_DIR_IN) {
                    endpointIn = endpoint
                } else {
                    endpointOut = endpoint
                }
            }
        }
        if (endpointIn == null || endpointOut == null) {
            throw UsbHidException("The security key is missing an interrupt endpoint.")
        }
        val connection = usb.openDevice(device)
            ?: throw UsbHidException("Could not open the security key (permission?).")
        if (!connection.claimInterface(iface, true)) {
            connection.close()
            throw UsbHidException("Could not claim the security key's HID interface.")
        }
        val product = device.productName ?: "security key"
        VelaLog.event(
            "usb.hid",
            "opened",
            "product" to product,
            "packet" to endpointOut.maxPacketSize,
        )
        return UsbHidPortConnection(connection, iface, endpointIn, endpointOut, device.deviceName, product)
    }

    private fun registerReceiverCompat(receiver: BroadcastReceiver, filter: IntentFilter) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }
    }

    private fun hidInterface(device: UsbDevice): UsbInterface? {
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            if (iface.interfaceClass != UsbConstants.USB_CLASS_HID) continue
            var hasIn = false
            var hasOut = false
            for (e in 0 until iface.endpointCount) {
                val endpoint = iface.getEndpoint(e)
                if (endpoint.type == UsbConstants.USB_ENDPOINT_XFER_INT) {
                    if (endpoint.direction == UsbConstants.USB_DIR_IN) hasIn = true else hasOut = true
                }
            }
            if (hasIn && hasOut) return iface
        }
        return null
    }
}

/** The device could not be reached at all — no interface, no permission. */
class UsbHidException(message: String) : Exception(message)

/**
 * One open USB conversation, as the core cable's [UsbHidPort].
 *
 * A CTAPHID report is 64 bytes over the interrupt endpoints, sent with NO
 * report-id byte — Android's bulk transfer takes the raw packet, unlike
 * hidapi's write which prepends one. The core cable's `HidCable::open` writes
 * the INIT, so this only carries what it hands over.
 */
private class UsbHidPortConnection(
    private val connection: UsbDeviceConnection,
    private val iface: UsbInterface,
    private val endpointIn: UsbEndpoint,
    private val endpointOut: UsbEndpoint,
    private val deviceName: String,
    private val product: String,
) : UsbHidPort {

    override fun writeReport(report: ByteArray): String? {
        val written = connection.bulkTransfer(endpointOut, report, report.size, WRITE_TIMEOUT_MS)
        return if (written < 0) "USB write failed" else null
    }

    override fun readReport(): HidReadOutcome {
        val buffer = ByteArray(REPORT_SIZE)
        val read = connection.bulkTransfer(endpointIn, buffer, buffer.size, READ_SLICE_MS)
        return when {
            // A full report.
            read == REPORT_SIZE -> HidReadOutcome.Report(buffer)
            // The read slice elapsed with nothing — the cable loops until its
            // own overall deadline. bulkTransfer returns -1 on timeout.
            read < 0 -> HidReadOutcome.WouldBlock
            // A short read is a framing fault the cable cannot use.
            else -> HidReadOutcome.Failed("USB read returned $read of $REPORT_SIZE bytes")
        }
    }

    override fun product(): String = product

    override fun path(): String = deviceName

    private companion object {
        const val REPORT_SIZE = 64
        const val WRITE_TIMEOUT_MS = 1_000
        // Short, so a cancelled ceremony stops promptly; the cable's own
        // overall budget (in Rust) decides when the key has truly gone quiet.
        const val READ_SLICE_MS = 250
    }
}
