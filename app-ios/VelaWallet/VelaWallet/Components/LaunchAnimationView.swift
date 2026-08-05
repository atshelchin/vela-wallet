//
//  LaunchAnimationView.swift
//  VelaWallet
//
//  The launch animation — the only file in this app that imports Lottie
//  (spec 012 FR-024). Contract:
//  specs/012-launch-animation-lottie/contracts/launch-animation-api.md
//
//  Same shape as the other three platforms: play once → hold the finished
//  lockup → cross-dissolve into Welcome, with any input cutting straight to the
//  dissolve and every failure path ending silently on Welcome.
//

import Lottie
import SwiftUI

struct LaunchAnimationView: View {
    let appearance: LaunchAnimation.Appearance
    let formFactor: LaunchAnimation.FormFactor
    let reduceMotion: Bool
    /// Fired once, the instant the cross-dissolve starts. The HOST animates its
    /// own Welcome opacity 0→1 with the same curve and duration, so the two
    /// layers dissolve into each other.
    ///
    /// A start SIGNAL rather than streamed progress, because SwiftUI cannot
    /// stream it: `withAnimation { dissolve = 1 }` sets the state to its final
    /// value immediately and only interpolates when rendering, so `onChange`
    /// fires exactly once, with 1.0. Driving the host from that made Welcome
    /// snap to full opacity and the overlay vanish in the same instant — the
    /// abrupt hand-off this parameter now exists to prevent. (Compose's
    /// `animateFloatAsState` DOES tick per frame, which is why Android streams.)
    let onDissolveStart: () -> Void
    /// Called EXACTLY once, for every outcome — completion, skip, budget expiry,
    /// ceiling, asset failure, reduce-motion. The host does not distinguish
    /// between them; it only removes the overlay.
    let onFinished: () -> Void

    @Environment(\.theme) private var theme

    @State private var animation: LottieAnimation?
    @State private var loaded = false
    @State private var dissolve: Double = 0
    @State private var exiting = false
    @State private var finished = false

    var body: some View {
        GeometryReader { proxy in
            let box = LaunchAnimation.boxSize(
                viewportWidth: proxy.size.width,
                formFactor: formFactor
            )

            ZStack {
                // Opaque until the dissolve starts — Welcome must not be visible
                // through it (FR-013). During the dissolve the host's
                // identically coloured background takes over, which is what
                // keeps the backdrop continuous instead of washing out.
                theme.bgBase.ignoresSafeArea()

                if let animation {
                    LottieView(animation: animation)
                        // `.configuration(_:)`, NOT `.configure { view.configuration = … }`.
                        //
                        // `configure` closures run on EVERY SwiftUI update, and
                        // assigning `LottieAnimationView.configuration` rebuilds
                        // the animation layer — which resets playback to frame 0.
                        // Doing it unguarded froze the animation on its first
                        // frame: the mark centred, every wordmark glyph still at
                        // opacity 0, forever. The library's own modifier carries
                        // the `if view.configuration != configuration` guard that
                        // makes it idempotent.
                        //
                        // Set explicitly rather than left to `.automatic` because
                        // this engine composites on the render server, which is
                        // why lottie-ios was chosen for the launch path
                        // (research D2).
                        .configuration(LottieConfiguration(renderingEngine: .coreAnimation))
                        // Reduce-motion gets the finished lockup as a still, not
                        // a build (FR-019); everyone else plays once from the
                        // start. `.paused` rather than a zero-length play, so
                        // there is genuinely no motion to perceive.
                        .playbackMode(
                            reduceMotion
                                ? .paused(at: .progress(1))
                                : .playing(.fromProgress(0, toProgress: 1, loopMode: .playOnce))
                        )
                        .animationDidFinish { _ in beginHoldThenExit() }
                        .frame(width: box.width, height: box.height)
                }
            }
            .frame(width: proxy.size.width, height: proxy.size.height)
        }
        .ignoresSafeArea()
        .opacity(1 - dissolve)
        // FR-021: decoration. Hidden from assistive technology; takes no focus.
        .accessibilityHidden(true)
        // FR-016: any tap cuts to the dissolve.
        .contentShape(Rectangle())
        .onTapGesture { beginExit() }
        .task { await load() }
    }

    // MARK: - Lifecycle

    private func load() async {
        // FR-017: a missing, unreadable or malformed asset is not something the
        // user hears about. `named` returns nil and the overlay simply ends.
        let name = LaunchAnimation.assetName(formFactor, appearance)
        let loadedAnimation = LottieAnimation.named(name)

        guard let loadedAnimation else {
            finishOnce()
            return
        }
        animation = loadedAnimation
        loaded = true

        if reduceMotion {
            // Static final frame, no hold — the point of the setting is less
            // time spent on motion, not a longer still.
            beginExit()
            return
        }

        // FR-015: hard ceiling, from the first presented frame.
        try? await Task.sleep(for: .seconds(LaunchAnimation.hardCeiling))
        beginExit()
    }

    /// FR-014: nothing presented within the budget → abandon, silently.
    private func startFirstFrameBudget() async {
        try? await Task.sleep(for: .seconds(LaunchAnimation.firstFrameBudget))
        if !loaded { finishOnce() }
    }

    private func beginHoldThenExit() {
        guard !exiting else { return }
        Task {
            try? await Task.sleep(for: .seconds(LaunchAnimation.hold))
            beginExit()
        }
    }

    private func beginExit() {
        guard !exiting, !finished else { return }
        exiting = true

        // Both sides start fading in the same instant, with the same curve.
        onDissolveStart()
        withAnimation(.easeInOut(duration: LaunchAnimation.exitCrossfade)) {
            dissolve = 1
        }

        // The overlay is removed only AFTER the fade has had time to render.
        // Removing it on the state change would delete the very thing that is
        // supposed to be fading.
        Task {
            try? await Task.sleep(for: .seconds(LaunchAnimation.exitCrossfade))
            finishOnce()
        }
    }

    /// Latched: a completion racing a timeout must not dismiss twice
    /// (contract behaviour 1).
    private func finishOnce() {
        guard !finished else { return }
        finished = true
        onFinished()
    }
}
