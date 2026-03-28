import SwiftUI

struct TransactionHistoryView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(WalletState.self) private var wallet
    @State private var transactions: [Transaction] = []
    @State private var isLoading = false
    @State private var selectedTx: Transaction?

    var body: some View {
        VStack(spacing: 0) {
            VelaNavBar(title: "tx.history_title", onBack: { dismiss() })

            if isLoading {
                Spacer()
                ProgressView()
                Spacer()
            } else if transactions.isEmpty {
                Spacer()
                VStack(spacing: 16) {
                    ZStack {
                        Circle().fill(VelaColor.bgWarm).frame(width: 64, height: 64)
                        Image(systemName: "doc.text").font(.system(size: 28)).foregroundStyle(VelaColor.textTertiary)
                    }
                    Text("tx.empty").font(VelaFont.body(14)).foregroundStyle(VelaColor.textTertiary)
                }
                Spacer()
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(transactions) { tx in
                            Button { selectedTx = tx } label: {
                                txRow(tx)
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
                .refreshable { await loadTransactions() }
            }
        }
        .background(VelaColor.bg)
        .task { await loadTransactions() }
        .sheet(item: $selectedTx) { tx in
            TransactionDetailView(tx: tx)
        }
    }

    private func txRow(_ tx: Transaction) -> some View {
        HStack(spacing: 12) {
            // Direction icon
            ZStack {
                Circle().fill(tx.isSend ? VelaColor.accentSoft : tx.isReceive ? VelaColor.greenSoft : VelaColor.bgWarm)
                    .frame(width: 40, height: 40)
                Image(systemName: tx.isSend ? "arrow.up" : tx.isReceive ? "arrow.down" : "arrow.left.arrow.right")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tx.isSend ? VelaColor.accent : tx.isReceive ? VelaColor.green : VelaColor.textSecondary)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(tx.isSend ? "Sent \(tx.symbol)" : tx.isReceive ? "Received \(tx.symbol)" : tx.category == "approve" ? "Approved \(tx.symbol)" : "Contract Call")
                    .font(.system(size: 15, weight: .medium)).foregroundStyle(VelaColor.textPrimary).lineLimit(1)
                HStack(spacing: 6) {
                    Text(tx.chainName).font(.system(size: 12)).foregroundStyle(VelaColor.textTertiary)
                    Text("·").foregroundStyle(VelaColor.textTertiary)
                    Text(tx.timeAgo).font(.system(size: 12)).foregroundStyle(VelaColor.textTertiary)
                }
            }

            Spacer()

            if !tx.displayValue.isEmpty {
                Text("\(tx.isSend ? "-" : "+")\(tx.displayValue)")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(tx.isSend ? VelaColor.accent : VelaColor.green)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 14)
        .contentShape(Rectangle())
    }

    private func loadTransactions() async {
        guard !wallet.address.isEmpty else { return }
        isLoading = transactions.isEmpty
        do {
            transactions = try await TransactionHistoryService().fetchTransactions(address: wallet.address)
        } catch {
            debugLog("[TxHistory] Failed: \(error)")
        }
        isLoading = false
    }
}

// MARK: - Transaction Detail

struct TransactionDetailView: View {
    @Environment(\.dismiss) private var dismiss
    let tx: Transaction

    var body: some View {
        VStack(spacing: 0) {
            VelaNavBar(title: "tx.detail_title", onBack: { dismiss() })

            ScrollView {
                VStack(spacing: 20) {
                    // Direction + value
                    VStack(spacing: 8) {
                        ZStack {
                            Circle().fill(tx.isSend ? VelaColor.accentSoft : VelaColor.greenSoft).frame(width: 56, height: 56)
                            Image(systemName: tx.isSend ? "arrow.up" : "arrow.down")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(tx.isSend ? VelaColor.accent : VelaColor.green)
                        }

                        if !tx.displayValue.isEmpty {
                            Text("\(tx.isSend ? "-" : "+")\(tx.displayValue) \(tx.symbol)")
                                .font(.system(size: 28, weight: .bold)).foregroundStyle(VelaColor.textPrimary)
                        }

                        Text(tx.isSend ? "Sent" : tx.isReceive ? "Received" : tx.category == "approve" ? "Approved" : "Contract Call")
                            .font(VelaFont.body(14)).foregroundStyle(VelaColor.textSecondary)
                    }
                    .padding(.top, 16)

                    // Detail card
                    VStack(spacing: 0) {
                        detailRow(label: String(localized: "tx.status"), value: tx.status == "confirmed" ? "✅ Confirmed" : "❌ Failed")
                        detailRow(label: String(localized: "tx.network"), value: tx.chainName)
                        detailRow(label: String(localized: "tx.from"), value: shortAddr(tx.from), copyable: tx.from)
                        detailRow(label: String(localized: "tx.to"), value: shortAddr(tx.to), copyable: tx.to)
                        detailRow(label: String(localized: "tx.hash"), value: shortAddr(tx.hash), copyable: tx.hash)
                        if let addr = tx.tokenAddress {
                            detailRow(label: String(localized: "token.contract"), value: shortAddr(addr), copyable: addr)
                        }
                        if let tokenId = tx.tokenId {
                            detailRow(label: "Token ID", value: tokenId, isLast: true)
                        } else {
                            detailRow(label: String(localized: "tx.time"), value: tx.timeAgo, isLast: true)
                        }
                    }
                    .background(VelaColor.bgCard)
                    .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                    .overlay(RoundedRectangle(cornerRadius: VelaRadius.card).stroke(VelaColor.border, lineWidth: 1))
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            }
        }
        .background(VelaColor.bg)
    }

    private func detailRow(label: String, value: String, copyable: String? = nil, isLast: Bool = false) -> some View {
        HStack {
            Text(label).font(.system(size: 13)).foregroundStyle(VelaColor.textTertiary)
            Spacer()
            if let copyValue = copyable {
                Button {
                    UIPasteboard.general.string = copyValue
                } label: {
                    HStack(spacing: 4) {
                        Text(value).font(VelaFont.mono(12)).foregroundStyle(VelaColor.textPrimary)
                        Image(systemName: "doc.on.doc").font(.system(size: 10)).foregroundStyle(VelaColor.textTertiary)
                    }
                }
            } else {
                Text(value).font(.system(size: 13, weight: .medium)).foregroundStyle(VelaColor.textPrimary)
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 13)
        .overlay(alignment: .bottom) {
            if !isLast { VelaColor.border.frame(height: 1) }
        }
    }
}
