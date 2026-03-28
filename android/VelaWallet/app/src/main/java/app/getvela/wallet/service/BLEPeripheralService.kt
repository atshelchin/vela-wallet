package app.getvela.wallet.service

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

private const val TAG = "BLEPeripheral"

/**
 * BLE Peripheral — Android app advertises as a Vela Wallet peripheral.
 * Chrome extension (Central) connects and sends dApp requests.
 * Phone signs with Passkey and returns responses.
 *
 * Port of iOS BLEPeripheralService.swift — same UUIDs and protocol.
 */
class BLEPeripheralService private constructor() {

    companion object {
        val SERVICE_UUID: UUID = UUID.fromString("0000BE1A-0000-1000-8000-00805F9B34FB")
        val REQUEST_CHAR_UUID: UUID = UUID.fromString("0001BE1A-0000-1000-8000-00805F9B34FB")
        val RESPONSE_CHAR_UUID: UUID = UUID.fromString("0002BE1A-0000-1000-8000-00805F9B34FB")
        val WALLET_INFO_CHAR_UUID: UUID = UUID.fromString("0003BE1A-0000-1000-8000-00805F9B34FB")

        @Volatile
        private var instance: BLEPeripheralService? = null

        val shared: BLEPeripheralService
            get() = instance ?: synchronized(this) {
                instance ?: BLEPeripheralService().also { instance = it }
            }
    }

    var isAdvertising by mutableStateOf(false)
    var isConnected by mutableStateOf(false)
    var currentChainId by mutableIntStateOf(1)

    var onRequest: ((BLEIncomingRequest) -> Unit)? = null
    var onSwitchAccount: ((String) -> Unit)? = null

    private var gattServer: BluetoothGattServer? = null
    private var advertiser: BluetoothLeAdvertiser? = null
    private var subscribedDevice: BluetoothDevice? = null // only set after CCCD subscription (matches iOS subscribedCentral)
    private var responseChar: BluetoothGattCharacteristic? = null
    private var walletInfoChar: BluetoothGattCharacteristic? = null

    private var advWalletAddress = ""
    private var advAccountName = ""
    private var advChainId = 1
    private var advAllAccounts: List<Map<String, String>> = emptyList()
    private var shouldAutoRestart = false

    private var bluetoothManager: BluetoothManager? = null
    private var appContext: Context? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    private var incomingBuffer = ByteArray(0)
    private var lastBufferTime = 0L
    private var negotiatedMtu = 23

    // Serialized outgoing queue — matches iOS pattern with flow control
    private val outgoingQueue = mutableListOf<ByteArray>()
    private var currentChunks: List<ByteArray> = emptyList()
    private var currentChunkIndex = 0
    private var isSending = false

    // MARK: - Public API

    fun startAdvertising(
        context: Context,
        walletAddress: String,
        accountName: String,
        chainId: Int,
        allAccounts: List<Pair<String, String>> = emptyList(),
    ) {
        advWalletAddress = walletAddress
        advAccountName = accountName
        advChainId = chainId
        currentChainId = chainId
        advAllAccounts = allAccounts.map { mapOf("name" to it.first, "address" to it.second) }
        shouldAutoRestart = true

        val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager ?: return
        val adapter = btManager.adapter ?: return
        advertiser = adapter.bluetoothLeAdvertiser ?: return
        bluetoothManager = btManager
        appContext = context.applicationContext

        setupGattServer(context, btManager)
        startBleAdvertising()
    }

    fun stopAdvertising() {
        shouldAutoRestart = false
        try {
            advertiser?.stopAdvertising(advertiseCallback)
            gattServer?.close()
        } catch (_: SecurityException) {}
        isAdvertising = false
        isConnected = false
        subscribedDevice = null
        onRequest = null
        onSwitchAccount = null
        incomingBuffer = ByteArray(0)
        outgoingQueue.clear()
        currentChunks = emptyList()
        currentChunkIndex = 0
        isSending = false
        Log.d(TAG, "Stopped")
    }

    fun sendResponse(id: String, result: Any?, error: BLEError? = null) {
        if (subscribedDevice == null) {
            Log.d(TAG, "No subscribed central, dropping response $id")
            return
        }

        val json = JSONObject().apply {
            put("id", id)
            if (error != null) {
                put("error", JSONObject().put("code", error.code).put("message", error.message))
            } else {
                val jsonResult = when (result) {
                    is List<*> -> JSONArray(result)
                    is Map<*, *> -> JSONObject(result as Map<String, Any?>)
                    is JSONObject -> result
                    null -> JSONObject.NULL
                    else -> result
                }
                put("result", jsonResult)
            }
        }
        val data = json.toString().toByteArray() + "\n\n".toByteArray()
        Log.d(TAG, "Queuing response: id=$id, size=${data.size} bytes")
        outgoingQueue.add(data)
        if (!isSending) sendNextChunk()
    }

