//
//  AckRow.swift
//  VelaWallet
//
//  The single authoritative acknowledgment row (spec 014): hairline
//  checkbox + wrapping text with optional inline links. Links are
//  individually activatable and wrap with the text (the spec-011 e2e
//  click-target lesson) — they emit ActionIds without toggling the box.
//
//  The WHOLE ROW toggles, sentence included, as it does on web. A row with
//  links cannot get that from SwiftUI: a container `onTapGesture` wins over
//  the inline links and swallows them, which is why this row used to opt out
//  of row-wide toggling — and then a tap anywhere but the 16pt box did
//  nothing at all (founder-found 2026-08-25). So a link row is drawn by
//  TextKit instead, where the tap can be resolved to a character and the
//  answer read off the same layout that drew it. Rows without links stay
//  pure SwiftUI.
//

import SwiftUI

/// One run of ack-row text; `action != nil` renders it as an inline link.
struct AckSegment {
    let text: String
    var action: ActionId? = nil
}

struct AckRow: View {
    @Environment(\.theme) private var theme
    let segments: [AckSegment]
    @Binding var checked: Bool
    var onLink: (ActionId) -> Void = { _ in }

    private var hasLinks: Bool { segments.contains { $0.action != nil } }
    private var fullText: String { segments.map(\.text).joined() }

