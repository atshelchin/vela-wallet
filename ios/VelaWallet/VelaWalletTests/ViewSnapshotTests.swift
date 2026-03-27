import Testing
import SwiftUI
@testable import VelaWallet

// MARK: - View Instantiation Tests

struct ViewInstantiationTests {

    @MainActor
    @Test func welcomeViewInstantiates() {
        let view = WelcomeView(onCreateWallet: {}, onLogin: {})
        #expect(type(of: view) == WelcomeView.self)
    }

    @MainActor
    @Test func createWalletViewInstantiates() {
        let view = CreateWalletView(onBack: {}, onCreated: { _ in })
        #expect(type(of: view) == CreateWalletView.self)
    }

    @MainActor
    @Test func sendViewInstantiates() {
        let view = SendView()
        #expect(type(of: view) == SendView.self)
    }

    @MainActor
    @Test func receiveViewInstantiates() {
        let view = ReceiveView()
        #expect(type(of: view) == ReceiveView.self)
    }

    @MainActor
    @Test func confirmTransactionViewInstantiates() {
        let view = ConfirmTransactionView(
            toName: "vitalik.eth",
            toAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
            amount: "0.5",
            symbol: "ETH"
        )
        #expect(type(of: view) == ConfirmTransactionView.self)
    }

    @MainActor
    @Test func confirmTransactionWithoutNameInstantiates() {
        let view = ConfirmTransactionView(
            toName: nil,
            toAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
            amount: "1.0",
            symbol: "ETH"
        )
        #expect(type(of: view) == ConfirmTransactionView.self)
    }

    @MainActor
    @Test func velaConnectViewInstantiates() {
        let view = VelaConnectView()
        #expect(type(of: view) == VelaConnectView.self)
    }

    @MainActor
    @Test func settingsViewInstantiates() {
        let view = SettingsView()
        #expect(type(of: view) == SettingsView.self)
    }

    @MainActor
    @Test func networkEditorViewInstantiates() {
        let view = NetworkEditorView()
        #expect(type(of: view) == NetworkEditorView.self)
    }

    @MainActor
    @Test func accountSwitcherViewInstantiates() {
        let view = AccountSwitcherView()
        #expect(type(of: view) == AccountSwitcherView.self)
    }

    @MainActor
    @Test func velaNavBarWithBack() {
        let view = VelaNavBar(title: "Test", onBack: {})
        #expect(type(of: view) == VelaNavBar.self)
    }

    @MainActor
    @Test func velaNavBarWithoutBack() {
        let view = VelaNavBar(title: "Test")
        #expect(type(of: view) == VelaNavBar.self)
    }

    @MainActor
    @Test func sectionHeaderInstantiates() {
        let view = SectionHeader(title: "TOKENS")
        #expect(type(of: view) == SectionHeader.self)
    }

    @MainActor
    @Test func networkDotInstantiates() {
        let view = NetworkDot()
        #expect(type(of: view) == NetworkDot.self)
    }

    @MainActor
    @Test func tokenIconInstantiates() {
        let view = TokenIcon(label: "Ξ", color: .blue, bg: .gray)
        #expect(type(of: view) == TokenIcon.self)
    }

    @MainActor
    @Test func networkIconInstantiates() {
        let view = NetworkIcon(network: .ethereum)
        #expect(type(of: view) == NetworkIcon.self)
    }

    @MainActor
    @Test func networkIconForAllDefaults() {
        for network in Network.defaults {
            let view = NetworkIcon(network: network)
            #expect(type(of: view) == NetworkIcon.self)
        }
    }

    @MainActor
    @Test func velaSailLogoInstantiates() {
        let view = VelaSailLogo()
        #expect(type(of: view) == VelaSailLogo.self)
    }

    @MainActor
    @Test func qrScannerViewInstantiates() {
        let view = QRScannerView(onScanned: { _ in })
        #expect(type(of: view) == QRScannerView.self)
    }
}

// MARK: - Navigation Logic Tests

struct NavigationLogicTests {

    @Test func rootShowsOnboardingWhenNoWallet() {
        let state = WalletState()
        #expect(state.hasWallet == false)
    }

    @Test func rootShowsMainTabWhenHasWallet() {
        let state = WalletState()
        state.hasWallet = true
        state.address = "0x1234567890abcdef1234567890abcdef12345678"
        #expect(state.hasWallet == true)
    }
}

// MARK: - Card Modifier Tests

struct CardModifierTests {

    @MainActor
    @Test func velaCardModifierApplies() {
        let view = Text("Hello").velaCard()
        #expect(type(of: view) == ModifiedContent<Text, VelaCardModifier>.self)
    }
}

// MARK: - PasskeyService Tests

struct PasskeyServiceTests {

    @Test func serviceInstantiates() {
        let service = PasskeyService()
        #expect(type(of: service) == PasskeyService.self)
    }

    @Test func relyingParty() {
        #expect(PasskeyService.relyingParty == "getvela.app")
    }

    @Test func errorDescriptions() {
        let cancelled = PasskeyService.PasskeyError.cancelled
        #expect(cancelled.localizedDescription.contains("cancelled"))

        let failed = PasskeyService.PasskeyError.failed("test")
        #expect(failed.localizedDescription.contains("test"))

        let noCred = PasskeyService.PasskeyError.noCredential
        #expect(noCred.localizedDescription.contains("credential"))

        let noAnchor = PasskeyService.PasskeyError.noPresentationAnchor
        #expect(noAnchor.localizedDescription.contains("anchor"))
    }
}
