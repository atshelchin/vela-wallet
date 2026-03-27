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
        advAllAccounts = allAccounts.map { ["name": $0.name, "address": $0.address] }
        shouldAutoRestart = true

        guard peripheralManager.state == .poweredOn else {
            print("[BLE] Bluetooth not ready, will start when powered on")
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
        print("[BLE] Stopped")
    }

    /// Send response back to the connected central (Chrome extension).
    func sendResponse(_ response: BLEOutgoingResponse) {
        guard let central = subscribedCentral else {
            print("[BLE] No central connected")
            return
        }

        guard let data = try? JSONEncoder().encode(response) else { return }

        let mtu = central.maximumUpdateValueLength
        let chunks = stride(from: 0, to: data.count, by: mtu).map {
            data[$0..<min($0 + mtu, data.count)]
        }

        for chunk in chunks {
            peripheralManager.updateValue(Data(chunk), for: responseChar, onSubscribedCentrals: [central])
        }
        print("[BLE] Response sent: \(response.id)")
    }

    // MARK: - Private

    private func setupAndAdvertise() {
        // Don't re-advertise if already advertising
        if isAdvertising {
            print("[BLE] Already advertising, skipping")
            return
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
        print("[BLE] Advertising: \(advAccountName) (\(advWalletAddress.prefix(10))...)")
    }

    private func handleIncomingData(_ data: Data) {
        incomingBuffer.append(data)

        if let request = try? JSONDecoder().decode(BLEIncomingRequest.self, from: incomingBuffer) {
            incomingBuffer = Data()
            print("[BLE] Request: \(request.method) from \(request.origin)")

            // Handle account switch internally
            if request.method == "wallet_switchAccount",
               let address = request.params.first?.value as? String {
                print("[BLE] Switch account to: \(address)")
                onSwitchAccount?(address)
                // Respond immediately
                sendResponse(BLEOutgoingResponse(
                    id: request.id,
                    result: AnyCodable(true),
                    error: nil
                ))
                return
            }

            lastRequest = request
            onRequest?(request)
        }
    }
}

// MARK: - CBPeripheralManagerDelegate

extension BLEPeripheralService: CBPeripheralManagerDelegate {

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        print("[BLE] State: \(peripheral.state.rawValue)")
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
            print("[BLE] Advertising error: \(error)")
            isAdvertising = false
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        print("[BLE] Central subscribed to \(characteristic.uuid)")
        if characteristic.uuid == Self.responseCharUUID {
            subscribedCentral = central
            isConnected = true
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        print("[BLE] Central unsubscribed from \(characteristic.uuid)")
        if characteristic.uuid == Self.responseCharUUID {
            subscribedCentral = nil
            isConnected = false

            // Auto re-advertise so central can reconnect
            if shouldAutoRestart {
                print("[BLE] Auto re-advertising for reconnection...")
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
