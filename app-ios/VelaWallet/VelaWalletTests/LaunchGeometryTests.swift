//
//  LaunchGeometryTests.swift
//  VelaWalletTests
//
//  Spec 012 FR-011 and the shared time budget.
//
//  The same tables are asserted in Rust, Kotlin and TypeScript. Repeating them
//  in four languages is the point: the four apps never run the same code, so a
//  transcription slip in any one of them has nothing else to catch it.
//

import CoreGraphics
import Foundation
import Testing
@testable import VelaWallet

struct LaunchGeometryTests {

    /// Lockup width ÷ core canvas width — a property of the shipped assets,
    /// re-derived from the files themselves by `scripts/lint-lottie-assets.mjs`.
    private let phoneLockupRatio: CGFloat = 314.85 / 350
    private let largeLockupRatio: CGFloat = 566.73 / 680

    @Test("box ratios are derived from the assets, not chosen")
    func boxRatiosAreDerived() {
        #expect(abs(LaunchAnimation.phoneBoxWidthRatio - 350.0 / 390.0) < 1e-6)
        #expect(abs(LaunchAnimation.largeBoxWidthRatio - 680.0 / 1920.0) < 1e-6)
    }

    @Test("at the authored width the box is the core canvas, one to one")
    func boxIsOneToOneAtAuthoredWidth() {
        let phone = LaunchAnimation.boxSize(viewportWidth: 390, formFactor: .phone)
        #expect(abs(phone.width - LaunchAnimation.phoneCanvas.width) < 0.01)
        #expect(abs(phone.height - LaunchAnimation.phoneCanvas.height) < 0.01)

        let large = LaunchAnimation.boxSize(viewportWidth: 1920, formFactor: .largeScreen)
        #expect(abs(large.width - LaunchAnimation.largeCanvas.width) < 0.01)
        #expect(abs(large.height - LaunchAnimation.largeCanvas.height) < 0.01)
    }

    @Test("the lockup holds the authored share of the viewport at every size")
    func lockupShareIsConstant() {
        // research D1: phone 80.73 % of width, large screen 29.52 %.
        for width in [CGFloat(320), 360, 390, 402, 430] {
            let box = LaunchAnimation.boxSize(viewportWidth: width, formFactor: .phone)
            let share = box.width * phoneLockupRatio / width
            #expect(abs(share - 0.8073) < 0.001, "phone @\(width): share \(share)")
        }
        for width in [CGFloat(768), 1280, 1440, 1920, 3440] {
            let box = LaunchAnimation.boxSize(viewportWidth: width, formFactor: .largeScreen)
            let share = box.width * largeLockupRatio / width
            #expect(abs(share - 0.2952) < 0.001, "large @\(width): share \(share)")
        }
    }

    @Test("the form-factor predicate is the one shared by all four apps")
    func formFactorPredicate() {
        #expect(LaunchAnimation.formFactor(for: CGSize(width: 390, height: 844)) == .phone)
        #expect(LaunchAnimation.formFactor(for: CGSize(width: 430, height: 932)) == .phone)
        // An iPad — portrait by width, and landscape by orientation — picks up
        // the large-screen composition with no platform special-casing.
        #expect(LaunchAnimation.formFactor(for: CGSize(width: 768, height: 1024)) == .largeScreen)
        #expect(LaunchAnimation.formFactor(for: CGSize(width: 1024, height: 768)) == .largeScreen)
    }

    @Test("asset names match what the build phase copies into the bundle")
    func assetNames() {
        #expect(LaunchAnimation.assetName(.phone, .dark) == "vela-wallet-launch-phone-core-dark")
        #expect(LaunchAnimation.assetName(.phone, .light) == "vela-wallet-launch-phone-core-light")
        #expect(LaunchAnimation.assetName(.largeScreen, .dark) == "vela-wallet-launch-desktop-core-dark")
    }

    /// FR-003 in the only place iOS can check it cheaply: the animations really
    /// are in the bundle. If the `Bundle launch animations` phase silently stops
    /// running, every other test here still passes and the app just never shows
    /// an animation — exactly the failure mode this feature keeps hitting.
    @Test("every shipped animation is actually in the app bundle")
    func animationsAreBundled() throws {
        for formFactor in [LaunchAnimation.FormFactor.phone, .largeScreen] {
            for appearance in [LaunchAnimation.Appearance.dark, .light] {
                let name = LaunchAnimation.assetName(formFactor, appearance)
                let url = Bundle(for: BundleToken.self).url(forResource: name, withExtension: "json")
                    ?? Bundle.main.url(forResource: name, withExtension: "json")
                #expect(url != nil, "\(name).json is missing from the bundle")
            }
        }
    }

    /// The transition timeline, pinned. These are numbers the founder set by
    /// feel on a running build; a silent change to any of them changes the
    /// product, and nothing else would notice.
    @Test("transition timeline matches the agreed shape")
    func transitionTimeline() {
        #expect(LaunchAnimation.durationMs == 1700)
        #expect(LaunchAnimation.holdMs == 400)
        #expect(LaunchAnimation.exitCrossfadeMs == 400)

        let nominal = LaunchAnimation.durationMs + LaunchAnimation.holdMs + LaunchAnimation.exitCrossfadeMs
        #expect(nominal == 2500)
        #expect(
            LaunchAnimation.hardCeilingMs > nominal,
            "the ceiling must leave room for the nominal sequence or a healthy launch is cut short"
        )
        #expect(LaunchAnimation.hardCeilingMs - nominal >= 400, "too little slack for a slow device")
    }
}

/// Anchors `Bundle(for:)` to the test bundle.
private final class BundleToken {}
