import Foundation

/// Builds, signs, and submits ERC-4337 UserOperations for Safe wallets.
final class SafeTransactionService {
    private let bundlerAPI = WalletAPIService()
    private let passkeyService = PasskeyService()

    // MARK: - Send Native Token

    /// Send native token (ETH, POL, BNB, etc.)
    @MainActor
    func sendNative(
        from safeAddress: String,
        to: String,
        valueWei: String,
        network: String,
        chainId: Int,
        publicKeyHex: String
    ) async throws -> TransactionResult {
        // callData: executeUserOp(to, value, "0x", 0)
        let callData = buildExecuteCallData(to: to, value: valueWei, data: Data())
        return try await sendUserOp(
            safeAddress: safeAddress,
            callData: callData,
            network: network,
            chainId: chainId,
            publicKeyHex: publicKeyHex
        )
    }

    // MARK: - Send ERC-20 Token

    /// Send ERC-20 token.
    @MainActor
    func sendERC20(
        from safeAddress: String,
        tokenAddress: String,
        to: String,
        amountWei: String,
        network: String,
        chainId: Int,
        publicKeyHex: String
    ) async throws -> TransactionResult {
        // ERC-20 transfer(address,uint256)
        let transferSelector = EthCrypto.functionSelector("transfer(address,uint256)")
        let transferData = transferSelector
            + EthCrypto.abiEncode(address: to)
            + EthCrypto.abiEncode(uint256Hex: amountWei)

        // callData: executeUserOp(tokenAddress, 0, transfer(...), 0)
        let callData = buildExecuteCallData(to: tokenAddress, value: "0", data: transferData)
        return try await sendUserOp(
            safeAddress: safeAddress,
            callData: callData,
            network: network,
            chainId: chainId,
            publicKeyHex: publicKeyHex
        )
    }

    // MARK: - Core UserOp Flow

    @MainActor
    private func sendUserOp(
        safeAddress: String,
        callData: Data,
        network: String,
        chainId: Int,
        publicKeyHex: String
    ) async throws -> TransactionResult {
        // 1. Check if deployed
        let deployed = try await isDeployed(address: safeAddress, network: network)

        // 2. Build initCode if needed
        let initCode: Data = deployed ? Data() : buildInitCode(publicKeyHex: publicKeyHex)

        // 3. Get nonce (0 for undeployed wallets)
        let nonce: String = deployed ? try await getNonce(safeAddress: safeAddress, network: network) : "0x0"

        // 4. Get gas prices
        let (maxFee, maxPriority) = try await getGasPrices(network: network)

        // 5. Initial gas estimates
        let verificationGas: UInt64 = deployed ? 300_000 : 600_000
        let callGas: UInt64 = 150_000
        let preVerificationGas: UInt64 = 60_000

        // 6. Build dummy UserOp for gas estimation
        let dummySig = buildDummySignature()
        var userOp = UserOperation(
            sender: safeAddress,
            nonce: nonce,
            initCode: initCode,
            callData: callData,
            verificationGasLimit: verificationGas,
            callGasLimit: callGas,
            preVerificationGas: preVerificationGas,
            maxFeePerGas: maxFee,
            maxPriorityFeePerGas: maxPriority,
            paymasterAndData: Data(),
            signature: dummySig
        )

        // 7. Estimate gas via bundler
        if let estimated = try? await estimateGas(userOp: userOp, network: network) {
            userOp.verificationGasLimit = max(userOp.verificationGasLimit, estimated.verificationGasLimit * 13 / 10)
            userOp.callGasLimit = max(userOp.callGasLimit, estimated.callGasLimit * 13 / 10)
            userOp.preVerificationGas = max(userOp.preVerificationGas, estimated.preVerificationGas + 5000)
        }

        // 8. Calculate SafeOp hash (EIP-712)
        let safeOpHash = calculateSafeOpHash(userOp: userOp, chainId: chainId)

        // 9. Sign with Passkey (triggers Face ID)
        let assertion = try await passkeyService.sign(data: safeOpHash)

        // 10. Build real signature
        guard let derSig = assertion.signature,
              let rawSig = AttestationParser.derSignatureToRaw(derSig) else {
            throw SafeTxError.signatureFailed
        }

        let clientDataJSON = assertion.clientDataJSON ?? Data()
        let authenticatorData = assertion.authenticatorData ?? Data()
        let clientDataFields = extractClientDataFields(from: clientDataJSON)

        print("[WebAuthn] authenticatorData: \(authenticatorData.hexString)")
        print("[WebAuthn] sigR: \(rawSig.prefix(32).hexString)")
        print("[WebAuthn] sigS: \(rawSig.suffix(32).hexString)")

        let realSig = buildUserOpSignature(
            authenticatorData: authenticatorData,
            clientDataFields: clientDataFields,
            sigR: rawSig.prefix(32),
            sigS: rawSig.suffix(32)
        )
        userOp.signature = realSig

        // 11. Submit to bundler
        let userOpHash = try await submitUserOp(userOp: userOp, network: network)

        // 12. Wait for receipt
        let txHash = try await waitForReceipt(userOpHash: userOpHash, network: network)

        return TransactionResult(userOpHash: userOpHash, txHash: txHash)
    }

