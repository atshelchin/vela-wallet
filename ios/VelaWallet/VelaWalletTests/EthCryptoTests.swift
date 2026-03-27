import Testing
import Foundation
@testable import VelaWallet

// MARK: - Keccak-256 Tests

struct Keccak256Tests {

    @Test func emptyInput() {
        let result = EthCrypto.keccak256(Data())
        #expect(result.hexString == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")
    }

    @Test func helloString() {
        let result = EthCrypto.keccak256(Data("hello".utf8))
        #expect(result.hexString == "1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8")
    }

    @Test func abcString() {
        let result = EthCrypto.keccak256(Data("abc".utf8))
        #expect(result.hexString == "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45")
    }

    @Test func outputIs32Bytes() {
        let result = EthCrypto.keccak256(Data("test".utf8))
        #expect(result.count == 32)
    }

    @Test func deterministicOutput() {
        let a = EthCrypto.keccak256(Data("deterministic".utf8))
        let b = EthCrypto.keccak256(Data("deterministic".utf8))
        #expect(a == b)
    }

    @Test func differentInputsDifferentOutputs() {
        let a = EthCrypto.keccak256(Data("a".utf8))
        let b = EthCrypto.keccak256(Data("b".utf8))
        #expect(a != b)
    }
}

// MARK: - Function Selector Tests

struct FunctionSelectorTests {

    @Test func transferSelector() {
        let selector = EthCrypto.functionSelector("transfer(address,uint256)")
        #expect(selector.hexString == "a9059cbb")
    }

    @Test func setupSelector() {
        let selector = EthCrypto.functionSelector("setup(address[],uint256,address,bytes,address,address,uint256,address)")
        #expect(selector.hexString == "b63e800d")
    }

    @Test func enableModulesSelector() {
        let selector = EthCrypto.functionSelector("enableModules(address[])")
        #expect(selector.hexString == "8d0dc49f")
    }

    @Test func configureSelector() {
        let selector = EthCrypto.functionSelector("configure((uint256,uint256,uint176))")
        #expect(selector.hexString == "0dd9692f")
    }

    @Test func multiSendSelector() {
        let selector = EthCrypto.functionSelector("multiSend(bytes)")
        #expect(selector.hexString == "8d80ff0a")
    }

    @Test func selectorIs4Bytes() {
        let selector = EthCrypto.functionSelector("transfer(address,uint256)")
        #expect(selector.count == 4)
    }
}

// MARK: - ABI Encoding Tests

struct ABIEncodingTests {

    @Test func encodeAddressZero() {
        let result = EthCrypto.abiEncode(address: "0x0000000000000000000000000000000000000000")
        #expect(result.count == 32)
        #expect(result.hexString == "0000000000000000000000000000000000000000000000000000000000000000")
    }

    @Test func encodeAddressWithValue() {
        let result = EthCrypto.abiEncode(address: "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226")
        #expect(result.count == 32)
        // Address should be left-padded with zeros in 32 bytes
        #expect(result.hexString.hasSuffix("75cf11467937ce3f2f357ce24ffc3dbf8fd5c226"))
    }

    @Test func encodeUint256Zero() {
        let result = EthCrypto.abiEncode(uint256: 0)
        #expect(result.count == 32)
        #expect(result == Data(repeating: 0, count: 32))
    }

    @Test func encodeUint256One() {
        let result = EthCrypto.abiEncode(uint256: 1)
        #expect(result.count == 32)
        #expect(result[31] == 1)
        #expect(result[30] == 0)
    }

    @Test func encodeUint256Large() {
        let result = EthCrypto.abiEncode(uint256: 256)
        #expect(result.count == 32)
        #expect(result[31] == 0)
        #expect(result[30] == 1)
    }

    @Test func encodeUint256Hex() {
        let result = EthCrypto.abiEncode(uint256Hex: "100")
        #expect(result.count == 32)
        #expect(result[31] == 0)
        #expect(result[30] == 1) // 0x100 = 256
    }

    @Test func encodeBytes32() {
        let input = Data(repeating: 0xAB, count: 32)
        let result = EthCrypto.abiEncode(bytes32: input)
        #expect(result.count == 32)
        #expect(result == input)
    }

    @Test func encodeBytes32Shorter() {
        let input = Data([0x01, 0x02])
        let result = EthCrypto.abiEncode(bytes32: input)
        #expect(result.count == 32)
        #expect(result[0] == 0x01)
        #expect(result[1] == 0x02)
        #expect(result[2] == 0x00)
    }

    @Test func concat() {
        let a = Data([1, 2])
        let b = Data([3, 4])
        let result = EthCrypto.concat([a, b])
        #expect(result == Data([1, 2, 3, 4]))
    }
}

// MARK: - CREATE2 Address Tests

struct CREATE2Tests {

    @Test func checksumAddress() {
        let result = EthCrypto.checksumAddress("0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359")
        #expect(result.hasPrefix("0x"))
        #expect(result.count == 42)
    }

    @Test func checksumAddressPreservesLength() {
        let input = "fb6916095ca1df60bb79ce92ce3ea74c37c5d359"
        let result = EthCrypto.checksumAddress(input)
        #expect(result.count == 42) // 0x + 40
    }
}

// MARK: - EIP-712 Type Hashes

struct EIP712TypeHashTests {

    @Test func domainTypeHash() {
        let result = EthCrypto.keccak256(Data("EIP712Domain(uint256 chainId,address verifyingContract)".utf8))
        #expect(result.hexString == "47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218")
    }

    @Test func safeOpTypeHash() {
        let result = EthCrypto.keccak256(Data("SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)".utf8))
        #expect(result.hexString == "c03dfc11d8b10bf9cf703d558958c8c42777f785d998c62060d85a4f0ef6ea7f")
    }
}

// MARK: - Data Hex Extension Tests

struct DataHexTests {

    @Test func hexStringEmpty() {
        #expect(Data().hexString == "")
    }

    @Test func hexStringOnesByte() {
        #expect(Data([0xFF]).hexString == "ff")
    }

    @Test func hexStringMultipleBytes() {
        #expect(Data([0x01, 0xAB, 0xCD]).hexString == "01abcd")
    }

    @Test func initFromHexString() {
        let data = Data(hexString: "01abcd")
        #expect(data != nil)
        #expect(data?.count == 3)
        #expect(data?[0] == 0x01)
        #expect(data?[1] == 0xAB)
        #expect(data?[2] == 0xCD)
    }

    @Test func initFromHexStringWith0x() {
        let data = Data(hexString: "0x01abcd")
        #expect(data != nil)
        #expect(data?.count == 3)
    }

    @Test func initFromHexStringOddLength() {
        let data = Data(hexString: "abc")
        #expect(data == nil)
    }

    @Test func base64URLEncoding() {
        let data = Data([0x3B, 0xB2, 0xFE]) // produces base64 with +/
        let encoded = data.base64URLEncoded
        #expect(!encoded.contains("+"))
        #expect(!encoded.contains("/"))
        #expect(!encoded.contains("="))
    }

    @Test func base64URLDecoding() {
        let original = "SGVsbG8gV29ybGQ" // "Hello World" base64url
        let data = Data(base64URLEncoded: original)
        #expect(String(data: data, encoding: .utf8) == "Hello World")
    }

    @Test func base64URLRoundtrip() {
        let original = Data("test data for roundtrip".utf8)
        let encoded = original.base64URLEncoded
        let decoded = Data(base64URLEncoded: encoded)
        #expect(decoded == original)
    }
}
