import Testing
import Foundation
@testable import VelaWallet

// MARK: - BLE UUID Tests

struct BLEUUIDTests {

    @Test func serviceUUIDFormat() {
        let uuid = BLEPeripheralService.serviceUUID.uuidString
        #expect(uuid.count == 36) // "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
        #expect(uuid.contains("BE1A"))
    }

    @Test func allUUIDsAreUnique() {
        let uuids = [
            BLEPeripheralService.serviceUUID,
            BLEPeripheralService.requestCharUUID,
            BLEPeripheralService.responseCharUUID,
            BLEPeripheralService.walletInfoCharUUID,
        ]
        let strings = uuids.map(\.uuidString)
        #expect(Set(strings).count == 4)
    }

    @Test func requestUUIDContainsBE1A() {
        #expect(BLEPeripheralService.requestCharUUID.uuidString.contains("BE1A"))
    }

    @Test func responseUUIDContainsBE1A() {
        #expect(BLEPeripheralService.responseCharUUID.uuidString.contains("BE1A"))
    }

    @Test func walletInfoUUIDContainsBE1A() {
        #expect(BLEPeripheralService.walletInfoCharUUID.uuidString.contains("BE1A"))
    }
}

// MARK: - BLE Message Types Tests

struct BLEIncomingRequestTests {

    @Test func decodableFromJSON() throws {
        let json = """
        {
            "id": "req-1",
            "method": "eth_sendTransaction",
            "params": [{"to": "0x123", "value": "0x1"}],
            "origin": "https://app.uniswap.org",
            "favicon": "https://app.uniswap.org/favicon.ico"
        }
        """
        let data = Data(json.utf8)
        let request = try JSONDecoder().decode(BLEIncomingRequest.self, from: data)
        #expect(request.id == "req-1")
        #expect(request.method == "eth_sendTransaction")
        #expect(request.origin == "https://app.uniswap.org")
        #expect(request.favicon == "https://app.uniswap.org/favicon.ico")
    }

    @Test func decodableWithoutFavicon() throws {
        let json = """
        {
            "id": "req-2",
            "method": "personal_sign",
            "params": ["0xdeadbeef", "0x123"],
            "origin": "https://opensea.io"
        }
        """
        let data = Data(json.utf8)
        let request = try JSONDecoder().decode(BLEIncomingRequest.self, from: data)
        #expect(request.id == "req-2")
        #expect(request.method == "personal_sign")
        #expect(request.favicon == nil)
    }

    @Test func decodableWithEmptyParams() throws {
        let json = """
        {
            "id": "req-3",
            "method": "eth_accounts",
            "params": [],
            "origin": "https://example.com"
        }
        """
        let data = Data(json.utf8)
        let request = try JSONDecoder().decode(BLEIncomingRequest.self, from: data)
        #expect(request.params.isEmpty)
    }

    @Test func identifiable() throws {
        let json = """
        {"id":"abc","method":"eth_chainId","params":[],"origin":"https://test.com"}
        """
        let request = try JSONDecoder().decode(BLEIncomingRequest.self, from: Data(json.utf8))
        #expect(request.id == "abc")
    }
}

struct BLEOutgoingResponseTests {

    @Test func encodableWithResult() throws {
        let response = BLEOutgoingResponse(
            id: "resp-1",
            result: AnyCodable("0xabc123"),
            error: nil
        )
        let data = try JSONEncoder().encode(response)
        let json = String(data: data, encoding: .utf8)!
        #expect(json.contains("resp-1"))
        #expect(json.contains("0xabc123"))
    }

    @Test func encodableWithError() throws {
        let response = BLEOutgoingResponse(
            id: "resp-2",
            result: nil,
            error: BLEError(code: 4001, message: "User rejected")
        )
        let data = try JSONEncoder().encode(response)
        let json = String(data: data, encoding: .utf8)!
        #expect(json.contains("4001"))
        #expect(json.contains("User rejected"))
    }

    @Test func roundtrip() throws {
        let original = BLEOutgoingResponse(
            id: "rt-1",
            result: AnyCodable(["0xaddr1", "0xaddr2"]),
            error: nil
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(BLEOutgoingResponse.self, from: data)
        #expect(decoded.id == "rt-1")
        #expect(decoded.error == nil)
    }
}

// MARK: - AnyCodable Tests

struct AnyCodableTests {

    @Test func encodeString() throws {
        let value = AnyCodable("hello")
        let data = try JSONEncoder().encode(value)
        let str = String(data: data, encoding: .utf8)!
        #expect(str.contains("hello"))
    }

