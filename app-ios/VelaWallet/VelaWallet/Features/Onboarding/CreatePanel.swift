//
//  CreatePanel.swift
//  VelaWallet
//
//  The five screens of the v2 create journey, and the shell that frames them.
//
//  Spec 014 put this flow in a bottom sheet. The v2 design makes it the whole
//  screen at every step and keeps a sheet for FAILURES only, where an
//  interruption genuinely is modal — a form someone is halfway through is not an
//  interruption, and putting it behind a scrim said it was.
//
//  Nothing here holds flow state. Every screen renders `CreateView` and sends
//  events back; the whole mapping from view to screen is `screenFor`.
//

import SwiftUI

// MARK: - The shell

/// A back affordance and a three-segment progress bar, and nothing else: every
/// screen inside decides its own content.
struct FlowShell<Content: View>: View {
    @Environment(\.theme) private var theme
    let flowLabel: String
    let backLabel: String
    /// 0-based; negative hides the bar (the flow has not started stepping).
    let step: Int
    let canGoBack: Bool
    let onBack: () -> Void
    @ViewBuilder let content: Content

    private var fraction: Double {
        step < 0 ? 0 : min(1, Double(step + 1) / Double(totalFlowSteps))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                if canGoBack {
                    Button(action: onBack) {
                        HStack(spacing: Tokens.Space.s4) {
                            Image(systemName: "chevron.left")
                            Text(backLabel).typeRole(Typography.body)
                        }
                        .foregroundStyle(theme.fgMuted)
                    }
                    .accessibilityLabel(backLabel)
                } else {
                    Spacer().frame(width: 0)
                }
                Spacer()
                Text(flowLabel)
                    .typeRole(Typography.body)
                    .foregroundStyle(theme.fgMuted)
            }
            .frame(minHeight: Tokens.Layout.hitTarget)

            if step >= 0 {
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(theme.borderBase)
                        Capsule()
                            .fill(theme.accentBase)
                            .frame(width: proxy.size.width * fraction)
                    }
                }
                .frame(height: FlowMetrics.progressBar)
                .padding(.top, Tokens.Space.s16)
                .animation(.easeInOut(duration: Tokens.Motion.base), value: fraction)
            }

            content
                .padding(.top, Tokens.Space.s32)
        }
        .padding(.horizontal, Tokens.Layout.screenPaddingX)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(theme.bgBase.ignoresSafeArea())
    }
}

// MARK: - Name

