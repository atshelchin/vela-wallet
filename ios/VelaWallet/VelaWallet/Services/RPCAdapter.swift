import Foundation

/// RPC Adapter — routes JSON-RPC calls to user-configured or default endpoints.
///
/// Local-First Architecture: users can bring their own RPC nodes.
/// Fallback order: user-configured URL → getvela.app proxy → public RPC.
///
/// Usage:
///   let adapter = RPCAdapter.shared
///   let result = try await adapter.call(method: "eth_call", params: [...], chainId: 137)
///   let bundlerResult = try await adapter.bundlerCall(method: "eth_sendUserOperation", params: [...], chainId: 137)
final class RPCAdapter {
    static let shared = RPCAdapter()

    /// Default proxy (used when user has no custom config).
    static let defaultProxyURL = "https://getvela.app/api/bundler"

    /// Public RPC fallbacks (used when both custom and proxy fail).
    private static let publicRPCs: [Int: String] = [
        1:     "https://eth.llamarpc.com",
        56:    "https://bsc-dataseed.binance.org",
        137:   "https://polygon-rpc.com",
        42161: "https://arb1.arbitrum.io/rpc",
        10:    "https://mainnet.optimism.io",
        8453:  "https://mainnet.base.org",
        43114: "https://api.avax.network/ext/bc/C/rpc",
    ]

    private static let networkMap: [Int: String] = [
        1: "eth-mainnet", 56: "bnb-mainnet", 137: "matic-mainnet",
        42161: "arb-mainnet", 10: "opt-mainnet", 8453: "base-mainnet", 43114: "avax-mainnet",
    ]

    private init() {}

    // MARK: - RPC Call (eth_call, eth_getBalance, etc.)

    /// Send a standard JSON-RPC call. Tries user config → proxy → public RPC.
    func call(method: String, params: [Any], chainId: Int) async throws -> Data {
        // 1. User-configured RPC
        let userRPC = userRPCURL(for: chainId)
        if let url = userRPC {
            if let result = try? await directRPC(url: url, method: method, params: params) {
                return result
            }
        }

        // 2. Vela proxy
        if let result = try? await proxyRPC(method: method, params: params, chainId: chainId) {
            return result
        }

        // 3. Public RPC fallback
        if let publicURL = Self.publicRPCs[chainId] {
            return try await directRPC(url: publicURL, method: method, params: params)
        }

        throw RPCError.allEndpointsFailed
    }

    // MARK: - Bundler Call (ERC-4337 methods)

    /// Send a bundler-specific call (eth_sendUserOperation, etc.).
    /// Tries user config → Vela proxy.
    func bundlerCall(method: String, params: [Any], chainId: Int) async throws -> Data {
        // 1. User-configured bundler
        let userBundler = userBundlerURL(for: chainId)
        if let url = userBundler {
            if let result = try? await directRPC(url: url, method: method, params: params) {
                return result
            }
        }

        // 2. Vela proxy
        return try await proxyRPC(method: method, params: params, chainId: chainId)
    }

    // MARK: - Direct JSON-RPC

    private func directRPC(url: String, method: String, params: [Any]) async throws -> Data {
        guard let requestURL = URL(string: url) else { throw RPCError.invalidURL }
        var request = URLRequest(url: requestURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15

        let body: [String: Any] = [
            "jsonrpc": "2.0",
            "id": 1,
            "method": method,
            "params": params,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw RPCError.httpError
        }
        return data
    }

    // MARK: - Proxy RPC (via getvela.app)

    private func proxyRPC(method: String, params: [Any], chainId: Int) async throws -> Data {
        let network = Self.networkMap[chainId] ?? "eth-mainnet"
        guard let url = URL(string: Self.defaultProxyURL) else { throw RPCError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15

        let body: [String: Any] = [
            "method": method,
            "params": params,
            "network": network,
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw RPCError.httpError
        }
        return data
    }

    // MARK: - User Config

    /// Read user-configured RPC URL for a chain from Network settings.
    private func userRPCURL(for chainId: Int) -> String? {
        let networks = loadUserNetworks()
        guard let network = networks.first(where: { $0.chainId == chainId }) else { return nil }
        let url = network.rpcURL
        // Only use if user has actually customized it (not the default)
        let defaults = Network.defaults
        if let defaultNet = defaults.first(where: { $0.chainId == chainId }), defaultNet.rpcURL == url {
            return nil // Using default — let the proxy handle it
        }
        return url.isEmpty ? nil : url
    }

    /// Read user-configured bundler URL for a chain.
    private func userBundlerURL(for chainId: Int) -> String? {
        let networks = loadUserNetworks()
        guard let network = networks.first(where: { $0.chainId == chainId }) else { return nil }
        let url = network.bundlerURL
        let defaults = Network.defaults
        if let defaultNet = defaults.first(where: { $0.chainId == chainId }), defaultNet.bundlerURL == url {
            return nil
        }
        return url.isEmpty ? nil : url
    }

    /// Load network config — for now from Network.defaults (TODO: persist user edits)
    private func loadUserNetworks() -> [Network] {
        // TODO: Load from LocalStorage when NetworkEditorView saves changes
        return Network.defaults
    }

    // MARK: - Errors

    enum RPCError: Error, LocalizedError {
        case allEndpointsFailed
        case invalidURL
        case httpError

        var errorDescription: String? {
            switch self {
            case .allEndpointsFailed: "All RPC endpoints failed. Check your network settings."
            case .invalidURL: "Invalid RPC URL."
            case .httpError: "RPC request failed."
            }
        }
    }
}
