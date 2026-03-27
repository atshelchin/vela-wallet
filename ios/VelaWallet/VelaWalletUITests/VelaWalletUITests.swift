import XCTest

final class VelaWalletUITests: XCTestCase {

    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launch()
    }

    // MARK: - Onboarding

    @MainActor
    func testWelcomeScreenShowsOnLaunch() throws {
        // Welcome screen should show create and import buttons
        let createButton = app.buttons["welcome.create"]
        let importButton = app.buttons["welcome.import"]

        XCTAssertTrue(createButton.waitForExistence(timeout: 5))
        XCTAssertTrue(importButton.exists)
    }

    @MainActor
    func testWelcomeScreenShowsBranding() throws {
        // "vel" and "a" text should be visible
        let velText = app.staticTexts["vel"]
        let aText = app.staticTexts["a"]

        XCTAssertTrue(velText.waitForExistence(timeout: 5))
        XCTAssertTrue(aText.exists)
    }

    @MainActor
    func testCreateWalletNavigatesFromWelcome() throws {
        let createButton = app.buttons["welcome.create"]
        XCTAssertTrue(createButton.waitForExistence(timeout: 5))
        createButton.tap()

        // Should show create wallet screen with passkey button
        let passkeyButton = app.buttons["create.button"]
        XCTAssertTrue(passkeyButton.waitForExistence(timeout: 3))
    }

    @MainActor
    func testCreateWalletShowsSecurityNote() throws {
        let createButton = app.buttons["welcome.create"]
        XCTAssertTrue(createButton.waitForExistence(timeout: 5))
        createButton.tap()

        // Security note should be visible
        let securityNote = app.staticTexts["create.security_note"]
        XCTAssertTrue(securityNote.waitForExistence(timeout: 3))
    }

    @MainActor
    func testCreateWalletBackButton() throws {
        let createButton = app.buttons["welcome.create"]
        XCTAssertTrue(createButton.waitForExistence(timeout: 5))
        createButton.tap()

        // Tap back
        let backButton = app.buttons["chevron.left"]
        XCTAssertTrue(backButton.waitForExistence(timeout: 3))
        backButton.tap()

        // Should be back on welcome screen
        XCTAssertTrue(createButton.waitForExistence(timeout: 3))
    }

    @MainActor
    func testCreatePasskeyNavigatesToHome() throws {
        let createButton = app.buttons["welcome.create"]
        XCTAssertTrue(createButton.waitForExistence(timeout: 5))
        createButton.tap()

        let passkeyButton = app.buttons["create.button"]
        XCTAssertTrue(passkeyButton.waitForExistence(timeout: 3))
        passkeyButton.tap()

        // Should navigate to main wallet tab bar
        let walletTab = app.tabBars.buttons.element(boundBy: 0)
        XCTAssertTrue(walletTab.waitForExistence(timeout: 5))
    }

    // MARK: - Main Wallet

    @MainActor
    func testMainTabBarExists() throws {
        navigateToHome()

        // Tab bar should have 3 tabs
        let tabBar = app.tabBars
        XCTAssertTrue(tabBar.element.waitForExistence(timeout: 3))

        let tabs = tabBar.buttons
        XCTAssertEqual(tabs.count, 3)
    }

    @MainActor
    func testHomeShowsBalance() throws {
        navigateToHome()

        // Should show the dollar sign in balance
        let balance = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '$'"))
        XCTAssertTrue(balance.element.waitForExistence(timeout: 3))
    }

    @MainActor
    func testHomeShowsActionButtons() throws {
        navigateToHome()

        // Send, Receive, Swap buttons
        let sendButton = app.buttons["home.send"]
        let receiveButton = app.buttons["home.receive"]

        XCTAssertTrue(sendButton.waitForExistence(timeout: 3))
        XCTAssertTrue(receiveButton.exists)
    }

    @MainActor
    func testHomeShowsTokenList() throws {
        navigateToHome()

        // Ethereum token should be visible
        let ethText = app.staticTexts["Ethereum"]
        XCTAssertTrue(ethText.waitForExistence(timeout: 3))
    }

    @MainActor
    func testNetworkPickerOpens() throws {
        navigateToHome()

        // Tap network selector
        let networkButton = app.buttons.matching(NSPredicate(format: "label CONTAINS 'Ethereum'")).element
        if networkButton.waitForExistence(timeout: 3) {
            networkButton.tap()

            // Network picker should show all networks
            let arbitrum = app.staticTexts["Arbitrum One"]
            XCTAssertTrue(arbitrum.waitForExistence(timeout: 3))
        }
    }

    @MainActor
    func testSendScreenOpens() throws {
        navigateToHome()

        let sendButton = app.buttons["home.send"]
        XCTAssertTrue(sendButton.waitForExistence(timeout: 3))
        sendButton.tap()

        // Send screen should appear with address field
        let toLabel = app.staticTexts["send.to"]
        XCTAssertTrue(toLabel.waitForExistence(timeout: 3))
    }

    @MainActor
    func testReceiveScreenOpens() throws {
        navigateToHome()

        let receiveButton = app.buttons["home.receive"]
        XCTAssertTrue(receiveButton.waitForExistence(timeout: 3))
        receiveButton.tap()

        // Receive screen should appear with copy button
        let copyButton = app.buttons["receive.copy"]
        XCTAssertTrue(copyButton.waitForExistence(timeout: 3))
    }

    // MARK: - Tab Navigation

    @MainActor
    func testTabNavigationToDApps() throws {
        navigateToHome()

        // Switch to dApps tab
        let dappsTab = app.tabBars.buttons.element(boundBy: 1)
        XCTAssertTrue(dappsTab.waitForExistence(timeout: 3))
        dappsTab.tap()

        // Should show Vela Connect content
        let connectHeading = app.staticTexts["connect.heading"]
        XCTAssertTrue(connectHeading.waitForExistence(timeout: 3))
    }

    @MainActor
    func testTabNavigationToSettings() throws {
        navigateToHome()

        // Switch to Settings tab
        let settingsTab = app.tabBars.buttons.element(boundBy: 2)
        XCTAssertTrue(settingsTab.waitForExistence(timeout: 3))
        settingsTab.tap()

        // Should show Settings content
        let passkey = app.staticTexts["settings.passkey"]
        XCTAssertTrue(passkey.waitForExistence(timeout: 3))
    }

    @MainActor
    func testTabNavigationBackToWallet() throws {
        navigateToHome()

        // Go to settings
        let settingsTab = app.tabBars.buttons.element(boundBy: 2)
        XCTAssertTrue(settingsTab.waitForExistence(timeout: 3))
        settingsTab.tap()

        // Go back to wallet
        let walletTab = app.tabBars.buttons.element(boundBy: 0)
        walletTab.tap()

        // Should show wallet content
        let balance = app.staticTexts.matching(NSPredicate(format: "label CONTAINS '$'"))
        XCTAssertTrue(balance.element.waitForExistence(timeout: 3))
    }

    // MARK: - Vela Connect

    @MainActor
    func testVelaConnectShowsPairingSteps() throws {
        navigateToHome()

        let dappsTab = app.tabBars.buttons.element(boundBy: 1)
        XCTAssertTrue(dappsTab.waitForExistence(timeout: 3))
        dappsTab.tap()

        // Should show pairing steps
        let step1 = app.staticTexts["connect.step1"]
        XCTAssertTrue(step1.waitForExistence(timeout: 3))
    }

    @MainActor
    func testVelaConnectPairButton() throws {
        navigateToHome()

        let dappsTab = app.tabBars.buttons.element(boundBy: 1)
        XCTAssertTrue(dappsTab.waitForExistence(timeout: 3))
        dappsTab.tap()

        let pairButton = app.buttons["connect.pair_button"]
        XCTAssertTrue(pairButton.waitForExistence(timeout: 3))
        pairButton.tap()

        // Should switch to connected state
        let connectedText = app.staticTexts["connect.connected"]
        XCTAssertTrue(connectedText.waitForExistence(timeout: 3))
    }

    @MainActor
    func testVelaConnectDisconnect() throws {
        navigateToHome()

        let dappsTab = app.tabBars.buttons.element(boundBy: 1)
        XCTAssertTrue(dappsTab.waitForExistence(timeout: 3))
        dappsTab.tap()

        // Pair
        let pairButton = app.buttons["connect.pair_button"]
        XCTAssertTrue(pairButton.waitForExistence(timeout: 3))
        pairButton.tap()

        // Disconnect
        let disconnectButton = app.buttons["connect.disconnect"]
        XCTAssertTrue(disconnectButton.waitForExistence(timeout: 3))
        disconnectButton.tap()

        // Should be back to pairing state
        XCTAssertTrue(pairButton.waitForExistence(timeout: 3))
    }

    // MARK: - Settings

    @MainActor
    func testSettingsShowsAllSections() throws {
        navigateToHome()

        let settingsTab = app.tabBars.buttons.element(boundBy: 2)
        XCTAssertTrue(settingsTab.waitForExistence(timeout: 3))
        settingsTab.tap()

        let passkey = app.staticTexts["settings.passkey"]
        let networks = app.staticTexts["settings.networks"]
        let about = app.staticTexts["settings.about"]

        XCTAssertTrue(passkey.waitForExistence(timeout: 3))
        XCTAssertTrue(networks.exists)
        XCTAssertTrue(about.exists)
    }

    // MARK: - Helper

    private func navigateToHome() {
        // Navigate through onboarding to reach home
        let createButton = app.buttons["welcome.create"]
        if createButton.waitForExistence(timeout: 3) {
            createButton.tap()
            let passkeyButton = app.buttons["create.button"]
            if passkeyButton.waitForExistence(timeout: 3) {
                passkeyButton.tap()
            }
        }
        // Wait for tab bar
        _ = app.tabBars.element.waitForExistence(timeout: 5)
    }
}