    var body: some View {
        HStack(alignment: .top, spacing: Tokens.Space.s12) {
            checkbox
            if hasLinks {
                LinkedSentence(
                    segments: segments,
                    role: Typography.flowCaption,
                    textColor: theme.palette.fgMuted.uiColor,
                    linkColor: theme.palette.accentBase.uiColor,
                    onLink: onLink,
                    onElsewhere: { checked.toggle() }
                )
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text(fullText)
                    .typeRole(Typography.flowCaption)
                    .foregroundStyle(theme.fgMuted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .contentShape(Rectangle())
        // A row without links is one target from edge to edge. A link row
        // resolves its own taps inside `LinkedSentence`, and adding a gesture
        // here would take them back.
        .onTapGesture {
            if !hasLinks { checked.toggle() }
        }
    }

    private var checkbox: some View {
        Button {
            checked.toggle()
        } label: {
            ZStack {
                if checked {
                    RoundedRectangle(cornerRadius: Tokens.Radius.r4)
                        .fill(theme.accentBase)
                    Image(systemName: "checkmark")
                        .font(GlyphFont.checkbox)
                        .foregroundStyle(theme.onAccent)
                } else {
                    RoundedRectangle(cornerRadius: Tokens.Radius.r4)
                        .strokeBorder(theme.borderStrong, lineWidth: Tokens.BorderWidth.hairline)
                }
            }
            .frame(width: FlowGeometry.checkboxSize, height: FlowGeometry.checkboxSize)
            // Keep the glyph box at mock size; grow the tap surface.
            .padding(Tokens.Space.s4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, -Tokens.Space.s4)
        .padding(.leading, -Tokens.Space.s4)
        .accessibilityLabel(fullText)
        .accessibilityValue(Text(verbatim: checked ? "1" : "0"))
        .accessibilityAddTraits(checked ? [.isSelected] : [])
    }
}

/// The legal sentence, drawn by TextKit so a tap can be resolved to the
/// character it landed on: a link phrase opens that document, anything else
/// is part of the checkbox.
///
/// TextKit 1 on purpose (`usingTextLayoutManager: false`) — `characterIndex`
/// and `boundingRect(forGlyphRange:)` are what answer "which character is
/// under this point", and they belong to the layout manager.
private struct LinkedSentence: UIViewRepresentable {
    let segments: [AckSegment]
    let role: TypeRole
    let textColor: UIColor
    let linkColor: UIColor
    let onLink: (ActionId) -> Void
    let onElsewhere: () -> Void

    static let actionKey = NSAttributedString.Key("velaAction")

    func makeUIView(context: Context) -> UITextView {
        let view = UITextView(usingTextLayoutManager: false)
        view.isEditable = false
        // NOT selectable: selection would fight the tap, and this view's own
        // recognizer already routes every tap, links included.
        view.isSelectable = false
        view.isScrollEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.adjustsFontForContentSizeCategory = true
        view.addGestureRecognizer(
            UITapGestureRecognizer(
                target: context.coordinator,
                action: #selector(Coordinator.handleTap(_:))
            )
        )
        return view
    }

    func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.parent = self
        view.attributedText = attributed
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        guard let width = proposal.width, width > 0 else { return nil }
        let fitted = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: width, height: ceil(fitted.height))
    }

    func makeCoordinator() -> Coordinator { Coordinator(parent: self) }

    private var attributed: NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = role.lineSpacing
        let result = NSMutableAttributedString()
        for segment in segments {
            var attributes: [NSAttributedString.Key: Any] = [
                .font: role.uiFont,
                .paragraphStyle: paragraph,
                .foregroundColor: segment.action == nil ? textColor : linkColor,
            ]
            if let action = segment.action {
                attributes[Self.actionKey] = action.rawValue
            }
            result.append(NSAttributedString(string: segment.text, attributes: attributes))
        }
        return result
    }

    final class Coordinator: NSObject {
        var parent: LinkedSentence

        init(parent: LinkedSentence) { self.parent = parent }

        @objc func handleTap(_ gesture: UITapGestureRecognizer) {
            guard let view = gesture.view as? UITextView else { return }
            let point = gesture.location(in: view)
            if let action = actionAt(point, in: view) {
                parent.onLink(action)
            } else {
                parent.onElsewhere()
            }
        }

        private func actionAt(_ point: CGPoint, in view: UITextView) -> ActionId? {
            let storage = view.textStorage
            guard storage.length > 0 else { return nil }
            let index = view.layoutManager.characterIndex(
                for: point,
                in: view.textContainer,
                fractionOfDistanceBetweenInsertionPoints: nil
            )
            guard index < storage.length else { return nil }
            // `characterIndex` snaps to the nearest character, so a tap in the
            // empty run after a line's last word would claim that word. The
            // glyph's own box is the check that says it did not.
            let box = view.layoutManager.boundingRect(
                forGlyphRange: NSRange(location: index, length: 1),
                in: view.textContainer
            )
            guard box.contains(point) else { return nil }
            guard
                let raw = storage.attribute(actionKey, at: index, effectiveRange: nil) as? String
            else { return nil }
            return ActionId(rawValue: raw)
        }

        private var actionKey: NSAttributedString.Key { LinkedSentence.actionKey }
    }
}

#Preview("Ack rows") {
    struct Host: View {
        @State private var first = false
        @State private var second = true
        var body: some View {
            VStack(alignment: .leading, spacing: Tokens.Space.s16) {
                AckRow(
                    segments: [AckSegment(text: "如果您丢失设备，可以通过 iCloud 或 Google 账户在新设备上恢复钱包。")],
                    checked: $first
                )
                AckRow(
                    segments: [
                        AckSegment(text: "我同意 "),
                        AckSegment(text: "隐私政策", action: .openPrivacyPolicy),
                        AckSegment(text: " 和 "),
                        AckSegment(text: "服务条款", action: .openTerms),
                        AckSegment(text: "。"),
                    ],
                    checked: $second
                )
            }
            .padding(Tokens.Space.s24)
        }
    }
    return Host().themed(.light)
}

#Preview("Ack rows dark") {
    struct Host: View {
        @State private var first = true
        @State private var second = false
        var body: some View {
            VStack(alignment: .leading, spacing: Tokens.Space.s16) {
                AckRow(
                    segments: [AckSegment(text: "如果您丢失设备，可以通过 iCloud 或 Google 账户在新设备上恢复钱包。")],
                    checked: $first
                )
                AckRow(
                    segments: [
                        AckSegment(text: "我同意 "),
                        AckSegment(text: "隐私政策", action: .openPrivacyPolicy),
                        AckSegment(text: " 和 "),
                        AckSegment(text: "服务条款", action: .openTerms),
                        AckSegment(text: "。"),
                    ],
                    checked: $second
                )
            }
            .padding(Tokens.Space.s24)
        }
    }
    return Host()
        .background(Tokens.dark.bgRaised.color)
        .themed(.dark)
}