/// Name the wallet, and accept the two gates.
///
/// Two checkboxes, matching the core's `ACK_COUNT` (data-model §2, 4 → 2). The
/// recovery line between them is an ASSURANCE — a fact about what the founding
/// key set buys you — not a third gate, so it renders with a filled tick and
/// nothing to tap. Making it tappable would invite a person to agree to
/// something that changes nothing.
struct NameScreen: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let view: CreateView
    let statusText: String?
    @Binding var name: String
    let onToggleAck: (Int) -> Void
    let onSubmit: () -> Void
    let onStartOver: () -> Void
    let onLink: (ActionId) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s24) {
                    Text(loc.t(I18nKeys.Create.nameTitle))
                        .typeRole(Typography.display)
                        .foregroundStyle(theme.fgBase)

                    NameField(
                        label: loc.t(I18nKeys.Create.accountNameLabel),
                        placeholder: loc.t(I18nKeys.Create.accountNamePlaceholder),
                        helper: loc.t(I18nKeys.Create.accountNameHint),
                        tooLongText: loc.t(I18nKeys.Create.nameTooLong),
                        text: $name,
                        tooLong: view.nameTooLong
                    )
                    .disabled(!view.nameEditable)

                    VStack(alignment: .leading, spacing: Tokens.Space.s12) {
                        AckRow(
                            segments: [AckSegment(text: loc.t(I18nKeys.Create.ack0))],
                            checked: binding(for: 0)
                        )

                        HStack(alignment: .top, spacing: Tokens.Space.s12) {
                            Image(systemName: "checkmark")
                                .foregroundStyle(theme.successBase)
                            Text(loc.t(I18nKeys.Create.assuranceRecovery))
                                .typeRole(Typography.flowCaption)
                                .foregroundStyle(theme.fgMuted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }

                        // Unlike Android, iOS can put the two links INSIDE the
                        // consent sentence: `AckRow` disables row-wide toggling
                        // when a row has links, so the link tap and the checkbox
                        // tap do not compete. Android's row is one touch target
                        // and needs its links on a line of their own.
                        AckRow(
                            segments: [
                                AckSegment(text: loc.t(I18nKeys.Create.ack1)),
                                AckSegment(
                                    text: loc.t(I18nKeys.Create.ack1PrivacyPolicy),
                                    action: .openPrivacyPolicy
                                ),
                                AckSegment(text: loc.t(I18nKeys.Create.ack1And)),
                                AckSegment(text: loc.t(I18nKeys.Create.ack1Terms), action: .openTerms),
                                AckSegment(text: loc.t(I18nKeys.Create.ack1Period)),
                            ],
                            checked: binding(for: 1),
                            onLink: onLink
                        )
                    }

                    if let statusText {
                        Text(statusText)
                            .typeRole(Typography.flowCaption)
                            .foregroundStyle(theme.fgMuted)
                            .accessibilityAddTraits(.updatesFrequently)
                    }
                }
                .padding(.bottom, Tokens.Space.s32)
            }
            .scrollBounceBehavior(.basedOnSize)

            VelaButton(
                title: loc.t(submitLabelToI18n(view.submitLabel)),
                kind: .primary,
                enabled: view.canSubmit && !view.busy,
                action: onSubmit
            )

            if view.showStartOver {
                Button(action: onStartOver) {
                    Text(loc.t(I18nKeys.Create.startOverBtn))
                        .typeRole(Typography.flowCaption)
                        .foregroundStyle(theme.fgMuted)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, Tokens.Space.s12)
            }
        }
        .padding(.bottom, Tokens.Space.s16)
    }

    /// The core owns the ack state; this binding only reports a tap.
    ///
    /// A local `@State` mirror would drift the instant the core refused a
    /// toggle — and refusing one is exactly what `StartOver` does.
    private func binding(for index: Int) -> Binding<Bool> {
        Binding(
            get: { view.acks.indices.contains(index) ? view.acks[index] : false },
            set: { _ in onToggleAck(index) }
        )
    }
}

// MARK: - Keys

