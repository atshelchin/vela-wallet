import SwiftUI
import Observation

@Observable
final class LanguageManager {
    static let shared = LanguageManager()

    private(set) var current: AppLanguage

    private init() {
        let saved = UserDefaults.standard.stringArray(forKey: "AppleLanguages")?.first ?? ""
        current = saved.hasPrefix("zh") ? .chinese : .english
    }

    /// Set language, persist, and restart app to apply.
    /// iOS Bundle.main locale is fixed at launch, so a restart is required.
    func setLanguage(_ language: AppLanguage) {
        current = language
        UserDefaults.standard.set([language.code], forKey: "AppleLanguages")
        UserDefaults.standard.synchronize()
        // Restart — iOS apps relaunch in < 0.5s, feels like a refresh
        exit(0)
    }
}

enum AppLanguage: String, CaseIterable, Identifiable {
    case english
    case chinese

    var id: String { rawValue }

    var code: String {
        switch self {
        case .english: "en"
        case .chinese: "zh-Hans"
        }
    }

    var displayName: String {
        switch self {
        case .english: "English"
        case .chinese: "中文"
        }
    }

    var flag: String {
        switch self {
        case .english: "🇺🇸"
        case .chinese: "🇨🇳"
        }
    }
}
