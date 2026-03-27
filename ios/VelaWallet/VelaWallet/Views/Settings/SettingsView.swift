import SwiftUI

struct SettingsView: View {
    @Environment(WalletState.self) private var wallet
    @State private var showNetworkEditor = false
    @State private var showAccountSwitcher = false
    @State private var showLanguagePicker = false
    @State private var pendingUploadCount = 0

    private var lang: LanguageManager { .shared }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Account section
                    SettingsSection(title: "settings.account") {
                        Button { showAccountSwitcher = true } label: {
                            SettingsRow(
                                icon: "person.crop.circle",
                                iconStyle: .orange,
                                title: wallet.activeAccount?.name ?? "No Wallet",
                                subtitle: wallet.shortAddress.isEmpty
                                    ? String(localized: "settings.switch_account")
                                    : wallet.shortAddress,
                                showDivider: false
                            )
                        }
                    }

                    // Pending uploads warning
                    if pendingUploadCount > 0 {
                        SettingsSection(title: "settings.pending") {
                            let pendings = LocalStorage.shared.loadPendingUploads()
                            ForEach(Array(pendings.enumerated()), id: \.element.id) { index, pending in
                                Button { retryAllPendingUploads() } label: {
                                    SettingsRow(
                                        icon: "arrow.up.circle",
                                        iconStyle: .orange,
                                        title: pending.name,
                                        subtitle: String(localized: "settings.pending_uploads"),
                                        showDivider: index < pendings.count - 1
                                    )
                                }
                            }
                        }
                    }

                    // Networks section
                    SettingsSection(title: "settings.networks_section") {
                        Button { showNetworkEditor = true } label: {
                            SettingsRow(
                                icon: "globe",
                                iconStyle: .blue,
                                title: String(localized: "settings.networks"),
                                subtitle: String(localized: "settings.networks_rpc_desc"),
                                showDivider: false
                            )
                        }
                    }

                    // General section
                    SettingsSection(title: "settings.general") {
                        Button { showLanguagePicker = true } label: {
                            SettingsRow(
                                icon: "globe.americas.fill",
                                iconStyle: .green,
                                title: String(localized: "settings.language"),
                                subtitle: lang.current.displayName,
                                showDivider: true
                            )
                        }

                        SettingsRow(
                            icon: "info.circle.fill",
                            iconStyle: .gray,
                            title: String(localized: "settings.about"),
                            subtitle: String(localized: "settings.version", defaultValue: "Version \("1.0.0")"),
                            showDivider: false
                        )
                    }
                }
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .background(VelaColor.bg)
            .navigationBarHidden(true)
            .safeAreaInset(edge: .top) {
                VelaNavBar(title: "settings.title")
                    .background(VelaColor.bg)
            }
            .sheet(isPresented: $showNetworkEditor) {
                NetworkEditorView()
            }
            .sheet(isPresented: $showAccountSwitcher) {
                AccountSwitcherView()
            }
            .sheet(isPresented: $showLanguagePicker) {
                LanguagePickerView()
                    .presentationDetents([.height(280)])
            }
            .onAppear {
                pendingUploadCount = LocalStorage.shared.loadPendingUploads().count
            }
        }
    }

    private func retryAllPendingUploads() {
        let passkeyService = PasskeyService()
        let indexService = PublicKeyIndexService()
        let pendings = LocalStorage.shared.loadPendingUploads()

        Task {
            for pending in pendings {
                do {
                    let challenge = try await indexService.getChallenge()
                    let challengeData = Data(challenge.utf8)
                    let assertion = try await passkeyService.sign(data: challengeData)

                    guard let rawSig = assertion.signature.flatMap({ AttestationParser.derSignatureToRaw($0) }) else { continue }

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
                    // Individual upload failed, continue with next
                }
            }
            pendingUploadCount = LocalStorage.shared.loadPendingUploads().count
        }
    }
}

// MARK: - Language Picker