/// The founding key list — the screen spec 014 never had, and the only place a
/// multi-key wallet can be assembled.
///
/// Everything on it is a rendering of `CreateView`; nothing here decides. The
/// three gates the core enforces (at most seven keys, every key confirmed, a
/// sole key must be backed up) surface as a disabled control with a stated
/// reason rather than as a tap that quietly does nothing.
struct KeysScreen: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let view: CreateView
    let onAddKey: (KeyMethod) -> Void
    let onConfirmKey: (Int) -> Void
    let onRemoveKey: (Int) -> Void
    let onFinish: () -> Void

    @State private var pickerOpen = false

    private var full: Bool { view.keys.count >= maxKeys }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s16) {
                    Text(loc.t(view.needsSecondKey
                        ? I18nKeys.Create.keysTitleBlocked
                        : I18nKeys.Create.keysTitle))
                        .typeRole(Typography.display)
                        .foregroundStyle(theme.fgBase)

                    Text(loc.t(subtitleKey))
                        .typeRole(Typography.body)
                        .foregroundStyle(theme.fgMuted)

                    if view.needsSecondKey {
                        HStack(alignment: .top, spacing: Tokens.Space.s12) {
                            Image(systemName: "exclamationmark.triangle")
                                .foregroundStyle(theme.accentBase)
                            Text(loc.t(I18nKeys.Create.needSecondKeyHint))
                                .typeRole(Typography.flowCaption)
                                .foregroundStyle(theme.fgBase)
                        }
                        .padding(Tokens.Space.s12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(theme.accentSoft, in: RoundedRectangle(cornerRadius: Tokens.Radius.r12))
                    }

                    HStack {
                        Text(loc.t(I18nKeys.Create.keysLabel))
                            .typeRole(Typography.label)
                            .foregroundStyle(theme.fgMuted)
                        Spacer()
                        // Mono: it is a count, and a count that jitters in width
                        // as it changes reads as the layout moving rather than
                        // the number.
                        Text(loc.t(
                            I18nKeys.Create.keyCount,
                            vars: ["current": "\(view.keys.count)", "max": "\(maxKeys)"]
                        ))
                        .typeRole(Typography.monoSmall)
                        .foregroundStyle(theme.fgMuted)
                    }
                    .padding(.top, Tokens.Space.s8)

                    VStack(spacing: 0) {
                        ForEach(Array(view.keys.enumerated()), id: \.offset) { index, key in
                            if index > 0 {
                                Divider().overlay(theme.borderBase)
                            }
                            KeyRow(
                                loc: loc,
                                key: key,
                                busy: view.busy,
                                // Row 0 is the pinned key: not removable, and
                                // its name IS the wallet name. Removing it is
                                // `start over`, not a row action.
                                removable: index > 0,
                                onConfirm: { onConfirmKey(index) },
                                onRemove: { onRemoveKey(index) }
                            )
                        }
                        Divider().overlay(theme.borderBase)
                    }

                    Button {
                        pickerOpen.toggle()
                    } label: {
                        HStack(spacing: Tokens.Space.s12) {
                            Text("+").typeRole(Typography.title)
                            Text(loc.t(full
                                ? I18nKeys.Create.keyLimitReached
                                : I18nKeys.Create.addKeyBtn))
                                .typeRole(Typography.body)
                        }
                        .foregroundStyle(full ? theme.fgMuted : theme.accentBase)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .frame(minHeight: Tokens.Layout.hitTarget)
                    }
                    .disabled(!view.canAddKey)
                    .opacity(view.canAddKey ? 1 : Tokens.Opacity.disabled)

                    if pickerOpen && view.canAddKey {
                        AddMethodPicker(loc: loc) { method in
                            pickerOpen = false
                            onAddKey(method)
                        }
                    }

                    Text(loc.t(I18nKeys.Create.keysHint))
                        .typeRole(Typography.flowCaption)
                        .foregroundStyle(theme.fgSubtle)
                        .padding(.top, Tokens.Space.s16)
                }
                .padding(.bottom, Tokens.Space.s24)
            }
            .scrollBounceBehavior(.basedOnSize)

            VelaButton(
                title: loc.t(view.needsSecondKey
                    ? I18nKeys.Create.addSecondKeyBtn
                    : I18nKeys.Create.createWalletBtn),
                kind: .primary,
                enabled: view.canFinish && !view.busy,
                action: onFinish
            )
        }
        .padding(.bottom, Tokens.Space.s16)
    }

    private var subtitleKey: String {
        if view.needsSecondKey { return I18nKeys.Create.keysSubtitleBlocked }
        return full ? I18nKeys.Create.keysSubtitleFull : I18nKeys.Create.keysSubtitle
    }
}

