import SwiftUI

struct NFTGalleryView: View {
    @Environment(WalletState.self) private var wallet
    @State private var nfts: [APINFT] = []
    @State private var isLoading = false
    @State private var expandedCollection: String?
    @State private var selectedNFT: APINFT?
    @State private var showSendFor: APINFT?
    @State private var showAddCollection = false
    @State private var viewMode: ViewMode = .collections

    enum ViewMode { case collections, all }

    private var collections: [NFTCollectionGroup] {
        Dictionary(grouping: nfts) { $0.collectionName ?? $0.contractAddress }
            .map { (name, items) in
                NFTCollectionGroup(
                    name: name,
                    contractAddress: items[0].contractAddress,
                    chainName: items[0].chainName,
                    image: items[0].collectionImage ?? items[0].image,
                    items: items
                )
            }
            .sorted { $0.items.count > $1.items.count }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Header
                HStack {
                    Text("tab.nfts")
                        .font(VelaFont.title(17))
                        .foregroundStyle(VelaColor.textPrimary)

                    Spacer()

                    // View mode toggle
                    HStack(spacing: 0) {
                        viewModeButton(icon: "square.stack.fill", mode: .collections)
                        viewModeButton(icon: "square.grid.2x2.fill", mode: .all)
                    }
                    .padding(2)
                    .background(VelaColor.bgWarm)
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                    // Add button
                    Button { showAddCollection = true } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(VelaColor.accent)
                            .frame(width: 32, height: 32)
                            .background(VelaColor.accentSoft)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
                .padding(.horizontal, VelaSpacing.screenH)
                .padding(.vertical, 12)
                .background(VelaColor.bg)

                // Stats bar
                if !nfts.isEmpty {
                    HStack(spacing: 16) {
                        statBadge(value: "\(collections.count)", label: String(localized: "nft.collections"))
                        statBadge(value: "\(nfts.count)", label: String(localized: "nft.items"))
                        Spacer()
                    }
                    .padding(.horizontal, VelaSpacing.screenH)
                    .padding(.bottom, 12)
                }

                // Content
                if isLoading {
                    Spacer()
                    ProgressView()
                    Spacer()
                } else if nfts.isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        switch viewMode {
                        case .collections:
                            collectionsView
                        case .all:
                            allNFTsGrid
                        }
                    }
                    .refreshable { await loadNFTs() }
                }
            }
            .background(VelaColor.bg)
            .navigationBarHidden(true)
            .task { await loadNFTs() }
            .sheet(item: $selectedNFT) { nft in
                NFTDetailView(nft: nft, onSend: { sendNFT in
                    selectedNFT = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                        showSendFor = sendNFT
                    }
                })
            }
            .sheet(item: $showSendFor) { nft in
                NFTSendView(nft: nft)
            }
            .sheet(isPresented: $showAddCollection) {
                AddTokenView() // Reuse existing add token view for now
            }
        }
    }

    // MARK: - View Mode Button

    private func viewModeButton(icon: String, mode: ViewMode) -> some View {
        Button { withAnimation(.easeInOut(duration: 0.15)) { viewMode = mode } } label: {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundStyle(viewMode == mode ? VelaColor.textPrimary : VelaColor.textTertiary)
                .frame(width: 28, height: 28)
                .background(viewMode == mode ? VelaColor.bgCard : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }

    // MARK: - Stat Badge

    private func statBadge(value: String, label: String) -> some View {
        HStack(spacing: 4) {
            Text(value)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(VelaColor.textPrimary)
            Text(label)
                .font(.system(size: 12))
                .foregroundStyle(VelaColor.textTertiary)
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            ZStack {
                Circle().fill(VelaColor.bgWarm).frame(width: 80, height: 80)
                Text("🖼").font(.system(size: 36))
            }
            VStack(spacing: 8) {
                Text("nft.empty_title")
                    .font(VelaFont.heading(20))
                    .foregroundStyle(VelaColor.textPrimary)
                Text("nft.empty_desc")
                    .font(VelaFont.body(14))
                    .foregroundStyle(VelaColor.textSecondary)
                    .multilineTextAlignment(.center)
                    .lineSpacing(4)
            }
            .padding(.horizontal, 40)

            Button { showAddCollection = true } label: {
                HStack(spacing: 6) {
                    Image(systemName: "plus.circle.fill")
                    Text("nft.add_collection")
                }
            }
            .buttonStyle(VelaSecondaryButtonStyle())
            .padding(.horizontal, 40)

            Spacer()
        }
    }

    // MARK: - Collections View

    private var collectionsView: some View {
        LazyVStack(spacing: 12) {
            ForEach(collections, id: \.contractAddress) { collection in
                CollectionCard(
                    collection: collection,
                    isExpanded: expandedCollection == collection.name,
                    onToggle: {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            expandedCollection = expandedCollection == collection.name ? nil : collection.name
                        }
                    },
                    onNFTTap: { nft in selectedNFT = nft }
                )
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
    }

    // MARK: - All NFTs Grid

    private var allNFTsGrid: some View {
        let columns = [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)]
        return LazyVGrid(columns: columns, spacing: 12) {
            ForEach(nfts) { nft in
                Button { selectedNFT = nft } label: {
                    VStack(alignment: .leading, spacing: 0) {
                        CachedAsyncImage(url: nft.imageURL) {
                            ZStack {
                                Rectangle().fill(VelaColor.bgWarm)
                                Text("🖼").font(.system(size: 24))
                            }
                        }
                        .scaledToFill()
                        .frame(height: 160)
                        .clipped()

                        VStack(alignment: .leading, spacing: 3) {
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
                    .overlay(RoundedRectangle(cornerRadius: VelaRadius.card).stroke(VelaColor.border, lineWidth: 1))
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
    }

    // MARK: - Load Data

    private func loadNFTs() async {
        guard !wallet.address.isEmpty else { return }
        isLoading = nfts.isEmpty
        do {
            nfts = try await WalletAPIService().fetchNFTs(address: wallet.address)
        } catch {
            debugLog("[NFTGallery] Failed: \(error)")
        }
        isLoading = false
    }
}

// MARK: - Collection Group Model

private struct NFTCollectionGroup {
    let name: String
    let contractAddress: String
    let chainName: String
    let image: String?
    let items: [APINFT]
}

// MARK: - Collection Card

private struct CollectionCard: View {
    let collection: NFTCollectionGroup
    let isExpanded: Bool
    let onToggle: () -> Void
    let onNFTTap: (APINFT) -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Header
            Button(action: onToggle) {
                HStack(spacing: 12) {
                    // Collection icon
                    if let urlStr = collection.image,
                       let url = URL(string: urlStr.hasPrefix("ipfs://") ? "https://ipfs.io/ipfs/\(urlStr.dropFirst(7))" : urlStr) {
                        CachedAsyncImage(url: url) { collectionFallback }
                            .scaledToFill()
                            .frame(width: 48, height: 48)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                    } else {
                        collectionFallback
                    }

                    VStack(alignment: .leading, spacing: 3) {
                        Text(collection.name)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(VelaColor.textPrimary)
                            .lineLimit(1)
                        HStack(spacing: 6) {
                            Text(collection.chainName)
                                .font(.system(size: 12))
                                .foregroundStyle(VelaColor.textTertiary)
                            Text("·").foregroundStyle(VelaColor.textTertiary)
                            Text("\(collection.items.count) items")
                                .font(.system(size: 12))
                                .foregroundStyle(VelaColor.textTertiary)
                        }
                    }

                    Spacer()

                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(VelaColor.textTertiary)
                        .frame(width: 28, height: 28)
                        .background(VelaColor.bgWarm)
                        .clipShape(Circle())
                }
                .padding(14)
            }

            // Expanded grid
            if isExpanded {
                VelaColor.border.frame(height: 1)
                let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(collection.items) { nft in
                        Button { onNFTTap(nft) } label: {
                            VStack(spacing: 0) {
                                CachedAsyncImage(url: nft.imageURL) {
                                    ZStack {
                                        Rectangle().fill(VelaColor.bgWarm)
                                        Text("🖼").font(.system(size: 16))
                                    }
                                }
                                .scaledToFill()
                                .frame(maxWidth: .infinity)
                                .aspectRatio(1, contentMode: .fill)
                                .clipped()

                                Text(nft.displayName.components(separatedBy: "#").last.map { "#\($0)" } ?? nft.displayName)
                                    .font(.system(size: 10))
                                    .foregroundStyle(VelaColor.textSecondary)
                                    .lineLimit(1)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 4)
                            }
                            .background(VelaColor.bg)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                            .overlay(RoundedRectangle(cornerRadius: 8).stroke(VelaColor.border, lineWidth: 1))
                        }
                    }
                }
                .padding(10)
            }
        }
        .background(VelaColor.bgCard)
        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
        .overlay(RoundedRectangle(cornerRadius: VelaRadius.card).stroke(VelaColor.border, lineWidth: 1))
    }

    private var collectionFallback: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 12).fill(VelaColor.bgWarm)
            Text(String(collection.name.prefix(2)).uppercased())
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(VelaColor.textSecondary)
        }
        .frame(width: 48, height: 48)
    }
}

