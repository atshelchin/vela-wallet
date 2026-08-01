//
//  LocaleMappingTests.swift
//  VelaWalletTests
//
//  D6 fixtures — semantics of src/i18n/shared.ts#detectSystemLanguage.
//

import Testing
@testable import VelaWallet

@MainActor
struct LocaleMappingTests {
    @Test(arguments: [
        // Simplified Chinese in all its spellings
        ("zh", "zh"), ("zh-CN", "zh"), ("zh-Hans-CN", "zh"), ("zh-Hans", "zh"),
        // Traditional Chinese: script/region routing
        ("zh-Hant", "zh-TW"), ("zh-TW", "zh-TW"), ("zh-Hant-TW", "zh-TW"),
        ("zh-HK", "zh-HK"), ("zh-Hant-HK", "zh-HK"), ("zh-Hant-MO", "zh-HK"), ("zh-MO", "zh-HK"),
        // Only one Spanish / Portuguese variant ships
        ("es", "es-MX"), ("es-AR", "es-MX"), ("es-MX", "es-MX"),
        ("pt", "pt-BR"), ("pt-PT", "pt-BR"), ("pt-BR", "pt-BR"),
        // Legacy Indonesian tag
        ("in", "id"), ("id", "id"), ("id-ID", "id"),
        // Base-language match
        ("fr-CA", "fr"), ("de-DE", "de"), ("en-GB", "en"), ("ru-RU", "ru"),
        // Unsupported → en
        ("ar", "en"), ("hi-IN", "en"), ("th", "en"),
    ])
    func mapsPreferredLanguage(fixture: (String, String)) {
        #expect(Loc.mapPreferredLanguage(fixture.0) == fixture.1,
                "\(fixture.0) should map to \(fixture.1)")
    }
}
