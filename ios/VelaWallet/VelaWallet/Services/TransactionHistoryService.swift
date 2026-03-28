import Foundation

/// Fetches transaction history from getvela.app/api/transactions.
/// Provider-agnostic — backend handles Alchemy/Moralis/Covalent switching.
final class TransactionHistoryService {
    static let baseURL = "https://getvela.app/api"

    func fetchTransactions(address: String, network: String? = nil, pageSize: Int = 25) async throws -> [Transaction] {
        var components = URLComponents(string: "\(Self.baseURL)/transactions")!
        var items = [URLQueryItem(name: "address", value: address), URLQueryItem(name: "pageSize", value: "\(pageSize)")]
        if let network { items.append(URLQueryItem(name: "network", value: network)) }
        components.queryItems = items

        var request = URLRequest(url: components.url!)
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.fetchFailed
        }
        return try JSONDecoder().decode(TransactionResponse.self, from: data).transactions
    }

    struct TransactionResponse: Decodable {
        let transactions: [Transaction]
    }

    enum APIError: Error {
        case fetchFailed
    }
}

struct Transaction: Decodable, Identifiable {
    let hash: String
    let network: String
    let chainName: String
    let from: String
    let to: String
    let value: String
    let symbol: String
    let decimals: Int
    let tokenAddress: String?
    let category: String // "send", "receive", "contract", "approve"
    let timestamp: Int64?
    let blockNumber: String
    let status: String
    let tokenId: String?
    let data: String?

    var id: String { "\(hash)_\(category)_\(tokenAddress ?? "native")" }
    var isSend: Bool { category == "send" }
    var isReceive: Bool { category == "receive" }

    var displayValue: String {
        guard let v = Double(value), v > 0 else { return "" }
        return v >= 1 ? String(format: "%.4f", v) : String(format: "%.6f", v)
    }

    var timeAgo: String {
        guard let ts = timestamp else { return "" }
        let diff = Int(Date().timeIntervalSince1970) - Int(ts)
        if diff < 60 { return "Just now" }
        if diff < 3600 { return "\(diff / 60)m ago" }
        if diff < 86400 { return "\(diff / 3600)h ago" }
        if diff < 604800 { return "\(diff / 86400)d ago" }
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: Date(timeIntervalSince1970: Double(ts)))
    }
}
