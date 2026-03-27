import CoreBluetooth
import Combine
import UIKit

/// BLE Peripheral — iOS app advertises as a Vela Wallet peripheral.
/// Chrome extension (Central) connects and sends dApp requests.
/// Phone signs with Passkey and returns responses.
final class BLEPeripheralService: NSObject, ObservableObject {
    static let shared = BLEPeripheralService()

    // Must match Chrome extension protocol.ts
    static let serviceUUID        = CBUUID(string: "0000BE1A-0000-1000-8000-00805F9B34FB")
    static let requestCharUUID    = CBUUID(string: "0001BE1A-0000-1000-8000-00805F9B34FB")
    static let responseCharUUID   = CBUUID(string: "0002BE1A-0000-1000-8000-00805F9B34FB")
    static let walletInfoCharUUID = CBUUID(string: "0003BE1A-0000-1000-8000-00805F9B34FB")

    @Published var isAdvertising = false
    @Published var isConnected = false
    @Published var lastRequest: BLEIncomingRequest? = nil

    private var peripheralManager: CBPeripheralManager!
    private var requestChar: CBMutableCharacteristic!
    private var responseChar: CBMutableCharacteristic!
    private var walletInfoChar: CBMutableCharacteristic!
    private var service: CBMutableService!
    private var subscribedCentral: CBCentral?

    // Advertising config — kept for auto-restart
    private var advWalletAddress = ""
    private var advAccountName = ""
    private var advChainId = 1
    private var advAllAccounts: [[String: String]] = []
    private var shouldAutoRestart = false

    /// Called when phone switches account (from Chrome extension request)
    var onSwitchAccount: ((String) -> Void)?

    /// Current chain ID from advertising config
    @Published var currentChainId: Int = 1

    /// Callback when a dApp request arrives.
    var onRequest: ((BLEIncomingRequest) -> Void)?

    private var incomingBuffer = Data()

    private override init() {
        super.init()
        peripheralManager = CBPeripheralManager(delegate: self, queue: .main)
    }

    // MARK: - Public API

    /// Start advertising as Vela Wallet peripheral.
    func startAdvertising(walletAddress: String, accountName: String, chainId: Int, allAccounts: [(name: String, address: String)] = []) {
        advWalletAddress = walletAddress
        advAccountName = accountName
        advChainId = chainId
        currentChainId = chainId
        advAllAccounts = allAccounts.map { ["name": $0.name, "address": $0.address] }
        shouldAutoRestart = true

        guard peripheralManager.state == .poweredOn else {
            debugLog("[BLE] Bluetooth not ready, will start when powered on")
            return
        }

        setupAndAdvertise()
    }

    /// Update wallet info (e.g. when account switches). Updates characteristic value.
    func updateWalletInfo(walletAddress: String, accountName: String, chainId: Int, allAccounts: [(name: String, address: String)]? = nil) {
        advWalletAddress = walletAddress
        advAccountName = accountName
        advChainId = chainId
        if let allAccounts { advAllAccounts = allAccounts.map { ["name": $0.name, "address": $0.address] } }

        let info: [String: Any] = [
            "address": walletAddress,
            "chainId": chainId,
            "name": accountName,
            "accounts": advAllAccounts
        ]
        if let data = try? JSONSerialization.data(withJSONObject: info) {
            walletInfoChar?.value = data

            // Push update via sendResponse (uses chunked protocol with \n\n marker)
            let infoResult: [String: Any] = [
                "address": walletAddress, "chainId": chainId, "name": accountName,
                "accounts": advAllAccounts
            ]
            sendResponse(BLEOutgoingResponse(
                id: "wallet_info_update",
                result: AnyCodable(infoResult),
                error: nil
            ))
        }
    }

    /// Stop advertising.
    func stopAdvertising() {
        shouldAutoRestart = false
        peripheralManager.stopAdvertising()
        peripheralManager.removeAllServices()
        isAdvertising = false
        isConnected = false
        subscribedCentral = nil
        debugLog("[BLE] Stopped")
    }

