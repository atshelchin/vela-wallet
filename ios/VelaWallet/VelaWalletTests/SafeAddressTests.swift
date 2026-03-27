import Testing
import Foundation
@testable import VelaWallet

// MARK: - Safe Address Computation Tests
// Test vectors generated from the TypeScript reference implementation (compute-safe-address.ts)

struct SafeAddressComputerTests {

    // Known test key: 04 + x(32 bytes) + y(32 bytes)
    let testPublicKey = "04a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90b1c2d3e4f50617283940a1b2c3d4e5f6b1c2d3e4f50617283940a1b2c3d4e5f6"
    let expectedAddress = "0x762EdA60D3B68755c271D608644650278f88329F"
    let expectedSaltNonce = "ff558186314810b914e7a54ec8f9dee960ff493364c68ba36e07dd89f547787a"
    let expectedSetupDataHash = "b0d27e7ff8c758797463d1d9b3cfe53cd9c7ff2a92f037cd261b4f90f5de0191"

    // MARK: - Public Key Parsing

    @Test func parsePublicKeyWithPrefix() {
        let (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        #expect(x.count == 32)
        #expect(y.count == 32)
        #expect(x.hexString == "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90")
        #expect(y.hexString == "b1c2d3e4f50617283940a1b2c3d4e5f6b1c2d3e4f50617283940a1b2c3d4e5f6")
    }

    @Test func parsePublicKeyWith0xPrefix() {
        let (x, y) = SafeAddressComputer.parsePublicKey("0x" + testPublicKey)
        #expect(x.count == 32)
        #expect(y.count == 32)
    }

    @Test func parsePublicKeyWithout04Prefix() {
        let rawKey = String(testPublicKey.dropFirst(2)) // remove "04"
        let (x, y) = SafeAddressComputer.parsePublicKey(rawKey)
        #expect(x.count == 32)
        #expect(y.count == 32)
    }

    @Test func parsePublicKeyInvalidLength() {
        let (x, y) = SafeAddressComputer.parsePublicKey("04aabb")
        #expect(x.isEmpty)
        #expect(y.isEmpty)
    }

    // MARK: - Salt Nonce

    @Test func saltNonceMatchesTypeScript() {
        let (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        let saltNonce = SafeAddressComputer.calculateSaltNonce(x: x, y: y)
        #expect(saltNonce.hexString == expectedSaltNonce)
    }

    @Test func saltNonceIs32Bytes() {
        let (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        let saltNonce = SafeAddressComputer.calculateSaltNonce(x: x, y: y)
        #expect(saltNonce.count == 32)
    }

    @Test func saltNonceDeterministic() {
        let (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        let a = SafeAddressComputer.calculateSaltNonce(x: x, y: y)
        let b = SafeAddressComputer.calculateSaltNonce(x: x, y: y)
        #expect(a == b)
    }

    @Test func differentKeysDifferentSaltNonce() {
        let key2 = "04" + String(repeating: "a1", count: 32) + String(repeating: "b2", count: 32)
        let (x1, y1) = SafeAddressComputer.parsePublicKey(testPublicKey)
        let (x2, y2) = SafeAddressComputer.parsePublicKey(key2)
        let salt1 = SafeAddressComputer.calculateSaltNonce(x: x1, y: y1)
        let salt2 = SafeAddressComputer.calculateSaltNonce(x: x2, y: y2)
        #expect(salt1 != salt2)
    }

    // MARK: - Setup Data

    @Test func setupDataHashMatchesTypeScript() {
        let (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        let setupData = SafeAddressComputer.encodeSetupData(x: x, y: y)
        let hash = EthCrypto.keccak256(setupData)
        #expect(hash.hexString == expectedSetupDataHash)
    }

    @Test func setupDataNotEmpty() {
        let (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        let setupData = SafeAddressComputer.encodeSetupData(x: x, y: y)
        #expect(setupData.count > 0)
    }

    @Test func setupDataStartsWithSelector() {
        let (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        let setupData = SafeAddressComputer.encodeSetupData(x: x, y: y)
        let setupSelector = EthCrypto.functionSelector("setup(address[],uint256,address,bytes,address,address,uint256,address)")
        #expect(setupData.prefix(4) == setupSelector)
    }

    @Test func setupDataDeterministic() {
        let (x, y) = SafeAddressComputer.parsePublicKey(testPublicKey)
        let a = SafeAddressComputer.encodeSetupData(x: x, y: y)
        let b = SafeAddressComputer.encodeSetupData(x: x, y: y)
        #expect(a == b)
    }

    // MARK: - Full Address Computation

    @Test func computeAddressMatchesTypeScript() {
        let address = SafeAddressComputer.computeAddress(publicKeyHex: testPublicKey)
        #expect(address == expectedAddress)
    }

    @Test func computeAddressIsChecksummed() {
        let address = SafeAddressComputer.computeAddress(publicKeyHex: testPublicKey)
        #expect(address.hasPrefix("0x"))
        #expect(address.count == 42)
        // Must contain at least one uppercase letter (EIP-55)
        let body = String(address.dropFirst(2))
        let hasUpper = body.contains(where: { $0.isUppercase })
        #expect(hasUpper)
    }

    @Test func computeAddressDeterministic() {
        let a = SafeAddressComputer.computeAddress(publicKeyHex: testPublicKey)
        let b = SafeAddressComputer.computeAddress(publicKeyHex: testPublicKey)
        #expect(a == b)
    }

    @Test func computeAddressAccepts0xPrefix() {
        let a = SafeAddressComputer.computeAddress(publicKeyHex: testPublicKey)
        let b = SafeAddressComputer.computeAddress(publicKeyHex: "0x" + testPublicKey)
        #expect(a == b)
    }

    @Test func differentKeysDifferentAddresses() {
        let key2 = "04" + String(repeating: "cc", count: 32) + String(repeating: "dd", count: 32)
        let addr1 = SafeAddressComputer.computeAddress(publicKeyHex: testPublicKey)
        let addr2 = SafeAddressComputer.computeAddress(publicKeyHex: key2)
        #expect(addr1 != addr2)
    }

    // MARK: - Contract Constants

    @Test func contractAddressesAreValid() {
        let addresses = [
            SafeAddressComputer.safeProxyFactory,
            SafeAddressComputer.safeSingleton,
            SafeAddressComputer.entryPoint,
            SafeAddressComputer.safe4337Module,
            SafeAddressComputer.safeModuleSetup,
            SafeAddressComputer.webAuthnSigner,
            SafeAddressComputer.multiSend,
        ]
        for addr in addresses {
            #expect(addr.hasPrefix("0x"))
            #expect(addr.count == 42)
        }
    }

    @Test func proxyCreationCodeNotEmpty() {
        #expect(SafeAddressComputer.proxyCreationCode.count > 100)
    }
}

// MARK: - Attestation Parser Tests

struct AttestationParserTests {

    @Test func derSignatureToRaw64Bytes() {
        // DER: 30 44 02 20 <r 32 bytes> 02 20 <s 32 bytes>
        var der = Data([0x30, 0x44, 0x02, 0x20])
        der += Data(repeating: 0xAA, count: 32) // r
        der += Data([0x02, 0x20])
        der += Data(repeating: 0xBB, count: 32) // s

        let raw = AttestationParser.derSignatureToRaw(der)
        #expect(raw != nil)
        #expect(raw?.count == 64)
        #expect(raw?.prefix(32) == Data(repeating: 0xAA, count: 32))
        #expect(raw?.suffix(32) == Data(repeating: 0xBB, count: 32))
    }

    @Test func derSignatureStripsLeadingZero() {
        // r with leading zero (33 bytes) -> should strip to 32
        var der = Data([0x30, 0x46, 0x02, 0x21, 0x00])
        der += Data(repeating: 0xAA, count: 32) // r (33 bytes with leading 0x00)
        der += Data([0x02, 0x21, 0x00])
        der += Data(repeating: 0xBB, count: 32) // s (33 bytes with leading 0x00)

        let raw = AttestationParser.derSignatureToRaw(der)
        #expect(raw != nil)
        #expect(raw?.count == 64)
    }

    @Test func derSignaturePadsShortR() {
        // r that's only 31 bytes -> should pad to 32
        var der = Data([0x30, 0x43, 0x02, 0x1F])
        der += Data(repeating: 0xAA, count: 31) // r (31 bytes)
        der += Data([0x02, 0x20])
        der += Data(repeating: 0xBB, count: 32) // s

        let raw = AttestationParser.derSignatureToRaw(der)
        #expect(raw != nil)
        #expect(raw?.count == 64)
        #expect(raw?[0] == 0x00) // padded
        #expect(raw?[1] == 0xAA)
    }

    @Test func derSignatureInvalidInput() {
        let raw = AttestationParser.derSignatureToRaw(Data([0x00, 0x01]))
        #expect(raw == nil)
    }

    @Test func derSignatureEmptyInput() {
        let raw = AttestationParser.derSignatureToRaw(Data())
        #expect(raw == nil)
    }
}

// MARK: - UserOperation Tests

struct UserOperationTests {

    @Test func toDictHasAllFields() {
        let userOp = UserOperation(
            sender: "0x1234567890123456789012345678901234567890",
            nonce: "0x0",
            initCode: Data(),
            callData: Data([0xAB, 0xCD]),
            verificationGasLimit: 300_000,
            callGasLimit: 100_000,
            preVerificationGas: 60_000,
            maxFeePerGas: 2_000_000_000,
            maxPriorityFeePerGas: 1_000_000_000,
            paymasterAndData: Data(),
            signature: Data([0x01, 0x02])
        )

        let dict = userOp.toDict()
        #expect(dict["sender"] == "0x1234567890123456789012345678901234567890")
        #expect(dict["nonce"] == "0x0")
        #expect(dict["initCode"] == "0x")
        #expect(dict["callData"]?.hasPrefix("0x") == true)
        #expect(dict["accountGasLimits"]?.hasPrefix("0x") == true)
        #expect(dict["preVerificationGas"]?.hasPrefix("0x") == true)
        #expect(dict["gasFees"]?.hasPrefix("0x") == true)
        #expect(dict["paymasterAndData"] == "0x")
        #expect(dict["signature"]?.hasPrefix("0x") == true)
    }

    @Test func toDictCallDataEncoding() {
        let userOp = UserOperation(
            sender: "0x0", nonce: "0x0",
            initCode: Data(), callData: Data([0xAB, 0xCD]),
            verificationGasLimit: 0, callGasLimit: 0, preVerificationGas: 0,
            maxFeePerGas: 0, maxPriorityFeePerGas: 0,
            paymasterAndData: Data(), signature: Data()
        )

        let dict = userOp.toDict()
        #expect(dict["callData"] == "0xabcd")
    }

    @Test func toDictEmptyInitCode() {
        let userOp = UserOperation(
            sender: "0x0", nonce: "0x0",
            initCode: Data(), callData: Data(),
            verificationGasLimit: 0, callGasLimit: 0, preVerificationGas: 0,
            maxFeePerGas: 0, maxPriorityFeePerGas: 0,
            paymasterAndData: Data(), signature: Data()
        )

        let dict = userOp.toDict()
        #expect(dict["initCode"] == "0x")
    }
}

// MARK: - SafeTransactionService Error Tests

struct SafeTxErrorTests {

    @Test func signatureFailedDescription() {
        let error = SafeTransactionService.SafeTxError.signatureFailed
        #expect(error.localizedDescription.contains("signature"))
    }

    @Test func estimationFailedDescription() {
        let error = SafeTransactionService.SafeTxError.estimationFailed
        #expect(error.localizedDescription.contains("gas"))
    }

    @Test func submitFailedDescription() {
        let error = SafeTransactionService.SafeTxError.submitFailed("test reason")
        #expect(error.localizedDescription.contains("test reason"))
    }

    @Test func timeoutDescription() {
        let error = SafeTransactionService.SafeTxError.timeout
        #expect(error.localizedDescription.contains("timed out"))
    }
}