private struct KeyRow: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let key: CreateKeyRow
    let busy: Bool
    let removable: Bool
    let onConfirm: () -> Void
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: Tokens.Space.s12) {
            Image(systemName: key.method == .securityKey ? "key.horizontal" : "person.badge.key")
                .foregroundStyle(theme.fgMuted)
                .frame(width: Tokens.Control.sm, height: Tokens.Control.sm)
                .background(theme.bgSunken, in: RoundedRectangle(cornerRadius: Tokens.Radius.r8))

            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                Text(key.name).typeRole(Typography.rowTitle).foregroundStyle(theme.fgBase)
                Text(loc.t(providerLineFor(key.method)))
                    .typeRole(Typography.flowCaption)
                    .foregroundStyle(theme.fgMuted)
            }
            Spacer()

            // One trailing slot, as the design draws it. A key that has not
            // confirmed its membership has no status to show yet, so the retry
            // TAKES that slot rather than crowding in beside it.
            if key.confirmed {
                Text(loc.t(key.synced
                    ? I18nKeys.Create.keySyncedBadge
                    : I18nKeys.Create.keyDeviceOnlyBadge))
                    .typeRole(Typography.label)
                    .foregroundStyle(key.synced ? theme.successBase : theme.fgMuted)
                    .padding(.horizontal, Tokens.Space.s8)
                    .padding(.vertical, Tokens.Space.s4)
                    .background(
                        key.synced ? theme.successSoft : theme.bgSunken,
                        in: Capsule()
                    )
            } else {
                Button(action: onConfirm) {
                    Text(loc.t(I18nKeys.Create.confirmKeyBtn))
                        .typeRole(Typography.label)
                        .foregroundStyle(theme.accentBase)
                }
                .disabled(busy)
            }

            if removable {
                Button(action: onRemove) {
                    Image(systemName: "xmark").foregroundStyle(theme.fgSubtle)
                }
                .disabled(busy)
                .accessibilityLabel(loc.t(I18nKeys.Create.removeKeyBtn))
            }
        }
        .padding(.vertical, Tokens.Space.s12)
    }
}

/// The three ways to mint a founding key.
///
/// Unlike the browser, this client OWNS the picker, so the person's selection
/// here is honoured at the ceremony rather than merely recorded.
///
/// `Hybrid` is rendered present-and-explained rather than hidden: the design
/// draws it, the core models it, and a later feature adds the transport. An
/// absent row would read as "this wallet cannot do that"; a disabled row with
/// its reason reads as "not yet", which is the truth.
private struct AddMethodPicker: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let onPick: (KeyMethod) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(loc.t(I18nKeys.Create.addMethodLabel))
                .typeRole(Typography.label)
                .foregroundStyle(theme.fgMuted)
                .padding(.vertical, Tokens.Space.s8)

            ForEach(KeyMethod.allCases, id: \.self) { method in
                let available = method != .hybrid
                let copy = methodCopy(method)
                Button { onPick(method) } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                            Text(loc.t(copy.title))
                                .typeRole(Typography.rowTitle)
                                .foregroundStyle(theme.fgBase)
                            Text(loc.t(available ? copy.body : I18nKeys.Create.methodHybridUnavailable))
                                .typeRole(Typography.flowCaption)
                                .foregroundStyle(theme.fgMuted)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer()
                        if available {
                            Image(systemName: "chevron.right").foregroundStyle(theme.fgSubtle)
                        }
                    }
                    .frame(minHeight: Tokens.Layout.hitTarget)
                }
                .disabled(!available)
                .opacity(available ? 1 : Tokens.Opacity.disabled)
            }
        }
    }
}

// MARK: - Progress

