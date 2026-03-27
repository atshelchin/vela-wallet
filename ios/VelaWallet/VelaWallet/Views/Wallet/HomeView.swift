import SwiftUI
import Combine

struct HomeView: View {
    @Environment(WalletState.self) private var wallet
    @State private var showSend = false
    @State private var showReceive = false
    @State private var showAddToken = false
    @State private var tokens: [APIToken] = []
    @State private var nfts: [APINFT] = []
    @State private var isLoading = false
    @State private var selectedToken: APIToken?
    @State private var selectedNFT: APINFT?
    @State private var activeTab: AssetTab = .tokens

    enum AssetTab { case tokens, nfts }

    private var totalUSD: Double { tokens.reduce(0) { $0 + $1.usdValue } }
    private var sortedTokens: [APIToken] { tokens.sorted { $0.usdValue > $1.usdValue } }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    balanceSection
                    actionButtons
                    assetTabPicker
                    if activeTab == .tokens {
                        tokenSection
                    } else {
                        nftSection
                    }
                }
                .padding(.bottom, 24)
            }
            .background(VelaColor.bg)
            .navigationBarHidden(true)
            .refreshable { await loadData() }
            .sheet(isPresented: $showSend) {
                SendView()
                    .onDisappear { delayedRefresh() }
            }
            .sheet(isPresented: $showReceive) {
                ReceiveView()
                    .onDisappear { delayedRefresh() }
            }
            .sheet(isPresented: $showAddToken) {
                AddTokenView()
                    .onDisappear { Task { await loadData() } }
            }
            .sheet(item: $selectedToken) { token in
                TokenDetailView(token: token)
            }
            .sheet(item: $selectedNFT) { nft in
                NFTDetailView(nft: nft)
            }
            .task { await loadData() }
            .onReceive(autoRefreshTimer) { _ in
                Task { await loadData() }
            }
        }
    }

    // Auto-refresh every 30 seconds
    private let autoRefreshTimer = Timer.publish(every: 30, on: .main, in: .common).autoconnect()

    /// Refresh after a short delay to bypass API cache
    private func delayedRefresh() {
        Task.detached {
            try? await Task.sleep(for: .seconds(3))
            await MainActor.run { Task { await loadData() } }
        }
    }

    // MARK: - Balance

    private var balanceSection: some View {
        VStack(spacing: 6) {
            if let name = wallet.activeAccount?.name {
                Text(name)
                    .font(VelaFont.label(15))
                    .foregroundStyle(VelaColor.textPrimary)
            }

            Button {
                UIPasteboard.general.string = wallet.address
            } label: {
                HStack(spacing: 6) {
                    Text(wallet.shortAddress)
                        .font(VelaFont.mono(13))
                    Image(systemName: "doc.on.doc")
                        .font(.system(size: 12))
                }
                .foregroundStyle(VelaColor.textSecondary)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(VelaColor.bgWarm)
                .clipShape(Capsule())
            }

            HStack(alignment: .firstTextBaseline, spacing: 0) {
                Text("$\(Int(totalUSD).formatted())")
                    .font(.system(size: 44, weight: .bold))
                    .foregroundStyle(VelaColor.textPrimary)
                    .tracking(-2)
                Text(".\(String(format: "%02d", Int(totalUSD * 100) % 100))")
                    .font(.system(size: 28, weight: .medium))
                    .foregroundStyle(VelaColor.textTertiary)
            }
        }
        .padding(.vertical, 28)
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 12) {
            ActionButton(icon: "arrow.up", title: String(localized: "home.send"), isPrimary: true) {
                showSend = true
            }
            ActionButton(icon: "arrow.down", title: String(localized: "home.receive")) {
                showReceive = true
            }
        }
        .padding(.horizontal, VelaSpacing.screenH)
        .padding(.bottom, 20)
    }

    // MARK: - Tokens / NFTs Tab Picker

    private var assetTabPicker: some View {
        HStack(spacing: 0) {
            tabButton(title: String(localized: "home.tokens"), tab: .tokens)
            tabButton(title: String(localized: "home.nfts"), tab: .nfts)
        }
        .padding(3)
        .background(VelaColor.bgWarm)
        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
        .padding(.horizontal, VelaSpacing.screenH)
        .padding(.bottom, 16)
    }

    private func tabButton(title: String, tab: AssetTab) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.15)) { activeTab = tab } } label: {
            Text(title)
                .font(VelaFont.label(13))
                .foregroundStyle(activeTab == tab ? VelaColor.textPrimary : VelaColor.textTertiary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(activeTab == tab ? VelaColor.bgCard : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
    }

    // MARK: - Tokens

    private var tokenSection: some View {
        VStack(spacing: 12) {
            HStack {
                Spacer()
                Button { showAddToken = true } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .semibold))
                        Text("token.add_title")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundStyle(VelaColor.accent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(VelaColor.accentSoft)
                    .clipShape(Capsule())
                }
                .padding(.trailing, VelaSpacing.screenH)
            }

            if isLoading && tokens.isEmpty {
                VStack(spacing: 16) {
                    ProgressView()
                    Text("Loading...")
                        .font(VelaFont.body(14))
                        .foregroundStyle(VelaColor.textTertiary)
                }
                .padding(.vertical, 40)
            } else if tokens.isEmpty {
                emptyState(icon: "tray", text: String(localized: "home.no_activity"))
            } else {
                VStack(spacing: 0) {
                    ForEach(sortedTokens) { token in
                        Button { selectedToken = token } label: {
                            TokenRow(token: token)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - NFTs

    private var nftSection: some View {
        VStack(spacing: 12) {
            if isLoading && nfts.isEmpty {
                VStack(spacing: 16) {
                    ProgressView()
                    Text("Loading...")
                        .font(VelaFont.body(14))
                        .foregroundStyle(VelaColor.textTertiary)
                }
                .padding(.vertical, 40)
            } else if nfts.isEmpty {
                emptyState(icon: "photo.on.rectangle.angled", text: String(localized: "home.no_nfts"))
            } else {
                let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(nfts) { nft in
                        Button { selectedNFT = nft } label: {
                            NFTCard(nft: nft)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: - Empty State

    private func emptyState(icon: String, text: String) -> some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(VelaColor.bgWarm)
                    .frame(width: 56, height: 56)
                Image(systemName: icon)
                    .font(.system(size: 22))
                    .foregroundStyle(VelaColor.textTertiary)
            }
            Text(text)
                .font(VelaFont.body(14))
                .foregroundStyle(VelaColor.textTertiary)
                .multilineTextAlignment(.center)
        }
        .padding(.vertical, 32)
    }

    // MARK: - Load Data

    private func loadData() async {
        guard !wallet.address.isEmpty else { return }
        guard !Task.isCancelled else { return }

        isLoading = true
        let api = WalletAPIService()

        await loadTokensData(api: api)
        await loadNFTsData(api: api)

        isLoading = false
    }

    private func loadTokensData(api: WalletAPIService) async {
        do {
            guard !Task.isCancelled else { return }
            var apiTokens = try await api.fetchTokens(address: wallet.address)

            let customTokens = LocalStorage.shared.loadCustomTokens()
            let existingIds = Set(apiTokens.map { "\($0.chainId)_\($0.tokenAddress ?? "")" })

            for custom in customTokens {
                let key = "\(custom.chainId)_\(custom.contractAddress)"
                if !existingIds.contains(key) {
                    let token = APIToken(
                        network: custom.networkId,
                        chainName: custom.networkName,
                        symbol: custom.symbol,
                        balance: "0",
                        decimals: custom.decimals,
                        logo: nil,
                        name: custom.name,
                        tokenAddress: custom.contractAddress,
                        priceUsd: nil,
                        spam: false
                    )
                    apiTokens.append(token)
                }
            }
            tokens = apiTokens
        } catch is CancellationError {
            // Silently ignore — task was replaced by a newer one
        } catch {
            print("[HomeView] Failed to load tokens: \(error.localizedDescription)")
        }
    }

    private func loadNFTsData(api: WalletAPIService) async {
        do {
            guard !Task.isCancelled else { return }
            nfts = try await api.fetchNFTs(address: wallet.address)
        } catch is CancellationError {
            // Silently ignore
        } catch {
            print("[HomeView] Failed to load NFTs: \(error.localizedDescription)")
        }
    }
}

// MARK: - Action Button

private struct ActionButton: View {
    let icon: String
    let title: String
    var isPrimary: Bool = false
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                Text(title)
                    .font(VelaFont.label(14))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(isPrimary ? VelaColor.textPrimary : VelaColor.bgCard)
            .foregroundStyle(isPrimary ? Color.white : VelaColor.textPrimary)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
            .overlay {
                if !isPrimary {
                    RoundedRectangle(cornerRadius: VelaRadius.card)
                        .stroke(VelaColor.border, lineWidth: 1)
                }
            }
        }
    }
}

// MARK: - Token Row

private struct TokenRow: View {
    let token: APIToken

    var body: some View {
        HStack(spacing: VelaSpacing.itemGap) {
            TokenLogo(token: token)

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
                    .font(VelaFont.label(15))
                    .foregroundStyle(VelaColor.textPrimary)
                if token.usdValue > 0 {
                    Text("$\(token.usdValue, specifier: "%.2f")")
                        .font(.system(size: 12))
                        .foregroundStyle(VelaColor.textTertiary)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }

}

// MARK: - NFT Card

private struct NFTCard: View {
    let nft: APINFT

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Image
            CachedAsyncImage(url: nft.imageURL) {
                ZStack {
                    Rectangle().fill(VelaColor.bgWarm)
                    Image(systemName: "photo")
                        .font(.system(size: 24))
                        .foregroundStyle(VelaColor.textTertiary)
                }
            }
            .scaledToFill()
            .frame(height: 160)
            .clipped()

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(nft.displayName)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(VelaColor.textPrimary)
                    .lineLimit(1)

                Text(nft.collectionName ?? nft.chainName)
                    .font(.system(size: 11))
                    .foregroundStyle(VelaColor.textTertiary)
                    .lineLimit(1)
            }
            .padding(10)
        }
        .background(VelaColor.bgCard)
        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: VelaRadius.card)
                .stroke(VelaColor.border, lineWidth: 1)
        )
    }
}

#Preview {
    let state = WalletState()
    state.hasWallet = true
    state.address = "0x7a3F8c2D1b4E9f6A5d3C0e8B7a2F4d6E1c9e92B"
    state.accounts = [Account(id: "1", name: "Personal", address: state.address, createdAt: Date())]
    return HomeView()
        .environment(state)
}