    // MARK: - CallData

    /// Encode Safe.executeUserOp(address to, uint256 value, bytes data, uint8 operation)
    private func buildExecuteCallData(to: String, value: String, data: Data) -> Data {
        let selector = EthCrypto.functionSelector("executeUserOp(address,uint256,bytes,uint8)")
        let toEncoded = EthCrypto.abiEncode(address: to)
        let valueEncoded = EthCrypto.abiEncode(uint256Hex: value)
        let dataOffset = EthCrypto.abiEncode(uint256: 128) // 4 * 32 bytes
        let operation = EthCrypto.abiEncode(uint256: 0) // CALL
        let dataLen = EthCrypto.abiEncode(uint256: UInt64(data.count))
        let dataPadding = Data(repeating: 0, count: (32 - data.count % 32) % 32)

        return selector + toEncoded + valueEncoded + dataOffset + operation + dataLen + data + dataPadding
    }

    // MARK: - InitCode

    private func buildInitCode(publicKeyHex: String) -> Data {
        let (x, y) = SafeAddressComputer.parsePublicKey(publicKeyHex)
        let setupData = SafeAddressComputer.encodeSetupData(x: x, y: y)
        let saltNonce = SafeAddressComputer.calculateSaltNonce(x: x, y: y)

        // createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce)
        let selector = EthCrypto.functionSelector("createProxyWithNonce(address,bytes,uint256)")
        let singletonEncoded = EthCrypto.abiEncode(address: SafeAddressComputer.safeSingleton)
        let dataOffset = EthCrypto.abiEncode(uint256: 96) // 3 * 32
        let saltEncoded = EthCrypto.abiEncode(bytes32: saltNonce)
        let dataLen = EthCrypto.abiEncode(uint256: UInt64(setupData.count))
        let dataPadding = Data(repeating: 0, count: (32 - setupData.count % 32) % 32)

        let createData = selector + singletonEncoded + dataOffset + saltEncoded + dataLen + setupData + dataPadding

        let factoryBytes = Data(hexString: String(SafeAddressComputer.safeProxyFactory.dropFirst(2)))!
        return factoryBytes + createData
    }

    // MARK: - SafeOp Hash (EIP-712)

    private func calculateSafeOpHash(userOp: UserOperation, chainId: Int) -> Data {
        let typeHash = EthCrypto.keccak256(Data("SafeOp(address safe,uint256 nonce,bytes initCode,bytes callData,uint128 verificationGasLimit,uint128 callGasLimit,uint256 preVerificationGas,uint128 maxPriorityFeePerGas,uint128 maxFeePerGas,bytes paymasterAndData,uint48 validAfter,uint48 validUntil,address entryPoint)".utf8))

        let structHash = EthCrypto.keccak256(
            typeHash
            + EthCrypto.abiEncode(address: userOp.sender)
            + EthCrypto.abiEncode(uint256Hex: userOp.nonce)
            + EthCrypto.keccak256(userOp.initCode)  // hash of dynamic
            + EthCrypto.keccak256(userOp.callData)   // hash of dynamic
            + EthCrypto.abiEncode(uint256: userOp.verificationGasLimit)
            + EthCrypto.abiEncode(uint256: userOp.callGasLimit)
            + EthCrypto.abiEncode(uint256: userOp.preVerificationGas)
            + EthCrypto.abiEncode(uint256: userOp.maxPriorityFeePerGas)
            + EthCrypto.abiEncode(uint256: userOp.maxFeePerGas)
            + EthCrypto.keccak256(userOp.paymasterAndData) // hash of dynamic
            + EthCrypto.abiEncode(uint256: 0) // validAfter
            + EthCrypto.abiEncode(uint256: 0) // validUntil
            + EthCrypto.abiEncode(address: SafeAddressComputer.entryPoint)
        )

        // Domain separator
        let domainTypeHash = EthCrypto.keccak256(Data("EIP712Domain(uint256 chainId,address verifyingContract)".utf8))
        let domainSeparator = EthCrypto.keccak256(
            domainTypeHash
            + EthCrypto.abiEncode(uint256: UInt64(chainId))
            + EthCrypto.abiEncode(address: SafeAddressComputer.safe4337Module)
        )

        // Final hash: keccak256(0x1901 || domainSeparator || structHash)
        return EthCrypto.keccak256(Data([0x19, 0x01]) + domainSeparator + structHash)
    }

