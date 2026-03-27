import SwiftUI

struct CreateWalletView: View {
    var onBack: () -> Void
    var onCreated: (String, String) -> Void  // (address, name)

    @State private var accountName = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @FocusState private var isNameFocused: Bool

    // After passkey is created, store for retry
    @State private var pendingCredentialId: String?
    @State private var pendingAddress: String?
    @State private var pendingName: String?
    @State private var uploadFailed = false

    private let passkeyService = PasskeyService()

    var body: some View {
        VStack(spacing: 0) {
            VelaNavBar(title: "", onBack: onBack)

            Spacer()

            VStack(spacing: 28) {
                ZStack {
                    RoundedRectangle(cornerRadius: 28)
                        .fill(VelaColor.bgWarm)
                        .overlay(
                            RoundedRectangle(cornerRadius: 28)
                                .stroke(VelaColor.border, lineWidth: 1)
                        )
                    Image(systemName: uploadFailed ? "exclamationmark.arrow.circlepath" : "person.badge.key.fill")
                        .font(.system(size: 36))
                        .foregroundStyle(VelaColor.accent)
                }
                .frame(width: 88, height: 88)

                if uploadFailed {
                    VStack(spacing: 12) {
                        Text("create.upload_failed_title")
                            .font(VelaFont.heading(24))
                            .foregroundStyle(VelaColor.textPrimary)
                        Text("create.upload_failed_desc")
                            .font(VelaFont.body(15))
                            .foregroundStyle(VelaColor.textSecondary)
                            .multilineTextAlignment(.center)
                            .lineSpacing(4)
                    }
                } else {
                    VStack(spacing: 12) {
                        Text("create.title")
                            .font(VelaFont.heading(28))
                            .foregroundStyle(VelaColor.textPrimary)
                        Text("create.description")
                            .font(VelaFont.body(15))
                            .foregroundStyle(VelaColor.textSecondary)
                            .multilineTextAlignment(.center)
                            .lineSpacing(4)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("create.name_label")
                            .font(.system(size: 12, weight: .semibold))
                            .tracking(1)
                            .foregroundStyle(VelaColor.textTertiary)
                            .padding(.leading, 4)

                        TextField(String(localized: "create.name_placeholder"), text: $accountName)
                            .font(.system(size: 16, weight: .medium))
                            .padding(16)
                            .background(VelaColor.bgCard)
                            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
                            .overlay(
                                RoundedRectangle(cornerRadius: VelaRadius.card)
                                    .stroke(VelaColor.border, lineWidth: 1.5)
                            )
                            .focused($isNameFocused)
                    }

                    HStack(spacing: 10) {
                        Image(systemName: "shield.fill")
                            .font(.system(size: 16))
                        Text("create.security_note")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundStyle(VelaColor.green)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 14)
                    .background(VelaColor.greenSoft)
                    .clipShape(RoundedRectangle(cornerRadius: VelaRadius.cardSmall))
                }

                if let error = errorMessage {
                    Text(error)
                        .font(.system(size: 13))
                        .foregroundStyle(VelaColor.accent)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 36)

            Spacer()

            VStack(spacing: 12) {
                if uploadFailed {
                    Button(action: retryUpload) {
                        if isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text("create.retry_upload")
                        }
                    }
                    .buttonStyle(VelaPrimaryButtonStyle())
                    .disabled(isLoading)

                    Button(action: skipAndContinue) {
                        Text("create.skip")
                    }
                    .buttonStyle(VelaSecondaryButtonStyle())
                } else {
                    Button(action: handleCreatePasskey) {
                        if isLoading {
                            ProgressView().tint(.white)
                        } else {
                            Text("create.button")
                        }
                    }
                    .buttonStyle(VelaPrimaryButtonStyle())
                    .disabled(isLoading || accountName.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
        .background(VelaColor.bg)
        .onAppear { isNameFocused = true }
    }

    // MARK: - Create Passkey

    private func handleCreatePasskey() {
        isLoading = true
        errorMessage = nil
        let name = accountName.trimmingCharacters(in: .whitespaces)

        Task {
            do {
                let result = try await passkeyService.register(userName: name)
                let credentialId = result.credentialID.hexString

                // Extract P256 public key from attestation
                guard let attestation = result.publicKey,
                      let pubKey = AttestationParser.extractPublicKey(from: attestation) else {
                    isLoading = false
                    errorMessage = "Failed to extract public key from attestation"
                    return
                }

                let publicKeyHex = pubKey.uncompressedHex
                // Compute real Safe address from P-256 public key (CREATE2)
                let address = SafeAddressComputer.computeAddress(publicKeyHex: publicKeyHex)
                debugLog("[CreateWallet] publicKey: \(publicKeyHex)")
                debugLog("[CreateWallet] Safe address: \(address)")

                // Save to local storage immediately
                let stored = LocalStorage.StoredAccount(
                    id: credentialId,
                    name: name,
                    publicKeyHex: publicKeyHex,
                    address: address,
                    createdAt: Date()
                )
                LocalStorage.shared.saveAccount(stored)

                pendingCredentialId = credentialId
                pendingAddress = address
                pendingName = name

                // Save pending upload in case it fails
                let pending = LocalStorage.PendingUpload(
                    id: credentialId,
                    name: name,
                    publicKeyHex: publicKeyHex,
                    attestationObjectHex: attestation.hexString,
                    createdAt: Date()
                )
                LocalStorage.shared.savePendingUpload(pending)

                // Try upload
                await uploadPublicKey(credentialId: credentialId, publicKeyHex: publicKeyHex, name: name)
            } catch let error as PasskeyService.PasskeyError {
                isLoading = false
                if case .cancelled = error { return }
                errorMessage = error.localizedDescription
            } catch {
                isLoading = false
                errorMessage = error.localizedDescription
            }
        }
    }

    // MARK: - Upload Public Key

    private func uploadPublicKey(credentialId: String, publicKeyHex: String, name: String) async {
        do {
            let indexService = PublicKeyIndexService()
            let challenge = try await indexService.getChallenge()
            let challengeData = Data(challenge.utf8)

            let assertion = try await passkeyService.sign(data: challengeData)

            // Convert DER signature to raw r||s
            let derSig = assertion.signature ?? Data()
            debugLog("[Upload] DER sig hex: \(derSig.hexString)")
            debugLog("[Upload] DER sig length: \(derSig.count) bytes")

            guard let rawSig = AttestationParser.derSignatureToRaw(derSig) else {
                debugLog("[Upload] DER→raw conversion failed")
                throw PasskeyService.PasskeyError.failed("Failed to convert signature format")
            }

            debugLog("[Upload] Raw sig hex: \(rawSig.hexString)")
            debugLog("[Upload] publicKey: \(publicKeyHex)")
            debugLog("[Upload] authData hex: \(assertion.authenticatorData?.hexString ?? "nil")")
            debugLog("[Upload] clientDataJSON: \(String(data: assertion.clientDataJSON ?? Data(), encoding: .utf8) ?? "nil")")

            let createRequest = PublicKeyIndexService.CreateRequest(
                rpId: PasskeyService.relyingParty,
                credentialId: credentialId,
                publicKey: publicKeyHex,
                challenge: challenge,
                signature: rawSig.hexString,
                authenticatorData: assertion.authenticatorData?.base64URLEncoded ?? "",
                clientDataJSON: assertion.clientDataJSON?.base64URLEncoded ?? "",
                name: name
            )

            let _ = try await indexService.create(request: createRequest)

            // Upload succeeded — remove from pending
            LocalStorage.shared.removePendingUpload(credentialId: credentialId)

            isLoading = false
            onCreated(pendingAddress ?? "", name)
        } catch {
            isLoading = false
            uploadFailed = true
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Retry

    private func retryUpload() {
        guard let credentialId = pendingCredentialId, let name = pendingName else { return }
        let stored = LocalStorage.shared.findAccount(byCredentialId: credentialId)
        guard let publicKeyHex = stored?.publicKeyHex else { return }

        isLoading = true
        errorMessage = nil
        Task {
            await uploadPublicKey(credentialId: credentialId, publicKeyHex: publicKeyHex, name: name)
        }
    }

    // MARK: - Skip

    private func skipAndContinue() {
        if let addr = pendingAddress, let name = pendingName {
            onCreated(addr, name)
        }
    }
}

#Preview {
    CreateWalletView(onBack: {}, onCreated: { _, _ in })
}
