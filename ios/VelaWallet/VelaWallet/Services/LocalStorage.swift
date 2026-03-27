import Foundation

/// Persists wallet credential data to iCloud (NSUbiquitousKeyValueStore).
/// Syncs across devices automatically — switching phones won't lose data.
/// Falls back to UserDefaults if iCloud is unavailable.
final class LocalStorage {
    static let shared = LocalStorage()

    private let cloud = NSUbiquitousKeyValueStore.default
    private let local = UserDefaults.standard
    private let accountsKey = "vela.accounts"
    private let pendingUploadsKey = "vela.pendingUploads"
    private let customTokensKey = "vela.customTokens"

    private init() {
        // Trigger initial sync
        cloud.synchronize()

        // Migrate from UserDefaults to iCloud if needed
        migrateToCloudIfNeeded()
    }

    // MARK: - Accounts

    struct StoredAccount: Codable, Identifiable {
        let id: String           // credentialId (hex)
        let name: String
        let publicKeyHex: String // uncompressed P256: 04 || x || y
        let address: String      // Safe address
        let createdAt: Date
    }

    func saveAccount(_ account: StoredAccount) {
        var accounts = loadAccounts()
        accounts.removeAll { $0.id == account.id }
        accounts.append(account)
        save(accounts, forKey: accountsKey)
    }

    func loadAccounts() -> [StoredAccount] {
        load(forKey: accountsKey) ?? []
    }

    func findAccount(byCredentialId id: String) -> StoredAccount? {
        loadAccounts().first { $0.id == id }
    }

    // MARK: - Pending Uploads

    struct PendingUpload: Codable, Identifiable {
        let id: String           // credentialId
        let name: String
        let publicKeyHex: String
        let attestationObjectHex: String
        let createdAt: Date
    }

    func savePendingUpload(_ upload: PendingUpload) {
        var uploads = loadPendingUploads()
        uploads.removeAll { $0.id == upload.id }
        uploads.append(upload)
        save(uploads, forKey: pendingUploadsKey)
    }

    func loadPendingUploads() -> [PendingUpload] {
        load(forKey: pendingUploadsKey) ?? []
    }

    func removePendingUpload(credentialId: String) {
        var uploads = loadPendingUploads()
        uploads.removeAll { $0.id == credentialId }
        save(uploads, forKey: pendingUploadsKey)
    }

    func hasPendingUploads() -> Bool {
        !loadPendingUploads().isEmpty
    }

    // MARK: - Custom Tokens

    struct CustomToken: Codable, Identifiable {
        let id: String           // "{chainId}_{contractAddress}"
        let chainId: Int
        let contractAddress: String
        let symbol: String
        let name: String
        let decimals: Int
        let networkName: String  // display name like "Ethereum"

        var networkId: String {
            switch chainId {
            case 1: "eth-mainnet"
            case 42161: "arb-mainnet"
            case 8453: "base-mainnet"
            case 10: "opt-mainnet"
            case 137: "matic-mainnet"
            case 56: "bnb-mainnet"
            case 43114: "avax-mainnet"
            default: "eth-mainnet"
            }
        }
    }

    func saveCustomToken(_ token: CustomToken) {
        var tokens = loadCustomTokens()
        tokens.removeAll { $0.id == token.id }
        tokens.append(token)
        save(tokens, forKey: customTokensKey)
    }

    func loadCustomTokens() -> [CustomToken] {
        load(forKey: customTokensKey) ?? []
    }

    func removeCustomToken(id: String) {
        var tokens = loadCustomTokens()
        tokens.removeAll { $0.id == id }
        save(tokens, forKey: customTokensKey)
    }

    // MARK: - Private

    private func save<T: Encodable>(_ value: T, forKey key: String) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        // Save to both iCloud and local
        cloud.set(data, forKey: key)
        cloud.synchronize()
        local.set(data, forKey: key)
    }

    private func load<T: Decodable>(forKey key: String) -> T? {
        // Prefer iCloud, fallback to local
        let data = cloud.data(forKey: key) ?? local.data(forKey: key)
        guard let data else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func migrateToCloudIfNeeded() {
        // If local has data but cloud doesn't, push to cloud
        for key in [accountsKey, pendingUploadsKey] {
            if cloud.data(forKey: key) == nil, let localData = local.data(forKey: key) {
                cloud.set(localData, forKey: key)
            }
        }
        cloud.synchronize()
    }
}