    // MARK: - WebAuthn Signature

    /// Extract clientDataFields from clientDataJSON.
    ///
    /// clientDataJSON format:
    ///   {"type":"webauthn.get","challenge":"<b64url>","origin":"https://...","crossOrigin":false}
    ///
    /// clientDataFields = everything after challenge's closing `",` up to (but not including) final `}`
    ///   e.g.: "origin":"https://getvela.app","crossOrigin":false
    ///
    /// The contract template already includes `,"` before this, so we must NOT include the leading comma.
    private func extractClientDataFields(from clientDataJSON: Data) -> String {
        guard let json = String(data: clientDataJSON, encoding: .utf8) else { return "" }

        // Find "challenge":"
        let key = "\"challenge\":\""
        guard let keyRange = json.range(of: key) else { return "" }

        // Find the closing quote of the challenge value
        let valueStart = keyRange.upperBound
        var searchIndex = valueStart
        while searchIndex < json.endIndex {
            if json[searchIndex] == "\"" { break }
            searchIndex = json.index(after: searchIndex)
        }
        guard searchIndex < json.endIndex else { return "" }

        // Skip 2 chars: closing `"` and `,` → start at the next field
        let skipIndex = json.index(searchIndex, offsetBy: 2, limitedBy: json.endIndex) ?? json.endIndex
        // Take everything up to the final `}`
        let endIndex = json.index(before: json.endIndex) // skip `}`
        guard skipIndex < endIndex else { return "" }

        let fields = String(json[skipIndex..<endIndex])
        print("[WebAuthn] clientDataFields: \(fields)")
        return fields
    }

    /// Build contract signature for SafeWebAuthnSharedSigner.
    ///
    /// Format: validAfter(6) + validUntil(6) + r(32) + s(32) + v(1) + dataLength(32) + dynamicData
    /// Where r = signer address padded, s = 65 (offset), v = 0x00 (contract sig type)
    /// dynamicData = abi.encode(bytes authenticatorData, string clientDataFields, uint256 sigR, uint256 sigS)
    private func buildUserOpSignature(
        authenticatorData: Data,
        clientDataFields: String,
        sigR: Data,
        sigS: Data
    ) -> Data {
        // Validity window: validAfter(6) + validUntil(6) = 12 bytes of zeros
        var sig = Data(repeating: 0, count: 12)

        // Contract signature header: r(32) + s(32) + v(1)
        sig += EthCrypto.abiEncode(address: SafeAddressComputer.webAuthnSigner) // r = signer address
        sig += EthCrypto.abiEncode(uint256: 65) // s = offset to dynamic data (after r+s+v)
        sig += Data([0x00]) // v = 0x00 = contract signature

        // Dynamic data: abi.encode(bytes, string, uint256, uint256)
        let dynamicData = abiEncodeWebAuthnSig(
            authenticatorData: authenticatorData,
            clientDataFields: clientDataFields,
            r: sigR,
            s: sigS
        )
        sig += EthCrypto.abiEncode(uint256: UInt64(dynamicData.count))
        sig += dynamicData

        return sig
    }

    /// ABI encode: (bytes authenticatorData, string clientDataFields, uint256 r, uint256 s)
    /// Matches TypeScript: encodeAbiParameters([{type:'bytes'},{type:'string'},{type:'uint256'},{type:'uint256'}], ...)
    private func abiEncodeWebAuthnSig(authenticatorData: Data, clientDataFields: String, r: Data, s: Data) -> Data {
        let clientFieldsBytes = Data(clientDataFields.utf8)

        // Head: 4 slots (offsets for dynamic types, inline for static types)
        // slot 0: offset to authenticatorData (bytes) = 4 * 32 = 128
        // slot 1: offset to clientDataFields (string) = calculated after authData
        // slot 2: r (uint256, inline)
        // slot 3: s (uint256, inline)

        // Tail parts
        // authenticatorData: length(32) + padded data
        let authPadLen = (32 - authenticatorData.count % 32) % 32
        let authTail = EthCrypto.abiEncode(uint256: UInt64(authenticatorData.count))
            + authenticatorData
            + Data(repeating: 0, count: authPadLen)

        // clientDataFields: length(32) + padded data
        let clientPadLen = (32 - clientFieldsBytes.count % 32) % 32
        let clientTail = EthCrypto.abiEncode(uint256: UInt64(clientFieldsBytes.count))
            + clientFieldsBytes
            + Data(repeating: 0, count: clientPadLen)

        let authDataOffset: UInt64 = 128 // 4 * 32
        let clientDataOffset: UInt64 = authDataOffset + UInt64(authTail.count)

        var result = Data()
        result += EthCrypto.abiEncode(uint256: authDataOffset)
        result += EthCrypto.abiEncode(uint256: clientDataOffset)
        result += EthCrypto.abiEncode(bytes32: r)
        result += EthCrypto.abiEncode(bytes32: s)
        result += authTail
        result += clientTail

        return result
    }

