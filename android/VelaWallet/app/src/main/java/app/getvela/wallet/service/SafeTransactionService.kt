package app.getvela.wallet.service

import android.app.Activity
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

private const val TAG = "SafeTx"

/**
 * Builds, signs, and submits ERC-4337 UserOperations for Safe wallets.
 * Port of iOS SafeTransactionService.swift.
 */
class SafeTransactionService {

    companion object {
        const val VERIFICATION_GAS_DEPLOYED: Long = 300_000
        const val VERIFICATION_GAS_UNDEPLOYED: Long = 600_000
        const val CALL_GAS_LIMIT: Long = 150_000
        const val PRE_VERIFICATION_GAS: Long = 60_000
    }

    private val passkeyService = PasskeyService()

    data class TransactionResult(val userOpHash: String, val txHash: String)

    // MARK: - Send Native Token

    suspend fun sendNative(
        activity: Activity,
        safeAddress: String,
        to: String,
        valueWei: String,
        chainId: Int,
        publicKeyHex: String,
    ): TransactionResult {
        val callData = buildExecuteCallData(to, valueWei, ByteArray(0))
        return sendUserOp(activity, safeAddress, callData, chainId, publicKeyHex)
    }

    // MARK: - Send ERC-20

    suspend fun sendERC20(
        activity: Activity,
        safeAddress: String,
        tokenAddress: String,
        to: String,
        amountWei: String,
        chainId: Int,
        publicKeyHex: String,
    ): TransactionResult {
        val transferSelector = EthCrypto.functionSelector("transfer(address,uint256)")
        val transferData = transferSelector +
            EthCrypto.abiEncodeAddress(to) +
            EthCrypto.abiEncodeUint256Hex(amountWei)
        val callData = buildExecuteCallData(tokenAddress, "0", transferData)
        return sendUserOp(activity, safeAddress, callData, chainId, publicKeyHex)
    }

    // MARK: - Send Contract Call

    suspend fun sendContractCall(
        activity: Activity,
        safeAddress: String,
        to: String,
        valueWei: String,
        data: ByteArray,
        chainId: Int,
        publicKeyHex: String,
    ): TransactionResult {
        val callData = buildExecuteCallData(to, valueWei, data)
        return sendUserOp(activity, safeAddress, callData, chainId, publicKeyHex)
    }

    // MARK: - Core UserOp Flow

    private suspend fun sendUserOp(
        activity: Activity,
        safeAddress: String,
        callData: ByteArray,
        chainId: Int,
        publicKeyHex: String,
    ): TransactionResult = withContext(Dispatchers.IO) {
        // 1. Check deployment
        val deployed = isDeployed(safeAddress, chainId)

        // 2. InitCode
        val initCode = if (deployed) ByteArray(0) else buildInitCode(publicKeyHex)

        // 3. Nonce
        val nonce = if (deployed) getNonce(safeAddress, chainId) else "0x0"

        // 4. Gas prices
        val (maxFee, maxPriority) = getGasPrices(chainId)

        // 5. Gas estimates
        var verificationGas = if (deployed) VERIFICATION_GAS_DEPLOYED else VERIFICATION_GAS_UNDEPLOYED
        var callGas = CALL_GAS_LIMIT
        var preVerification = PRE_VERIFICATION_GAS

        // 6. Build UserOp with dummy sig
        val dummySig = buildDummySignature()
        val userOp = UserOperation(
            sender = safeAddress, nonce = nonce, initCode = initCode,
            callData = callData, verificationGasLimit = verificationGas,
            callGasLimit = callGas, preVerificationGas = preVerification,
            maxFeePerGas = maxFee, maxPriorityFeePerGas = maxPriority,
            paymasterAndData = ByteArray(0), signature = dummySig,
        )

        // 7. Estimate gas
        try {
            val est = estimateGas(userOp, chainId)
            userOp.verificationGasLimit = maxOf(userOp.verificationGasLimit, est.verificationGasLimit * 13 / 10)
            userOp.callGasLimit = maxOf(userOp.callGasLimit, est.callGasLimit * 13 / 10)
            userOp.preVerificationGas = maxOf(userOp.preVerificationGas, est.preVerificationGas + 5000)
        } catch (e: Exception) {
            Log.d(TAG, "Gas estimation failed, using defaults: ${e.message}")
        }

        // 8. SafeOp hash
        val safeOpHash = calculateSafeOpHash(userOp, chainId)

        // 9. Sign with passkey (on main thread for UI)
        val assertion = withContext(Dispatchers.Main) {
            passkeyService.sign(activity, safeOpHash)
        }

        // 10. Build real signature
        val derSig = assertion.signature ?: throw Exception("No signature returned")
        val rawSig = passkeyService.derSignatureToRaw(derSig) ?: throw Exception("DER→raw conversion failed")

        val clientDataJSON = assertion.clientDataJSON ?: ByteArray(0)
        val authenticatorData = assertion.authenticatorData ?: ByteArray(0)
        val clientDataFields = extractClientDataFields(clientDataJSON)

        val realSig = buildUserOpSignature(authenticatorData, clientDataFields, rawSig.copyOfRange(0, 32), rawSig.copyOfRange(32, 64))
        userOp.signature = realSig

        // 11. Submit
        val userOpHash = submitUserOp(userOp, chainId)

        // 12. Wait for receipt
        val txHash = waitForReceipt(userOpHash, chainId)

        TransactionResult(userOpHash, txHash)
    }

