package app.getvela.wallet.service

/**
 * Computes the deterministic Safe wallet address from a P-256 public key.
 * Port of iOS SafeAddressComputer.swift — must produce identical results.
 */
object SafeAddressComputer {

    // Contract addresses (same across all EVM chains)
    const val SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67"
    const val SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762"
    const val FALLBACK_HANDLER = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99"
    const val ENTRY_POINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032"
    const val SAFE_4337_MODULE = "0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226"
    const val SAFE_MODULE_SETUP = "0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47"
    const val WEB_AUTHN_SIGNER = "0x94a4F6affBd8975951142c3999aEAB7ecee555c2"
    const val MULTI_SEND = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526"

    private const val PROXY_CREATION_CODE = "608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564"

    fun computeAddress(publicKeyHex: String): String {
        val (x, y) = parsePublicKey(publicKeyHex)
        val saltNonce = calculateSaltNonce(x, y)
        val setupData = encodeSetupData(x, y)
        return calculateProxyAddress(setupData, saltNonce)
    }

    internal fun parsePublicKey(hex: String): Pair<ByteArray, ByteArray> {
        var clean = hex.removePrefix("0x")
        if (clean.startsWith("04")) clean = clean.drop(2)
        if (clean.length != 128) return Pair(ByteArray(0), ByteArray(0))
        val x = EthCrypto.hexToBytes(clean.substring(0, 64))
        val y = EthCrypto.hexToBytes(clean.substring(64, 128))
        return Pair(x, y)
    }

    private fun calculateSaltNonce(x: ByteArray, y: ByteArray): ByteArray {
        val encoded = EthCrypto.abiEncodeBytes32(x) + EthCrypto.abiEncodeBytes32(y)
        return EthCrypto.keccak256(encoded)
    }

    internal fun encodeSetupData(x: ByteArray, y: ByteArray): ByteArray {
        // 1. enableModules([safe4337Module])
        val enableModulesSelector = EthCrypto.functionSelector("enableModules(address[])")
        val enableModulesData = enableModulesSelector +
            EthCrypto.abiEncodeUint256(32) +
            EthCrypto.abiEncodeUint256(1) +
            EthCrypto.abiEncodeAddress(SAFE_4337_MODULE)

        // 2. configure((uint256,uint256,uint176))
        val configureSelector = EthCrypto.functionSelector("configure((uint256,uint256,uint176))")
        val verifiers = EthCrypto.abiEncodeUint256Hex("100")
        val configureData = configureSelector +
            EthCrypto.abiEncodeBytes32(x) +
            EthCrypto.abiEncodeBytes32(y) +
            verifiers

        // MultiSend transactions
        val tx1 = encodeMultiSendTx(SAFE_MODULE_SETUP, enableModulesData, 1)
        val tx2 = encodeMultiSendTx(WEB_AUTHN_SIGNER, configureData, 1)
        val packed = tx1 + tx2

        // multiSend(bytes)
        val multiSendSelector = EthCrypto.functionSelector("multiSend(bytes)")
        val multiSendData = multiSendSelector +
            EthCrypto.abiEncodeUint256(32) +
            EthCrypto.abiEncodeUint256(packed.size.toLong()) +
            packed +
            ByteArray((32 - packed.size % 32) % 32)

        // Safe.setup()
        val setupSelector = EthCrypto.functionSelector(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)"
        )

        val zero = "0x0000000000000000000000000000000000000000"
        val ownersOffset = EthCrypto.abiEncodeUint256(256)
        val threshold = EthCrypto.abiEncodeUint256(1)
        val to = EthCrypto.abiEncodeAddress(MULTI_SEND)
        val dataOffset = EthCrypto.abiEncodeUint256(256 + 64)
        val fallback = EthCrypto.abiEncodeAddress(SAFE_4337_MODULE)
        val paymentToken = EthCrypto.abiEncodeAddress(zero)
        val payment = EthCrypto.abiEncodeUint256(0)
        val paymentReceiver = EthCrypto.abiEncodeAddress(zero)
        val ownersArrayLen = EthCrypto.abiEncodeUint256(1)
        val ownersArrayData = EthCrypto.abiEncodeAddress(WEB_AUTHN_SIGNER)
        val dataLen = EthCrypto.abiEncodeUint256(multiSendData.size.toLong())
        val dataPadding = ByteArray((32 - multiSendData.size % 32) % 32)

        return setupSelector +
            ownersOffset + threshold + to + dataOffset + fallback + paymentToken + payment + paymentReceiver +
            ownersArrayLen + ownersArrayData +
            dataLen + multiSendData + dataPadding
    }

    private fun encodeMultiSendTx(to: String, data: ByteArray, operation: Int): ByteArray {
        val toBytes = EthCrypto.hexToBytes(to.removePrefix("0x"))
        val result = byteArrayOf(operation.toByte()) + toBytes + ByteArray(32) // value = 0
        val lenBytes = ByteArray(32)
        val len = data.size.toLong()
        for (i in 0 until 8) lenBytes[31 - i] = ((len shr (i * 8)) and 0xFF).toByte()
        return result + lenBytes + data
    }

    private fun calculateProxyAddress(setupData: ByteArray, nonce: ByteArray): String {
        val singletonEncoded = EthCrypto.abiEncodeAddress(SAFE_SINGLETON)
        val deploymentCode = EthCrypto.hexToBytes(PROXY_CREATION_CODE) + singletonEncoded
        val initCodeHash = EthCrypto.keccak256(deploymentCode)

        val initializerHash = EthCrypto.keccak256(setupData)
        val saltInput = EthCrypto.abiEncodeBytes32(initializerHash) + EthCrypto.abiEncodeBytes32(nonce)
        val salt = EthCrypto.keccak256(saltInput)

        return EthCrypto.create2Address(SAFE_PROXY_FACTORY, salt, initCodeHash)
    }
}
