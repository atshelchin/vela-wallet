import SwiftUI

struct RootView: View {
    @Environment(WalletState.self) private var wallet

    var body: some View {
        if wallet.hasWallet {
            MainTabView()
        } else {
            OnboardingFlow()
        }
    }
}

struct OnboardingFlow: View {
    @Environment(WalletState.self) private var wallet
    @State private var step: OnboardingStep = .welcome

    enum OnboardingStep {
        case welcome
        case create
    }

    var body: some View {
        switch step {
        case .welcome:
            WelcomeView(
                onCreateWallet: { step = .create },
                onLogin: { handleLogin() }
            )
        case .create:
            CreateWalletView(
                onBack: { step = .welcome },
                onCreated: { address, name in
                    let account = Account(id: UUID().uuidString, name: name, address: address, createdAt: Date())
                    wallet.accounts.append(account)
                    wallet.activeAccountIndex = 0
                    wallet.address = address
                    wallet.hasWallet = true
                }
            )
        }
    }

    private func handleLogin() {
        let service = PasskeyService()
        Task {
            do {
                let result = try await service.authenticate()
                let credentialId = result.credentialID.hexString
                // Check if already exists in memory
                if let existingIndex = wallet.accounts.firstIndex(where: { $0.id == credentialId }) {
                    wallet.activeAccountIndex = existingIndex
                    wallet.address = wallet.accounts[existingIndex].address
                } else {
                    // Extract username from userID
                    let nameFromPasskey = result.userID.flatMap { PasskeyService.decodeUserName(from: $0) }
                    let stored = LocalStorage.shared.findAccount(byCredentialId: credentialId)
                    let name = nameFromPasskey ?? stored?.name ?? "Wallet"

                    // Compute correct Safe address from public key — NEVER use credentialId as address
                    var address = stored?.address ?? ""
                    if address.isEmpty {
                        // Try to get public key from server
                        if let record = try? await PublicKeyIndexService().query(
                            rpId: PasskeyService.relyingParty, credentialId: credentialId
                        ) {
                            address = SafeAddressComputer.computeAddress(publicKeyHex: record.publicKey)
                            LocalStorage.shared.saveAccount(LocalStorage.StoredAccount(
                                id: credentialId, name: name, publicKeyHex: record.publicKey,
                                address: address, createdAt: Date()
                            ))
                        }
                    }

                    guard !address.isEmpty else {
                        print("[Login] Cannot determine Safe address — no local data or server")
                        return // Stay on welcome, don't show a wrong address
                    }

                    let account = Account(id: credentialId, name: name, address: address, createdAt: Date())
                    wallet.accounts.append(account)
                    wallet.activeAccountIndex = wallet.accounts.count - 1
                    wallet.address = address
                }
                wallet.hasWallet = true
            } catch {
                // Don't silently swallow — at least log it
                print("[Login] Failed: \(error.localizedDescription)")
            }
        }
    }
}

struct MainTabView: View {
    @State private var selectedTab: Tab = .wallet
    @State private var showPendingUploads = false

    enum Tab {
        case wallet, dapps, settings
    }

    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                HomeView()
                    .tabItem {
                        Label(String(localized: "tab.wallet"), systemImage: "square.grid.2x2.fill")
                    }
                    .tag(Tab.wallet)

                VelaConnectView()
                    .tabItem {
                        Label(String(localized: "tab.dapps"), systemImage: "globe")
                    }
                    .tag(Tab.dapps)

            SettingsView()
                .tabItem {
                    Label(String(localized: "tab.settings"), systemImage: "gearshape")
                }
                .tag(Tab.settings)
        }
        .tint(VelaColor.accent)

            // Full-screen pending upload overlay
            if showPendingUploads {
                PendingUploadOverlay(onDismiss: {
                    showPendingUploads = false
                })
            }
        }
        .onAppear {
            showPendingUploads = LocalStorage.shared.hasPendingUploads()
        }
    }
}

// MARK: - Full-Screen Pending Upload Warning

struct PendingUploadOverlay: View {
    var onDismiss: () -> Void

    @State private var pendings: [LocalStorage.PendingUpload] = []
    @State private var currentIndex = 0
    @State private var isRetrying = false
    @State private var statusMessage: String?
    @State private var statusIsError = false

    private let passkeyService = PasskeyService()
    private let indexService = PublicKeyIndexService()

    private var currentPending: LocalStorage.PendingUpload? {
        guard currentIndex < pendings.count else { return nil }
        return pendings[currentIndex]
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.5).ignoresSafeArea()

            VStack(spacing: 0) {
                // Header
                VStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(VelaColor.accentSoft)
                            .frame(width: 64, height: 64)
                        Image(systemName: "arrow.up.doc.fill")
                            .font(.system(size: 26))
                            .foregroundStyle(VelaColor.accent)
                    }

                    Text("pending.title")
                        .font(VelaFont.heading(20))
                        .foregroundStyle(VelaColor.textPrimary)