// MARK: - NFT Send View

struct NFTSendView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(WalletState.self) private var wallet
    let nft: APINFT

    @State private var toAddress = ""
    @State private var isSending = false
    @State private var errorMessage: String?
    @State private var txHash: String?

    var body: some View {
        if let hash = txHash {
            VStack(spacing: 20) {
                Spacer()
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 56)).foregroundStyle(VelaColor.green)
                Text("NFT Sent").font(VelaFont.heading(24)).foregroundStyle(VelaColor.textPrimary)
                Text(nft.displayName).font(VelaFont.label(16)).foregroundStyle(VelaColor.textSecondary)
                Text(shortAddr(hash)).font(VelaFont.mono(12)).foregroundStyle(VelaColor.textTertiary)
                Spacer()
                Button { dismiss() } label: { Text("confirm.done") }
                    .buttonStyle(VelaPrimaryButtonStyle())
                    .padding(.horizontal, 28).padding(.bottom, 24)
            }
            .background(VelaColor.bg)
        } else {
            VStack(spacing: 0) {
                VelaNavBar(title: "Send NFT", onBack: { dismiss() })

                ScrollView {
                    VStack(spacing: 20) {
                        // NFT preview
                        HStack(spacing: 12) {
                            CachedAsyncImage(url: nft.imageURL) {
                                ZStack { RoundedRectangle(cornerRadius: 8).fill(VelaColor.bgWarm); Text("🖼") }
                            }
                            .scaledToFill()
                            .frame(width: 56, height: 56)
                            .clipShape(RoundedRectangle(cornerRadius: 8))

                            VStack(alignment: .leading, spacing: 2) {
                                Text(nft.displayName).font(.system(size: 15, weight: .semibold)).foregroundStyle(VelaColor.textPrimary)
                                Text(nft.collectionName ?? nft.chainName).font(.system(size: 12)).foregroundStyle(VelaColor.textTertiary)
                                Text("Token ID: \(nft.tokenId)").font(VelaFont.mono(11)).foregroundStyle(VelaColor.textTertiary)
                            }
                            Spacer()
                        }
                        .padding(12)
                        .velaCard()

                        // To address
                        VStack(alignment: .leading, spacing: 8) {
                            Text("send.to")
                                .font(.system(size: 12, weight: .semibold)).tracking(1)
                                .foregroundStyle(VelaColor.textTertiary).padding(.leading, 4)
                            TextField(String(localized: "send.to_placeholder"), text: $toAddress)
                                .font(VelaFont.mono(14))
                                .autocorrectionDisabled().textInputAutocapitalization(.never)
                                .padding(16)
                                .background(VelaColor.bgCard)
                                .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                                .overlay(RoundedRectangle(cornerRadius: VelaRadius.card).stroke(VelaColor.border, lineWidth: 1.5))
                        }

                        if let error = errorMessage {
                            Text(error).font(.system(size: 13)).foregroundStyle(VelaColor.accent).multilineTextAlignment(.center)
                        }
                    }
                    .padding(.horizontal, VelaSpacing.screenH)
                    .padding(.top, 8)
                }

                Button { sendNFT() } label: {
                    if isSending {
                        HStack(spacing: 8) { ProgressView().tint(.white); Text("Sending...") }
                    } else {
                        Text("Send NFT")
                    }
                }
                .buttonStyle(VelaPrimaryButtonStyle())
                .disabled(toAddress.count < 42 || isSending)
                .padding(.horizontal, 28).padding(.bottom, 24)
            }
            .background(VelaColor.bg)
        }
    }

    private func sendNFT() {
        isSending = true; errorMessage = nil
        Task {
            do {
                let credentialId = wallet.activeAccount?.id ?? ""
                let stored = LocalStorage.shared.findAccount(byCredentialId: credentialId)
                guard let publicKeyHex = stored?.publicKeyHex, !publicKeyHex.isEmpty else {
                    throw PasskeyService.PasskeyError.failed("Public key not found")
                }

                let selector = EthCrypto.functionSelector("safeTransferFrom(address,address,uint256)")
                let calldata = selector
                    + EthCrypto.abiEncode(address: wallet.address)
                    + EthCrypto.abiEncode(address: toAddress)
                    + EthCrypto.abiEncode(uint256: UInt64(nft.tokenId) ?? 0)

                let service = SafeTransactionService()
                let result = try await service.sendContractCall(
                    from: wallet.address, to: nft.contractAddress,
                    valueWei: "0", data: calldata,
                    chainId: nft.chainId, publicKeyHex: publicKeyHex
                )
                txHash = result.txHash
            } catch {
                errorMessage = error.localizedDescription
            }
            isSending = false
        }
    }
}

private extension APINFT {
    var chainId: Int {
        switch network {
        case "eth-mainnet": 1
        case "arb-mainnet": 42161
        case "base-mainnet": 8453
        case "opt-mainnet": 10
        case "matic-mainnet": 137
        case "bnb-mainnet": 56
        case "avax-mainnet": 43114
        default: 1
        }
    }
}
