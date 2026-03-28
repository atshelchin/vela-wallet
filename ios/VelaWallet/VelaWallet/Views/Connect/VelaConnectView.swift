import SwiftUI

struct VelaConnectView: View {
    @Environment(WalletState.self) private var wallet
    @StateObject private var ble = BLEPeripheralService.shared

    @State private var incomingRequest: BLEIncomingRequest?
    @State private var isSigning = false
    @State private var signError: String?
    @State private var showAccountPicker = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Header with account switcher
                HStack {
                    Text("connect.title")
                        .font(VelaFont.title(17))
                        .foregroundStyle(VelaColor.textPrimary)

                    Spacer()

                    // Inline account switcher
                    Button { showAccountPicker = true } label: {
                        HStack(spacing: 6) {
                            Text(wallet.activeAccount?.name ?? "Wallet")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(VelaColor.textPrimary)
                                .lineLimit(1)
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(VelaColor.textTertiary)
                        }
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(VelaColor.bgWarm)
                        .clipShape(Capsule())
                    }
                }
                .padding(.horizontal, VelaSpacing.screenH)
                .padding(.vertical, 12)

                if let request = incomingRequest {
                    requestView(request)
                } else if ble.isConnected {
                    connectedState
                } else if ble.isAdvertising {
                    advertisingState
                } else {
                    idleState
                }
            }
            .background(VelaColor.bg)
            .navigationBarHidden(true)
            .sheet(isPresented: $showAccountPicker) {
                AccountSwitcherView()
                    .presentationDetents([.medium, .large])
            }
        }
        .onAppear {
            ble.onRequest = { request in
                incomingRequest = request
            }
            // Handle account switch from Chrome extension
            ble.onSwitchAccount = { address in
                if let index = wallet.accounts.firstIndex(where: { $0.address == address }) {
                    wallet.activeAccountIndex = index
                    wallet.address = address
                }
            }
        }
        .onChange(of: wallet.address) {
            debugLog("[VelaConnect] wallet.address changed to: \(wallet.address.prefix(12))... isAdvertising=\(ble.isAdvertising) isConnected=\(ble.isConnected)")
            if ble.isAdvertising || ble.isConnected {
                debugLog("[VelaConnect] Pushing wallet info update via BLE")
                ble.updateWalletInfo(
                    walletAddress: wallet.address,
                    accountName: wallet.activeAccount?.name ?? "Wallet",
                    chainId: ble.currentChainId,
                    allAccounts: wallet.accounts.map { ($0.name, $0.address) }
                )
            }
        }
    }

    // MARK: - Idle (not advertising)

    private var idleState: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 32) {
                ZStack {
                    Circle().stroke(VelaColor.blue.opacity(0.06), lineWidth: 1).frame(width: 160, height: 160)
                    Circle().stroke(VelaColor.blue.opacity(0.12), lineWidth: 1.5).frame(width: 128, height: 128)
                    Circle().fill(VelaColor.blueSoft).frame(width: 100, height: 100)
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.system(size: 32)).foregroundStyle(VelaColor.blue)
                }
                VStack(spacing: 10) {
                    Text("connect.heading")
                        .font(VelaFont.heading(24)).foregroundStyle(VelaColor.textPrimary)
                    Text("connect.description")
                        .font(VelaFont.body(14)).foregroundStyle(VelaColor.textSecondary)
                        .multilineTextAlignment(.center).lineSpacing(4)
                }
                VStack(spacing: 12) {
                    StepRow(number: 1, text: String(localized: "connect.step1"))
                    StepRow(number: 2, text: String(localized: "connect.step2"))
                    StepRow(number: 3, text: String(localized: "connect.step3"))
                }
            }
            .padding(.horizontal, 36)
            Spacer()

            Button { startBLE() } label: {
                HStack(spacing: 8) {
                    Image(systemName: "dot.radiowaves.left.and.right")
                    Text("connect.pair_button")
                }
            }
            .buttonStyle(BlueButtonStyle())
            .padding(.horizontal, 28).padding(.bottom, 24)
        }
    }

    // MARK: - Advertising (waiting for Chrome)

    private var advertisingState: some View {
        VStack(spacing: 0) {
            Spacer()
            VStack(spacing: 24) {
                ZStack {
                    Circle().stroke(VelaColor.blue.opacity(0.1), lineWidth: 1.5).frame(width: 120, height: 120)
                    Circle().fill(VelaColor.blueSoft).frame(width: 88, height: 88)
                    Image(systemName: "dot.radiowaves.left.and.right")
                        .font(.system(size: 28)).foregroundStyle(VelaColor.blue)
                        .symbolEffect(.pulse, options: .repeating)
                }
                VStack(spacing: 8) {
                    Text("connect.waiting")
                        .font(VelaFont.heading(20)).foregroundStyle(VelaColor.textPrimary)
                    Text("connect.waiting_desc")
                        .font(VelaFont.body(13)).foregroundStyle(VelaColor.textSecondary)
                        .multilineTextAlignment(.center).lineSpacing(4)
                }

                // Current wallet
                HStack(spacing: 10) {
                    ZStack {
                        Circle().fill(VelaColor.accentSoft).frame(width: 32, height: 32)
                        Text(String((wallet.activeAccount?.name ?? "V").prefix(1)).uppercased())
                            .font(.system(size: 12, weight: .bold)).foregroundStyle(VelaColor.accent)
                    }
                    VStack(alignment: .leading, spacing: 1) {
                        Text(wallet.activeAccount?.name ?? "Wallet")
                            .font(.system(size: 13, weight: .semibold)).foregroundStyle(VelaColor.textPrimary)
                        Text(wallet.shortAddress)
                            .font(VelaFont.mono(11)).foregroundStyle(VelaColor.textTertiary)
                    }
                    Spacer()
                }
                .padding(12)
                .background(VelaColor.bgWarm)
                .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
            }
            .padding(.horizontal, 36)
            Spacer()

            Button { ble.stopAdvertising() } label: {
                HStack(spacing: 8) {
                    Image(systemName: "stop.circle")
                    Text("connect.stop")
                }
            }
            .buttonStyle(DisconnectButtonStyle())
            .padding(.horizontal, 28).padding(.bottom, 24)
        }
    }

    // MARK: - Connected

    private var connectedState: some View {
        VStack(spacing: 0) {
            // Device card
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(VelaColor.blueSoft).frame(width: 44, height: 44)
                    Image(systemName: "desktopcomputer").font(.system(size: 20)).foregroundStyle(VelaColor.blue)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Chrome — Vela Connect")
                        .font(.system(size: 15, weight: .semibold)).foregroundStyle(VelaColor.textPrimary)
                    HStack(spacing: 4) {
                        NetworkDot(color: VelaColor.green, size: 6)
                        Text("connect.status_connected")
                            .font(.system(size: 12, weight: .medium)).foregroundStyle(VelaColor.green)
                    }
                }
                Spacer()
            }
            .padding(16)
            .background(VelaColor.bgCard)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
            .overlay(RoundedRectangle(cornerRadius: VelaRadius.card).stroke(Color(hex: 0xD4DDFF), lineWidth: 1.5))
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.top, 16)

            // Current wallet
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(VelaColor.accentSoft).frame(width: 36, height: 36)
                    Text(String((wallet.activeAccount?.name ?? "V").prefix(1)).uppercased())
                        .font(.system(size: 14, weight: .bold)).foregroundStyle(VelaColor.accent)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(wallet.activeAccount?.name ?? "Wallet")
                        .font(.system(size: 14, weight: .semibold)).foregroundStyle(VelaColor.textPrimary)
                    Text(wallet.shortAddress)
                        .font(VelaFont.mono(12)).foregroundStyle(VelaColor.textTertiary)
                }
                Spacer()
                Button { showAccountPicker = true } label: {
                    Text("send.change")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(VelaColor.accent)
                }
            }
            .padding(14)
            .background(VelaColor.bgWarm)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.top, 12)

            Spacer()

            VStack(spacing: 20) {
                ZStack {
                    Circle().fill(VelaColor.greenSoft).frame(width: 64, height: 64)
                    Image(systemName: "checkmark").font(.system(size: 26, weight: .semibold)).foregroundStyle(VelaColor.green)
                }
                VStack(spacing: 8) {
                    Text("connect.connected").font(VelaFont.heading(22)).foregroundStyle(VelaColor.textPrimary)
                    Text("connect.connected_desc")
                        .font(VelaFont.body(14)).foregroundStyle(VelaColor.textSecondary)
                        .multilineTextAlignment(.center).lineSpacing(4)
                }
            }
            .padding(.horizontal, 36)

            Spacer()

            Button { ble.stopAdvertising() } label: { Text("connect.disconnect") }
                .buttonStyle(DisconnectButtonStyle())
                .padding(.horizontal, 28).padding(.bottom, 24)
        }
    }

    // MARK: - Incoming Request

    private func requestView(_ request: BLEIncomingRequest) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                if let favicon = request.favicon, let url = URL(string: favicon) {
                    AsyncImage(url: url) { image in
                        image.resizable().frame(width: 20, height: 20).clipShape(RoundedRectangle(cornerRadius: 4))
                    } placeholder: {
                        RoundedRectangle(cornerRadius: 4).fill(VelaColor.bgWarm).frame(width: 20, height: 20)
                    }
                }
                Text(request.origin).font(.system(size: 13, weight: .medium)).foregroundStyle(VelaColor.textPrimary).lineLimit(1)
                Spacer()
            }
            .padding(.horizontal, VelaSpacing.screenH).padding(.top, 16).padding(.bottom, 12)

            VStack(spacing: 0) {
                HStack {
                    Text(methodDisplayName(request.method).uppercased())
                        .font(.system(size: 10, weight: .semibold)).tracking(1).foregroundStyle(VelaColor.textTertiary)
                    Spacer()
                    Text(Network.chainName(for: ble.currentChainId))
                        .font(.system(size: 10, weight: .semibold)).foregroundStyle(VelaColor.blue)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(VelaColor.blueSoft).clipShape(Capsule())
                }
                .padding(.horizontal, 16).padding(.top, 14).padding(.bottom, 8)

                // Show tx details for eth_sendTransaction
                if request.method == "eth_sendTransaction",
                   let txDict = request.params.first?.value as? [String: Any] {
                    let toAddr = txDict["to"] as? String ?? "Unknown"
                    let valueHex = txDict["value"] as? String ?? "0x0"
                    let hasData = (txDict["data"] as? String ?? "0x") != "0x"
                    let valueWei = UInt64(valueHex.dropFirst(2), radix: 16) ?? 0
                    let valueEth = Double(valueWei) / 1e18

                    if valueEth > 0 {
                        Text(String(format: "%.6f", valueEth) + " " + Network.nativeSymbol(for: ble.currentChainId))
                            .font(.system(size: 24, weight: .bold)).foregroundStyle(VelaColor.textPrimary)
                            .padding(.horizontal, 16).padding(.bottom, 4)
                    }

                    if hasData {
                        Text("Contract Interaction")
                            .font(.system(size: 14, weight: .medium)).foregroundStyle(VelaColor.textSecondary)
                            .padding(.horizontal, 16).padding(.bottom, 4)
                    }

                    VelaColor.border.frame(height: 1)
                    txDetailRow(label: "To", value: shortAddr(toAddr))
                    txDetailRow(label: "From", value: shortAddr(wallet.address))
                    txDetailRow(label: "Network", value: Network.chainName(for: ble.currentChainId))
                } else {
                    Text(methodDisplayName(request.method))
                        .font(VelaFont.heading(20)).foregroundStyle(VelaColor.textPrimary)
                        .padding(.horizontal, 16).padding(.bottom, 14)
                }
            }
            .background(VelaColor.bgCard)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
            .overlay(RoundedRectangle(cornerRadius: VelaRadius.card).stroke(VelaColor.border, lineWidth: 1))
            .padding(.horizontal, VelaSpacing.screenH)

            if let error = signError {
                Text(error).font(.system(size: 13)).foregroundStyle(VelaColor.accent)
                    .multilineTextAlignment(.center).padding(.horizontal, VelaSpacing.screenH).padding(.top, 12)
            }

            Spacer()

            VStack(spacing: 10) {
                Button { approveRequest(request) } label: {
                    if isSigning {
                        HStack(spacing: 8) { ProgressView().tint(.white); Text("Signing...") }
                    } else {
                        Text("confirm.button")
                    }
                }
                .buttonStyle(VelaAccentButtonStyle()).disabled(isSigning)

                Button { rejectRequest(request) } label: {
                    Text("Reject").font(VelaFont.label(14)).foregroundStyle(VelaColor.textSecondary)
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                }
            }
            .padding(.horizontal, VelaSpacing.screenH).padding(.bottom, 24)
        }
    }

    // MARK: - Actions

    private func startBLE() {
        ble.startAdvertising(
            walletAddress: wallet.address,
            accountName: wallet.activeAccount?.name ?? "Vela Wallet",
            chainId: ble.currentChainId,
            allAccounts: wallet.accounts.map { ($0.name, $0.address) }
        )
    }

    private func approveRequest(_ request: BLEIncomingRequest) {
        isSigning = true; signError = nil
        Task {
            do {
                let result: AnyCodable

                if request.method == "eth_sendTransaction" {
                    // Full ERC-4337 flow: build UserOp → sign → submit → return tx hash
                    result = try await handleSendTransaction(request)
                } else if request.method == "personal_sign" {
                    result = try await handlePersonalSign(request)
                } else if request.method.contains("signTypedData") {
                    result = try await handleSignTypedData(request)
                } else {
                    result = try await handleGenericSign(request)
                }

                let response = BLEOutgoingResponse(id: request.id, result: result, error: nil)
                debugLog("[VelaConnect] Sending BLE response for \(request.id)")
                ble.sendResponse(response)
                incomingRequest = nil
                isSigning = false
            } catch {
                debugLog("[VelaConnect] Error: \(error)")
                // Send error response back so dApp's promise resolves
                ble.sendResponse(BLEOutgoingResponse(
                    id: request.id, result: nil,
                    error: BLEError(code: -32603, message: error.localizedDescription)
                ))
                incomingRequest = nil
                isSigning = false
                signError = error.localizedDescription
            }
        }
    }

    // MARK: - eth_sendTransaction (full ERC-4337)

    private func handleSendTransaction(_ request: BLEIncomingRequest) async throws -> AnyCodable {
        guard let txDict = request.params.first?.value as? [String: Any] else {
            throw PasskeyService.PasskeyError.failed("Invalid transaction params")
        }

        let to = txDict["to"] as? String ?? ""
        let valueHex = txDict["value"] as? String ?? "0x0"
        let dataHex = txDict["data"] as? String ?? "0x"

        // Get public key for UserOp building
        let credentialId = wallet.activeAccount?.id ?? ""
        let stored = LocalStorage.shared.findAccount(byCredentialId: credentialId)
        guard let publicKeyHex = stored?.publicKeyHex, !publicKeyHex.isEmpty else {
            // Try server
            if let record = try? await PublicKeyIndexService().query(
                rpId: PasskeyService.relyingParty, credentialId: credentialId
            ) {
                let stored = LocalStorage.StoredAccount(
                    id: credentialId, name: wallet.activeAccount?.name ?? "Wallet",
                    publicKeyHex: record.publicKey, address: wallet.address, createdAt: Date()
                )
                LocalStorage.shared.saveAccount(stored)
                return try await executeSendTransaction(to: to, valueHex: valueHex, dataHex: dataHex, publicKeyHex: record.publicKey)
            }
            throw PasskeyService.PasskeyError.failed("Public key not found")
        }

        return try await executeSendTransaction(to: to, valueHex: valueHex, dataHex: dataHex, publicKeyHex: publicKeyHex)
    }

    private func executeSendTransaction(to: String, valueHex: String, dataHex: String, publicKeyHex: String) async throws -> AnyCodable {
        let service = SafeTransactionService()
        let chainId = ble.currentChainId
        let valueClean = valueHex.hasPrefix("0x") ? String(valueHex.dropFirst(2)) : valueHex

        debugLog("[VelaConnect] Sending tx: to=\(to.prefix(10))... value=\(valueHex) data=\(dataHex.prefix(10))... chain=\(chainId)")

        let txResult: SafeTransactionService.TransactionResult
        if dataHex == "0x" || dataHex.isEmpty {
            txResult = try await service.sendNative(
                from: wallet.address, to: to, valueWei: valueClean,
                chainId: chainId, publicKeyHex: publicKeyHex
            )
        } else {
            let dataClean = dataHex.hasPrefix("0x") ? String(dataHex.dropFirst(2)) : dataHex
            let txData = Data(hexString: dataClean) ?? Data()
            txResult = try await service.sendContractCall(
                from: wallet.address, to: to, valueWei: valueClean, data: txData,
                chainId: chainId, publicKeyHex: publicKeyHex
            )
        }

        debugLog("[VelaConnect] Tx hash: \(txResult.txHash)")
        return AnyCodable(txResult.txHash)
    }

    // MARK: - personal_sign

    private func handlePersonalSign(_ request: BLEIncomingRequest) async throws -> AnyCodable {
        let passkeyService = PasskeyService()
        let credentialID: Data? = if let id = wallet.activeAccount?.id { Data(hexString: id) } else { nil }

        guard let hexMsg = request.params.first?.value as? String else {
            throw PasskeyService.PasskeyError.failed("Invalid message")
        }

        // Ethereum personal sign: hash with prefix
        let clean = hexMsg.hasPrefix("0x") ? String(hexMsg.dropFirst(2)) : hexMsg
        let msgBytes = Data(hexString: clean) ?? Data(hexMsg.utf8)
        let prefix = Data("\u{19}Ethereum Signed Message:\n\(msgBytes.count)".utf8)
        let dataToSign = EthCrypto.keccak256(prefix + msgBytes)

        let assertion = try await passkeyService.sign(data: dataToSign, credentialID: credentialID)
        guard let sig = assertion.signature,
              let rawSig = AttestationParser.derSignatureToRaw(sig) else {
            throw PasskeyService.PasskeyError.failed("No signature")
        }

        // Note: P256 passkey signature — v is not recoverable like secp256k1.
        // For Safe EIP-1271 signature verification, this format works.
        // v=0 indicates contract signature validation path.
        let sigHex = "0x" + rawSig.hexString + "00"
        return AnyCodable(sigHex)
    }

    // MARK: - eth_signTypedData

    private func handleSignTypedData(_ request: BLEIncomingRequest) async throws -> AnyCodable {
        let passkeyService = PasskeyService()
        let credentialID: Data? = if let id = wallet.activeAccount?.id { Data(hexString: id) } else { nil }

        // Hash the typed data params with keccak256
        let jsonData = try JSONEncoder().encode(request.params)
        let dataToSign = EthCrypto.keccak256(jsonData)

        let assertion = try await passkeyService.sign(data: dataToSign, credentialID: credentialID)
        guard let sig = assertion.signature,
              let rawSig = AttestationParser.derSignatureToRaw(sig) else {
            throw PasskeyService.PasskeyError.failed("No signature")
        }

        let sigHex = "0x" + rawSig.hexString + "00"
        return AnyCodable(sigHex)
    }

    // MARK: - Generic sign

    private func handleGenericSign(_ request: BLEIncomingRequest) async throws -> AnyCodable {
        let passkeyService = PasskeyService()
        let credentialID: Data? = if let id = wallet.activeAccount?.id { Data(hexString: id) } else { nil }

        let jsonData = try JSONEncoder().encode(request.params)
        let dataToSign = EthCrypto.keccak256(jsonData)

        let assertion = try await passkeyService.sign(data: dataToSign, credentialID: credentialID)
        guard let sig = assertion.signature else {
            throw PasskeyService.PasskeyError.failed("No signature")
        }
        return AnyCodable("0x" + sig.hexString)
    }

    private func rejectRequest(_ request: BLEIncomingRequest) {
        ble.sendResponse(BLEOutgoingResponse(id: request.id, result: nil, error: BLEError(code: 4001, message: "User rejected")))
        incomingRequest = nil
    }

    private func methodDisplayName(_ method: String) -> String {
        switch method {
        case "eth_sendTransaction": "Transaction"
        case "personal_sign": "Sign Message"
        case "eth_signTypedData_v4": "Sign Typed Data"
        case "eth_requestAccounts": "Connect"
        default: method
        }
    }

    private func txDetailRow(label: String, value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 12)).foregroundStyle(VelaColor.textTertiary)
            Spacer()
            Text(value).font(VelaFont.mono(12)).foregroundStyle(VelaColor.textPrimary)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .overlay(alignment: .bottom) { VelaColor.border.frame(height: 1) }
    }
}

