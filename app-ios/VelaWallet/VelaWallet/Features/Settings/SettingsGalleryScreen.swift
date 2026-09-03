//
//  SettingsGalleryScreen.swift
//  VelaWallet
//
//  Settings preview gallery (spec 023, the spec-018 mechanism): every mobile
//  state — ST1–ST16 and the SR1–SR5 rescue set — reachable in one tap, driven
//  by fixtures alone and fully offline. Reached only via `VELA_PAGE`;
//  production navigation never links here.
//
//  Chip labels are state codes (data, not translations), so nothing
//  user-visible bypasses the corpus.
//

import SwiftUI

struct SettingsGalleryScreen: View {
    @Environment(\.theme) private var theme
    let loc: Loc

    @State private var state: SettingsStateId = SettingsGalleryScreen.pinnedState

    /// `VELA_SETTINGS_STATE=st13` opens the gallery on one state — the same
    /// env-pin family as `VELA_PAGE`/`VELA_THEME`/`VELA_LANG`. The simulator
    /// has no tap API from the shell, so without this a screenshot script can
    /// only ever see ST1.
    private static var pinnedState: SettingsStateId {
        let raw = ProcessInfo.processInfo.environment["VELA_SETTINGS_STATE"] ?? ""
        return SettingsStateId(rawValue: raw) ?? .st1
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Tokens.Space.s8) {
                    ForEach(SettingsStateId.allCases) { entry in
                        Text(entry.label)
                            .typeRole(Typography.label)
                            .foregroundStyle(entry == state ? theme.onAccent : theme.fgMuted)
                            .padding(.horizontal, Tokens.Space.s12)
                            .padding(.vertical, Tokens.Space.s8)
                            .background(entry == state ? theme.accentBase : theme.bgRaised,
                                        in: Capsule())
                            .contentShape(Capsule())
                            .onTapGesture { state = entry }
                    }
                }
                .padding(.horizontal, Tokens.Space.s12)
                .padding(.vertical, Tokens.Space.s8)
            }
            // A fresh identity per state, so switching chips rebuilds the whole
            // screen — including the @State seeds inside it.
            SettingsScreen(model: SettingsFixtures.build(state, loc: loc), loc: loc)
                .id(state)
        }
        .background(theme.bgBase.ignoresSafeArea())
    }
}