    /// Build a dummy signature for gas estimation.
    private func buildDummySignature() -> Data {
        var sig = Data(repeating: 0, count: 12)
        sig += EthCrypto.abiEncode(address: SafeAddressComputer.webAuthnSigner)
        sig += EthCrypto.abiEncode(uint256: 65)
        sig += Data([0x00])

        let fakeAuthData = Data([0x01]) + Data(repeating: 0, count: 36) // 37 bytes, right-padded
        let fakeClientFields = "\"origin\":\"https://getvela.app\",\"crossOrigin\":false"
        let fakeR = Data(repeating: 0, count: 31) + Data([0x01])
        let fakeS = Data(repeating: 0, count: 31) + Data([0x01])

        let dynamicData = abiEncodeWebAuthnSig(
            authenticatorData: fakeAuthData,
            clientDataFields: fakeClientFields,
            r: fakeR,
            s: fakeS
        )
        sig += EthCrypto.abiEncode(uint256: UInt64(dynamicData.count))
        sig += dynamicData
        return sig
    }

    // MARK: - Bundler RPC Calls

    private func isDeployed(address: String, network: String) async throws -> Bool {
        let data = try await bundlerAPI.bundlerRequest(
            method: "eth_getCode",
            params: [address, "latest"],
            network: network
        )
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = json["result"] as? String else { return false }
        return result != "0x" && result.count > 2
    }

    private func getNonce(safeAddress: String, network: String) async throws -> String {
        let selector = EthCrypto.functionSelector("getNonce(address,uint192)").hexString
        let addressEncoded = EthCrypto.abiEncode(address: safeAddress).hexString
        let keyEncoded = EthCrypto.abiEncode(uint256: 0).hexString
        let callData = "0x" + selector + addressEncoded + keyEncoded

        let data = try await bundlerAPI.bundlerRequest(
            method: "eth_call",
            params: [["to": SafeAddressComputer.entryPoint, "data": callData], "latest"],
            network: network
        )

        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = json["result"] as? String else { return "0x0" }
        return result
    }

    private func getGasPrices(network: String) async throws -> (maxFee: UInt64, maxPriority: UInt64) {
        // Try pimlico_getUserOperationGasPrice first (recommended by Pimlico)
        if let data = try? await bundlerAPI.bundlerRequest(
            method: "pimlico_getUserOperationGasPrice",
            params: [],
            network: network
        ),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let result = json["result"] as? [String: Any],
           let fast = result["fast"] as? [String: Any],
           let maxFeeHex = fast["maxFeePerGas"] as? String,
           let maxPriorityHex = fast["maxPriorityFeePerGas"] as? String {
            let maxFee = UInt64(maxFeeHex.dropFirst(2), radix: 16) ?? 0
            let maxPriority = UInt64(maxPriorityHex.dropFirst(2), radix: 16) ?? 0
            if maxFee > 0 {
                print("[Gas] pimlico price: maxFee=\(maxFee), maxPriority=\(maxPriority)")
                return (maxFee, maxPriority)
            }
        }

        // Fallback: eth_gasPrice * 1.5
        let data = try await bundlerAPI.bundlerRequest(
            method: "eth_gasPrice",
            params: [],
            network: network
        )
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = json["result"] as? String else {
            return (50_000_000_000, 25_000_000_000)
        }
        let gasPrice = UInt64(String(result.dropFirst(2)), radix: 16) ?? 50_000_000_000
        print("[Gas] eth_gasPrice fallback: \(gasPrice), using \(gasPrice * 3 / 2)")
        return (gasPrice * 3 / 2, gasPrice)
    }

