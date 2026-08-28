//
//  GalleryScreen.swift
//  VelaWallet
//
//  Preview gallery (spec 015 FR-004, research D4): every mobile H-state
//  reachable in ≤ 2 interactions, plus the identicon parity board (US3)
//  and the QR placeholder. Fully offline — fixtures only. Reached via
//  VELA_PAGE=gallery; never linked from production navigation. Theme
//  toggle re-renders both appearances through .themed(); locale follows
//  the app language (VELA_LANG override, same as the rest of the app).
//

import SwiftUI

private enum GalleryEntry: Hashable, Identifiable {
    case state(MobileStateId)
    case identicons
    case qr

    var id: String {
        switch self {
        case .state(let state): state.rawValue
        case .identicons: "identicons"
        case .qr: "qr"
        }
    }

    /// Chip labels are mock/state codes — data, not translatable copy.
    var label: String {
        switch self {
        case .state(let state): state.label
        case .identicons: "ID"
        case .qr: "QR"
        }
    }

    static let all: [GalleryEntry] =
        MobileStateId.allCases.map { .state($0) } + [.identicons, .qr]

    /// `VELA_STATE` preselect (screenshot-matrix affordance, gallery-only —
    /// same launch-override idiom as VELA_PAGE): h1…h8 | identicons | qr.
    static let launchEntry: GalleryEntry = {
        guard let raw = ProcessInfo.processInfo.environment["VELA_STATE"] else { return .state(.h1) }
        return all.first { $0.id == raw } ?? .state(.h1)
    }()
}

struct GalleryScreen: View {
    @Environment(\.theme) private var inheritedTheme

    let loc: Loc
    @State private var schemeOverride: ColorScheme?
    @State private var entry: GalleryEntry = GalleryEntry.launchEntry

    private var scheme: ColorScheme { schemeOverride ?? inheritedTheme.scheme }
    private var theme: Theme { Theme(scheme: scheme) }

    var body: some View {
        VStack(spacing: Tokens.Space.s0) {
            controls
            Rectangle()
                .fill(theme.borderBase)
                .frame(height: Tokens.BorderWidth.hairline)
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(theme.bgSunken.ignoresSafeArea())
        .themed(scheme)
        .preferredColorScheme(scheme)
    }

    // MARK: - Chrome

    private var controls: some View {
        HStack(spacing: Tokens.Space.s8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Tokens.Space.s8) {
                    ForEach(GalleryEntry.all) { candidate in
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

    private func chip(_ candidate: GalleryEntry) -> some View {
        let selected = candidate == entry
        return Button {
            entry = candidate
        } label: {
            Text(verbatim: candidate.label)
                .typeRole(Typography.label)
                .foregroundStyle(selected ? theme.accentBase : theme.fgMuted)
                .padding(.horizontal, Tokens.Space.s12)
                .frame(minHeight: Tokens.Control.sm)
                .background(Capsule().fill(selected ? theme.accentSoft : theme.bgRaised))
        }
    }

    // MARK: - Content

    @ViewBuilder private var content: some View {
        switch entry {
        case .state(let state):
            // .id resets @State (H8's auto-presented sheet) per selection.
            WalletScreen(model: WalletFixtures.buildMobileState(state, loc: loc), loc: loc)
                .id(state)
        case .identicons:
            identiconBoard
        case .qr:
            ScrollView {
                QRPlaceholder(caption: loc.t("componentsUi.qrPlaceholder.caption"))
                    .padding(Tokens.Space.s24)
                    .frame(maxWidth: .infinity)
            }
        }
    }

    /// US3 parity board: fixed seed set, placeholder for the empty seed.
    private var identiconBoard: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: Tokens.Layout.hitTarget * 2))], spacing: Tokens.Space.s24) {
                ForEach(Array(WalletFixtures.identiconBoardSeeds.enumerated()), id: \.offset) { _, seed in
                    VStack(spacing: Tokens.Space.s8) {
                        IdenticonAvatar(seed: seed, size: WalletGeometry.identiconTile)
                        Text(verbatim: seedLabel(seed))
                            .monoRole(Typography.monoAddress)
                            .foregroundStyle(theme.fgMuted)
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }
                }
            }
            .padding(Tokens.Space.s24)
        }
    }

    private func seedLabel(_ seed: String) -> String {
        seed.isEmpty ? "∅" : seed
    }
}

#Preview("Gallery") {
    GalleryScreen(loc: Loc(overrideTag: "zh"))
        .themed(.dark)
        .environment(\.identiconProvider, .previewSafe)
}