// MARK: - Components

private struct StepRow: View {
    let number: Int; let text: String
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack { Circle().fill(VelaColor.bgWarm).frame(width: 24, height: 24)
                Text("\(number)").font(.system(size: 12, weight: .bold)).foregroundStyle(VelaColor.textSecondary) }
            Text(text).font(VelaFont.body(14)).foregroundStyle(VelaColor.textPrimary).lineSpacing(3)
            Spacer()
        }
        .padding(.horizontal, 16).padding(.vertical, 14)
        .background(VelaColor.bgCard)
        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
        .overlay(RoundedRectangle(cornerRadius: VelaRadius.card).stroke(VelaColor.border, lineWidth: 1))
    }
}

private struct BlueButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(VelaFont.label(16)).foregroundStyle(.white)
            .frame(maxWidth: .infinity).padding(.vertical, 17)
            .background(VelaColor.blue).clipShape(RoundedRectangle(cornerRadius: VelaRadius.button))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

private struct DisconnectButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(VelaFont.label(16)).foregroundStyle(VelaColor.accent)
            .frame(maxWidth: .infinity).padding(.vertical, 17)
            .overlay(RoundedRectangle(cornerRadius: VelaRadius.button).stroke(VelaColor.accent, lineWidth: 1.5))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
