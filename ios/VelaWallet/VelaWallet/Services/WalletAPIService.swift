import Foundation

/// Client for getvela.app API endpoints.
final class WalletAPIService {
    static let baseURL = "https://getvela.app/api"

    // MARK: - Wallet Balances

    /// Fetch token balances across all supported networks.
    func fetchTokens(address: String) async throws -> [APIToken] {
        var components = URLComponents(string: "\(Self.baseURL)/wallet")!
        components.queryItems = [URLQueryItem(name: "address", value: address)]

        // Bypass URLSession cache to always get fresh data
        var request = URLRequest(url: components.url!)
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            debugLog("[API] /wallet failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
            throw APIError.fetchFailed
        }

        let result = try JSONDecoder().decode(WalletResponse.self, from: data)
        let filtered = result.tokens.filter { !$0.spam }
        let total = filtered.reduce(0) { $0 + $1.usdValue }
        debugLog("[API] /wallet: \(filtered.count) tokens, total $\(String(format: "%.2f", total))")
        return filtered
    }

    // MARK: - Exchange Rate

    /// Fetch USD to target currency exchange rate.
    func fetchExchangeRate(currency: String = "CNY") async throws -> Double {
        var components = URLComponents(string: "\(Self.baseURL)/exchange-rate")!
        components.queryItems = [URLQueryItem(name: "currency", value: currency)]

        let (data, response) = try await URLSession.shared.data(from: components.url!)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw APIError.fetchFailed
        }

        let result = try JSONDecoder().decode(ExchangeRateResponse.self, from: data)
        return result.rate
    }

    // MARK: - NFTs

    /// Fetch NFTs across all supported networks.
    func fetchNFTs(address: String) async throws -> [APINFT] {
        var components = URLComponents(string: "\(Self.baseURL)/nft")!
        components.queryItems = [URLQueryItem(name: "address", value: address)]

        var request = URLRequest(url: components.url!)
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            debugLog("[API] /nft failed: HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0)")
            throw APIError.fetchFailed
        }

        let result = try JSONDecoder().decode(NFTResponse.self, from: data)
        debugLog("[API] /nft: \(result.nfts.count) NFTs")
        return result.nfts
    }

    // MARK: - Types

    struct WalletResponse: Decodable {
        let tokens: [APIToken]
    }

    struct NFTResponse: Decodable {
        let nfts: [APINFT]
    }

    struct ExchangeRateResponse: Decodable {
        let currency: String
        let rate: Double
    }

    enum APIError: Error, LocalizedError {
        case fetchFailed
        var errorDescription: String? { "Failed to fetch data from server." }
    }
}

// MARK: - API Token Model

struct APIToken: Decodable, Identifiable {
    let network: String
    let chainName: String
    let symbol: String
    let balance: String
    let decimals: Int
    let logo: String?
    let name: String
    let tokenAddress: String?
    let priceUsd: Double?
    let spam: Bool

    var id: String { "\(network)_\(tokenAddress ?? "native")_\(symbol)" }

    /// Is this a native token (ETH, BNB, AVAX, etc.)?
    var isNative: Bool { tokenAddress == nil }

    /// Balance as Double
    var balanceDouble: Double { Double(balance) ?? 0 }

    /// USD value of holdings
    var usdValue: Double {
        guard let price = priceUsd else { return 0 }
        return balanceDouble * price
    }

    /// Chain ID derived from network identifier
    var chainId: Int {
        switch network {
        case "eth-mainnet": 1
        case "arb-mainnet": 42161
        case "base-mainnet": 8453
        case "opt-mainnet": 10
        case "matic-mainnet": 137
        case "bnb-mainnet": 56
        case "avax-mainnet": 43114
        default: 1
        }
    }

    /// Logo URL for this token
    var logoURL: URL? {
        // If API provides a logo, use it
        if let logo, !logo.isEmpty, let url = URL(string: logo) {
            return url
        }
        // Native token: use chain logo
        if isNative {
            return URL(string: "https://ethereum-data.awesometools.dev/chainlogos/eip155-\(chainId).png")
        }
        // ERC20: use token logo from chain data
        if let addr = tokenAddress {
            return URL(string: "https://ethereum-data.awesometools.dev/assets/eip155-\(chainId)/\(addr)/logo.png")
        }
        return nil
    }
}

// MARK: - NFT Model

struct APINFT: Decodable, Identifiable {
    let network: String
    let chainName: String
    let contractAddress: String
    let tokenId: String
    let name: String?
    let description: String?
    let image: String?
    let tokenType: String
    let collectionName: String?
    let collectionImage: String?

    var id: String { "\(network)_\(contractAddress)_\(tokenId)" }

    var displayName: String { name ?? "\(collectionName ?? "NFT") #\(tokenId)" }

    var imageURL: URL? {
        guard let image, !image.isEmpty else { return nil }
        // Handle IPFS URLs
        if image.hasPrefix("ipfs://") {
            return URL(string: "https://ipfs.io/ipfs/" + image.dropFirst(7))
        }
        return URL(string: image)
    }

    var collectionImageURL: URL? {
        guard let collectionImage, !collectionImage.isEmpty else { return nil }
        if collectionImage.hasPrefix("ipfs://") {
            return URL(string: "https://ipfs.io/ipfs/" + collectionImage.dropFirst(7))
        }
        return URL(string: collectionImage)
    }
}