                    Text("pending.description")
                        .font(VelaFont.body(13))
                        .foregroundStyle(VelaColor.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                }
                .padding(.top, 28)
                .padding(.horizontal, 24)

                // Account list
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(Array(pendings.enumerated()), id: \.element.id) { index, pending in
                            HStack(spacing: 12) {
                                ZStack {
                                    Circle()
                                        .fill(VelaColor.accentSoft)
                                        .frame(width: 36, height: 36)
                                    Text(String(pending.name.prefix(1)).uppercased())
                                        .font(.system(size: 14, weight: .bold))
                                        .foregroundStyle(VelaColor.accent)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(pending.name)
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(VelaColor.textPrimary)
                                    Text(pending.id.prefix(10) + "..." + pending.id.suffix(6))
                                        .font(VelaFont.mono(11))
                                        .foregroundStyle(VelaColor.textTertiary)
                                }

                                Spacer()

                                if isRetrying && currentIndex == index {
                                    ProgressView()
                                        .scaleEffect(0.8)
                                } else {
                                    Image(systemName: "arrow.up.circle")
                                        .font(.system(size: 18))
                                        .foregroundStyle(VelaColor.accent)
                                }
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(
                                isRetrying && currentIndex == index
                                    ? VelaColor.accentSoft
                                    : VelaColor.bgCard
                            )
                            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
                            .overlay(
                                RoundedRectangle(cornerRadius: VelaRadius.cardSmall)
                                    .stroke(VelaColor.border, lineWidth: 1)
                            )
                        }
                    }
                    .padding(.horizontal, 24)
                }
                .frame(maxHeight: 200)
                .padding(.top, 20)

                // Status
                if let msg = statusMessage {
                    Text(msg)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(statusIsError ? VelaColor.accent : VelaColor.green)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .padding(.top, 12)
                }

                // Buttons
                VStack(spacing: 10) {
                    Button(action: retryAll) {
                        if isRetrying {
                            HStack(spacing: 8) {
                                ProgressView().tint(.white)
                                if let p = currentPending {
                                    Text(p.name)
                                        .foregroundStyle(.white.opacity(0.7))
                                }
                            }
                        } else {
                            Text("create.retry_upload")
                        }
                    }
                    .buttonStyle(VelaAccentButtonStyle())
                    .disabled(isRetrying)

                    Button(action: onDismiss) {
                        Text("create.skip")
                            .font(VelaFont.label(14))
                            .foregroundStyle(VelaColor.textSecondary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .disabled(isRetrying)
                }
                .padding(.horizontal, 24)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
            .background(VelaColor.bg)
            .clipShape(RoundedRectangle(cornerRadius: 24))
            .padding(.horizontal, 20)
        }
        .onAppear {
            pendings = LocalStorage.shared.loadPendingUploads()
        }
    }

    private func retryAll() {
        isRetrying = true
        statusMessage = nil
        currentIndex = 0

        Task {
            var failedNames: [String] = []

            for i in 0..<pendings.count {
                currentIndex = i
                let pending = pendings[i]

                do {
                    let challenge = try await indexService.getChallenge()
                    let challengeData = Data(challenge.utf8)
                    let assertion = try await passkeyService.sign(data: challengeData)

                    guard let rawSig = assertion.signature.flatMap({ AttestationParser.derSignatureToRaw($0) }) else {
                        failedNames.append(pending.name)
                        continue
                    }

                    let req = PublicKeyIndexService.CreateRequest(
                        rpId: PasskeyService.relyingParty,
                        credentialId: pending.id,
                        publicKey: pending.publicKeyHex,
                        challenge: challenge,
                        signature: rawSig.hexString,
                        authenticatorData: assertion.authenticatorData?.base64URLEncoded ?? "",
                        clientDataJSON: assertion.clientDataJSON?.base64URLEncoded ?? "",
                        name: pending.name
                    )
                    let _ = try await indexService.create(request: req)
                    LocalStorage.shared.removePendingUpload(credentialId: pending.id)
                } catch {
                    failedNames.append(pending.name)
                    print("[PendingUpload] \(pending.name) failed: \(error.localizedDescription)")
                }
            }

            isRetrying = false
            pendings = LocalStorage.shared.loadPendingUploads()

            if failedNames.isEmpty {
                statusMessage = String(localized: "pending.all_success")
                statusIsError = false
                try? await Task.sleep(for: .seconds(1.2))
                onDismiss()
            } else {
                statusMessage = String(localized: "pending.some_failed") + " " + failedNames.joined(separator: ", ")
                statusIsError = true
            }
        }
    }
}

#Preview("Root - No Wallet") {
    RootView()
        .environment(WalletState())
}

#Preview("Root - Has Wallet") {
    let state = WalletState()
    state.hasWallet = true
    state.address = "0x7a3F8c2D1b4E9f6A5d3C0e8B7a2F4d6E1c9e92B"
    state.accounts = [Account(id: "1", name: "Personal", address: state.address, createdAt: Date())]
    return RootView()
        .environment(state)
}
