package app.getvela.wallet

import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.I18nRuntime
import app.getvela.wallet.core.i18n.LocaleResolver
import java.io.File
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * SC-002b: differential evidence on the real engine (host dylib via JNA — the
 * jna.library.path is wired in app/build.gradle.kts; spec 005's native-rollout
 * precondition). Catalogs come from the generated public/i18n, the same files
 * the app packages as assets.
 */
class I18nEngineSmokeTest {

    private val repoRoot = File(
        System.getProperty("vela.repo.root")
            ?: error("vela.repo.root not set — run via Gradle (testOptions wires it)"),
    )

    private fun newRuntime(): I18nRuntime = I18nRuntime { tag ->
        File(repoRoot, "public/i18n/$tag.json").readBytes()
    }

    private val welcomeKeys = listOf(
        I18nKeys.Welcome.TAGLINE,
        I18nKeys.Welcome.CREATE_WALLET,
        I18nKeys.Welcome.ALREADY_HAVE_WALLET,
        I18nKeys.Welcome.FEATURE_NO_MNEMONIC_TITLE,
        I18nKeys.Welcome.FEATURE_NO_MNEMONIC_BODY,
        I18nKeys.Welcome.FEATURE_ONE_ADDRESS_TITLE,
        I18nKeys.Welcome.FEATURE_ONE_ADDRESS_BODY,
        I18nKeys.Welcome.FEATURE_OPEN_SOURCE_TITLE,
        I18nKeys.Welcome.FEATURE_OPEN_SOURCE_BODY,
        I18nKeys.Welcome.FEATURE_KEY_CUSTODY_TITLE,
        I18nKeys.Welcome.FEATURE_KEY_CUSTODY_BODY,
        I18nKeys.Welcome.FEATURE_SAFE_CONTRACT_TITLE,
        I18nKeys.Welcome.FEATURE_SAFE_CONTRACT_BODY,
        I18nKeys.Welcome.FEATURE_STABLECOIN_GAS_TITLE,
        I18nKeys.Welcome.FEATURE_STABLECOIN_GAS_BODY,
        I18nKeys.Settings.TITLE,
        I18nKeys.Settings.SECTION_APPEARANCE,
        I18nKeys.Settings.THEME_LIGHT,
        I18nKeys.Settings.THEME_DARK,
        I18nKeys.Settings.THEME_AUTO,
        I18nKeys.Create.HEADER,
        I18nKeys.Common.CANCEL,
    )

    @Test
    fun everyScreenKeyTranslatesInEnglish() {
        val runtime = newRuntime()
        runtime.initialize("en")
        for (key in welcomeKeys) {
            val value = runtime.t(key)
            assertNotEquals("key echoed (missing in en catalog): $key", key, value)
            assertTrue("blank translation for $key", value.isNotBlank())
        }
    }

    @Test
    fun chineseCatalogTranslatesTheWelcomeScreen() {
        val runtime = newRuntime()
        runtime.initialize("zh")
        assertEquals("zh", runtime.state.value.language)
        assertEquals("创建钱包", runtime.t(I18nKeys.Welcome.CREATE_WALLET))
        assertEquals("我已有钱包", runtime.t(I18nKeys.Welcome.ALREADY_HAVE_WALLET))
        assertEquals("您的密钥，您的资产", runtime.t(I18nKeys.Welcome.TAGLINE))
        assertEquals("不用助记词", runtime.t(I18nKeys.Welcome.FEATURE_NO_MNEMONIC_TITLE))
    }

    @Test
    fun everySupportedLocaleLoadsAndTranslates() {
        val runtime = newRuntime()
        runtime.initialize("en")
        for (tag in LocaleResolver.SUPPORTED) {
            runtime.setLocale(tag)
            assertEquals(tag, runtime.state.value.language)
            val value = runtime.t(I18nKeys.Welcome.CREATE_WALLET)
            assertNotEquals("key echoed for locale $tag", I18nKeys.Welcome.CREATE_WALLET, value)
            assertTrue("blank translation for locale $tag", value.isNotBlank())
        }
    }

    @Test
    fun traditionalChineseResolvesToTaiwanCatalog() {
        val tag = LocaleResolver.resolve(listOf(Locale.forLanguageTag("zh-Hant-TW")))
        assertEquals("zh-TW", tag)
        val runtime = newRuntime()
        runtime.initialize(tag)
        assertEquals("zh-TW", runtime.state.value.language)
        assertNotEquals(
            I18nKeys.Welcome.CREATE_WALLET,
            runtime.t(I18nKeys.Welcome.CREATE_WALLET),
        )
    }

    @Test
    fun unsupportedLocaleFallsBackToEnglishCatalog() {
        val tag = LocaleResolver.resolve(listOf(Locale.forLanguageTag("pl-PL")))
        assertEquals("en", tag)
        val runtime = newRuntime()
        runtime.initialize(tag)
        assertEquals("Create Wallet", runtime.t(I18nKeys.Welcome.CREATE_WALLET))
    }

    @Test
    fun switchingBackAndForthKeepsEnglishFallbackResident() {
        val runtime = newRuntime()
        runtime.initialize("zh")
        runtime.setLocale("ja")
        runtime.setLocale("en")
        assertEquals("Create Wallet", runtime.t(I18nKeys.Welcome.CREATE_WALLET))
    }
}
