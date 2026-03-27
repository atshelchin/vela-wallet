import Testing
import Foundation
@testable import VelaWallet

// MARK: - APIToken Tests

struct APITokenTests {

    @Test func nativeTokenDetection() {
        let native = APIToken(
            network: "eth-mainnet", chainName: "Ethereum", symbol: "ETH",
            balance: "1.5", decimals: 18, logo: nil, name: "Ethereum",
            tokenAddress: nil, priceUsd: 3200.0, spam: false
        )
        #expect(native.isNative)
    }

    @Test func erc20TokenDetection() {
        let erc20 = APIToken(
            network: "eth-mainnet", chainName: "Ethereum", symbol: "USDC",
            balance: "100.0", decimals: 6, logo: nil, name: "USD Coin",
            tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
            priceUsd: 1.0, spam: false
        )
        #expect(!erc20.isNative)
    }

    @Test func usdValueCalculation() {
        let token = APIToken(
            network: "eth-mainnet", chainName: "Ethereum", symbol: "ETH",
            balance: "2.5", decimals: 18, logo: nil, name: "Ethereum",
            tokenAddress: nil, priceUsd: 3200.0, spam: false
        )
        #expect(token.usdValue == 8000.0)
    }

    @Test func usdValueNoPrice() {
        let token = APIToken(
            network: "eth-mainnet", chainName: "Ethereum", symbol: "SHIB",
            balance: "1000000", decimals: 18, logo: nil, name: "Shiba",
            tokenAddress: "0x1234", priceUsd: nil, spam: false
        )
        #expect(token.usdValue == 0)
    }

    @Test func balanceDouble() {
        let token = APIToken(
            network: "eth-mainnet", chainName: "Ethereum", symbol: "ETH",
            balance: "1.2345", decimals: 18, logo: nil, name: "Ethereum",
            tokenAddress: nil, priceUsd: nil, spam: false
        )
        #expect(token.balanceDouble == 1.2345)
    }

    @Test func balanceDoubleInvalid() {
        let token = APIToken(
            network: "eth-mainnet", chainName: "Ethereum", symbol: "ETH",
            balance: "not_a_number", decimals: 18, logo: nil, name: "Ethereum",
            tokenAddress: nil, priceUsd: nil, spam: false
        )
        #expect(token.balanceDouble == 0)
    }

    @Test func chainIdMapping() {
        let cases: [(String, Int)] = [
            ("eth-mainnet", 1),
            ("arb-mainnet", 42161),
            ("base-mainnet", 8453),
            ("opt-mainnet", 10),
            ("matic-mainnet", 137),
            ("bnb-mainnet", 56),
            ("avax-mainnet", 43114),
        ]
        for (network, expected) in cases {
            let token = APIToken(
                network: network, chainName: "", symbol: "", balance: "0",
                decimals: 18, logo: nil, name: "", tokenAddress: nil,
                priceUsd: nil, spam: false
            )
            #expect(token.chainId == expected, "Expected \(expected) for \(network)")
        }
    }

    @Test func logoURLNativeToken() {
        let token = APIToken(
            network: "eth-mainnet", chainName: "Ethereum", symbol: "ETH",
            balance: "0", decimals: 18, logo: nil, name: "Ethereum",
            tokenAddress: nil, priceUsd: nil, spam: false
        )
        let url = token.logoURL
        #expect(url != nil)
        #expect(url?.absoluteString.contains("eip155-1") == true)
    }

    @Test func logoURLERC20Token() {
        let addr = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        let token = APIToken(
            network: "eth-mainnet", chainName: "Ethereum", symbol: "USDC",
            balance: "0", decimals: 6, logo: nil, name: "USD Coin",
            tokenAddress: addr, priceUsd: nil, spam: false
        )
        let url = token.logoURL
        #expect(url != nil)
        #expect(url?.absoluteString.contains(addr) == true)
    }

    @Test func logoURLPrefersAPILogo() {
        let token = APIToken(
            network: "eth-mainnet", chainName: "Ethereum", symbol: "USDC",
            balance: "0", decimals: 6, logo: "https://example.com/logo.png",
            name: "USD Coin", tokenAddress: "0x123", priceUsd: nil, spam: false
        )
        #expect(token.logoURL?.absoluteString == "https://example.com/logo.png")
    }

    @Test func tokenIdUniqueness() {
        let a = APIToken(
            network: "eth-mainnet", chainName: "", symbol: "ETH",
            balance: "0", decimals: 18, logo: nil, name: "",
            tokenAddress: nil, priceUsd: nil, spam: false
        )
        let b = APIToken(
            network: "arb-mainnet", chainName: "", symbol: "ETH",
            balance: "0", decimals: 18, logo: nil, name: "",
            tokenAddress: nil, priceUsd: nil, spam: false
        )
        #expect(a.id != b.id)
    }
}

