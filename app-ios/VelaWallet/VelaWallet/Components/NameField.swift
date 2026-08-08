//
//  NameField.swift
//  VelaWallet
//
//  The single authoritative account-name field (spec 014): label →
//  sunken input well → (over-length) error hint → helper caption. The
//  error hint appears between field and caption without displacing the
//  field (A3), and the field border tints error (contract §5).
//

import SwiftUI

struct NameField: View {
    @Environment(\.theme) private var theme
    /// Resolved strings — components never touch the i18n pipeline.
    let label: String
    let placeholder: String
    let helper: String
    let tooLongText: String
    @Binding var text: String
    let tooLong: Bool

    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s8) {
            Text(label)
                .typeRole(Typography.fieldLabel)
                .foregroundStyle(theme.fgBase)

            TextField(
                "",
                text: $text,
                prompt: Text(placeholder).foregroundStyle(theme.fgSubtle)
            )
            .font(Typography.body.font)
            .foregroundStyle(theme.fgBase)
            .focused($focused)
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .padding(.horizontal, Tokens.Space.s16)
            .frame(height: FlowGeometry.fieldHeight)
            .background {
                RoundedRectangle(cornerRadius: Tokens.Radius.r12)
                    .fill(theme.bgSunken)
            }
            .overlay {
                RoundedRectangle(cornerRadius: Tokens.Radius.r12)
                    .strokeBorder(borderColor, lineWidth: borderWidth)
            }
            .accessibilityLabel(label)

            if tooLong {
                Text(tooLongText)
                    .typeRole(Typography.flowCaption)
                    .foregroundStyle(theme.errorBase)
            }

            Text(helper)
                .typeRole(Typography.flowCaption)
                .foregroundStyle(theme.fgMuted)
        }
    }

    private var borderColor: Color {
        if tooLong { return theme.errorBase }
        return focused ? theme.borderStrong : theme.borderBase
    }

    private var borderWidth: CGFloat {
        tooLong ? Tokens.BorderWidth.emphasis : Tokens.BorderWidth.hairline
    }
}

#Preview("Name field") {
    struct Host: View {
        @State private var empty = ""
        @State private var long = "一个特别特别特别长的账户名称示例"
        var body: some View {
            VStack(spacing: Tokens.Space.s32) {
                NameField(
                    label: "账户名称",
                    placeholder: "为您的账户输入名称",
                    helper: "此名称将与您的公钥一起存储上链，用于跨设备登录。",
                    tooLongText: "名字太长，放不进通行密钥——请缩短一些。",
                    text: $empty,
                    tooLong: false
                )
                NameField(
                    label: "账户名称",
                    placeholder: "为您的账户输入名称",
                    helper: "此名称将与您的公钥一起存储上链，用于跨设备登录。",
                    tooLongText: "名字太长，放不进通行密钥——请缩短一些。",
                    text: $long,
                    tooLong: true
                )
            }
            .padding(Tokens.Space.s24)
        }
    }
    return Host().themed(.light)
}

#Preview("Name field dark") {
    struct Host: View {
        @State private var long = "一个特别特别特别长的账户名称示例"
        var body: some View {
            NameField(
                label: "账户名称",
                placeholder: "为您的账户输入名称",
                helper: "此名称将与您的公钥一起存储上链，用于跨设备登录。",
                tooLongText: "名字太长，放不进通行密钥——请缩短一些。",
                text: $long,
                tooLong: true
            )
            .padding(Tokens.Space.s24)
        }
    }
    return Host()
        .background(Tokens.dark.bgRaised.color)
        .themed(.dark)
}
