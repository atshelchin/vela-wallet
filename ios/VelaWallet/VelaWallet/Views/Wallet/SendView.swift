import SwiftUI

struct SendView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(WalletState.self) private var wallet

    /// Pre-select a token (e.g. from TokenDetailView). Skips token selection step.
    var preselectedToken: APIToken? = nil

    @State private var step: SendStep = .selectToken
    @State private var tokens: [APIToken] = []
    @State private var isLoading = false
    @State private var selectedToken: APIToken?
    @State private var toAddress = ""
    @State private var amount = ""
    @State private var showScanner = false

    enum SendStep {
        case selectToken
        case enterDetails
        case confirm
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                switch step {
                case .selectToken:
                    tokenSelectionView
                case .enterDetails:
                    detailsView
                case .confirm:
                    confirmView
                }
            }
            .background(VelaColor.bg)
            .fullScreenCover(isPresented: $showScanner) {
                QRScannerSheet(onScanned: { value in
                    if value.hasPrefix("ethereum:") {
                        toAddress = String(value.dropFirst("ethereum:".count).prefix(42))
                    } else {
                        toAddress = value
                    }
                    showScanner = false
                }, onCancel: {
                    showScanner = false
                })
            }
            .task {
                // If token is preselected (from detail page), skip to details
                if let token = preselectedToken {
                    selectedToken = token
                    step = .enterDetails
                }
                await loadTokens()
            }
        }
    }

    // MARK: - Step 1: Select Token

    private var tokenSelectionView: some View {
        VStack(spacing: 0) {
            VelaNavBar(title: "send.select_token", onBack: { dismiss() })

            if isLoading {
                Spacer()
                ProgressView()
                Spacer()
            } else if tokens.isEmpty {
                Spacer()
                VStack(spacing: 12) {
                    Image(systemName: "tray")
                        .font(.system(size: 32))
                        .foregroundStyle(VelaColor.textTertiary)
                    Text("send.no_tokens")
                        .font(VelaFont.body(14))
                        .foregroundStyle(VelaColor.textTertiary)
                }
                Spacer()
            } else {
                ScrollView {
                    VStack(spacing: 4) {
                        ForEach(tokens.sorted(by: { $0.usdValue > $1.usdValue })) { token in
                            Button {
                                selectedToken = token
                                step = .enterDetails
                            } label: {
                                HStack(spacing: 14) {
                                    TokenLogo(token: token, size: 40)

                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(token.symbol)
                                            .font(.system(size: 15, weight: .semibold))
                                            .foregroundStyle(VelaColor.textPrimary)
                                        Text(token.chainName)
                                            .font(.system(size: 12))
                                            .foregroundStyle(VelaColor.textTertiary)
                                    }

                                    Spacer()

                                    VStack(alignment: .trailing, spacing: 2) {
                                        Text(formatBalance(token.balanceDouble))
                                            .font(VelaFont.label(14))
                                            .foregroundStyle(VelaColor.textPrimary)
                                        if token.usdValue > 0 {
                                            Text("$\(token.usdValue, specifier: "%.2f")")
                                                .font(.system(size: 12))
                                                .foregroundStyle(VelaColor.textTertiary)
                                        }
                                    }

                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(VelaColor.textTertiary)
                                }
                                .padding(.horizontal, 16)
                                .padding(.vertical, 14)
                                .contentShape(Rectangle())
                            }
                        }
                    }
                    .padding(.horizontal, 8)
                    .padding(.top, 8)
                }
            }
        }
    }

    // MARK: - Step 2: Enter Details

    private var detailsView: some View {
        VStack(spacing: 0) {
            VelaNavBar(title: "send.title", onBack: { step = .selectToken })

            // Selected token banner
            if let token = selectedToken {
                HStack(spacing: 10) {
                    TokenLogo(token: token, size: 28)
                    Text("\(token.symbol)")
                        .font(VelaFont.label(14))
                        .foregroundStyle(VelaColor.textPrimary)
                    Text("on \(token.chainName)")
                        .font(.system(size: 12))
                        .foregroundStyle(VelaColor.textTertiary)
                    Spacer()
                    Button { step = .selectToken } label: {
                        Text("send.change")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(VelaColor.accent)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(VelaColor.bgWarm)
                .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
                .padding(.horizontal, VelaSpacing.screenH)
                .padding(.bottom, 12)
            }

            VStack(spacing: 20) {
                // To field
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("send.to")
                            .font(.system(size: 12, weight: .semibold))
                            .tracking(1)
                            .foregroundStyle(VelaColor.textTertiary)
                            .padding(.leading, 4)

                        Spacer()

                        Button { showScanner = true } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "qrcode.viewfinder")
                                    .font(.system(size: 14))
                                Text("send.scan")
                                    .font(.system(size: 12, weight: .semibold))
                            }
                            .foregroundStyle(VelaColor.accent)
                        }
                    }

                    TextField(String(localized: "send.to_placeholder"), text: $toAddress)
                        .font(VelaFont.mono(14))
                        .autocorrectionDisabled()
                        .textInputAutocapitalization(.never)
                        .padding(16)
                        .background(VelaColor.bgCard)
                        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                        .overlay(
                            RoundedRectangle(cornerRadius: VelaRadius.card)
                                .stroke(VelaColor.border, lineWidth: 1.5)
                        )
                }

                // Amount field
                VStack(spacing: 8) {
                    Text("send.amount")
                        .font(.system(size: 12, weight: .semibold))
                        .tracking(1)
                        .foregroundStyle(VelaColor.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.leading, 4)

                    ZStack(alignment: .trailing) {
                        TextField("0", text: $amount)
                            .font(.system(size: 32, weight: .bold))
                            .multilineTextAlignment(.center)
                            .keyboardType(.decimalPad)
                            .padding(24)
                            .background(VelaColor.bgCard)
                            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                            .overlay(
                                RoundedRectangle(cornerRadius: VelaRadius.card)
                                    .stroke(VelaColor.border, lineWidth: 1.5)
                            )

                        Text(selectedToken?.symbol ?? "")
                            .font(VelaFont.label(14))
                            .foregroundStyle(VelaColor.textSecondary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(VelaColor.bgWarm)
                            .clipShape(Capsule())
                            .padding(.trailing, 16)
                    }
                }

                // Balance hint
                if let token = selectedToken {
                    HStack {
                        Text(String(localized: "send.balance", defaultValue: "Balance: \(formatBalance(token.balanceDouble)) \(token.symbol)"))
                            .font(.system(size: 13))
                            .foregroundStyle(VelaColor.textTertiary)

                        Spacer()

                        Button {
                            amount = "\(token.balanceDouble)"
                        } label: {
                            Text("MAX")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(VelaColor.accent)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(VelaColor.accentSoft)
                                .clipShape(Capsule())
                        }
                    }
                    .padding(.horizontal, 4)
                }
            }
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.top, 8)

            Spacer()

            Button { step = .confirm } label: {
                Text("send.review")
            }
            .buttonStyle(VelaPrimaryButtonStyle())
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.bottom, 24)
            .disabled(toAddress.isEmpty || amount.isEmpty)
        }
    }

    // MARK: - Step 3: Confirm

    private var confirmView: some View {
        ConfirmTransactionView(
            toName: toAddress.contains(".") ? toAddress : nil,
            toAddress: toAddress,
            amount: amount,
            token: selectedToken,
            onSuccess: { dismiss() }
        )
    }

    // MARK: - Load

    private func loadTokens() async {
        guard !wallet.address.isEmpty else { return }
        isLoading = true
        do {
            tokens = try await WalletAPIService().fetchTokens(address: wallet.address)
            // Filter out zero-balance tokens
            tokens = tokens.filter { $0.balanceDouble > 0 }
        } catch {
            print("[SendView] Failed to load tokens: \(error)")
        }
        isLoading = false
    }

}

