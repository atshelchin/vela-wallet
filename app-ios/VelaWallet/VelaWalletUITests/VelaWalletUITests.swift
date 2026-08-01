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

    func testWelcomeSmoke() throws {
        let app = XCUIApplication()
        app.launchEnvironment["VELA_LANG"] = "en"
        app.launch()

        // 1. Welcome renders: brand, first card, both CTAs.
        XCTAssertTrue(app.staticTexts["Vela Wallet"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["No seed phrase"].waitForExistence(timeout: 5))
        let create = app.buttons["Create Wallet"]
        let imported = app.buttons["I already have a wallet"]
        XCTAssertTrue(create.exists)
        XCTAssertTrue(imported.exists)

        // 2. Swipe advances the carousel (target the card itself — the
        //    window center sits in the flexible spacer above the TabView).
        app.staticTexts["No seed phrase"].swipeLeft()
        XCTAssertTrue(app.staticTexts["One address, 12+ networks"].waitForExistence(timeout: 5))

        // 3. Tapping the last dot jumps to card 06.
        let lastDot = app.buttons["6/6"]
        XCTAssertTrue(lastDot.waitForExistence(timeout: 5))
        lastDot.tap()
        XCTAssertTrue(app.staticTexts["Pay gas in stablecoins"].waitForExistence(timeout: 5))

        // 4. Create Wallet → placeholder, then back to Welcome.
        create.tap()
        XCTAssertTrue(app.navigationBars.buttons.firstMatch.waitForExistence(timeout: 5))
        XCTAssertFalse(app.staticTexts["Pay gas in stablecoins"].exists)
        app.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(create.waitForExistence(timeout: 5))

        // 5. Import CTA → placeholder.
        imported.tap()
        XCTAssertTrue(app.navigationBars.buttons.firstMatch.waitForExistence(timeout: 5))
    }
}
