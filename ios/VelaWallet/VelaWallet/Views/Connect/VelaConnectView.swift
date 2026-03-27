import SwiftUI

struct VelaConnectView: View {
    @Environment(WalletState.self) private var wallet
    @State private var isPairing = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VelaNavBar(title: "connect.title")

                if wallet.isConnectedToBrowser {
                    connectedState
                } else {
                    pairingState
                }
            }
            .background(VelaColor.bg)
            .navigationBarHidden(true)
        }
    }

    // MARK: - Pairing State

    private var pairingState: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 32) {
                // Bluetooth icon with pulse
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

                // Steps
                VStack(spacing: 12) {
                    StepRow(number: 1, text: String(localized: "connect.step1"))
                    StepRow(number: 2, text: String(localized: "connect.step2"))
                    StepRow(number: 3, text: String(localized: "connect.step3"))
                }
            }
            .padding(.horizontal, 36)

            Spacer()

            Button {
                // TODO: Implement BLE peripheral advertising
                wallet.isConnectedToBrowser = true
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                    Text("connect.pair_button")
                }
            }
            .buttonStyle(BlueButtonStyle())
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
        }
    }

    // MARK: - Connected State

    private var connectedState: some View {
        VStack(spacing: 0) {
            // Device card
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
                    Text("MacBook Pro — Chrome")
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
                wallet.isConnectedToBrowser = false
            } label: {
                Text("connect.disconnect")
            }
            .buttonStyle(DisconnectButtonStyle())
            .padding(.horizontal, 28)
            .padding(.bottom, 24)
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
                Circle()
                    .fill(VelaColor.bgWarm)
                    .frame(width: 24, height: 24)
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
        .overlay(
            RoundedRectangle(cornerRadius: VelaRadius.card)
                .stroke(VelaColor.border, lineWidth: 1)
        )
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
            .overlay(
                RoundedRectangle(cornerRadius: VelaRadius.button)
                    .stroke(VelaColor.accent, lineWidth: 1.5)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

#Preview {
    VelaConnectView()
        .environment(WalletState())
}
