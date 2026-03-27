import SwiftUI

struct AddTokenView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var contractAddress = ""
    @State private var selectedNetwork: Network = .ethereum
    @State private var showNetworkPicker = false
    @State private var showScanner = false
    @State private var isLoading = false
    @State private var errorMessage: String?

    // Auto-fetched from contract
    @State private var tokenName = ""
    @State private var tokenSymbol = ""
    @State private var tokenDecimals = ""
    @State private var tokenFetched = false

    var body: some View {
        VStack(spacing: 0) {
            VelaNavBar(title: "token.add_title", onBack: { dismiss() })

            ScrollView {
                VStack(spacing: 20) {
                    // Network selector
                    VStack(alignment: .leading, spacing: 8) {
                        Text("token.network")
                            .font(.system(size: 12, weight: .semibold))
                            .tracking(1)
                            .foregroundStyle(VelaColor.textTertiary)
                            .padding(.leading, 4)

                        Button { showNetworkPicker = true } label: {
                            HStack(spacing: 12) {
                                ChainLogo(
                                    chainId: selectedNetwork.chainId,
                                    fallbackLabel: selectedNetwork.iconLabel,
                                    fallbackColor: selectedNetwork.iconColor,
                                    fallbackBg: selectedNetwork.iconBg,
                                    size: 28
                                )
                                .id(selectedNetwork.chainId)

                                Text(selectedNetwork.displayName)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(VelaColor.textPrimary)

                                Spacer()

                                Image(systemName: "chevron.down")
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(VelaColor.textTertiary)
                            }
                            .padding(14)
                            .background(VelaColor.bgCard)
                            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                            .overlay(
                                RoundedRectangle(cornerRadius: VelaRadius.card)
                                    .stroke(VelaColor.border, lineWidth: 1.5)
                            )
                        }
                    }

                    // Contract address
                    VStack(alignment: .leading, spacing: 8) {
                        Text("token.contract")
                            .font(.system(size: 12, weight: .semibold))
                            .tracking(1)
                            .foregroundStyle(VelaColor.textTertiary)
                            .padding(.leading, 4)

                        HStack(spacing: 8) {
                            TextField("0x...", text: $contractAddress)
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
                                .onChange(of: contractAddress) {
                                    if contractAddress.count == 42 && contractAddress.hasPrefix("0x") {
                                        fetchTokenInfo()
                                    } else {
                                        tokenFetched = false
                                    }
                                }

                            Button { showScanner = true } label: {
                                Image(systemName: "qrcode.viewfinder")
                                    .font(.system(size: 20))
                                    .foregroundStyle(VelaColor.accent)
                                    .frame(width: 52, height: 52)
                                    .background(VelaColor.accentSoft)
                                    .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                            }
                        }
                    }

                    if isLoading {
                        HStack(spacing: 8) {
                            ProgressView().scaleEffect(0.8)
                            Text("token.fetching")
                                .font(VelaFont.body(13))
                                .foregroundStyle(VelaColor.textTertiary)
                        }
                    }

                    // Token info (auto-filled or manual)
                    if tokenFetched || !contractAddress.isEmpty {
                        VStack(spacing: 14) {
                            TokenField(label: String(localized: "token.name"), text: $tokenName, placeholder: "e.g. USD Coin")
                            TokenField(label: String(localized: "token.symbol"), text: $tokenSymbol, placeholder: "e.g. USDC")
                            TokenField(label: String(localized: "token.decimals"), text: $tokenDecimals, placeholder: "e.g. 18", keyboard: .numberPad)
                        }
                    }

                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 13))
                            .foregroundStyle(VelaColor.accent)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, VelaSpacing.screenH)
                .padding(.top, 8)
            }

            // Add button
            Button(action: addToken) {
                Text("token.add_button")
            }
            .buttonStyle(VelaPrimaryButtonStyle())
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.bottom, 24)
            .disabled(!canAdd)
        }
        .background(VelaColor.bg)
        .sheet(isPresented: $showNetworkPicker) {
            NetworkSelectorSheet(selected: $selectedNetwork)
                .presentationDetents([.medium])
        }
        .fullScreenCover(isPresented: $showScanner) {
            ZStack(alignment: .topLeading) {
                QRScannerView { value in
                    // Extract 0x address from scanned value
                    if let range = value.range(of: "0x[0-9a-fA-F]{40}", options: .regularExpression) {
                        contractAddress = String(value[range])
                    }
                    showScanner = false
                }
                .ignoresSafeArea()

                Button { showScanner = false } label: {
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

    private var canAdd: Bool {
        contractAddress.count == 42
        && !tokenSymbol.trimmingCharacters(in: .whitespaces).isEmpty
        && !tokenName.trimmingCharacters(in: .whitespaces).isEmpty
        && Int(tokenDecimals) != nil
    }

    private func addToken() {
        guard let decimals = Int(tokenDecimals) else { return }
        let token = LocalStorage.CustomToken(
            id: "\(selectedNetwork.chainId)_\(contractAddress)",
            chainId: selectedNetwork.chainId,
            contractAddress: contractAddress,
            symbol: tokenSymbol.trimmingCharacters(in: .whitespaces).uppercased(),
            name: tokenName.trimmingCharacters(in: .whitespaces),
            decimals: decimals,
            networkName: selectedNetwork.displayName
        )
        LocalStorage.shared.saveCustomToken(token)
        dismiss()
    }

    private func fetchTokenInfo() {
        isLoading = true
        errorMessage = nil

        let network: String
        switch selectedNetwork.chainId {
        case 1: network = "eth-mainnet"
        case 42161: network = "arb-mainnet"
        case 8453: network = "base-mainnet"
        case 10: network = "opt-mainnet"
        case 137: network = "matic-mainnet"
        case 56: network = "bnb-mainnet"
        case 43114: network = "avax-mainnet"
        default: network = "eth-mainnet"
        }

        Task {
            do {
                // Use eth_call to read name(), symbol(), decimals() from contract
                let api = WalletAPIService()

                // name() = 0x06fdde03
                let nameData = try await api.bundlerRequest(
                    method: "eth_call",
                    params: [["to": contractAddress, "data": "0x06fdde03"], "latest"],
                    network: network
                )
                // symbol() = 0x95d89b41
                let symbolData = try await api.bundlerRequest(
                    method: "eth_call",
                    params: [["to": contractAddress, "data": "0x95d89b41"], "latest"],
                    network: network
                )
                // decimals() = 0x313ce567
                let decimalsData = try await api.bundlerRequest(
                    method: "eth_call",
                    params: [["to": contractAddress, "data": "0x313ce567"], "latest"],
                    network: network
                )

                tokenName = decodeABIString(from: nameData) ?? ""
                tokenSymbol = decodeABIString(from: symbolData) ?? ""
                tokenDecimals = "\(decodeABIUint(from: decimalsData) ?? 18)"
                tokenFetched = !tokenName.isEmpty

                if !tokenFetched {
                    errorMessage = String(localized: "token.fetch_failed")
                }
            } catch {
                errorMessage = String(localized: "token.fetch_failed")
            }
            isLoading = false
        }
    }

    // MARK: - ABI Decode Helpers

    private func decodeABIString(from jsonData: Data) -> String? {
        guard let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
              let hex = json["result"] as? String,
              hex.count > 130 else { return nil }

        // ABI: offset(32) + length(32) + data
        let clean = String(hex.dropFirst(2)) // remove 0x
        let lengthHex = String(clean.dropFirst(64).prefix(64))
        guard let length = Int(lengthHex, radix: 16), length > 0, length < 256 else { return nil }

        let dataStart = clean.index(clean.startIndex, offsetBy: 128)
        let dataEnd = clean.index(dataStart, offsetBy: min(length * 2, clean.count - 128))
        let dataHex = String(clean[dataStart..<dataEnd])

        guard let data = Data(hexString: dataHex) else { return nil }
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .controlCharacters)
    }

    private func decodeABIUint(from jsonData: Data) -> Int? {
        guard let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
              let hex = json["result"] as? String else { return nil }
        let clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
        return Int(clean, radix: 16)
    }
}

// MARK: - Token Field

private struct TokenField: View {
    let label: String
    @Binding var text: String
    var placeholder: String = ""
    var keyboard: UIKeyboardType = .default

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .tracking(1)
                .foregroundStyle(VelaColor.textTertiary)
                .padding(.leading, 4)

            TextField(placeholder, text: $text)
                .font(.system(size: 15, weight: .medium))
                .keyboardType(keyboard)
                .padding(14)
                .background(VelaColor.bgCard)
                .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
                .overlay(
                    RoundedRectangle(cornerRadius: VelaRadius.cardSmall)
                        .stroke(VelaColor.border, lineWidth: 1)
                )
        }
    }
}

// MARK: - Network Selector Sheet

private struct NetworkSelectorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Binding var selected: Network

    private let networks = Network.defaults

    var body: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2.5)
                .fill(VelaColor.textTertiary.opacity(0.3))
                .frame(width: 36, height: 5)
                .padding(.top, 10)
                .padding(.bottom, 16)

            Text("token.network")
                .font(VelaFont.title(17))
                .foregroundStyle(VelaColor.textPrimary)
                .padding(.bottom, 12)

            ScrollView {
                VStack(spacing: 4) {
                    ForEach(networks) { network in
                        Button {
                            selected = network
                            dismiss()
                        } label: {
                            HStack(spacing: 12) {
                                ChainLogo(
                                    chainId: network.chainId,
                                    fallbackLabel: network.iconLabel,
                                    fallbackColor: network.iconColor,
                                    fallbackBg: network.iconBg,
                                    size: 32
                                )

                                Text(network.displayName)
                                    .font(.system(size: 15, weight: .medium))
                                    .foregroundStyle(VelaColor.textPrimary)

                                Spacer()

                                if selected.id == network.id {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(VelaColor.accent)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(selected.id == network.id ? VelaColor.accentSoft : .clear)
                            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
        .background(VelaColor.bg)
    }
}
