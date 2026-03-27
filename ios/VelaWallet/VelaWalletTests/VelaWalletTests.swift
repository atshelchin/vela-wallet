import Testing
@testable import VelaWallet

// MARK: - WalletState Tests

struct WalletStateTests {

    @Test func initialState() {
        let state = WalletState()
        #expect(state.hasWallet == false)
        #expect(state.address == "")
        #expect(state.isConnectedToBrowser == false)
        #expect(state.accounts.isEmpty)
        #expect(state.activeAccountIndex == 0)
        #expect(state.activeAccount == nil)
    }

    @Test func shortAddressFormatsCorrectly() {
        let state = WalletState()
        state.address = "0x7a3F8c2D1b4E9f6A5d3C0e8B7a2F4d6E1c9e92B"
        #expect(state.shortAddress == "0x7a3F...e92B")
    }

    @Test func shortAddressHandlesShortInput() {
        let state = WalletState()
        state.address = "0x1234"
        #expect(state.shortAddress == "0x1234")
    }

    @Test func shortAddressHandlesEmpty() {
        let state = WalletState()
        state.address = ""
        #expect(state.shortAddress == "")
    }

    @Test func shortAddressExactlyTenChars() {
        let state = WalletState()
        state.address = "0x12345678"
        #expect(state.shortAddress == "0x12345678")
    }

    @Test func shortAddressElevenChars() {
        let state = WalletState()
        state.address = "0x123456789"
        #expect(state.shortAddress == "0x1234...6789")
    }

    @Test func walletStateCanBeModified() {
        let state = WalletState()
        state.hasWallet = true
        state.address = "0xABC"
        state.isConnectedToBrowser = true

        #expect(state.hasWallet == true)
        #expect(state.address == "0xABC")
        #expect(state.isConnectedToBrowser == true)
    }

    @Test func activeAccountWithAccounts() {
        let state = WalletState()
        let account = Account(id: "test", name: "Test", address: "0x1234567890", createdAt: Date())
        state.accounts = [account]
        state.activeAccountIndex = 0

        #expect(state.activeAccount != nil)
        #expect(state.activeAccount?.id == "test")
    }

    @Test func activeAccountOutOfBounds() {
        let state = WalletState()
        state.activeAccountIndex = 5
        #expect(state.activeAccount == nil)
    }

    @Test func multipleAccounts() {
        let state = WalletState()
        let a1 = Account(id: "a", name: "Alice", address: "0xAAA", createdAt: Date())
        let a2 = Account(id: "b", name: "Bob", address: "0xBBB", createdAt: Date())
        state.accounts = [a1, a2]

        state.activeAccountIndex = 0
        #expect(state.activeAccount?.address == "0xAAA")

        state.activeAccountIndex = 1
        #expect(state.activeAccount?.address == "0xBBB")
    }
}

// MARK: - Account Tests

struct AccountTests {

    @Test func shortAddress() {
        let account = Account(id: "1", name: "Main", address: "0x7a3F8c2D1b4E9f6A5d3C0e8B7a2F4d6E1c9e92B", createdAt: Date())
        #expect(account.shortAddress == "0x7a3F...e92B")
    }

    @Test func shortAddressShort() {
        let account = Account(id: "1", name: "Short", address: "0x1234", createdAt: Date())
        #expect(account.shortAddress == "0x1234")
    }
}

// MARK: - Network Tests

struct NetworkTests {

    @Test func defaultsCount() {
        #expect(Network.defaults.count == 7)
    }

    @Test func ethereumProperties() {
        let net = Network.ethereum
        #expect(net.displayName == "Ethereum")
        #expect(net.chainId == 1)
        #expect(net.id == "ethereum")
        #expect(net.isL2 == false)
        #expect(net.subtitle == "Mainnet · Chain 1")
        #expect(!net.rpcURL.isEmpty)
        #expect(!net.explorerURL.isEmpty)
        #expect(!net.bundlerURL.isEmpty)
    }

    @Test func bnbProperties() {
        let net = Network.bnb
        #expect(net.displayName == "BNB Chain")
        #expect(net.chainId == 56)
    }

    @Test func polygonProperties() {
        let net = Network.polygon
        #expect(net.displayName == "Polygon")
        #expect(net.chainId == 137)
        #expect(net.isL2 == true)
    }

    @Test func arbitrumProperties() {
        let net = Network.arbitrum
        #expect(net.displayName == "Arbitrum")
        #expect(net.chainId == 42161)
    }

    @Test func optimismProperties() {
        let net = Network.optimism
        #expect(net.displayName == "Optimism")
        #expect(net.chainId == 10)
    }

    @Test func baseProperties() {
        let net = Network.base
        #expect(net.displayName == "Base")
        #expect(net.chainId == 8453)
    }

    @Test func avalancheProperties() {
        let net = Network.avalanche
        #expect(net.displayName == "Avalanche")
        #expect(net.chainId == 43114)
    }

    @Test func chainIdsAreUnique() {
        let chainIds = Network.defaults.map(\.chainId)
        #expect(Set(chainIds).count == chainIds.count)
    }

    @Test func idsAreUnique() {
        let ids = Network.defaults.map(\.id)
        #expect(Set(ids).count == ids.count)
    }

    @Test func allHaveRpcUrls() {
        for network in Network.defaults {
            #expect(!network.rpcURL.isEmpty)
        }
    }

    @Test func allHaveExplorerUrls() {
        for network in Network.defaults {
            #expect(!network.explorerURL.isEmpty)
        }
    }

    @Test func allHaveBundlerUrls() {
        for network in Network.defaults {
            #expect(!network.bundlerURL.isEmpty)
        }
    }

    @Test func rpcUrlsAreMutable() {
        var net = Network.ethereum
        net.rpcURL = "https://custom-rpc.example.com"
        #expect(net.rpcURL == "https://custom-rpc.example.com")
    }

    @Test func equatable() {
        #expect(Network.ethereum == Network.ethereum)
        #expect(Network.ethereum != Network.arbitrum)
    }

    @Test func l2Subtitle() {
        let net = Network.arbitrum
        #expect(net.subtitle.hasPrefix("L2"))
    }

    @Test func mainnetSubtitle() {
        let net = Network.ethereum
        #expect(net.subtitle.hasPrefix("Mainnet"))
    }
}

// MARK: - Token Tests

struct TokenTests {

    @Test func samplesExist() {
        #expect(Token.samples.count == 3)
    }

    @Test func sampleIds() {
        let ids = Token.samples.map(\.id)
        #expect(ids == ["eth", "usdc", "dai"])
    }

    @Test func sampleSymbols() {
        let symbols = Token.samples.map(\.symbol)
        #expect(symbols == ["ETH", "USDC", "DAI"])
    }

    @Test func sampleBalancesArePositive() {
        for token in Token.samples {
            #expect(token.balance > 0)
        }
    }

    @Test func sampleUsdValuesArePositive() {
        for token in Token.samples {
            #expect(token.usdValue > 0)
        }
    }

    @Test func sampleIdsAreUnique() {
        let ids = Token.samples.map(\.id)
        #expect(Set(ids).count == ids.count)
    }

    @Test func ethTokenValues() {
        let eth = Token.samples[0]
        #expect(eth.balance == 1.245)
        #expect(eth.usdValue == 3981.60)
    }
}