    @Test func encodeInt() throws {
        let value = AnyCodable(42)
        let data = try JSONEncoder().encode(value)
        let str = String(data: data, encoding: .utf8)!
        #expect(str.contains("42"))
    }

    @Test func encodeBool() throws {
        let value = AnyCodable(true)
        let data = try JSONEncoder().encode(value)
        let str = String(data: data, encoding: .utf8)!
        #expect(str.contains("true"))
    }

    @Test func encodeArray() throws {
        let value = AnyCodable(["a", "b", "c"])
        let data = try JSONEncoder().encode(value)
        let str = String(data: data, encoding: .utf8)!
        #expect(str.contains("a"))
        #expect(str.contains("b"))
    }

    @Test func encodeDict() throws {
        let value = AnyCodable(["key": "value"])
        let data = try JSONEncoder().encode(value)
        let str = String(data: data, encoding: .utf8)!
        #expect(str.contains("key"))
        #expect(str.contains("value"))
    }

    @Test func encodeNull() throws {
        let value = AnyCodable(NSNull())
        let data = try JSONEncoder().encode(value)
        let str = String(data: data, encoding: .utf8)!
        #expect(str.contains("null"))
    }

    @Test func decodeString() throws {
        let data = Data("\"hello\"".utf8)
        let value = try JSONDecoder().decode(AnyCodable.self, from: data)
        #expect(value.value as? String == "hello")
    }

    @Test func decodeInt() throws {
        let data = Data("42".utf8)
        let value = try JSONDecoder().decode(AnyCodable.self, from: data)
        #expect(value.value as? Int == 42)
    }

    @Test func decodeBool() throws {
        let data = Data("true".utf8)
        let value = try JSONDecoder().decode(AnyCodable.self, from: data)
        #expect(value.value as? Bool == true)
    }

    @Test func decodeNull() throws {
        let data = Data("null".utf8)
        let value = try JSONDecoder().decode(AnyCodable.self, from: data)
        #expect(value.value is NSNull)
    }

    @Test func decodeNestedObject() throws {
        let json = """
        {"to": "0x123", "value": "0x1", "data": "0x"}
        """
        let value = try JSONDecoder().decode(AnyCodable.self, from: Data(json.utf8))
        let dict = value.value as? [String: Any]
        #expect(dict?["to"] as? String == "0x123")
    }

    @Test func roundtripComplexStructure() throws {
        let json = """
        {
            "method": "eth_sendTransaction",
            "params": [{"to": "0x123", "value": "0x1"}],
            "count": 42,
            "active": true,
            "label": null
        }
        """
        let decoded = try JSONDecoder().decode([String: AnyCodable].self, from: Data(json.utf8))
        let reencoded = try JSONEncoder().encode(decoded)
        let redecoded = try JSONDecoder().decode([String: AnyCodable].self, from: reencoded)
        #expect(redecoded["method"]?.value as? String == "eth_sendTransaction")
        #expect(redecoded["count"]?.value as? Int == 42)
        #expect(redecoded["active"]?.value as? Bool == true)
    }
}

// MARK: - BLEError Tests

struct BLEErrorTests {

    @Test func encodable() throws {
        let error = BLEError(code: -32603, message: "Internal error")
        let data = try JSONEncoder().encode(error)
        let json = String(data: data, encoding: .utf8)!
        #expect(json.contains("-32603"))
        #expect(json.contains("Internal error"))
    }

    @Test func decodable() throws {
        let json = """
        {"code": 4001, "message": "User rejected the request"}
        """
        let error = try JSONDecoder().decode(BLEError.self, from: Data(json.utf8))
        #expect(error.code == 4001)
        #expect(error.message == "User rejected the request")
    }

    @Test func commonErrorCodes() {
        // Standard EIP-1193 error codes
        let userRejected = BLEError(code: 4001, message: "User rejected")
        #expect(userRejected.code == 4001)

        let unauthorized = BLEError(code: 4100, message: "Unauthorized")
        #expect(unauthorized.code == 4100)

        let disconnected = BLEError(code: 4900, message: "Disconnected")
        #expect(disconnected.code == 4900)

        let internalError = BLEError(code: -32603, message: "Internal")
        #expect(internalError.code == -32603)
    }
}

// MARK: - BLEPeripheralService Tests

struct BLEPeripheralServiceTests {

    @Test func singletonExists() {
        let service = BLEPeripheralService.shared
        #expect(type(of: service) == BLEPeripheralService.self)
    }

    @Test func initialState() {
        let service = BLEPeripheralService.shared
        #expect(service.isAdvertising == false)
        #expect(service.connectedCentral == nil)
    }
}