    private func estimateGas(userOp: UserOperation, network: String) async throws -> GasEstimate {
        let params: [Any] = [userOp.toDict() as Any, SafeAddressComputer.entryPoint]
        let data = try await bundlerAPI.bundlerRequest(
            method: "eth_estimateUserOperationGas",
            params: params,
            network: network
        )
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = json["result"] as? [String: Any] else {
            throw SafeTxError.estimationFailed
        }
        return GasEstimate(
            verificationGasLimit: parseHexUInt64(result["verificationGasLimit"]),
            callGasLimit: parseHexUInt64(result["callGasLimit"]),
            preVerificationGas: parseHexUInt64(result["preVerificationGas"])
        )
    }

    private func submitUserOp(userOp: UserOperation, network: String) async throws -> String {
        let params: [Any] = [userOp.toDict() as Any, SafeAddressComputer.entryPoint]
        let data = try await bundlerAPI.bundlerRequest(
            method: "eth_sendUserOperation",
            params: params,
            network: network
        )
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let result = json["result"] as? String else {
            let error = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"]
            throw SafeTxError.submitFailed("\(error ?? "Unknown error")")
        }
        return result
    }

    private func waitForReceipt(userOpHash: String, network: String, timeout: Int = 120) async throws -> String {
        let start = Date()
        while Date().timeIntervalSince(start) < Double(timeout) {
            let data = try await bundlerAPI.bundlerRequest(
                method: "eth_getUserOperationReceipt",
                params: [userOpHash],
                network: network
            )
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let result = json["result"] as? [String: Any],
               let receipt = result["receipt"] as? [String: Any],
               let txHash = receipt["transactionHash"] as? String {
                return txHash
            }
            try await Task.sleep(for: .seconds(1.5))
        }
        throw SafeTxError.timeout
    }

    private func parseHexUInt64(_ value: Any?) -> UInt64 {
        guard let hex = value as? String else { return 0 }
        let clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
        return UInt64(clean, radix: 16) ?? 0
    }

    // MARK: - Types

    struct TransactionResult {
        let userOpHash: String
        let txHash: String
    }

    struct GasEstimate {
        let verificationGasLimit: UInt64
        let callGasLimit: UInt64
        let preVerificationGas: UInt64
    }

    enum SafeTxError: Error, LocalizedError {
        case signatureFailed
        case estimationFailed
        case submitFailed(String)
        case timeout

        var errorDescription: String? {
            switch self {
            case .signatureFailed: "Failed to create signature."
            case .estimationFailed: "Failed to estimate gas."
            case .submitFailed(let msg): "Transaction failed: \(msg)"
            case .timeout: "Transaction timed out waiting for confirmation."
            }
        }
    }
}

// MARK: - UserOperation

struct UserOperation {
    let sender: String
    let nonce: String
    let initCode: Data
    let callData: Data
    var verificationGasLimit: UInt64
    var callGasLimit: UInt64
    var preVerificationGas: UInt64
    let maxFeePerGas: UInt64
    let maxPriorityFeePerGas: UInt64
    let paymasterAndData: Data
    var signature: Data

    /// Convert to JSON-RPC dict for bundler.
    /// ERC-4337 v0.7 JSON-RPC uses individual fields + factory/factoryData split.
    func toDict() -> [String: Any] {
        var dict: [String: Any] = [
            "sender": sender,
            "nonce": nonce,
            "callData": "0x" + callData.hexString,
            "callGasLimit": "0x" + String(callGasLimit, radix: 16),
            "verificationGasLimit": "0x" + String(verificationGasLimit, radix: 16),
            "preVerificationGas": "0x" + String(preVerificationGas, radix: 16),
            "maxFeePerGas": "0x" + String(maxFeePerGas, radix: 16),
            "maxPriorityFeePerGas": "0x" + String(maxPriorityFeePerGas, radix: 16),
            "signature": "0x" + signature.hexString,
        ]

        // v0.7: split initCode into factory + factoryData
        if initCode.count >= 20 {
            let factoryAddr = "0x" + initCode.prefix(20).hexString
            let factoryData = "0x" + initCode.suffix(from: 20).hexString
            dict["factory"] = factoryAddr
            dict["factoryData"] = factoryData
        }

        // v0.7: split paymasterAndData (empty for now)
        if paymasterAndData.isEmpty {
            // Don't include paymaster fields
        } else if paymasterAndData.count >= 20 {
            dict["paymaster"] = "0x" + paymasterAndData.prefix(20).hexString
            dict["paymasterData"] = "0x" + paymasterAndData.suffix(from: 20).hexString
            dict["paymasterVerificationGasLimit"] = "0x0"
            dict["paymasterPostOpGasLimit"] = "0x0"
        }

        return dict
    }
}
