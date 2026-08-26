//
//  UsbCeremonyPrompts.swift
//  VelaWallet
//
//  The dialogs the app-owned CTAP-over-CCID path draws itself.
//
//  Every OTHER passkey route on iOS hands the ceremony to the system sheet,
//  which draws its own PIN entry, touch prompt and account picker. The
//  app-owned CCID path has no such sheet — it IS the client — so it says these
//  three things on its own behalf, the way the desktop and Android do. The copy
//  is the shared corpus (spec 019 §5); nothing here is hard-coded.
//

import SwiftUI
import VelaCore

/// The security key's PIN. Dismissal (or Cancel) is a cancellation.
struct UsbPinSheet: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let pending: OnboardingModel.PendingPin
    let onSubmit: (String?) -> Void

    @State private var pin = ""
    @State private var answered = false

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s16) {
            Text(loc.t(I18nKeys.Create.pinTitle))
                .typeRole(Typography.title)
                .foregroundStyle(theme.fgBase)

            Text(loc.t(I18nKeys.Create.pinBody, vars: ["product": pending.product]))
                .typeRole(Typography.body)
                .foregroundStyle(theme.fgMuted)
                .fixedSize(horizontal: false, vertical: true)

            SecureField(loc.t(I18nKeys.Create.pinLabel), text: $pin)
                .textContentType(.password)
                .keyboardType(.numberPad)
                .textFieldStyle(.roundedBorder)

            if pending.isRetry {
                Text(loc.t(I18nKeys.Create.pinRejected))
                    .typeRole(Typography.flowCaption)
                    .foregroundStyle(theme.errorBase)
            }
            if pending.retries >= 0 {
                Text(loc.t(I18nKeys.Create.pinAttemptsLeft, vars: ["attempts": String(pending.retries)]))
                    .typeRole(Typography.flowCaption)
                    .foregroundStyle(theme.fgSubtle)
            }

            VelaButton(title: loc.t(I18nKeys.Create.confirmKeyBtn), kind: .primary) {
                answer(pin)
            }
            .disabled(pin.isEmpty)
            .padding(.top, Tokens.Space.s16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.vertical, Tokens.Space.s32)
        .presentationDragIndicator(.visible)
        .presentationBackground(theme.bgRaised)
        .onDisappear { if !answered { onSubmit(nil) } }
    }

    private func answer(_ pin: String?) {
        guard !answered else { return }
        answered = true
        onSubmit(pin)
    }
}

/// Which of several wallets on one key. Dismissal is a cancellation.
struct UsbWalletPickerSheet: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let pending: OnboardingModel.PendingWalletPick
    let onPick: (Int?) -> Void

    @State private var answered = false

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s12) {
            Text(loc.t(I18nKeys.Login.pickTitle))
                .typeRole(Typography.title)
                .foregroundStyle(theme.fgBase)

            Text(loc.t(I18nKeys.Login.pickBody, vars: ["product": pending.choices.first?.product ?? ""]))
                .typeRole(Typography.body)
                .foregroundStyle(theme.fgMuted)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(Array(pending.choices.enumerated()), id: \.offset) { index, choice in
                if index > 0 { Divider().overlay(theme.borderBase) }
                Button {
                    answer(index)
                } label: {
                    Text(choice.name.isEmpty ? loc.t(I18nKeys.Login.pickUnnamed) : choice.name)
                        .typeRole(Typography.body)
                        .foregroundStyle(theme.fgBase)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, Tokens.Space.s12)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.vertical, Tokens.Space.s32)
        .presentationDragIndicator(.visible)
        .presentationBackground(theme.bgRaised)
        .onDisappear { if !answered { onPick(nil) } }
    }

    private func answer(_ index: Int?) {
        guard !answered else { return }
        answered = true
        onPick(index)
    }
}

/// The key is blinking — "touch it now". Not answered by a tap; it clears when
/// the ceremony's next step arrives (the model sets the state to nil).
struct UsbTouchSheet: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let touch: OnboardingModel.UsbTouch

    private var body_: String {
        switch touch.kind {
        case "fingerprint":
            return loc.t(I18nKeys.Create.touchFingerprintBody, vars: ["product": touch.product])
        case "select":
            return loc.t(I18nKeys.Create.touchSelectBody)
        default:
            return loc.t(I18nKeys.Create.touchBody, vars: ["product": touch.product])
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s12) {
            Text(loc.t(I18nKeys.Create.touchTitle))
                .typeRole(Typography.title)
                .foregroundStyle(theme.fgBase)

            Text(body_)
                .typeRole(Typography.body)
                .foregroundStyle(theme.fgMuted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.vertical, Tokens.Space.s32)
        .presentationDetents([.height(220)])
        .presentationDragIndicator(.visible)
        .presentationBackground(theme.bgRaised)
    }
}