/// Deriving the address.
///
/// Three task rows and a percentage, both computed from the stage the core
/// reported — never from elapsed time. This is why spec 014's elapsed-seconds
/// ring is gone from the create flow: the percentage is the "still working"
/// affordance the v2 design chose, and it is derived rather than animated.
struct ProgressScreen: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let position: ProgressPosition
    let keyCount: Int

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s32) {
            VStack(alignment: .leading, spacing: Tokens.Space.s8) {
                Text(loc.t(I18nKeys.Create.progressTitle))
                    .typeRole(Typography.display)
                    .foregroundStyle(theme.fgBase)
                Text(loc.t(I18nKeys.Create.progressSubtitle, vars: ["count": "\(keyCount)"]))
                    .typeRole(Typography.body)
                    .foregroundStyle(theme.fgMuted)
            }

            VStack(alignment: .leading, spacing: Tokens.Space.s8) {
                HStack {
                    Text(loc.t(I18nKeys.Create.progressMeterLabel))
                        .typeRole(Typography.label)
                        .foregroundStyle(theme.fgMuted)
                    Spacer()
                    Text("\(position.percent)%")
                        .typeRole(Typography.mono)
                        .foregroundStyle(theme.fgBase)
                }
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(theme.borderBase)
                        Capsule()
                            .fill(theme.accentBase)
                            .frame(width: proxy.size.width * Double(position.percent) / 100)
                    }
                }
                .frame(height: FlowMetrics.progressBar)
                .animation(.easeInOut(duration: Tokens.Motion.base), value: position.percent)
                .accessibilityLabel(loc.t(I18nKeys.Create.progressMeterLabel))
                .accessibilityValue("\(position.percent)%")
            }

            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(progressTasks.enumerated()), id: \.offset) { index, task in
                    let done = index < position.activeTask
                    let active = index == position.activeTask
                    HStack(spacing: Tokens.Space.s12) {
                        Group {
                            if done {
                                Image(systemName: "checkmark").foregroundStyle(theme.successBase)
                            } else {
                                Circle()
                                    .fill(active ? theme.accentBase : theme.borderStrong)
                                    .frame(width: Tokens.Space.s8, height: Tokens.Space.s8)
                            }
                        }
                        .frame(width: Tokens.Space.s20)
                        // The row before the live one is finished, the row after
                        // has not started. Neither is emphasised: only what is
                        // happening right now is.
                        Text(loc.t(task))
                            .typeRole(active ? Typography.rowTitle : Typography.body)
                            .foregroundStyle(active ? theme.fgBase : theme.fgMuted)
                        Spacer()
                    }
                    .frame(minHeight: Tokens.Layout.hitTarget)
                }
            }
            Spacer()
        }
    }
}

// MARK: - Retry

/// The keys were minted; the group never landed.
///
/// Nothing is lost and nothing is re-minted. The core keeps the whole founding
/// set and a pending record it wrote BEFORE the first publish attempt, so a
/// retry resumes at the publish — which is why this screen offers a retry rather
/// than starting over, and why "start over" is the quiet secondary.
struct RetryScreen: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    /// The publish's own error, forwarded verbatim — it goes into the bug
    /// report, so prettifying it here would lose the only detail worth filing.
    let detail: String?
    let busy: Bool
    let onRetry: () -> Void
    let onStartOver: () -> Void
    let onEditEndpoint: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s12) {
                    Text(loc.t(I18nKeys.Create.syncFailedTitle))
                        .typeRole(Typography.display)
                        .foregroundStyle(theme.fgBase)
                    Text(loc.t(I18nKeys.Create.syncFailedMessage))
                        .typeRole(Typography.body)
                        .foregroundStyle(theme.fgMuted)
                    Text(loc.t(I18nKeys.Create.syncFailedHint))
                        .typeRole(Typography.flowCaption)
                        .foregroundStyle(theme.fgSubtle)

                    if let detail {
                        TechDetailsDisclosure(
                            label: loc.t(I18nKeys.Create.technicalDetails),
                            details: TechDetails(
                                code: detail,
                                context: loc.t(I18nKeys.Create.statusSyncingKey)
                            ),
                            onToggle: { _ in }
                        )
                        .padding(.top, Tokens.Space.s16)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.bottom, Tokens.Space.s24)
            }
            .scrollBounceBehavior(.basedOnSize)

            VStack(spacing: Tokens.Space.s12) {
                VelaButton(
                    title: loc.t(I18nKeys.Create.retryUploadBtn),
                    kind: .primary,
                    enabled: !busy,
                    action: onRetry
                )
                VelaButton(
                    title: loc.t(I18nKeys.Flow.editIndexEndpoint),
                    kind: .secondary,
                    enabled: !busy,
                    action: onEditEndpoint
                )
                VelaButton(
                    title: loc.t(I18nKeys.Create.startOverBtn),
                    kind: .secondary,
                    enabled: !busy,
                    action: onStartOver
                )
            }
        }
        .padding(.bottom, Tokens.Space.s16)
    }
}

