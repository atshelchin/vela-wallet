//
//  GalleryScreen.swift
//  VelaWallet
//
//  Dev-only state gallery (spec 014, FR-013/FR-014): lists all fixture
//  codes grouped Create / Login (E10 in both), renders the selected
//  fixture inside the REAL FlowSheet presentation, and toggles theme by
//  re-applying .themed(...). Compiled out of Release entirely; in Debug
//  it is reachable only with the env switch VELA_GALLERY=1
//  (SIMCTL_CHILD_VELA_GALLERY=1 on the simulator, house style).
//

#if DEBUG

import SwiftUI

/// The gallery gate — env-read once, static (house style: LaunchAnimation
/// / ThemeOverride switches).
enum GalleryMode {
    static let isEnabled = ProcessInfo.processInfo.environment["VELA_GALLERY"] == "1"
}

struct GalleryScreen: View {
    let loc: Loc
    @State private var scheme: ColorScheme = ThemeOverride.launchScheme ?? .dark
    // VELA_GALLERY_FIXTURE=<code> preselects a fixture at launch so a
    // screenshot loop can walk states without GUI scripting (dev-only).
    @State private var selected: FlowFixtures.Fixture? = ProcessInfo.processInfo
        .environment["VELA_GALLERY_FIXTURE"]
        .flatMap { code in FlowFixtures.all.first { $0.code == code } }

    var body: some View {
        NavigationStack {
            List {
                Section("Create") {
                    rows(FlowFixtures.createGroup)
                }
                Section("Login") {
                    rows(FlowFixtures.loginGroup)
                }
            }
            .navigationTitle("Flow Gallery")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        scheme = scheme == .dark ? .light : .dark
                    } label: {
                        Image(systemName: scheme == .dark ? "sun.max" : "moon")
                    }
                    .accessibilityLabel(Text(verbatim: "Toggle theme"))
                }
            }
        }
        .sheet(item: $selected) { fixture in
            GalleryFixtureSheet(fixture: fixture, loc: loc)
                // Re-apply the active theme to the presented container —
                // the gallery's contract for the light/dark walkthrough.
                .themed(scheme)
        }
        .themed(scheme)
        .preferredColorScheme(scheme)
    }

    private func rows(_ fixtures: [FlowFixtures.Fixture]) -> some View {
        ForEach(fixtures) { fixture in
            Button {
                selected = fixture
            } label: {
                HStack(spacing: Tokens.Space.s12) {
                    Text(fixture.code)
                        .typeRole(Typography.label)
                        .frame(minWidth: Tokens.Space.s48, alignment: .leading)
                    Text(fixture.name)
                        .typeRole(Typography.body)
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

/// One fixture inside the real container: FlowSheet + panel, with the
/// production close semantics (back/cancel/not_now/close dismiss; every
/// other ActionId is logged only — FR-011, contract §2).
private struct GalleryFixtureSheet: View {
    let fixture: FlowFixtures.Fixture
    let loc: Loc
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        FlowSheet(
            title: loc.t(titleKey),
            closeLabel: loc.t("onboarding.common.close"),
            onClose: { dismiss() }
        ) {
            switch fixture.state {
            case .create(let state):
                CreatePanel(loc: loc, state: state, sink: sink)
            case .login(let state):
                LoginPanel(loc: loc, state: state, sink: sink)
            }
        }
    }

    private var titleKey: String {
        switch fixture.state {
        case .create(let state): CreatePanel.scaffoldTitleKey(for: state)
        case .login(let state): LoginPanel.scaffoldTitleKey(for: state)
        }
    }

    private func sink(_ action: ActionId) {
        switch action {
        case .back, .cancel, .notNow, .close:
            dismiss()
        default:
            print("[gallery] \(fixture.code) → \(action.rawValue)")
        }
    }
}

#Preview("Gallery") {
    GalleryScreen(loc: Loc())
}

#Preview("Gallery fixture sheet dark") {
    GalleryFixtureSheet(fixture: FlowFixtures.all[0], loc: Loc())
        .background(Tokens.dark.bgRaised.color)
        .themed(.dark)
}

#endif