    // MARK: - CallData

    private fun buildExecuteCallData(to: String, value: String, data: ByteArray): ByteArray {
        val selector = EthCrypto.functionSelector("executeUserOp(address,uint256,bytes,uint8)")
        val toEncoded = EthCrypto.abiEncodeAddress(to)
        val valueEncoded = EthCrypto.abiEncodeUint256Hex(value)
        val dataOffset = EthCrypto.abiEncodeUint256(128)
        val operation = EthCrypto.abiEncodeUint256(0)
        val dataLen = EthCrypto.abiEncodeUint256(data.size.toLong())
        val dataPadding = ByteArray((32 - data.size % 32) % 32)
        return selector + toEncoded + valueEncoded + dataOffset + operation + dataLen + data + dataPadding
    }

    // MARK: - InitCode

    private fun buildInitCode(publicKeyHex: String): ByteArray {
        val (x, y) = SafeAddressComputer.parsePublicKey(publicKeyHex)
        val setupData = SafeAddressComputer.encodeSetupData(x, y)
        val saltNonce = EthCrypto.keccak256(EthCrypto.abiEncodeBytes32(x) + EthCrypto.abiEncodeBytes32(y))

        val selector = EthCrypto.functionSelector("createProxyWithNonce(address,bytes,uint256)")
        val singletonEncoded = EthCrypto.abiEncodeAddress(SafeAddressComputer.SAFE_SINGLETON)
        val dataOffset = EthCrypto.abiEncodeUint256(96)
        val saltEncoded = EthCrypto.abiEncodeBytes32(saltNonce)
        val dataLen = EthCrypto.abiEncodeUint256(setupData.size.toLong())
        val dataPadding = ByteArray((32 - setupData.size % 32) % 32)

        val createData = selector + singletonEncoded + dataOffset + saltEncoded + dataLen + setupData + dataPadding
        val factoryBytes = EthCrypto.hexToBytes(SafeAddressComputer.SAFE_PROXY_FACTORY.removePrefix("0x"))
        return factoryBytes + createData
    }

    // MARK: - SafeOp Hash (EIP-712)

    private fun calculateSafeOpHash(userOp: UserOperation, chainId: Int): ByteArray {
        val typeHash = EthCrypto.keccak256(
            "SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)".toByteArray()
        )

        val structHash = EthCrypto.keccak256(
            typeHash +
            EthCrypto.abiEncodeAddress(userOp.sender) +
            EthCrypto.abiEncodeUint256Hex(userOp.nonce) +
            EthCrypto.keccak256(userOp.initCode) +
            EthCrypto.keccak256(userOp.callData) +
            EthCrypto.abiEncodeUint256(userOp.verificationGasLimit) +
            EthCrypto.abiEncodeUint256(userOp.callGasLimit) +
            EthCrypto.abiEncodeUint256(userOp.preVerificationGas) +
            EthCrypto.abiEncodeUint256(userOp.maxPriorityFeePerGas) +
            EthCrypto.abiEncodeUint256(userOp.maxFeePerGas) +
            EthCrypto.keccak256(userOp.paymasterAndData) +
            EthCrypto.abiEncodeUint256(0) + // validAfter
            EthCrypto.abiEncodeUint256(0) + // validUntil
            EthCrypto.abiEncodeAddress(SafeAddressComputer.ENTRY_POINT)
        )

        val domainTypeHash = EthCrypto.keccak256("EIP712Domain(uint256 chainId,address verifyingContract)".toByteArray())
        val domainSeparator = EthCrypto.keccak256(
            domainTypeHash +
            EthCrypto.abiEncodeUint256(chainId.toLong()) +
            EthCrypto.abiEncodeAddress(SafeAddressComputer.SAFE_4337_MODULE)
        )

        return EthCrypto.keccak256(byteArrayOf(0x19, 0x01) + domainSeparator + structHash)
    }

