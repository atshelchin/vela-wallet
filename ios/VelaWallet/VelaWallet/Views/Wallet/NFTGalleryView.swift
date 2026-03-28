import SwiftUI

struct NFTGalleryView: View {
    @Environment(WalletState.self) private var wallet
    @State private var nfts: [APINFT] = []
    @State private var isLoading = false
    @State private var expandedCollection: String?
    @State private var selectedNFT: APINFT?
    @State private var nftToSend: APINFT?

    private var collections: [NFTCollection] {
        Dictionary(grouping: nfts) { $0.collectionName ?? $0.contractAddress }
            .map { (name, items) in
                NFTCollection(
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
            ScrollView {
                VStack(spacing: 12) {
                    if isLoading {
                        Spacer(minLength: 100)
                        ProgressView()
                        Spacer()
                    } else if collections.isEmpty {
                        Spacer(minLength: 80)
                        VStack(spacing: 16) {
                            Text("🖼").font(.system(size: 40))
                            Text("tab.nfts.empty")
                                .font(VelaFont.body(14))
                                .foregroundStyle(VelaColor.textTertiary)
                        }
                        Spacer()
                    } else {
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
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .background(VelaColor.bg)
            .navigationBarHidden(true)
            .safeAreaInset(edge: .top) {
                HStack {
                    Text("tab.nfts")
                        .font(VelaFont.title(17))
                        .foregroundStyle(VelaColor.textPrimary)
                    Spacer()
                }
                .padding(.horizontal, VelaSpacing.screenH)
                .padding(.vertical, 12)
                .background(VelaColor.bg)
            }
            .task { await loadNFTs() }
            .sheet(item: $selectedNFT) { nft in
                NFTDetailView(nft: nft, onSend: { nftToSend = $0 })
            }
            .sheet(item: $nftToSend) { nft in
                NFTSendView(nft: nft)
            }
        }
    }

    private func loadNFTs() async {
        guard !wallet.address.isEmpty else { return }
        isLoading = true
        do {
            nfts = try await WalletAPIService().fetchNFTs(address: wallet.address)
        } catch {
            debugLog("[NFTGallery] Failed: \(error)")
        }
        isLoading = false
    }
}

// MARK: - Collection Model

private struct NFTCollection {
    let name: String
    let contractAddress: String
    let chainName: String
    let image: String?
    let items: [APINFT]
}

// MARK: - Collection Card

private struct CollectionCard: View {
    let collection: NFTCollection
    let isExpanded: Bool
    let onToggle: () -> Void
    let onNFTTap: (APINFT) -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Header
            Button(action: onToggle) {
                HStack(spacing: 12) {
                    // Collection icon
                    if let urlStr = collection.image, let url = URL(string: urlStr.hasPrefix("ipfs://") ? "https://ipfs.io/ipfs/\(urlStr.dropFirst(7))" : urlStr) {
                        CachedAsyncImage(url: url) {
                            collectionFallback
                        }
                        .scaledToFill()
                        .frame(width: 44, height: 44)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    } else {
                        collectionFallback
                    }

                    VStack(alignment: .leading, spacing: 2) {
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
            RoundedRectangle(cornerRadius: 10).fill(VelaColor.bgWarm)
            Text(String(collection.name.prefix(2)).uppercased())
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(VelaColor.textSecondary)
        }
        .frame(width: 44, height: 44)
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
            // Success
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

                // safeTransferFrom(from, to, tokenId)
                let selector = EthCrypto.functionSelector("safeTransferFrom(address,address,uint256)")
                let fromEncoded = EthCrypto.abiEncode(address: wallet.address)
                let toEncoded = EthCrypto.abiEncode(address: toAddress)
                let tokenIdEncoded = EthCrypto.abiEncode(uint256: UInt64(nft.tokenId) ?? 0)
                let calldata = selector + fromEncoded + toEncoded + tokenIdEncoded

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