    /// Send response back to the connected central (Chrome extension).
    /// Uses chunked transfer with \n\n end marker. Serialized via outgoing queue.
    func sendResponse(_ response: BLEOutgoingResponse) {
        guard subscribedCentral != nil else {
            debugLog("[BLE] No central connected")
            return
        }

        guard let data = try? JSONEncoder().encode(response) else {
            debugLog("[BLE] Response encode failed for \(response.id)")
            return
        }

        let fullData = data + Data("\n\n".utf8)
        debugLog("[BLE] Queuing: id=\(response.id), size=\(data.count) bytes")

        // Queue the message and start sending if not already in progress
        outgoingQueue.append(fullData)
        if !isSending {
            sendNextMessage()
        }
    }

    /// Serialized outgoing message queue — prevents chunk interleaving
    private var outgoingQueue: [Data] = []
    private var currentChunks: [Data] = []
    private var currentChunkIndex = 0
    private var isSending = false

    private func sendNextMessage() {
        guard let central = subscribedCentral else {
            outgoingQueue.removeAll()
            isSending = false
            return
        }

        if currentChunkIndex >= currentChunks.count {
            // Current message done — dequeue next
            if outgoingQueue.isEmpty {
                isSending = false
                return
            }

            let fullData = outgoingQueue.removeFirst()
            let mtu = central.maximumUpdateValueLength
            currentChunks = stride(from: 0, to: fullData.count, by: mtu).map {
                Data(fullData[$0..<min($0 + mtu, fullData.count)])
            }
            currentChunkIndex = 0
            isSending = true
        }

        // Send chunks until queue full
        while currentChunkIndex < currentChunks.count {
            let chunk = currentChunks[currentChunkIndex]
            let sent = peripheralManager.updateValue(chunk, for: responseChar, onSubscribedCentrals: [central])
            if sent {
                currentChunkIndex += 1
            } else {
                return // peripheralManagerIsReady will resume
            }
        }

        // All chunks of current message sent — continue with next
        sendNextMessage()
    }

    // MARK: - Private

    private func setupAndAdvertise() {
        // Stop existing advertising first
        if isAdvertising {
            peripheralManager.stopAdvertising()
            peripheralManager.removeAllServices()
            isAdvertising = false
        }

        // Remove previous service if exists
        peripheralManager.removeAllServices()

        requestChar = CBMutableCharacteristic(
            type: Self.requestCharUUID,
            properties: [.write, .writeWithoutResponse],
            value: nil,
            permissions: [.writeable]
        )

        responseChar = CBMutableCharacteristic(
            type: Self.responseCharUUID,
            properties: [.notify],
            value: nil,
            permissions: [.readable]
        )

        let walletInfo: [String: Any] = [
            "address": advWalletAddress,
            "chainId": advChainId,
            "name": advAccountName,
            "accounts": advAllAccounts,
        ]
        let infoData = try? JSONSerialization.data(withJSONObject: walletInfo)

        walletInfoChar = CBMutableCharacteristic(
            type: Self.walletInfoCharUUID,
            properties: [.read],
            value: infoData,
            permissions: [.readable]
        )

        service = CBMutableService(type: Self.serviceUUID, primary: true)
        service.characteristics = [requestChar, responseChar, walletInfoChar]
        peripheralManager.add(service)

        peripheralManager.startAdvertising([
            CBAdvertisementDataServiceUUIDsKey: [Self.serviceUUID],
            CBAdvertisementDataLocalNameKey: "Vela Wallet",
        ])

        isAdvertising = true
        debugLog("[BLE] Advertising: \(advAccountName) (\(advWalletAddress.prefix(10))...)")
    }

    private var bufferTimer: Timer?

    private func handleIncomingData(_ data: Data) {
        incomingBuffer.append(data)

        // Reset buffer timeout — clear stale data after 30s
        bufferTimer?.invalidate()
        bufferTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: false) { [weak self] _ in
            if let self, !self.incomingBuffer.isEmpty {
                debugLog("[BLE] Buffer timeout — clearing \(self.incomingBuffer.count) stale bytes")
                self.incomingBuffer = Data()
            }
        }

