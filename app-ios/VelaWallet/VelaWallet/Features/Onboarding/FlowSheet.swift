//
//  FlowSheet.swift
//  VelaWallet
//
//  The one modal in the v2 flow: an interruption the person has to answer.
//
//  The whole journey is a full screen; only FAILURES are modal, because a
//  failure genuinely does stop everything until it is acknowledged. A form
//  someone is halfway through is not an interruption, which is why spec 014's
//  sheet — which held the entire create flow — is gone.
//
//  `confirmable` is the core's word for "this answer changes the flow". The
//  recovery offer is the only prompt where declining is a decision rather than a
//  dismissal, and it is the only one that gets two real buttons. Every other
//  prompt has one, because dismissing it and answering it are the same act.
//
//  **A dismissal is always `accepted = false`.** Swiping the sheet away must
//  reach the core as a refusal, or a machine waiting on a `prompt_answered`
//  hangs with nothing on screen — which is why the answer is delivered from
//  `onDisappear` rather than only from the buttons.
//

import SwiftUI

struct FlowSheet: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let kind: PromptKind
    let confirmable: Bool
    let onAnswer: (Bool) -> Void

    @State private var answered = false

    private var copy: PromptCopy { promptCopy(kind, loc: loc) }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s16) {
            StatusBadge(variant: Self.badge(for: kind.type))

            Text(copy.title)
                .typeRole(Typography.title)
                .foregroundStyle(theme.fgBase)

            Text(copy.message)
                .typeRole(Typography.body)
                .foregroundStyle(theme.fgMuted)
                .fixedSize(horizontal: false, vertical: true)

            VStack(spacing: Tokens.Space.s12) {
                if confirmable, let confirmLabel = copy.confirmLabel {
                    VelaButton(title: confirmLabel, kind: .primary) { answer(true) }
                    VelaButton(title: copy.cancelLabel ?? "", kind: .secondary) { answer(false) }
                } else {
                    VelaButton(title: loc.t(I18nKeys.Flow.close), kind: .primary) { answer(false) }
                }
            }
            .padding(.top, Tokens.Space.s16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.vertical, Tokens.Space.s32)
        .presentationDetents([.height(sheetHeight)])
        .presentationDragIndicator(.visible)
        .presentationBackground(theme.bgRaised)
        .interactiveDismissDisabled(false)
        .onDisappear {
            // The dismissal path. A swipe-away never reaches a button, and the
            // core is waiting for an answer either way.
            if !answered { onAnswer(false) }
        }
    }

    private func answer(_ accepted: Bool) {
        guard !answered else { return }
        answered = true
        onAnswer(accepted)
    }

    /// Content-height-ish detent. A prompt's message is one or two sentences,
    /// and a fixed medium detent would leave most of them floating in a
    /// half-empty sheet.
    private var sheetHeight: CGFloat {
        confirmable ? 400 : 340
    }

    /// The badge each prompt wears.
    ///
    /// Spec 014 had eighteen `OutcomeKind` values and this feature does not
    /// reduce them so much as RELOCATE them: eight of the eighteen are no longer
    /// sheets because v2 gave them somewhere better — `Created` is the Done
    /// screen, `SignedIn` is the wallet, `SyncFailed` is the Retry screen with
    /// the key list intact, `VerifyStuck` is the Name screen with a changed
    /// submit label, the three cancellations are the Name screen's quiet status
    /// line, and `AccountNotFound` arrives as a `sign_in_failed` prompt carrying
    /// the registry's own words. `deviations.md` carries the full table.
    ///
    /// What is left is what a sheet is for: nine prompt kinds, each an
    /// interruption.
    static func badge(for type: String) -> BadgeVariant {
        switch type {
        case "recover_offer": .info
        case "not_discoverable": .warning
        default: .error
        }
    }
}

/// Point this wallet at a different passkey index.
///
/// Opened automatically when the core reports `endpointUnreachable`, and
/// reachable by hand from the retry screen. **Sign-in is still permitted while
/// it is open** (data-model §4): an unreachable index is not a locked door, and
/// a person whose wallet is already on this device can often get in regardless.
///
/// The warning is not decoration. A wrong endpoint does not corrupt anything,
/// but it makes every key lookup answer "not found" — which presents as a wallet
/// that has vanished, and is the single most alarming wrong answer this app can
/// give.
struct EndpointSheet: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let defaultURL: String
    @State var draft: String
    let onSave: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s16) {
            Text(loc.t(I18nKeys.Settings.sectionPasskeyIndex))
                .typeRole(Typography.title)
                .foregroundStyle(theme.fgBase)

            Text(loc.t(I18nKeys.Settings.passkeyHint))
                .typeRole(Typography.flowCaption)
                .foregroundStyle(theme.fgMuted)
                .fixedSize(horizontal: false, vertical: true)

            NameField(
                label: loc.t(I18nKeys.Settings.endpointUrlLabel),
                placeholder: defaultURL,
                helper: "",
                tooLongText: "",
                text: $draft,
                tooLong: false
            )

            HStack(alignment: .top, spacing: Tokens.Space.s12) {
                Image(systemName: "exclamationmark.triangle").foregroundStyle(theme.warningBase)
                Text(loc.t(I18nKeys.Settings.warningText))
                    .typeRole(Typography.flowCaption)
                    .foregroundStyle(theme.fgMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(spacing: Tokens.Space.s12) {
                VelaButton(title: loc.t(I18nKeys.Flow.retry), kind: .primary) { onSave(draft) }
                VelaButton(title: loc.t(I18nKeys.Settings.resetToDefault), kind: .secondary) {
                    onSave(defaultURL)
                }
            }
            .padding(.top, Tokens.Space.s16)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .padding(.vertical, Tokens.Space.s32)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
        .presentationBackground(theme.bgRaised)
    }
}