struct LanguagePickerView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var showRestartAlert = false
    @State private var selectedLanguage: AppLanguage?
    private var lang: LanguageManager { .shared }

    var body: some View {
        VStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2.5)
                .fill(VelaColor.textTertiary.opacity(0.3))
                .frame(width: 36, height: 5)
                .padding(.top, 10)
                .padding(.bottom, 16)

            Text("settings.language")
                .font(VelaFont.title(17))
                .foregroundStyle(VelaColor.textPrimary)
                .padding(.bottom, 20)

            VStack(spacing: 8) {
                ForEach(AppLanguage.allCases) { language in
                    Button {
                        if language != lang.current {
                            selectedLanguage = language
                            showRestartAlert = true
                        }
                    } label: {
                        HStack(spacing: 14) {
                            Text(language.flag)
                                .font(.system(size: 24))

                            Text(language.displayName)
                                .font(.system(size: 16, weight: .medium))
                                .foregroundStyle(VelaColor.textPrimary)

                            Spacer()

                            if lang.current == language {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(VelaColor.accent)
                                    .font(.system(size: 20))
                            }
                        }
                        .padding(.horizontal, 20)
                        .padding(.vertical, 16)
                        .background(lang.current == language ? VelaColor.accentSoft : VelaColor.bgCard)
                        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                        .overlay(
                            RoundedRectangle(cornerRadius: VelaRadius.card)
                                .stroke(
                                    lang.current == language ? VelaColor.accent : VelaColor.border,
                                    lineWidth: lang.current == language ? 1.5 : 1
                                )
                        )
                    }
                }
            }
            .padding(.horizontal, 20)

            Spacer()
        }
        .background(VelaColor.bg)
        .alert("settings.language_restart_title", isPresented: $showRestartAlert) {
            Button(String(localized: "settings.language_restart_now"), role: .destructive) {
                if let language = selectedLanguage {
                    lang.setLanguage(language)
                    // Force quit to apply language change
                    exit(0)
                }
            }
            Button(String(localized: "settings.language_restart_later")) {
                if let language = selectedLanguage {
                    lang.setLanguage(language)
                }
                dismiss()
            }
            Button(String(localized: "confirm.cancel"), role: .cancel) {}
        } message: {
            Text("settings.language_restart_message")
        }
    }
}

// MARK: - Network Editor

struct NetworkEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var networks = Network.defaults

    var body: some View {
        VStack(spacing: 0) {
            VelaNavBar(title: "settings.networks", onBack: { dismiss() })

            ScrollView {
                VStack(spacing: 12) {
                    ForEach(Array(networks.enumerated()), id: \.element.id) { index, network in
                        NetworkConfigCard(network: $networks[index])
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
        }
        .background(VelaColor.bg)
    }
}

private struct NetworkConfigCard: View {
    @Binding var network: Network
    @State private var isExpanded = false

    var body: some View {
        VStack(spacing: 0) {
            // Header row
            Button { withAnimation(.easeInOut(duration: 0.2)) { isExpanded.toggle() } } label: {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(network.iconBg)
                            .frame(width: 36, height: 36)
                        Text(network.iconLabel)
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(network.iconColor)
                    }

                    VStack(alignment: .leading, spacing: 1) {
                        Text(network.displayName)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(VelaColor.textPrimary)
                        Text("Chain \(network.chainId)")
                            .font(.system(size: 12))
                            .foregroundStyle(VelaColor.textTertiary)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(VelaColor.textTertiary)
                        .rotationEffect(.degrees(isExpanded ? 90 : 0))
                }
                .padding(16)
            }

            if isExpanded {
                VelaColor.border.frame(height: 1)

                VStack(spacing: 14) {
                    ConfigField(label: "RPC URL", text: $network.rpcURL)
                    ConfigField(label: "Explorer", text: $network.explorerURL)
                    ConfigField(label: "Bundler", text: $network.bundlerURL)
                }
                .padding(16)
            }
        }
        .background(VelaColor.bgCard)
        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
        .overlay(
            RoundedRectangle(cornerRadius: VelaRadius.card)
                .stroke(VelaColor.border, lineWidth: 1)
        )
    }
}

private struct ConfigField: View {
    let label: String
    @Binding var text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label)
                .font(.system(size: 11, weight: .semibold))
                .tracking(1)
                .foregroundStyle(VelaColor.textTertiary)

            TextField(label, text: $text)
                .font(VelaFont.mono(12))
                .padding(12)
                .background(VelaColor.bgWarm)
                .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
        }
    }
}

// MARK: - Account Switcher