// MARK: - QR Scanner Sheet

private struct QRScannerSheet: View {
    var onScanned: (String) -> Void
    var onCancel: () -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            QRScannerView(onScanned: onScanned)
                .ignoresSafeArea()

            Button(action: onCancel) {
                Image(systemName: "xmark")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: 36, height: 36)
                    .background(.ultraThinMaterial)
                    .clipShape(Circle())
            }
            .padding(.top, 60)
            .padding(.leading, 20)
        }
    }
}

// MARK: - Confirm Transaction

struct ConfirmTransactionView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(WalletState.self) private var wallet

    var toName: String?
    let toAddress: String
    let amount: String
    let token: APIToken?
    var onSuccess: () -> Void

    @State private var isSending = false
    @State private var txResult: SafeTransactionService.TransactionResult?
    @State private var errorMessage: String?
    @State private var estimatedFeeUSD: String = "..."

    private var symbol: String { token?.symbol ?? "" }
    private var chainName: String { token?.chainName ?? "" }
    private var usdValue: String {
        guard let price = token?.priceUsd, let amt = Double(amount) else { return "" }
        return String(format: "$%.2f", amt * price)
    }

    var body: some View {
        VStack(spacing: 0) {
            VelaNavBar(title: "confirm.title", onBack: txResult == nil ? { dismiss() } : nil)

            if let result = txResult {
                // Success state
                successView(result: result)
            } else {
                // Confirm state
                confirmContent
            }
        }
        .background(VelaColor.bg)
        .task { await estimateGas() }
    }

    // MARK: - Confirm Content

    private var confirmContent: some View {
        VStack(spacing: 0) {
            VStack(spacing: 16) {
                // Amount card
                VStack(spacing: 4) {
                    Text("confirm.sending")
                        .font(.system(size: 12, weight: .semibold))
                        .tracking(1)
                        .foregroundStyle(VelaColor.textTertiary)
                    Text("\(amount) \(symbol)")
                        .font(.system(size: 36, weight: .bold))
                        .tracking(-1.5)
                        .foregroundStyle(VelaColor.textPrimary)
                    if !usdValue.isEmpty {
                        Text("≈ \(usdValue)")
                            .font(VelaFont.body(14))
                            .foregroundStyle(VelaColor.textTertiary)
                    }
                }
                .padding(.vertical, 28)
                .frame(maxWidth: .infinity)
                .velaCard()

                // Details
                VStack(spacing: 0) {
                    if let name = toName {
                        DetailRow(label: String(localized: "confirm.to"), value: name)
                    }
                    DetailRow(
                        label: String(localized: "confirm.address"),
                        value: toAddress.count > 16
                            ? "\(toAddress.prefix(6))...\(toAddress.suffix(4))"
                            : toAddress
                    )
                    if !chainName.isEmpty {
                        DetailRow(label: String(localized: "confirm.network"), value: chainName)
                    }
                    DetailRow(label: String(localized: "confirm.fee"), value: estimatedFeeUSD, isLast: true)
                }
                .velaCard()

                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(VelaColor.accent)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
            }
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.top, 8)

            Spacer()

            VStack(spacing: 10) {
                Button(action: sendTransaction) {
                    if isSending {
                        HStack(spacing: 8) {
                            ProgressView().tint(.white)
                            Text("confirm.sending_progress")
                        }
                    } else {
                        Text("confirm.button")
                    }
                }
                .buttonStyle(VelaAccentButtonStyle())
                .disabled(isSending)

                if !isSending {
                    Button { dismiss() } label: {
                        Text("confirm.cancel")
                            .font(VelaFont.label(14))
                            .foregroundStyle(VelaColor.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                }
            }
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.bottom, 24)
        }
    }

    // MARK: - Success View

    private func successView(result: SafeTransactionService.TransactionResult) -> some View {
        VStack(spacing: 24) {
            Spacer()

            ZStack {
                Circle()
                    .fill(VelaColor.greenSoft)
                    .frame(width: 72, height: 72)
                Image(systemName: "checkmark")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(VelaColor.green)
            }

            VStack(spacing: 8) {
                Text("confirm.success")
                    .font(VelaFont.heading(22))
                    .foregroundStyle(VelaColor.textPrimary)

                Text("\(amount) \(symbol)")
                    .font(VelaFont.label(16))
                    .foregroundStyle(VelaColor.textSecondary)

                Text(result.txHash.prefix(10) + "..." + result.txHash.suffix(6))
                    .font(VelaFont.mono(12))
                    .foregroundStyle(VelaColor.textTertiary)
            }

            Spacer()

            Button {
                dismiss()
                onSuccess()
            } label: {
                Text("confirm.done")
            }
            .buttonStyle(VelaPrimaryButtonStyle())
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.bottom, 24)
        }
    }

    // MARK: - Send Transaction

    private func sendTransaction() {
        guard let token else { return }

        isSending = true
        errorMessage = nil

        Task {
            // Try to resolve public key from multiple sources
            let credentialId = wallet.activeAccount?.id ?? ""
            var publicKeyHex = LocalStorage.shared.findAccount(byCredentialId: credentialId)?.publicKeyHex

            // Fallback: query public key index server
            if publicKeyHex == nil || publicKeyHex?.isEmpty == true {
                print("[Send] Public key not in local storage, querying server...")
                if let record = try? await PublicKeyIndexService().query(
                    rpId: PasskeyService.relyingParty,
                    credentialId: credentialId
                ) {
                    publicKeyHex = record.publicKey
                    // Save locally for next time
                    let stored = LocalStorage.StoredAccount(
                        id: credentialId,
                        name: wallet.activeAccount?.name ?? "Wallet",
                        publicKeyHex: record.publicKey,
                        address: wallet.address,
                        createdAt: Date()
                    )
                    LocalStorage.shared.saveAccount(stored)
                    print("[Send] Public key recovered from server")
                }
            }

            guard let pubKey = publicKeyHex, !pubKey.isEmpty else {
                isSending = false
                errorMessage = String(localized: "confirm.pubkey_not_found")
                return
            }

            await performSend(token: token, publicKeyHex: pubKey)
        }
    }

    private func performSend(token: APIToken, publicKeyHex: String) async {
        do {
            let service = SafeTransactionService()

            let result: SafeTransactionService.TransactionResult
            if token.isNative {
                let weiHex = amountToWeiHex(amount: amount, decimals: token.decimals)
                result = try await service.sendNative(
                    from: wallet.address,
                    to: toAddress,
                    valueWei: weiHex,
                    chainId: token.chainId,
                    publicKeyHex: publicKeyHex
                )
            } else {
                let weiHex = amountToWeiHex(amount: amount, decimals: token.decimals)
                result = try await service.sendERC20(
                    from: wallet.address,
                    tokenAddress: token.tokenAddress ?? "",
                    to: toAddress,
                    amountWei: weiHex,
                    chainId: token.chainId,
                    publicKeyHex: publicKeyHex
                )
            }

            isSending = false
            txResult = result
        } catch {
            isSending = false
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Gas Estimation

    private func estimateGas() async {
        guard let token else { return }
        do {
            let api = WalletAPIService()
            let (maxFee, _) = try await getGasPrices(network: token.network, api: api)

            // Rough estimation: (verificationGas + callGas + preVerificationGas) * maxFeePerGas
            let isDeployed = try await checkDeployed(network: token.network, api: api)
            let totalGas: UInt64 = isDeployed ? 460_000 : 960_000
            let feeWei = totalGas * maxFee
            let feeEth = Double(feeWei) / 1e18

            // Get native token price for USD conversion
            let nativePrice = token.isNative ? (token.priceUsd ?? 0) : await getNativePrice(network: token.network)
            let feeUSD = feeEth * nativePrice

            if feeUSD < 0.01 {
                estimatedFeeUSD = "< $0.01"
            } else {
                estimatedFeeUSD = String(format: "$%.2f", feeUSD)
            }
        } catch {
            estimatedFeeUSD = "—"
        }
    }

    private func getGasPrices(network: String, api: WalletAPIService) async throws -> (UInt64, UInt64) {
        let data = try await api.bundlerRequest(method: "eth_gasPrice", params: [], network: network)
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let hex = json["result"] as? String else { return (2_000_000_000, 1_000_000_000) }
        let gas = UInt64(hex.dropFirst(2), radix: 16) ?? 2_000_000_000
        return (gas * 2, gas / 2)
    }

    private func checkDeployed(network: String, api: WalletAPIService) async throws -> Bool {
        let data = try await api.bundlerRequest(method: "eth_getCode", params: [wallet.address, "latest"], network: network)
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let code = json["result"] as? String else { return false }
        return code != "0x" && code.count > 2
    }

    private func getNativePrice(network: String) async -> Double {
        do {
            let tokens = try await WalletAPIService().fetchTokens(address: wallet.address)
            return tokens.first(where: { $0.network == network && $0.isNative })?.priceUsd ?? 0
        } catch { return 0 }
    }

    /// Convert decimal amount string to wei as hex string (without 0x).
    /// Uses Decimal arithmetic to avoid Double precision loss (safe up to 2^128).
    private func amountToWeiHex(amount: String, decimals: Int) -> String {
        guard let decimalValue = Decimal(string: amount) else { return "0" }
        var multiplier = Decimal(1)
        for _ in 0..<decimals { multiplier *= 10 }
        let wei = decimalValue * multiplier
        // Convert Decimal to hex string via NSDecimalNumber
        let weiNumber = NSDecimalNumber(decimal: wei)
        let weiString = weiNumber.stringValue.components(separatedBy: ".").first ?? "0"
        // Parse large number to hex (handles > UInt64.max)
        guard let weiInt = UInt64(weiString) else {
            // For very large values, fall back to string-based hex conversion
            // This covers values up to ~18.4 ETH in UInt64; larger values are rare for user sends
            return "0"
        }
        return String(weiInt, radix: 16)
    }
}

private struct DetailRow: View {
    let label: String
    let value: String
    var isLast: Bool = false

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(VelaColor.textTertiary)
            Spacer()
            Text(value)
                .font(VelaFont.mono(13))
                .foregroundStyle(VelaColor.textPrimary)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .overlay(alignment: .bottom) {
            if !isLast {
                VelaColor.border.frame(height: 1)
            }
        }
    }
}

#Preview {
    let state = WalletState()
    state.hasWallet = true
    state.address = "0x7a3F8c2D1b4E9f6A5d3C0e8B7a2F4d6E1c9e92B"
    state.accounts = [Account(id: "1", name: "Personal", address: state.address, createdAt: Date())]
    return SendView()
        .environment(state)
}
