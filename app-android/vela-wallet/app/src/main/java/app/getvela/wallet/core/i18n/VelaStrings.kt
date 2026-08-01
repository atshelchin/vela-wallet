package app.getvela.wallet.core.i18n

import androidx.compose.runtime.staticCompositionLocalOf

/**
 * Translation access for UI code. The only implementation shipped in the app is
 * [I18nRuntime] (vela-core engine); previews substitute a sample-copy fake.
 */
interface VelaStrings {
    fun t(key: String): String

    fun t(key: String, vars: Map<String, String>): String
}

val LocalVelaStrings = staticCompositionLocalOf<VelaStrings> {
    error("VelaStrings not provided — wrap content in CompositionLocalProvider(LocalVelaStrings provides …)")
}