    // MARK: - WebAuthn Signature

    private fun extractClientDataFields(clientDataJSON: ByteArray): String {
        val json = String(clientDataJSON)
        val key = "\"challenge\":\""
        val keyIdx = json.indexOf(key)
        if (keyIdx == -1) return ""
        val valueStart = keyIdx + key.length
        val closeQuote = json.indexOf('"', valueStart)
        if (closeQuote == -1) return ""
        val skipIdx = closeQuote + 2 // skip `",`
        val endIdx = json.length - 1 // skip `}`
        if (skipIdx >= endIdx) return ""
        return json.substring(skipIdx, endIdx)
    }

    private fun buildUserOpSignature(
        authenticatorData: ByteArray,
        clientDataFields: String,
        sigR: ByteArray,
        sigS: ByteArray,
    ): ByteArray {
        var sig = ByteArray(12) // validAfter(6) + validUntil(6)
        sig += EthCrypto.abiEncodeAddress(SafeAddressComputer.WEB_AUTHN_SIGNER) // r = signer
        sig += EthCrypto.abiEncodeUint256(65) // s = offset
        sig += byteArrayOf(0x00) // v = contract sig

        val dynamicData = abiEncodeWebAuthnSig(authenticatorData, clientDataFields, sigR, sigS)
        sig += EthCrypto.abiEncodeUint256(dynamicData.size.toLong())
        sig += dynamicData
        return sig
    }

    private fun abiEncodeWebAuthnSig(
        authenticatorData: ByteArray,
        clientDataFields: String,
        r: ByteArray,
        s: ByteArray,
    ): ByteArray {
        val clientFieldsBytes = clientDataFields.toByteArray()

        val authPadLen = (32 - authenticatorData.size % 32) % 32
        val authTail = EthCrypto.abiEncodeUint256(authenticatorData.size.toLong()) + authenticatorData + ByteArray(authPadLen)

        val clientPadLen = (32 - clientFieldsBytes.size % 32) % 32
        val clientTail = EthCrypto.abiEncodeUint256(clientFieldsBytes.size.toLong()) + clientFieldsBytes + ByteArray(clientPadLen)

        val authDataOffset: Long = 128
        val clientDataOffset = authDataOffset + authTail.size

        return EthCrypto.abiEncodeUint256(authDataOffset) +
            EthCrypto.abiEncodeUint256(clientDataOffset) +
            EthCrypto.abiEncodeBytes32(r) +
            EthCrypto.abiEncodeBytes32(s) +
            authTail +
            clientTail
    }

    private fun buildDummySignature(): ByteArray {
        var sig = ByteArray(12)
        sig += EthCrypto.abiEncodeAddress(SafeAddressComputer.WEB_AUTHN_SIGNER)
        sig += EthCrypto.abiEncodeUint256(65)
        sig += byteArrayOf(0x00)

        val fakeAuthData = byteArrayOf(0x01) + ByteArray(36)
        val fakeClientFields = "\"origin\":\"https://getvela.app\",\"crossOrigin\":false"
        val fakeR = ByteArray(31) + byteArrayOf(0x01)
        val fakeS = ByteArray(31) + byteArrayOf(0x01)

        val dynamicData = abiEncodeWebAuthnSig(fakeAuthData, fakeClientFields, fakeR, fakeS)
        sig += EthCrypto.abiEncodeUint256(dynamicData.size.toLong())
        sig += dynamicData
        return sig
    }

    // MARK: - RPC Calls

    private fun isDeployed(address: String, chainId: Int): Boolean {
        val params = JSONArray().put(address).put("latest")
        val response = RPCAdapter.call("eth_getCode", params, chainId)
        val json = JSONObject(response)
        val result = json.optString("result", "0x")
        return result != "0x" && result.length > 2
    }

    private fun getNonce(safeAddress: String, chainId: Int): String {
        val selector = EthCrypto.bytesToHex(EthCrypto.functionSelector("getNonce(address,uint192)"))
        val addressEncoded = EthCrypto.bytesToHex(EthCrypto.abiEncodeAddress(safeAddress))
        val keyEncoded = EthCrypto.bytesToHex(EthCrypto.abiEncodeUint256(0))
        val callData = "0x$selector$addressEncoded$keyEncoded"

        val callObj = JSONObject().put("to", SafeAddressComputer.ENTRY_POINT).put("data", callData)
        val params = JSONArray().put(callObj).put("latest")
        val response = RPCAdapter.call("eth_call", params, chainId)
        val json = JSONObject(response)
        return json.optString("result", "0x0")
    }

