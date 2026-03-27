import Foundation

/// Computes the deterministic Safe wallet address from a P-256 public key.
/// Port of compute-safe-address.ts — must produce identical results.
enum SafeAddressComputer {

    // MARK: - Contract Addresses (all EVM chains)

    static let safeProxyFactory   = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67"
    static let safeSingleton      = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762" // SafeL2
    static let fallbackHandler    = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99"
    static let entryPoint         = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
    static let safe4337Module     = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226"
    static let safeModuleSetup    = "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47"
    static let webAuthnSigner     = "0x94a4F6affBd8975951142c3999aEAB7ecee555c2"
    static let multiSend          = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526"

    // Safe Proxy creation code (from SafeProxyFactory)
    static let proxyCreationCode = "608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564"

    // MARK: - Compute Address

    /// Compute the Safe wallet address for a given P-256 public key.
    /// - Parameter publicKeyHex: Uncompressed P-256 public key hex ("04" + x + y, 130 chars).
    /// - Returns: Checksummed Safe address.
    static func computeAddress(publicKeyHex: String) -> String {
        let (x, y) = parsePublicKey(publicKeyHex)
        let saltNonce = calculateSaltNonce(x: x, y: y)
        let setupData = encodeSetupData(x: x, y: y)
        return calculateProxyAddress(setupData: setupData, nonce: saltNonce)
    }

    // MARK: - Parse Public Key

    static func parsePublicKey(_ hex: String) -> (x: Data, y: Data) {
        var clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
        if clean.hasPrefix("04") { clean = String(clean.dropFirst(2)) }
        guard clean.count == 128 else { return (Data(), Data()) }

        let xHex = String(clean.prefix(64))
        let yHex = String(clean.suffix(64))
        return (Data(hexString: xHex)!, Data(hexString: yHex)!)
    }

    // MARK: - Salt Nonce

    /// saltNonce = keccak256(abi.encode(x, y))
    static func calculateSaltNonce(x: Data, y: Data) -> Data {
        let encoded = EthCrypto.abiEncode(bytes32: x) + EthCrypto.abiEncode(bytes32: y)
        return EthCrypto.keccak256(encoded)
    }

    // MARK: - Setup Data

    /// Encode Safe.setup() call data with MultiSend delegatecall.
    static func encodeSetupData(x: Data, y: Data) -> Data {
        // 1. enableModules([safe4337Module])
        let enableModulesSelector = EthCrypto.functionSelector("enableModules(address[])")
        let enableModulesData = enableModulesSelector
            + EthCrypto.abiEncode(uint256: 32) // offset
            + EthCrypto.abiEncode(uint256: 1)  // length
            + EthCrypto.abiEncode(address: safe4337Module)

        // 2. configure((uint256,uint256,uint176))
        let configureSelector = EthCrypto.functionSelector("configure((uint256,uint256,uint176))")
        let verifiers = EthCrypto.abiEncode(uint256Hex: "100") // RIP-7212 P256 precompile
        let configureData = configureSelector
            + EthCrypto.abiEncode(bytes32: x)
            + EthCrypto.abiEncode(bytes32: y)
            + verifiers

        // MultiSend transactions: delegatecall to moduleSetup + delegatecall to webAuthnSigner
        let tx1 = encodeMultiSendTx(to: safeModuleSetup, data: enableModulesData, operation: 1)
        let tx2 = encodeMultiSendTx(to: webAuthnSigner, data: configureData, operation: 1)
        let packed = tx1 + tx2

        // multiSend(bytes)
        let multiSendSelector = EthCrypto.functionSelector("multiSend(bytes)")
        let multiSendData = multiSendSelector
            + EthCrypto.abiEncode(uint256: 32)                    // offset
            + EthCrypto.abiEncode(uint256: UInt64(packed.count))  // length
            + packed
            + Data(repeating: 0, count: (32 - packed.count % 32) % 32) // padding

        // Safe.setup(address[],uint256,address,bytes,address,address,uint256,address)
        let setupSelector = EthCrypto.functionSelector(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)"
        )

        // Encode dynamic array for owners = [webAuthnSigner]
        // Offsets: owners(32) + threshold(32) + to(32) + data_offset(32) + fallback(32) + payment_token(32) + payment(32) + payment_receiver(32) = 256 bytes before owners array
        let ownersOffset = EthCrypto.abiEncode(uint256: 256)     // offset to owners array
        let threshold = EthCrypto.abiEncode(uint256: 1)
        let to = EthCrypto.abiEncode(address: multiSend)
        let dataOffset = EthCrypto.abiEncode(uint256: 256 + 64)  // after owners array (32 len + 32 addr)
        let fallback = EthCrypto.abiEncode(address: safe4337Module)
        let paymentToken = EthCrypto.abiEncode(address: "0x0000000000000000000000000000000000000000")
        let payment = EthCrypto.abiEncode(uint256: 0)
        let paymentReceiver = EthCrypto.abiEncode(address: "0x0000000000000000000000000000000000000000")

        // owners array: length=1, [webAuthnSigner]
        let ownersArrayLen = EthCrypto.abiEncode(uint256: 1)
        let ownersArrayData = EthCrypto.abiEncode(address: webAuthnSigner)

        // multiSendData as bytes: length + data + padding
        let dataLen = EthCrypto.abiEncode(uint256: UInt64(multiSendData.count))
        let dataPadding = Data(repeating: 0, count: (32 - multiSendData.count % 32) % 32)

        return setupSelector
            + ownersOffset + threshold + to + dataOffset + fallback + paymentToken + payment + paymentReceiver
            + ownersArrayLen + ownersArrayData
            + dataLen + multiSendData + dataPadding
    }

    // MARK: - MultiSend Transaction Encoding

    /// Encode a single transaction for MultiSend.
    /// Format: operation(1) + to(20) + value(32) + dataLength(32) + data
    private static func encodeMultiSendTx(to: String, data: Data, operation: UInt8) -> Data {
        let toBytes = Data(hexString: to.hasPrefix("0x") ? String(to.dropFirst(2)) : to)!
        var result = Data([operation])  // 1 byte
        result += toBytes               // 20 bytes
        result += Data(repeating: 0, count: 32) // value = 0, 32 bytes
        // data length as 32 bytes big-endian
        var lenBytes = Data(repeating: 0, count: 32)
        let len = UInt64(data.count)
        for i in 0..<8 { lenBytes[31 - i] = UInt8((len >> (i * 8)) & 0xFF) }
        result += lenBytes
        result += data
        return result
    }

    // MARK: - Proxy Address Calculation

    /// Calculate CREATE2 address for Safe Proxy.
    private static func calculateProxyAddress(setupData: Data, nonce: Data) -> String {
        // deploymentCode = proxyCreationCode + abi.encode(safeSingleton)
        let singletonEncoded = EthCrypto.abiEncode(address: safeSingleton)
        let deploymentCode = Data(hexString: proxyCreationCode)! + singletonEncoded
        let initCodeHash = EthCrypto.keccak256(deploymentCode)

        // salt = keccak256(abi.encode(keccak256(setupData), nonce))
        let initializerHash = EthCrypto.keccak256(setupData)
        let saltInput = EthCrypto.abiEncode(bytes32: initializerHash) + EthCrypto.abiEncode(bytes32: nonce)
        let salt = EthCrypto.keccak256(saltInput)

        return EthCrypto.create2Address(factory: safeProxyFactory, salt: salt, initCodeHash: initCodeHash)
    }
}
