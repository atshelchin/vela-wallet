package app.getvela.wallet.service

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
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
    private var connectedDevice: BluetoothDevice? = null
    private var responseChar: BluetoothGattCharacteristic? = null
    private var walletInfoChar: BluetoothGattCharacteristic? = null

    private var advWalletAddress = ""
    private var advAccountName = ""
    private var advChainId = 1
    private var advAllAccounts: List<Map<String, String>> = emptyList()

    private var incomingBuffer = ByteArray(0)
    private var lastBufferTime = 0L // timestamp of last buffer append
    private val outgoingQueue = mutableListOf<ByteArray>()
    private var isSending = false
    private var negotiatedMtu = 23 // BLE default, updated via MTU callback

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

        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager ?: return
        val adapter = bluetoothManager.adapter ?: return
        advertiser = adapter.bluetoothLeAdvertiser ?: return

        setupGattServer(context, bluetoothManager)
        startBleAdvertising()
    }

    fun stopAdvertising() {
        try {
            advertiser?.stopAdvertising(advertiseCallback)
            gattServer?.close()
        } catch (_: SecurityException) {}
        isAdvertising = false
        isConnected = false
        connectedDevice = null
        Log.d(TAG, "Stopped")
    }

    fun sendResponse(id: String, result: Any?, error: BLEError? = null) {
        val json = JSONObject().apply {
            put("id", id)
            if (error != null) {
                put("error", JSONObject().put("code", error.code).put("message", error.message))
            } else {
                // Convert Kotlin collections to JSON types
                val jsonResult = when (result) {
                    is List<*> -> JSONArray(result)
                    is Map<*, *> -> JSONObject(result as Map<String, Any?>)
                    null -> JSONObject.NULL
                    else -> result
                }
                put("result", jsonResult)
            }
        }
        val data = json.toString().toByteArray() + "\n\n".toByteArray()
        outgoingQueue.add(data)
        if (!isSending) sendNextMessage()
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
        // Clear stale buffer (30s timeout, matches iOS)
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
                @Suppress("UNCHECKED_CAST")
                val params = request.params.firstOrNull() as? Map<String, Any>
                val chainIdHex = params?.get("chainId") as? String
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

    private fun sendNextMessage() {
        val device = connectedDevice ?: run { outgoingQueue.clear(); isSending = false; return }
        val char = responseChar ?: run { isSending = false; return }

        if (outgoingQueue.isEmpty()) { isSending = false; return }
        isSending = true

        val fullData = outgoingQueue.removeFirst()
        // Use negotiated MTU minus 3 bytes ATT header, or conservative default
        val mtu = (negotiatedMtu - 3).coerceIn(20, 512)
        val chunks = fullData.toList().chunked(mtu).map { it.toByteArray() }

        for (chunk in chunks) {
            char.value = chunk
            try {
                gattServer?.notifyCharacteristicChanged(device, char, false)
            } catch (_: SecurityException) {}
        }

        // Continue with next message
        sendNextMessage()
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
                connectedDevice = device
                isConnected = true
                Log.d(TAG, "Central connected")
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                connectedDevice = null
                isConnected = false
                Log.d(TAG, "Central disconnected")
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
            // CCCD write = subscription
            if (descriptor?.characteristic?.uuid == RESPONSE_CHAR_UUID) {
                connectedDevice = device
                isConnected = true
                Log.d(TAG, "Central subscribed to response")
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
