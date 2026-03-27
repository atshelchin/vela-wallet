import Foundation

/// Client for the WebAuthn P256 Public Key Index API.
/// Stores and retrieves P256 public keys associated with passkey credentials.
final class PublicKeyIndexService {
    static let baseURL = "https://webauthnp256-publickey-index.biubiu.tools"

    // MARK: - Get Challenge

    /// Fetches a one-time challenge for signature verification (5-minute validity).
    func getChallenge() async throws -> String {
        let url = URL(string: "\(Self.baseURL)/api/challenge")!
        let (data, response) = try await URLSession.shared.data(from: url)
        try validateResponse(response, data: data)

        let json = try JSONDecoder().decode(ChallengeResponse.self, from: data)
        return json.challenge
    }

    // MARK: - Create (Store Public Key)

    /// Registers a new public key record after passkey creation.
    func create(request: CreateRequest) async throws -> PublicKeyRecord {
        let url = URL(string: "\(Self.baseURL)/api/create")!
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body = try JSONEncoder().encode(request)
        urlRequest.httpBody = body

        // Log request for debugging
        debugLog("[PublicKeyIndex] POST /api/create")
        debugLog("[PublicKeyIndex] rpId: \(request.rpId)")
        debugLog("[PublicKeyIndex] credentialId: \(request.credentialId.prefix(20))...")
        debugLog("[PublicKeyIndex] publicKey length: \(request.publicKey.count) chars")
        debugLog("[PublicKeyIndex] signature length: \(request.signature.count) chars")
        debugLog("[PublicKeyIndex] authenticatorData length: \(request.authenticatorData.count) chars")
        debugLog("[PublicKeyIndex] clientDataJSON length: \(request.clientDataJSON.count) chars")

        let (data, response) = try await URLSession.shared.data(for: urlRequest)
        try validateResponse(response, data: data, expected: 201)

        return try JSONDecoder().decode(PublicKeyRecord.self, from: data)
    }

    // MARK: - Query (Get Public Key)

    /// Retrieves a public key by rpId and credentialId.
    func query(rpId: String, credentialId: String) async throws -> PublicKeyRecord {
        var components = URLComponents(string: "\(Self.baseURL)/api/query")!
        components.queryItems = [
            URLQueryItem(name: "rpId", value: rpId),
            URLQueryItem(name: "credentialId", value: credentialId),
        ]

        let (data, response) = try await URLSession.shared.data(from: components.url!)
        try validateResponse(response, data: data)

        return try JSONDecoder().decode(PublicKeyRecord.self, from: data)
    }

    // MARK: - Private

    private func validateResponse(_ response: URLResponse, data: Data? = nil, expected: Int = 200) throws {
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard http.statusCode == expected else {
            // Extract server error message
            var serverMessage = ""
            if let data, let body = try? JSONDecoder().decode(ErrorResponse.self, from: data) {
                serverMessage = body.error
            } else if let data {
                serverMessage = String(data: data, encoding: .utf8) ?? ""
            }
            debugLog("[PublicKeyIndex] HTTP \(http.statusCode): \(serverMessage)")
            throw APIError.httpError(http.statusCode, serverMessage)
        }
    }

    struct ErrorResponse: Decodable {
        let error: String
    }

    // MARK: - Types

    struct ChallengeResponse: Decodable {
        let challenge: String
    }

    struct CreateRequest: Encodable {
        let rpId: String
        let credentialId: String
        let publicKey: String          // "04" + x + y hex
        let challenge: String
        let signature: String          // hex encoded r||s
        let authenticatorData: String  // base64url
        let clientDataJSON: String     // base64url
        let name: String
    }

    struct PublicKeyRecord: Decodable {
        let rpId: String
        let credentialId: String
        let publicKey: String
        let name: String
        let createdAt: Int64
    }

    enum APIError: Error, LocalizedError {
        case invalidResponse
        case httpError(Int, String)

        var errorDescription: String? {
            switch self {
            case .invalidResponse: "Invalid server response."
            case .httpError(let code, let message):
                message.isEmpty ? "Server error: \(code)" : "[\(code)] \(message)"
            }
        }
    }
}

// MARK: - Data Encoding Helpers

extension Data {
    /// Initialize from a hex string.
    init?(hexString: String) {
        let hex = hexString.hasPrefix("0x") ? String(hexString.dropFirst(2)) : hexString
        guard hex.count % 2 == 0 else { return nil }
        var data = Data(capacity: hex.count / 2)
        var index = hex.startIndex
        while index < hex.endIndex {
            let nextIndex = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<nextIndex], radix: 16) else { return nil }
            data.append(byte)
            index = nextIndex
        }
        self = data
    }

    /// Decode from base64url (no padding).
    init(base64URLEncoded string: String) {
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let remainder = base64.count % 4
        if remainder > 0 {
            base64 += String(repeating: "=", count: 4 - remainder)
        }
        self = Data(base64Encoded: base64) ?? Data()
    }

    /// Encode to base64url (no padding) as required by WebAuthn.
    var base64URLEncoded: String {
        base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Hex string representation.
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
