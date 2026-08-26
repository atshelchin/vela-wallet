//
//  FlowStates.swift
//  VelaWallet
//
//  What is left of spec 014's presentation layer after spec 019.
//
//  014 modelled the flow twice: once in Rust as `CreateView`, and once here as
//  `CreatePanelState` / `LoginPanelState` / `OutcomeSpec` — a parallel model the
//  gallery drove while the app drove nothing at all. Those types are gone. The
//  screens render `CreateView` directly, so there is no second model to keep in
//  step and no way for a fixture to look right in the gallery and wrong in the
//  app.
//
//  Two things survived, because both are genuinely the SHELL's:
//
//  - `ActionId`, which `AckRow` uses to route an inline link tap. It is a UI
//    routing token, not a flow state.
//  - `TechDetails`, the runtime diagnostics shape the disclosure renders.
//

import CoreGraphics

/// Where an inline link inside a row points. Not a flow state — the row has no
/// idea what the app does with it.
enum ActionId: String {
    case openPrivacyPolicy = "open_privacy_policy"
    case openTerms = "open_terms"
}

/// The status badge's vocabulary.
///
/// A COMPONENT vocabulary rather than a flow state, which is why it survived
/// the 014 clear-out: `StatusBadge` renders one of six discs, and what a given
/// prompt is worth is decided by the sheet that raises it.
enum BadgeVariant {
    case success
    case warning
    case neutral
    case error
    case timeout
    case info
}

/// Technical-details disclosure content. Runtime diagnostics, not copy.
struct TechDetails: Equatable {
    let code: String
    let context: String
    var endpoint: String?
}

/// Which screen of the create journey is showing.
enum FlowScreen: Equatable {
    case loading
    case name
    case keys
    case progress
    case retry
    case done
}

/// The founding-set cap, mirroring the core's `MAX_MULTI_KEYS`.
let maxKeys = 7

/// Which screen the core's view resolves to (data-model §3).
///
/// The `stage` decides, with one refinement: a busy machine reporting a progress
/// status has left the key list and is deriving, so the progress screen takes
/// over until it lands. `settingUpIdentity` is deliberately NOT a progress
/// status — it happens before the key list exists, and renders as the Name
/// screen's status line.
func screenFor(_ view: CreateView?) -> FlowScreen {
    guard let view else { return .loading }
    if view.stage == .created { return .done }
    if view.stage == .syncFailed { return .retry }
    if view.busy, progressFor(view.status) != nil { return .progress }
    return view.stage == .addKeys ? .keys : .name
}

/// Sizes the flow needs that the shared token set does not name.
///
/// Flow-local by intent rather than by omission: they appear on these screens
/// and nowhere else, and promoting them to `Tokens` would invite a second
/// caller to inherit a decision that was made about one layout.
enum FlowMetrics {
    /// The done card's identicon, and the disc the outcome tick sits in. The
    /// desktop draws the same pair at 44/34.
    static let identicon: CGFloat = 44
    static let doneCheck: CGFloat = 34
}