struct AccountSwitcherView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(WalletState.self) private var wallet

    @State private var isCreating = false
    @State private var showNameInput = false
    @State private var newAccountName = ""
    private let passkeyService = PasskeyService()

    var body: some View {
        VStack(spacing: 0) {
            VelaNavBar(title: "settings.accounts", onBack: { dismiss() })

            ScrollView {
                VStack(spacing: 16) {
                    // Existing accounts
                    ForEach(Array(wallet.accounts.enumerated()), id: \.element.id) { index, account in
                        Button {
                            wallet.activeAccountIndex = index
                            wallet.address = account.address
                            dismiss()
                        } label: {
                            HStack(spacing: 14) {
                                ZStack {
                                    Circle()
                                        .fill(VelaColor.accentSoft)
                                        .frame(width: 40, height: 40)
                                    Text(String(account.name.prefix(1)).uppercased())
                                        .font(.system(size: 16, weight: .bold))
                                        .foregroundStyle(VelaColor.accent)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(account.name)
                                        .font(.system(size: 15, weight: .semibold))
                                        .foregroundStyle(VelaColor.textPrimary)
                                    Text(account.shortAddress)
                                        .font(VelaFont.mono(12))
                                        .foregroundStyle(VelaColor.textTertiary)
                                }

                                Spacer()

                                if index == wallet.activeAccountIndex {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundStyle(VelaColor.accent)
                                }
                            }
                            .padding(16)
                            .background(VelaColor.bgCard)
                            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                            .overlay(
                                RoundedRectangle(cornerRadius: VelaRadius.card)
                                    .stroke(
                                        index == wallet.activeAccountIndex ? VelaColor.accent : VelaColor.border,
                                        lineWidth: index == wallet.activeAccountIndex ? 1.5 : 1
                                    )
                            )
                        }
                    }

                    // Name input for new account
                    if showNameInput {
                        VStack(spacing: 12) {
                            TextField(String(localized: "create.name_placeholder"), text: $newAccountName)
                                .font(.system(size: 16, weight: .medium))
                                .padding(16)
                                .background(VelaColor.bgCard)
                                .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                                .overlay(
                                    RoundedRectangle(cornerRadius: VelaRadius.card)
                                        .stroke(VelaColor.accent, lineWidth: 1.5)
                                )

                            HStack(spacing: 10) {
                                Button {
                                    showNameInput = false
                                    newAccountName = ""
                                } label: {
                                    Text("confirm.cancel")
                                }
                                .buttonStyle(VelaSecondaryButtonStyle())

                                Button { createNewAccount() } label: {
                                    if isCreating {
                                        ProgressView().tint(.white)
                                    } else {
                                        Text("create.button")
                                    }
                                }
                                .buttonStyle(VelaPrimaryButtonStyle())
                                .disabled(newAccountName.trimmingCharacters(in: .whitespaces).isEmpty || isCreating)
                            }
                        }
                    }

                    // Buttons
                    if !showNameInput {
                        VStack(spacing: 10) {
                            Button { showNameInput = true } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "plus.circle.fill")
                                    Text("settings.create_new_account")
                                }
                            }
                            .buttonStyle(VelaPrimaryButtonStyle())

                            Button { loginWithPasskey() } label: {
                                HStack(spacing: 8) {
                                    Image(systemName: "person.badge.key")
                                    Text("settings.login_with_passkey")
                                }
                            }
                            .buttonStyle(VelaSecondaryButtonStyle())
                            .disabled(isCreating)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
        }
        .background(VelaColor.bg)
    }

    private func createNewAccount() {
        isCreating = true
        let name = newAccountName.trimmingCharacters(in: .whitespaces)
        Task {
            do {
                let result = try await passkeyService.register(userName: name)
                let credentialId = result.credentialID.hexString

                // Extract public key
                let pubKey = result.publicKey.flatMap { AttestationParser.extractPublicKey(from: $0) }
                let publicKeyHex = pubKey?.uncompressedHex ?? ""
                let address = "0x" + String(credentialId.prefix(40))

                // Save locally
                let stored = LocalStorage.StoredAccount(
                    id: credentialId, name: name, publicKeyHex: publicKeyHex,
                    address: address, createdAt: Date()
                )
                LocalStorage.shared.saveAccount(stored)

                // Upload (best effort)
                let indexService = PublicKeyIndexService()
                var uploaded = false
                if let challenge = try? await indexService.getChallenge() {
                    let challengeData = Data(challenge.utf8)
                    if let assertion = try? await passkeyService.sign(data: challengeData),
                       let rawSig = assertion.signature.flatMap({ AttestationParser.derSignatureToRaw($0) }) {
                        let req = PublicKeyIndexService.CreateRequest(
                            rpId: PasskeyService.relyingParty,
                            credentialId: credentialId,
                            publicKey: publicKeyHex,
                            challenge: challenge,
                            signature: rawSig.hexString,
                            authenticatorData: assertion.authenticatorData?.base64URLEncoded ?? "",
                            clientDataJSON: assertion.clientDataJSON?.base64URLEncoded ?? "",
                            name: name
                        )
                        let _ = try? await indexService.create(request: req)
                        uploaded = true
                    }
                }

                if !uploaded {
                    // Save pending upload for retry
                    let pending = LocalStorage.PendingUpload(
                        id: credentialId, name: name, publicKeyHex: publicKeyHex,
                        attestationObjectHex: result.publicKey?.hexString ?? "",
                        createdAt: Date()
                    )
                    LocalStorage.shared.savePendingUpload(pending)
                }

                let account = Account(id: credentialId, name: name, address: address, createdAt: Date())
                wallet.accounts.append(account)
                wallet.activeAccountIndex = wallet.accounts.count - 1
                wallet.address = address
                isCreating = false
                dismiss()
            } catch {
                isCreating = false
            }
        }
    }

    private func loginWithPasskey() {
        isCreating = true
        Task {
            do {
                let result = try await passkeyService.authenticate()
                let credentialId = result.credentialID.hexString
                // Deduplicate: if this credential already exists, just switch to it
                if let existingIndex = wallet.accounts.firstIndex(where: { $0.id == credentialId }) {
                    wallet.activeAccountIndex = existingIndex
                    wallet.address = wallet.accounts[existingIndex].address
                } else {
                    let nameFromPasskey = result.userID.flatMap { PasskeyService.decodeUserName(from: $0) }
                    let stored = LocalStorage.shared.findAccount(byCredentialId: credentialId)
                    let name = nameFromPasskey ?? stored?.name ?? "Wallet"

                    // Compute correct address — never use credentialId as address
                    var address = stored?.address ?? ""
                    if address.isEmpty {
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

                    if !address.isEmpty {
                        let account = Account(id: credentialId, name: name, address: address, createdAt: Date())
                        wallet.accounts.append(account)
                        wallet.activeAccountIndex = wallet.accounts.count - 1
                        wallet.address = address
                    }
                }
                isCreating = false
                dismiss()
            } catch {
                isCreating = false
                print("[Settings] Login failed: \(error)")
            }
        }
    }
}

// MARK: - Settings Section

struct SettingsSection<Content: View>: View {
    let title: LocalizedStringResource
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .tracking(1.5)
                .foregroundStyle(VelaColor.textTertiary)
                .padding(.horizontal, VelaSpacing.screenH + 14)

            VStack(spacing: 0) {
                content
            }
            .background(VelaColor.bgCard)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: VelaRadius.card)
                    .stroke(VelaColor.border, lineWidth: 1)
            )
            .padding(.horizontal, 16)
        }
    }
}

