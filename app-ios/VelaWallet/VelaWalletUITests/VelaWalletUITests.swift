//
//  VelaWalletUITests.swift
//  VelaWalletUITests
//
//  One thin end-to-end smoke (D10): welcome renders, carousel pages by
//  swipe and by dot, both CTAs navigate to their placeholders and back.
//  State logic is unit-tested; this only proves the wiring on-device.
//

import XCTest

final class VelaWalletUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    /// Spec 012: the launch animation must actually ADVANCE.
    ///
    /// This exists because every unit test passed while the animation was frozen
    /// on frame 0 — the mark centred, all ten wordmark glyphs still at opacity 0
    /// — for its whole run. Nothing that inspects constants or bundles can see
    /// that; only comparing two moments of the real screen can. The cause was an
    /// unguarded `configure { view.configuration = … }`, which SwiftUI re-ran on
    /// every update and which resets playback each time.
    func testLaunchAnimationAdvances() throws {
        let app = XCUIApplication()
        app.launchEnvironment["VELA_LANG"] = "en"
        // Deliberately NOT skipping: this is the one test that watches it play.
        app.launch()

        // Frame 0 is the mark alone, centred. By ~1 s the mark has slid left and
        // several glyphs have faded in, so the two frames cannot match unless
        // playback is stuck.
        let early = app.screenshot().pngRepresentation
        Thread.sleep(forTimeInterval: 1.0)
        let later = app.screenshot().pngRepresentation

        XCTAssertNotEqual(
            early, later,
            "the launch animation did not change over 1 s — it is frozen (frame 0 shows the mark with no wordmark)"
        )

        // And it must still hand off: Welcome is reachable well inside the ceiling.
        XCTAssertTrue(app.buttons["Create Wallet"].waitForExistence(timeout: 8))
    }

    // NOT WRITTEN: a test that the hand-off takes time rather than collapsing.
    //
    // Three instruments were tried and all three lied:
    //   * `waitForExistence` on a Welcome button — true at 1.09 s, because
    //     Welcome is composed under the overlay from the first frame (FR-013a),
    //     so it exists in the tree throughout.
    //   * the same with `.accessibilityHidden(launching)` on the page — still
    //     true at 0.06 s; hiding from accessibility does not change `exists`.
    //   * "when do two consecutive screenshots match" — 0.64 s, because the
    //     animation is genuinely static over its last ~0.5 s (all glyphs are in
    //     by frame 72 of 102) and XCUITest screenshots cost 100–300 ms each, so
    //     a still stretch reads identically to a finished transition.
    //
    // Tuning the threshold until one of them went green would produce a test
    // that passes for the wrong reason — worse than no test, because it would be
    // trusted. `testLaunchAnimationAdvances` above covers the failure mode that
    // IS measurable here (frozen playback); the smoothness of the dissolve is
    // currently verified by eye.

}
