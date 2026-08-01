//
//  EngineSmokeTests.swift
//  VelaWalletTests
//
//  vela-core engine through Loc: catalog load, fallback ladder, key echo
//  as the visible failure signal (FR-005/FR-007).
//

import Testing
@testable import VelaWallet

@MainActor
struct EngineSmokeTests {
    @Test func zhOverrideResolvesAndTranslates() {
        let loc = Loc(overrideTag: "zh", preferredLanguages: [])
        #expect(loc.resolvedLanguage == "zh")
        #expect(loc.t("onboarding.welcome.createWallet") == "创建钱包")
        #expect(loc.t("onboarding.welcome.desktopTagline") == "您的密钥，您的资产")
    }

    @Test func unsupportedDeviceLanguageFallsBackToEnglish() {
        let loc = Loc(overrideTag: nil, preferredLanguages: ["ar-SA", "hi-IN"])
        #expect(loc.resolvedLanguage == "en")
        #expect(loc.t("onboarding.welcome.createWallet") == "Create Wallet")
    }

    @Test func germanCatalogLoads() {
        let loc = Loc(overrideTag: nil, preferredLanguages: ["de-DE"])
        #expect(loc.resolvedLanguage == "de")
        // Non-echo, non-English: the de catalog actually resolved.
        let value = loc.t("onboarding.welcome.createWallet")
        #expect(value != "onboarding.welcome.createWallet")
        #expect(!value.isEmpty)
        #expect(value != "Create Wallet")
    }

    @Test func missingKeyEchoesItself() {
        let loc = Loc(overrideTag: "en", preferredLanguages: [])
        #expect(loc.t("onboarding.welcome.noSuchKey") == "onboarding.welcome.noSuchKey")
    }

    @Test func welcomeContentFullyResolvedInZhAndEn() {
        for (tag, expectedLang) in [("zh", "zh"), ("en", "en")] {
            let loc = Loc(overrideTag: tag, preferredLanguages: [])
            #expect(loc.resolvedLanguage == expectedLang)
            let content = WelcomeContentBuilder.build(loc: loc)
            #expect(content.cards.count == 6)
            for card in content.cards {
                #expect(!card.title.isEmpty && !card.title.hasPrefix("onboarding."))
                #expect(!card.body.isEmpty && !card.body.hasPrefix("onboarding."))
            }
            #expect(!content.tagline.hasPrefix("onboarding."))
            #expect(!content.createWallet.hasPrefix("onboarding."))
            #expect(!content.alreadyHaveWallet.hasPrefix("onboarding."))
        }
    }
}