// MARK: - Settings Row

struct SettingsRow: View {
    let icon: String
    let iconStyle: IconStyle
    let title: String
    var subtitle: String? = nil
    var showDivider: Bool = true

    enum IconStyle {
        case orange, blue, green, gray

        var bg: Color {
            switch self {
            case .orange: VelaColor.accentSoft
            case .blue: VelaColor.blueSoft
            case .green: VelaColor.greenSoft
            case .gray: VelaColor.bgWarm
            }
        }

        var fg: Color {
            switch self {
            case .orange: VelaColor.accent
            case .blue: VelaColor.blue
            case .green: VelaColor.green
            case .gray: VelaColor.textSecondary
            }
        }
    }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(iconStyle.bg)
                    .frame(width: 34, height: 34)
                Image(systemName: icon)
                    .font(.system(size: 15))
                    .foregroundStyle(iconStyle.fg)
            }

            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(VelaColor.textPrimary)
                if let subtitle {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(VelaColor.textTertiary)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(VelaColor.textTertiary)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .contentShape(Rectangle())
        .overlay(alignment: .bottom) {
            if showDivider {
                VelaColor.border.frame(height: 1)
                    .padding(.leading, 66)
            }
        }
    }
}

#Preview {
    SettingsView()
        .environment(WalletState())
}