    fun updateWalletInfo(walletAddress: String, accountName: String, chainId: Int) {
        advWalletAddress = walletAddress
        advAccountName = accountName
        advChainId = chainId

        val info = JSONObject().apply {
            put("address", walletAddress)
            put("chainId", chainId)
            put("name", accountName)
            put("accounts", JSONArray(advAllAccounts.map { JSONObject(it) }))
        }
        walletInfoChar?.value = info.toString().toByteArray()

        // Push update
        sendResponse("wallet_info_update", info)
    }

    // MARK: - GATT Server Setup

    private fun setupGattServer(context: Context, bluetoothManager: BluetoothManager) {
        try {
            gattServer = bluetoothManager.openGattServer(context, gattCallback)
        } catch (_: SecurityException) { return }

        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)

        val requestCharacteristic = BluetoothGattCharacteristic(
            REQUEST_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE,
        )

        val responseCharacteristic = BluetoothGattCharacteristic(
            RESPONSE_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ,
        ).apply {
            addDescriptor(BluetoothGattDescriptor(
                UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"), // CCCD
                BluetoothGattDescriptor.PERMISSION_WRITE or BluetoothGattDescriptor.PERMISSION_READ,
            ))
        }
        responseChar = responseCharacteristic

        val walletInfo = JSONObject().apply {
            put("address", advWalletAddress)
            put("chainId", advChainId)
            put("name", advAccountName)
            put("accounts", JSONArray(advAllAccounts.map { JSONObject(it) }))
        }
        val walletInfoCharacteristic = BluetoothGattCharacteristic(
            WALLET_INFO_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_READ,
            BluetoothGattCharacteristic.PERMISSION_READ,
        ).apply {
            value = walletInfo.toString().toByteArray()
        }
        walletInfoChar = walletInfoCharacteristic

        service.addCharacteristic(requestCharacteristic)
        service.addCharacteristic(responseCharacteristic)
        service.addCharacteristic(walletInfoCharacteristic)

