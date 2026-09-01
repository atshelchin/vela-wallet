//
//  FlowGalleryScreen.swift
//  VelaWallet
//
//  Wallet-flow preview gallery (spec 021 FR-004): all thirty states, each
//  reachable in ≤ 2 interactions, driven by fixtures alone and fully
//  offline. Reached via VELA_PAGE=flows-gallery (with VELA_STATE to
//  preselect); never linked from production navigation.
//
//  The gallery hosts the same `FlowHost` the wallet screen does, so a
//  state reviewed here is the state that ships — there is no second render
//  path to drift.
//

import SwiftUI

struct FlowGalleryScreen: View {
    @Environment(\.theme) private var inheritedTheme

    let loc: Loc
    @State private var schemeOverride: ColorScheme?
    @State private var state: FlowStateId = FlowGalleryScreen.launchState

    /// `VELA_STATE` preselect (screenshot-matrix affordance, gallery-only —
    /// the same launch-override idiom as VELA_PAGE): r1 … sd4c.
    static let launchState: FlowStateId = {
        guard let raw = ProcessInfo.processInfo.environment["VELA_STATE"],
              let match = FlowStateId(rawValue: raw)
        else { return .r1 }
        return match
    }()

    private var scheme: ColorScheme { schemeOverride ?? inheritedTheme.scheme }
    private var theme: Theme { Theme(scheme: scheme) }

    var body: some View {
        VStack(spacing: Tokens.Space.s0) {
            controls
            Rectangle()
                .fill(theme.borderBase)
                .frame(height: Tokens.BorderWidth.hairline)
            // .id resets @State (the auto-presented sheet, the search field)
            // per selection.
            FlowHost(model: WalletFlowFixtures.build(state, loc: loc))
                .id(state)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(theme.bgSunken.ignoresSafeArea())
        .themed(scheme)
        .preferredColorScheme(scheme)
    }

    private var controls: some View {
        HStack(spacing: Tokens.Space.s8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Tokens.Space.s8) {
                    ForEach(FlowStateId.allCases) { candidate in
                        chip(candidate)
                    }
                }
                .padding(.horizontal, Tokens.Space.s16)
            }
            Button {
                schemeOverride = scheme == .dark ? .light : .dark
            } label: {
                Image(systemName: "circle.lefthalf.filled")
                    .font(WalletIconFont.galleryControl)
                    .foregroundStyle(theme.fgMuted)
                    .frame(width: Tokens.Layout.hitTarget, height: Tokens.Layout.hitTarget)
            }
            .padding(.trailing, Tokens.Space.s8)
        }
        .padding(.vertical, Tokens.Space.s8)
    }

    /// Chip labels are state codes — data, not translatable copy.
    private func chip(_ candidate: FlowStateId) -> some View {
        let selected = candidate == state
        return Button {
            state = candidate
        } label: {
            Text(verbatim: candidate.label)
                .typeRole(Typography.label)
                .foregroundStyle(selected ? theme.accentBase : theme.fgMuted)
                .padding(.horizontal, Tokens.Space.s12)
                .frame(minHeight: Tokens.Control.sm)
                .background(Capsule().fill(selected ? theme.accentSoft : theme.bgRaised))
        }
    }
}