        // Try to parse complete JSON (handles single-chunk messages)
        if let request = try? JSONDecoder().decode(BLEIncomingRequest.self, from: incomingBuffer) {
            incomingBuffer = Data()
            bufferTimer?.invalidate()
            debugLog("[BLE] Request: \(request.method) from \(request.origin)")

            // Handle account switch internally
            if request.method == "wallet_switchAccount",
               let address = request.params.first?.value as? String {
                debugLog("[BLE] Switch account to: \(address)")
                onSwitchAccount?(address)
                // Respond immediately
                sendResponse(BLEOutgoingResponse(
                    id: request.id,
                    result: AnyCodable(true),
                    error: nil
                ))
                return
            }

            // Handle chain switch internally
            if request.method == "wallet_switchEthereumChain",
               let params = request.params.first?.value as? [String: Any],
               let chainIdHex = params["chainId"] as? String {
                let stripped = chainIdHex.hasPrefix("0x") ? String(chainIdHex.dropFirst(2)) : chainIdHex
                let newChainId = Int(stripped, radix: 16) ?? currentChainId
                debugLog("[BLE] Switch chain to: \(newChainId)")
                currentChainId = newChainId
                advChainId = newChainId
                sendResponse(BLEOutgoingResponse(id: request.id, result: AnyCodable(NSNull()), error: nil))
                return
            }

            lastRequest = request
            onRequest?(request)
        }
    }
}

// MARK: - CBPeripheralManagerDelegate

extension BLEPeripheralService: CBPeripheralManagerDelegate {

    func peripheralManagerIsReady(toUpdateSubscribers peripheral: CBPeripheralManager) {
        sendNextMessage()
    }

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        debugLog("[BLE] State: \(peripheral.state.rawValue)")
        if peripheral.state == .poweredOn && shouldAutoRestart && !isAdvertising {
            setupAndAdvertise()
        }
        if peripheral.state != .poweredOn {
            isAdvertising = false
            isConnected = false
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error { print("[BLE] Service error: \(error)") }
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error {
            debugLog("[BLE] Advertising error: \(error)")
            isAdvertising = false
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        debugLog("[BLE] Central subscribed to \(characteristic.uuid)")
        if characteristic.uuid == Self.responseCharUUID {
            subscribedCentral = central
            isConnected = true
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        debugLog("[BLE] Central unsubscribed from \(characteristic.uuid)")
        if characteristic.uuid == Self.responseCharUUID {
            subscribedCentral = nil
            isConnected = false

            // Auto re-advertise so central can reconnect
            if shouldAutoRestart {
                debugLog("[BLE] Auto re-advertising for reconnection...")
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                    guard let self, self.shouldAutoRestart, !self.isConnected else { return }
                    self.setupAndAdvertise()
                }
            }
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            if request.characteristic.uuid == Self.requestCharUUID, let data = request.value {
                peripheral.respond(to: request, withResult: .success)
                handleIncomingData(data)
            } else {
                peripheral.respond(to: request, withResult: .requestNotSupported)
            }
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        if request.characteristic.uuid == Self.walletInfoCharUUID {
            request.value = walletInfoChar.value
            peripheral.respond(to: request, withResult: .success)
        } else {
            peripheral.respond(to: request, withResult: .requestNotSupported)
        }
    }
}

// MARK: - BLE Message Types

struct BLEIncomingRequest: Codable, Identifiable {
    let id: String
    let method: String
    let params: [AnyCodable]
    let origin: String
    let favicon: String?
}

struct BLEOutgoingResponse: Codable {
    let id: String
    let result: AnyCodable?
    let error: BLEError?
}

struct BLEError: Codable {
    let code: Int
    let message: String
}

struct AnyCodable: Codable {
    let value: Any

    init(_ value: Any) { self.value = value }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let s = try? container.decode(String.self) { value = s }
        else if let i = try? container.decode(Int.self) { value = i }
        else if let d = try? container.decode(Double.self) { value = d }
        else if let b = try? container.decode(Bool.self) { value = b }
        else if let a = try? container.decode([AnyCodable].self) { value = a.map(\.value) }
        else if let o = try? container.decode([String: AnyCodable].self) { value = o.mapValues(\.value) }
        else if container.decodeNil() { value = NSNull() }
        else { throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported type") }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case let s as String: try container.encode(s)
        case let i as Int: try container.encode(i)
        case let d as Double: try container.encode(d)
        case let b as Bool: try container.encode(b)
        case let a as [Any]: try container.encode(a.map { AnyCodable($0) })
        case let o as [String: Any]: try container.encode(o.mapValues { AnyCodable($0) })
        case is NSNull: try container.encodeNil()
        default: try container.encodeNil()
        }
    }
}