        try {
            gattServer?.addService(service)
        } catch (_: SecurityException) {}
    }

    private fun startBleAdvertising() {
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setConnectable(true)
            .setTimeout(0)
            .build()

        val data = AdvertiseData.Builder()
            .addServiceUuid(ParcelUuid(SERVICE_UUID))
            .setIncludeDeviceName(false)
            .build()

        try {
            advertiser?.startAdvertising(settings, data, advertiseCallback)
            isAdvertising = true
            Log.d(TAG, "Advertising: $advAccountName (${advWalletAddress.take(10)}...)")
        } catch (_: SecurityException) {
            isAdvertising = false
        }
    }

    // MARK: - Message Handling

    private fun handleIncomingData(data: ByteArray) {
        val now = System.currentTimeMillis()
        if (incomingBuffer.isNotEmpty() && now - lastBufferTime > 30_000) {
            Log.d(TAG, "Buffer timeout — clearing ${incomingBuffer.size} stale bytes")
            incomingBuffer = ByteArray(0)
        }
        lastBufferTime = now
        incomingBuffer += data

        try {
            val jsonStr = String(incomingBuffer)
            val request = parseRequest(jsonStr) ?: return
            incomingBuffer = ByteArray(0)

            Log.d(TAG, "Request: ${request.method} from ${request.origin}")

            // Handle account switch
            if (request.method == "wallet_switchAccount") {
                val address = request.params.firstOrNull() as? String
                if (address != null) {
                    onSwitchAccount?.invoke(address)
                    sendResponse(request.id, true)
                    return
                }
            }

            // Handle chain switch
            if (request.method == "wallet_switchEthereumChain") {
                val raw = request.params.firstOrNull()
                val chainIdHex: String? = when (raw) {
                    is JSONObject -> raw.optString("chainId", null)
                    is Map<*, *> -> (raw as? Map<String, Any>)?.get("chainId") as? String
                    else -> null
                }
                if (chainIdHex != null) {
                    currentChainId = chainIdHex.removePrefix("0x").toIntOrNull(16) ?: currentChainId
                    advChainId = currentChainId
                    sendResponse(request.id, null)
                    return
                }
            }

            onRequest?.invoke(request)
        } catch (_: Exception) {
            // Incomplete data, wait for more chunks
        }
    }

    private fun parseRequest(jsonStr: String): BLEIncomingRequest? {
        return try {
            val json = JSONObject(jsonStr)
            BLEIncomingRequest(
                id = json.getString("id"),
                method = json.getString("method"),
                params = parseJsonArray(json.optJSONArray("params")),
                origin = json.optString("origin", ""),
                favicon = json.optString("favicon", null),
            )
        } catch (_: Exception) { null }
    }

    private fun parseJsonArray(arr: JSONArray?): List<Any?> {
        if (arr == null) return emptyList()
        return (0 until arr.length()).map { arr.opt(it) }
    }

    // MARK: - Chunked Sending (matches iOS flow control pattern)
    //
    // iOS uses peripheralManager.updateValue() which returns false when the
    // transmit queue is full, then resumes via peripheralManagerIsReady callback.
    //
    // Android equivalent: send one chunk via notifyCharacteristicChanged(),
    // then WAIT for onNotificationSent() callback before sending the next chunk.

    private fun sendNextChunk() {
        val device = subscribedDevice ?: run { outgoingQueue.clear(); isSending = false; return }
        val char = responseChar ?: run { isSending = false; return }

        // Need to prepare chunks from next message?
        if (currentChunkIndex >= currentChunks.size) {
            if (outgoingQueue.isEmpty()) {
                isSending = false
                return
            }
            val fullData = outgoingQueue.removeFirst()
            val mtu = (negotiatedMtu - 3).coerceIn(20, 512)
            currentChunks = fullData.toList().chunked(mtu).map { it.toByteArray() }
            currentChunkIndex = 0
            isSending = true
            Log.d(TAG, "Sending message: ${fullData.size} bytes, ${currentChunks.size} chunks (mtu=$mtu)")
        }

        // Send one chunk, then wait for onNotificationSent
        if (currentChunkIndex < currentChunks.size) {
            val chunk = currentChunks[currentChunkIndex]
            char.value = chunk
            try {
                val sent = gattServer?.notifyCharacteristicChanged(device, char, false) ?: false
                if (sent) {
                    currentChunkIndex++
                    // onNotificationSent callback will call sendNextChunk() for the next chunk
                } else {
                    // BLE buffer full — retry after a short delay
                    Log.d(TAG, "BLE buffer full, retrying chunk $currentChunkIndex")
                    mainHandler.postDelayed({ sendNextChunk() }, 10)
                }
            } catch (e: Exception) {
                Log.e(TAG, "BLE notify failed: ${e.message}")
                outgoingQueue.clear()
                currentChunks = emptyList()
                currentChunkIndex = 0
                isSending = false
            }
        }
    }

    // MARK: - Callbacks

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings?) {
            Log.d(TAG, "Advertising started")
        }
        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "Advertising failed: $errorCode")
            isAdvertising = false
        }
    }

    private val gattCallback = object : BluetoothGattServerCallback() {
        override fun onMtuChanged(device: BluetoothDevice?, mtu: Int) {
            negotiatedMtu = mtu
            Log.d(TAG, "MTU negotiated: $mtu")
        }

        override fun onConnectionStateChange(device: BluetoothDevice?, status: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.d(TAG, "Central connected (waiting for subscription)")
                // Don't set isConnected here — wait for CCCD subscription (matches iOS)
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                subscribedDevice = null
                isConnected = false
                Log.d(TAG, "Central disconnected")

                // Auto re-advertise so central can reconnect (matches iOS)
                if (shouldAutoRestart) {
                    Log.d(TAG, "Auto re-advertising for reconnection...")
                    mainHandler.postDelayed({
                        if (shouldAutoRestart && !isConnected) {
                            val ctx = appContext ?: return@postDelayed
                            val btManager = bluetoothManager ?: return@postDelayed
                            setupGattServer(ctx, btManager)
                            startBleAdvertising()
                        }
                    }, 1000)
                }
            }
        }

        // Flow control: called when a notification chunk has been sent.
        // This is the Android equivalent of iOS peripheralManagerIsReady(toUpdateSubscribers:).
        override fun onNotificationSent(device: BluetoothDevice?, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                // Previous chunk sent — send next one
                sendNextChunk()
            } else {
                Log.e(TAG, "Notification failed with status $status")
                outgoingQueue.clear()
                currentChunks = emptyList()
                currentChunkIndex = 0
                isSending = false
            }
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice?, requestId: Int,
            characteristic: BluetoothGattCharacteristic?,
            preparedWrite: Boolean, responseNeeded: Boolean,
            offset: Int, value: ByteArray?
        ) {
            if (characteristic?.uuid == REQUEST_CHAR_UUID && value != null) {
                if (responseNeeded) {
                    try { gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null) }
                    catch (_: SecurityException) {}
                }
                handleIncomingData(value)
            }
        }

        override fun onCharacteristicReadRequest(
            device: BluetoothDevice?, requestId: Int,
            offset: Int, characteristic: BluetoothGattCharacteristic?
        ) {
            if (characteristic?.uuid == WALLET_INFO_CHAR_UUID) {
                try {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, walletInfoChar?.value)
                } catch (_: SecurityException) {}
            }
        }

        override fun onDescriptorWriteRequest(
            device: BluetoothDevice?, requestId: Int,
            descriptor: BluetoothGattDescriptor?,
            preparedWrite: Boolean, responseNeeded: Boolean,
            offset: Int, value: ByteArray?
        ) {
            if (responseNeeded) {
                try { gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null) }
                catch (_: SecurityException) {}
            }
            // CCCD write = subscription — NOW we're connected (matches iOS subscribedCentral)
            if (descriptor?.characteristic?.uuid == RESPONSE_CHAR_UUID) {
                subscribedDevice = device
                isConnected = true
                Log.d(TAG, "Central subscribed to response — connected")
            }
        }
    }
}

// MARK: - BLE Message Types

data class BLEIncomingRequest(
    val id: String,
    val method: String,
    val params: List<Any?>,
    val origin: String,
    val favicon: String?,
)

data class BLEError(val code: Int, val message: String)