// MARK: - Done

/// The wallet exists.
///
/// This is the first moment an address is shown, and that ordering is a rule
/// rather than a layout choice: the core withholds `address` until the group has
/// landed and the account is saved, because an address shown earlier is one
/// somebody can fund before the wallet is reachable.
struct DoneScreen: View {
    @Environment(\.theme) private var theme
    let loc: Loc
    let address: String
    let walletName: String
    let keys: [CreateKeyRow]
    let onEnter: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s24) {
                    VStack(alignment: .leading, spacing: Tokens.Space.s8) {
                        HStack(spacing: Tokens.Space.s8) {
                            Image(systemName: "checkmark").foregroundStyle(theme.successBase)
                            Text(loc.t(I18nKeys.Create.successTitle))
                                .typeRole(Typography.display)
                                .foregroundStyle(theme.fgBase)
                        }
                        Text(loc.t(I18nKeys.Create.successMessage, vars: ["count": "\(keys.count)"]))
                            .typeRole(Typography.body)
                            .foregroundStyle(theme.fgMuted)
                    }

                    VStack(alignment: .leading, spacing: Tokens.Space.s16) {
                        HStack(spacing: Tokens.Space.s12) {
                            // Rendered from the address by the same core that
                            // derived it, so what the person memorises here is
                            // what every other client draws.
                            IdenticonAvatar(seed: address, size: FlowMetrics.identicon)
                            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                                Text(walletName)
                                    .typeRole(Typography.title)
                                    .foregroundStyle(theme.fgBase)
                                Text(loc.t(I18nKeys.Create.identiconHint))
                                    .typeRole(Typography.flowCaption)
                                    .foregroundStyle(theme.fgMuted)
                            }
                        }

                        VStack(alignment: .leading, spacing: Tokens.Space.s8) {
                            Text(loc.t(I18nKeys.Create.walletAddressLabel))
                                .typeRole(Typography.label)
                                .foregroundStyle(theme.fgMuted)
                            AddressStrip(
                                address: address,
                                copyLabel: loc.t(I18nKeys.Flow.copyAddress),
                                copiedLabel: loc.t(I18nKeys.Flow.copied)
                            )
                        }
                    }
                    .padding(Tokens.Space.s20)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(theme.bgRaised, in: RoundedRectangle(cornerRadius: Tokens.Radius.r16))

                    VStack(spacing: 0) {
                        ForEach(Array(keys.enumerated()), id: \.offset) { _, key in
                            HStack {
                                Text(key.name)
                                    .typeRole(Typography.body)
                                    .foregroundStyle(theme.fgBase)
                                Spacer()
                                Text(loc.t(key.synced
                                    ? I18nKeys.Create.keySyncedBadge
                                    : I18nKeys.Create.keyDeviceOnlyBadge))
                                    .typeRole(Typography.label)
                                    .foregroundStyle(key.synced ? theme.successBase : theme.fgMuted)
                            }
                            .padding(.vertical, Tokens.Space.s8)
                        }
                    }

                    Text(loc.t(I18nKeys.Create.verifyHint))
                        .typeRole(Typography.flowCaption)
                        .foregroundStyle(theme.fgSubtle)
                }
                .padding(.bottom, Tokens.Space.s24)
            }
            .scrollBounceBehavior(.basedOnSize)

            VelaButton(title: loc.t(I18nKeys.Create.enterWalletBtn), kind: .primary, action: onEnter)
        }
        .padding(.bottom, Tokens.Space.s16)
    }
}
