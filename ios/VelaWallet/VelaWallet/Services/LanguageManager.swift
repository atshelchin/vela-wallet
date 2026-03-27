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

    /// Set language and persist. Requires app restart to take effect.
    func setLanguage(_ language: AppLanguage) {
        current = language
        UserDefaults.standard.set([language.code], forKey: "AppleLanguages")
        UserDefaults.standard.synchronize()
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
