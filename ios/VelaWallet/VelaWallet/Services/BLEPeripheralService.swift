import CoreBluetooth
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
    @Published var connectedCentral: CBCentral? = nil
    @Published var lastRequest: BLEIncomingRequest? = nil

    private var peripheralManager: CBPeripheralManager!
    private var requestChar: CBMutableCharacteristic!
    private var responseChar: CBMutableCharacteristic!
    private var walletInfoChar: CBMutableCharacteristic!
    private var service: CBMutableService!

    /// Callback when a dApp request arrives. The handler must call `sendResponse` when done.
    var onRequest: ((BLEIncomingRequest) -> Void)?

    private override init() {
        super.init()
        peripheralManager = CBPeripheralManager(delegate: self, queue: .main)
    }

    // MARK: - Public API

    /// Start advertising as Vela Wallet peripheral.
    func startAdvertising(walletAddress: String, accountName: String, chainId: Int) {
        guard peripheralManager.state == .poweredOn else {
            print("[BLE] Bluetooth not ready, state: \(peripheralManager.state.rawValue)")
            return
        }

        // Build service
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
            "address": walletAddress,
            "chainId": chainId,
            "name": accountName,
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
        print("[BLE] Advertising started")
    }

    /// Stop advertising.
    func stopAdvertising() {
        peripheralManager.stopAdvertising()
        peripheralManager.removeAllServices()
        isAdvertising = false
        connectedCentral = nil
        print("[BLE] Advertising stopped")
    }

    /// Send response back to the connected central (Chrome extension).
    func sendResponse(_ response: BLEOutgoingResponse) {
        guard let central = connectedCentral else {
            print("[BLE] No central connected, cannot send response")
            return
        }

        guard let data = try? JSONEncoder().encode(response) else {
            print("[BLE] Failed to encode response")
            return
        }

        // Chunk if needed (BLE MTU limit)
        let mtu = central.maximumUpdateValueLength
        let chunks = stride(from: 0, to: data.count, by: mtu).map {
            data[$0..<min($0 + mtu, data.count)]
        }

        for chunk in chunks {
            peripheralManager.updateValue(Data(chunk), for: responseChar, onSubscribedCentrals: [central])
        }

        print("[BLE] Response sent: \(response.id)")
    }
}

// MARK: - CBPeripheralManagerDelegate

extension BLEPeripheralService: CBPeripheralManagerDelegate {

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        print("[BLE] State: \(peripheral.state.rawValue)")
        if peripheral.state != .poweredOn {
            isAdvertising = false
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error {
            print("[BLE] Failed to add service: \(error)")
        } else {
            print("[BLE] Service added")
        }
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error {
            print("[BLE] Advertising failed: \(error)")
            isAdvertising = false
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didSubscribeTo characteristic: CBCharacteristic) {
        print("[BLE] Central subscribed: \(characteristic.uuid)")
        connectedCentral = central
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, central: CBCentral, didUnsubscribeFrom characteristic: CBCharacteristic) {
        print("[BLE] Central unsubscribed")
        if characteristic.uuid == Self.responseCharUUID {
            connectedCentral = nil
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            if request.characteristic.uuid == Self.requestCharUUID,
               let data = request.value {
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

    // MARK: - Private

    private var incomingBuffer = Data()

    private func handleIncomingData(_ data: Data) {
        // Try to parse directly; if fails, buffer for chunked messages
        incomingBuffer.append(data)

        if let request = try? JSONDecoder().decode(BLEIncomingRequest.self, from: incomingBuffer) {
            incomingBuffer = Data()
            print("[BLE] Request received: \(request.method) from \(request.origin)")
            lastRequest = request
            onRequest?(request)
        }
        // If parse fails, wait for more chunks
    }
}

// MARK: - BLE Message Types (must match protocol.ts)

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

/// Type-erased Codable wrapper for heterogeneous JSON
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