    private fun getGasPrices(chainId: Int): Pair<Long, Long> {
        // Try pimlico first
        try {
            val response = RPCAdapter.call("pimlico_getUserOperationGasPrice", JSONArray(), chainId)
            val json = JSONObject(response)
            val result = json.optJSONObject("result")
            val fast = result?.optJSONObject("fast")
            if (fast != null) {
                val maxFee = fast.getString("maxFeePerGas").removePrefix("0x").toLong(16)
                val maxPriority = fast.getString("maxPriorityFeePerGas").removePrefix("0x").toLong(16)
                if (maxFee > 0) return Pair(maxFee, maxPriority)
            }
        } catch (_: Exception) {}

        // Fallback
        val response = RPCAdapter.call("eth_gasPrice", JSONArray(), chainId)
        val json = JSONObject(response)
        val gasPrice = json.optString("result", "0x0").removePrefix("0x").toLongOrNull(16) ?: 50_000_000_000L
        return Pair(gasPrice * 3 / 2, gasPrice)
    }

    private data class GasEstimate(val verificationGasLimit: Long, val callGasLimit: Long, val preVerificationGas: Long)

    private fun estimateGas(userOp: UserOperation, chainId: Int): GasEstimate {
        val params = JSONArray().put(JSONObject(userOp.toDict())).put(SafeAddressComputer.ENTRY_POINT)
        val response = RPCAdapter.call("eth_estimateUserOperationGas", params, chainId)
        val json = JSONObject(response)
        val result = json.optJSONObject("result") ?: throw Exception("No result in gas estimation")
        return GasEstimate(
            verificationGasLimit = parseHexLong(result.optString("verificationGasLimit")),
            callGasLimit = parseHexLong(result.optString("callGasLimit")),
            preVerificationGas = parseHexLong(result.optString("preVerificationGas")),
        )
    }

    private fun submitUserOp(userOp: UserOperation, chainId: Int): String {
        val params = JSONArray().put(JSONObject(userOp.toDict())).put(SafeAddressComputer.ENTRY_POINT)
        val response = RPCAdapter.call("eth_sendUserOperation", params, chainId)
        val json = JSONObject(response)
        return json.optString("result", "").ifEmpty {
            throw Exception("Submit failed: ${json.optJSONObject("error")}")
        }
    }

    private suspend fun waitForReceipt(userOpHash: String, chainId: Int, timeoutMs: Long = 120_000): String {
        val start = System.currentTimeMillis()
        while (System.currentTimeMillis() - start < timeoutMs) {
            try {
                val params = JSONArray().put(userOpHash)
                val response = withContext(Dispatchers.IO) { RPCAdapter.call("eth_getUserOperationReceipt", params, chainId) }
                val json = JSONObject(response)
                val receipt = json.optJSONObject("result")?.optJSONObject("receipt")
                val txHash = receipt?.optString("transactionHash")
                if (!txHash.isNullOrEmpty()) return txHash
            } catch (_: Exception) {}
            delay(1500)
        }
        throw Exception("Transaction timed out waiting for confirmation")
    }

    private fun parseHexLong(hex: String?): Long {
        if (hex.isNullOrEmpty()) return 0
        return hex.removePrefix("0x").toLongOrNull(16) ?: 0
    }
}

// MARK: - UserOperation

data class UserOperation(
    val sender: String,
    val nonce: String,
    val initCode: ByteArray,
    val callData: ByteArray,
    var verificationGasLimit: Long,
    var callGasLimit: Long,
    var preVerificationGas: Long,
    val maxFeePerGas: Long,
    val maxPriorityFeePerGas: Long,
    val paymasterAndData: ByteArray,
    var signature: ByteArray,
) {
    fun toDict(): Map<String, Any> {
        val dict = mutableMapOf<String, Any>(
            "sender" to sender,
            "nonce" to nonce,
            "callData" to "0x${EthCrypto.bytesToHex(callData)}",
            "callGasLimit" to "0x${callGasLimit.toString(16)}",
            "verificationGasLimit" to "0x${verificationGasLimit.toString(16)}",
            "preVerificationGas" to "0x${preVerificationGas.toString(16)}",
            "maxFeePerGas" to "0x${maxFeePerGas.toString(16)}",
            "maxPriorityFeePerGas" to "0x${maxPriorityFeePerGas.toString(16)}",
            "signature" to "0x${EthCrypto.bytesToHex(signature)}",
        )

        if (initCode.size >= 20) {
            dict["factory"] = "0x${EthCrypto.bytesToHex(initCode.copyOfRange(0, 20))}"
            dict["factoryData"] = "0x${EthCrypto.bytesToHex(initCode.copyOfRange(20, initCode.size))}"
        }

        return dict
    }
}
