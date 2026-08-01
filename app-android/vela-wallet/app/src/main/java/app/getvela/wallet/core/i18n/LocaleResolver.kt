package app.getvela.wallet.core.i18n

import java.util.Locale

/**
 * Maps the system locale list onto the 15 supported catalog tags (research D4).
 *
 * The uniffi surface does not export vela-core's `resolve_language`, and
 * `changeLanguage` performs no I/O — the host must pick which catalog file to
 * load. This ladder mirrors `rust/crates/vela-core/src/i18n/resolve.rs`
 * (SUPPORTED + pinned `en` fallback); the engine smoke test cross-checks it.
 *
 * NOTE: always derive codes from `toLanguageTag()` — `Locale.language` returns
 * legacy ISO codes (`in` for Indonesian) that would silently miss `id`.
 */
object LocaleResolver {

    val SUPPORTED: List<String> = listOf(
        "en", "zh", "zh-TW", "zh-HK", "ja", "ko", "vi", "id",
        "tr", "es-MX", "pt-BR", "fr", "de", "ru", "it",
    )

    const val FALLBACK: String = "en"

    private val REGIONAL_REPRESENTATIVE = mapOf(
        "es" to "es-MX",
        "pt" to "pt-BR",
    )

    fun resolve(locales: List<Locale>): String {
        for (locale in locales) {
            resolveOne(locale)?.let { return it }
        }
        return FALLBACK
    }

    private fun resolveOne(locale: Locale): String? {
        val tag = locale.toLanguageTag()
        val language = tag.substringBefore('-')
        if (language == "zh") return resolveChinese(locale)

        val region = locale.country
        if (region.isNotEmpty()) {
            val regional = "$language-$region"
            if (regional in SUPPORTED) return regional
        }
        if (language in SUPPORTED) return language
        return REGIONAL_REPRESENTATIVE[language]
    }

    /**
     * Chinese: script decides first (Hant → traditional), then region.
     * zh-Hant / zh-Hant-TW → zh-TW; zh-Hant-HK / zh-Hant-MO → zh-HK;
     * bare zh-TW / zh-HK / zh-MO keep their regional catalogs; everything
     * else (Hans or unmarked) → zh.
     */
    private fun resolveChinese(locale: Locale): String {
        val script = locale.script
        val region = locale.country
        return when {
            script == "Hant" -> when (region) {
                "HK", "MO" -> "zh-HK"
                else -> "zh-TW"
            }
            script == "Hans" -> "zh"
            region == "TW" -> "zh-TW"
            region == "HK" || region == "MO" -> "zh-HK"
            else -> "zh"
        }
    }
}
