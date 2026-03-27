import SwiftUI

struct WelcomeView: View {
    var onCreateWallet: () -> Void
    var onLogin: () -> Void

    var body: some View {
        ZStack {
            VelaColor.textPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                Spacer()

                VStack(spacing: 32) {
                    VelaSailLogo(size: 80, color: VelaColor.accent)
                        .opacity(0.9)

                    VStack(spacing: 12) {
                        HStack(spacing: 0) {
                            Text("vel")
                                .foregroundStyle(.white)
                            Text("a")
                                .foregroundStyle(VelaColor.accent)
                        }
                        .font(.system(size: 56, weight: .bold))
                        .tracking(-2)

                        Text("welcome.tagline")
                            .font(VelaFont.body(15))
                            .foregroundStyle(VelaColor.textSecondary)
                            .multilineTextAlignment(.center)
                            .lineSpacing(4)
                    }
                }

                Spacer()

                VStack(spacing: 12) {
                    Button(action: onCreateWallet) {
                        Text("welcome.create")
                    }
                    .buttonStyle(VelaAccentButtonStyle())

                    Button(action: onLogin) {
                        Text("welcome.import")
                    }
                    .buttonStyle(WelcomeSecondaryStyle())
                }
                .padding(.horizontal, 28)
                .padding(.bottom, 24)
            }
        }
    }
}

private struct WelcomeSecondaryStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VelaFont.label(16))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 17)
            .overlay(
                RoundedRectangle(cornerRadius: VelaRadius.button)
                    .stroke(Color.white.opacity(0.15), lineWidth: 1.5)
            )
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

#Preview {
    WelcomeView(onCreateWallet: {}, onLogin: {})
}