// MARK: - APINFT Tests

struct APINFTTests {

    @Test func displayNameWithName() {
        let nft = APINFT(
            network: "eth-mainnet", chainName: "Ethereum",
            contractAddress: "0x123", tokenId: "1",
            name: "Cool NFT #1", description: nil, image: nil,
            tokenType: "ERC721", collectionName: "Cool Collection",
            collectionImage: nil
        )
        #expect(nft.displayName == "Cool NFT #1")
    }

    @Test func displayNameFallback() {
        let nft = APINFT(
            network: "eth-mainnet", chainName: "Ethereum",
            contractAddress: "0x123", tokenId: "42",
            name: nil, description: nil, image: nil,
            tokenType: "ERC721", collectionName: "My Collection",
            collectionImage: nil
        )
        #expect(nft.displayName == "My Collection #42")
    }

    @Test func ipfsImageURL() {
        let nft = APINFT(
            network: "eth-mainnet", chainName: "Ethereum",
            contractAddress: "0x123", tokenId: "1",
            name: nil, description: nil,
            image: "ipfs://QmHash123456",
            tokenType: "ERC721", collectionName: nil, collectionImage: nil
        )
        #expect(nft.imageURL?.absoluteString == "https://ipfs.io/ipfs/QmHash123456")
    }

    @Test func httpImageURL() {
        let nft = APINFT(
            network: "eth-mainnet", chainName: "Ethereum",
            contractAddress: "0x123", tokenId: "1",
            name: nil, description: nil,
            image: "https://example.com/nft.png",
            tokenType: "ERC721", collectionName: nil, collectionImage: nil
        )
        #expect(nft.imageURL?.absoluteString == "https://example.com/nft.png")
    }

    @Test func nilImageURL() {
        let nft = APINFT(
            network: "eth-mainnet", chainName: "Ethereum",
            contractAddress: "0x123", tokenId: "1",
            name: nil, description: nil, image: nil,
            tokenType: "ERC721", collectionName: nil, collectionImage: nil
        )
        #expect(nft.imageURL == nil)
    }

    @Test func nftId() {
        let nft = APINFT(
            network: "eth-mainnet", chainName: "Ethereum",
            contractAddress: "0xABC", tokenId: "42",
            name: nil, description: nil, image: nil,
            tokenType: "ERC721", collectionName: nil, collectionImage: nil
        )
        #expect(nft.id == "eth-mainnet_0xABC_42")
    }
}

// MARK: - LocalStorage CustomToken Tests

struct CustomTokenTests {

    @Test func networkIdMapping() {
        let cases: [(Int, String)] = [
            (1, "eth-mainnet"),
            (42161, "arb-mainnet"),
            (8453, "base-mainnet"),
            (10, "opt-mainnet"),
            (137, "matic-mainnet"),
            (56, "bnb-mainnet"),
            (43114, "avax-mainnet"),
        ]
        for (chainId, expected) in cases {
            let token = LocalStorage.CustomToken(
                id: "test", chainId: chainId,
                contractAddress: "0x123", symbol: "TEST",
                name: "Test", decimals: 18, networkName: "Test"
            )
            #expect(token.networkId == expected)
        }
    }

    @Test func customTokenId() {
        let token = LocalStorage.CustomToken(
            id: "1_0xABC", chainId: 1,
            contractAddress: "0xABC", symbol: "TKN",
            name: "Token", decimals: 18, networkName: "Ethereum"
        )
        #expect(token.id == "1_0xABC")
    }
}

// MARK: - WalletAPIService Tests

struct WalletAPIServiceTests {

    @Test func baseURL() {
        #expect(WalletAPIService.baseURL == "https://getvela.app/api")
    }

    @Test func apiErrorDescription() {
        let error = WalletAPIService.APIError.fetchFailed
        #expect(error.localizedDescription.contains("Failed"))
    }
}

// MARK: - PublicKeyIndexService Tests

struct PublicKeyIndexServiceTests {

    @Test func baseURL() {
        #expect(PublicKeyIndexService.baseURL == "https://webauthnp256-publickey-index.biubiu.tools")
    }

    @Test func apiErrorDescriptions() {
        let invalid = PublicKeyIndexService.APIError.invalidResponse
        #expect(invalid.localizedDescription.contains("Invalid"))

        let http = PublicKeyIndexService.APIError.httpError(400, "bad request")
        #expect(http.localizedDescription.contains("bad request"))
        #expect(http.localizedDescription.contains("400"))

        let httpNoMsg = PublicKeyIndexService.APIError.httpError(500, "")
        #expect(httpNoMsg.localizedDescription.contains("500"))
    }
}
