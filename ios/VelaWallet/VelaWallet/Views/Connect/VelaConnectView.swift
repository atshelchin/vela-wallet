import SwiftUI

struct VelaConnectView: View {
    @Environment(WalletState.self) private var wallet
    @StateObject private var ble = BLEPeripheralService.shared

    @State private var incomingRequest: BLEIncomingRequest?
    @State private var isSigning = false
    @State private var signResult: String?
    @State private var signError: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VelaNavBar(title: "connect.title")

                if let request = incomingRequest {
                    requestView(request)
                } else if ble.connectedCentral != nil {
                    connectedState
                } else {
                    pairingState
                }
            }
            .background(VelaColor.bg)
            .navigationBarHidden(true)
        }
        .onAppear {
            ble.onRequest = { request in
                incomingRequest = request
            }
        }
    }

    // MARK: - Pairing

    private var pairingState: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 32) {
                ZStack {
                    Circle()
                        .stroke(VelaColor.blue.opacity(0.06), lineWidth: 1)
                        .frame(width: 160, height: 160)
                    Circle()
                        .stroke(VelaColor.blue.opacity(0.12), lineWidth: 1.5)
                        .frame(width: 128, height: 128)
                    Circle()
                        .fill(VelaColor.blueSoft)
                        .frame(width: 100, height: 100)
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .font(.system(size: 32))
                        .foregroundStyle(VelaColor.blue)
                }

                VStack(spacing: 10) {
                    Text("connect.heading")
                        .font(VelaFont.heading(24))
                        .foregroundStyle(VelaColor.textPrimary)
                    Text("connect.description")
                        .font(VelaFont.body(14))
                        .foregroundStyle(VelaColor.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                }

                VStack(spacing: 12) {
                    StepRow(number: 1, text: String(localized: "connect.step1"))
                    StepRow(number: 2, text: String(localized: "connect.step2"))
                    StepRow(number: 3, text: String(localized: "connect.step3"))
                }
            }
            .padding(.horizontal, 36)

            Spacer()

            Button {
                if ble.isAdvertising {
                    ble.stopAdvertising()
                } else {
                    let name = wallet.activeAccount?.name ?? "Vela Wallet"
                    ble.startAdvertising(
                        walletAddress: wallet.address,
                        accountName: name,
                        chainId: 1
                    )
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: ble.isAdvertising ? "stop.circle" : "antenna.radiowaves.left.and.right")
                    Text(ble.isAdvertising ? String(localized: "connect.stop") : String(localized: "connect.pair_button"))
                }
            }
            .buttonStyle(ble.isAdvertising ? VelaSecondaryButtonStyle() : BlueButtonStyle())
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
    }

    // MARK: - Connected

    private var connectedState: some View {
        VStack(spacing: 0) {
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(VelaColor.blueSoft)
                        .frame(width: 44, height: 44)
                    Image(systemName: "desktopcomputer")
                        .font(.system(size: 20))
                        .foregroundStyle(VelaColor.blue)
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Chrome — Vela Connect")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(VelaColor.textPrimary)
                    HStack(spacing: 4) {
                        NetworkDot(color: VelaColor.green, size: 6)
                        Text("connect.status_connected")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(VelaColor.green)
                    }
                }

                Spacer()
            }
            .padding(16)
            .background(VelaColor.bgCard)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: VelaRadius.card)
                    .stroke(Color(hex: 0xD4DDFF), lineWidth: 1.5)
            )
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.top, 24)

            Spacer()

            VStack(spacing: 20) {
                ZStack {
                    Circle()
                        .fill(VelaColor.greenSoft)
                        .frame(width: 64, height: 64)
                    Image(systemName: "checkmark")
                        .font(.system(size: 26, weight: .semibold))
                        .foregroundStyle(VelaColor.green)
                }

                VStack(spacing: 8) {
                    Text("connect.connected")
                        .font(VelaFont.heading(22))
                        .foregroundStyle(VelaColor.textPrimary)
                    Text("connect.connected_desc")
                        .font(VelaFont.body(14))
                        .foregroundStyle(VelaColor.textSecondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                }
            }
            .padding(.horizontal, 36)

            Spacer()

            Button {
                ble.stopAdvertising()
            } label: {
                Text("connect.disconnect")
            }
            .buttonStyle(DisconnectButtonStyle())
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
    }

    // MARK: - Incoming Request

    private func requestView(_ request: BLEIncomingRequest) -> some View {
        VStack(spacing: 0) {
            // Origin
            HStack(spacing: 8) {
                if let favicon = request.favicon, let url = URL(string: favicon) {
                    AsyncImage(url: url) { image in
                        image.resizable().frame(width: 20, height: 20).clipShape(RoundedRectangle(cornerRadius: 4))
                    } placeholder: {
                        RoundedRectangle(cornerRadius: 4).fill(VelaColor.bgWarm).frame(width: 20, height: 20)
                    }
                }
                Text(request.origin)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(VelaColor.textPrimary)
                    .lineLimit(1)
                Spacer()
            }
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.top, 16)
            .padding(.bottom, 12)

            // Request card
            VStack(spacing: 0) {
                HStack {
                    Text(request.method.uppercased())
                        .font(.system(size: 10, weight: .semibold))
                        .tracking(1)
                        .foregroundStyle(VelaColor.textTertiary)
                    Spacer()
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 8)

                Text(methodDisplayName(request.method))
                    .font(VelaFont.heading(20))
                    .foregroundStyle(VelaColor.textPrimary)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 14)
            }
            .background(VelaColor.bgCard)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
            .overlay(
                RoundedRectangle(cornerRadius: VelaRadius.card)
                    .stroke(VelaColor.border, lineWidth: 1)
            )
            .padding(.horizontal, VelaSpacing.screenH)

            if let error = signError {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(VelaColor.accent)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, VelaSpacing.screenH)
                    .padding(.top, 12)
            }

            Spacer()

            // Approve / Reject
            VStack(spacing: 10) {
                Button { approveRequest(request) } label: {
                    if isSigning {
                        HStack(spacing: 8) {
                            ProgressView().tint(.white)
                            Text("Signing...")
                        }
                    } else {
                        Text("confirm.button")
                    }
                }
                .buttonStyle(VelaAccentButtonStyle())
                .disabled(isSigning)

                Button { rejectRequest(request) } label: {
                    Text("Reject")
                        .font(VelaFont.label(14))
                        .foregroundStyle(VelaColor.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
            }
            .padding(.horizontal, VelaSpacing.screenH)
            .padding(.bottom, 24)
        }
    }

    // MARK: - Request Handling

    private func approveRequest(_ request: BLEIncomingRequest) {
        isSigning = true
        signError = nil

        Task {
            do {
                // TODO: Route to SafeTransactionService based on method
                // For now, sign with Passkey and return
                let passkeyService = PasskeyService()

                // Build the data to sign based on method
                let dataToSign: Data
                if request.method == "personal_sign",
                   let hexMsg = request.params.first?.value as? String {
                    dataToSign = Data(hexString: String(hexMsg.dropFirst(2))) ?? Data(hexMsg.utf8)
                } else {
                    // Generic: hash the request params
                    let jsonData = try JSONEncoder().encode(request.params)
                    dataToSign = EthCrypto.keccak256(jsonData)
                }

                let assertion = try await passkeyService.sign(data: dataToSign)

                guard let sig = assertion.signature else {
                    throw PasskeyService.PasskeyError.signatureFailed
                }

                let response = BLEOutgoingResponse(
                    id: request.id,
                    result: AnyCodable("0x" + sig.hexString),
                    error: nil
                )
                ble.sendResponse(response)
                incomingRequest = nil
                isSigning = false
            } catch {
                isSigning = false
                signError = error.localizedDescription
            }
        }
    }

    private func rejectRequest(_ request: BLEIncomingRequest) {
        let response = BLEOutgoingResponse(
            id: request.id,
            result: nil,
            error: BLEError(code: 4001, message: "User rejected the request")
        )
        ble.sendResponse(response)
        incomingRequest = nil
    }

    private func methodDisplayName(_ method: String) -> String {
        switch method {
        case "eth_sendTransaction": return "Send Transaction"
        case "personal_sign": return "Sign Message"
        case "eth_signTypedData_v4": return "Sign Typed Data"
        case "eth_requestAccounts": return "Connect"
        default: return method
        }
    }
}

// MARK: - Step Row

private struct StepRow: View {
    let number: Int
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(VelaColor.bgWarm).frame(width: 24, height: 24)
                Text("\(number)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(VelaColor.textSecondary)
            }
            Text(text)
                .font(VelaFont.body(14))
                .foregroundStyle(VelaColor.textPrimary)
                .lineSpacing(3)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(VelaColor.bgCard)
        .clipShape(RoundedRectangle(cornerRadius: VelaRadius.card))
        .overlay(RoundedRectangle(cornerRadius: VelaRadius.card).stroke(VelaColor.border, lineWidth: 1))
    }
}

// MARK: - Button Styles

private struct BlueButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VelaFont.label(16))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .background(VelaColor.blue)
            .clipShape(RoundedRectangle(cornerRadius: VelaRadius.button))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

private struct DisconnectButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VelaFont.label(16))
            .foregroundStyle(VelaColor.accent)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .overlay(RoundedRectangle(cornerRadius: VelaRadius.button).stroke(VelaColor.accent, lineWidth: 1.5))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
