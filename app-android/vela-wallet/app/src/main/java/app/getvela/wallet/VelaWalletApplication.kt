package app.getvela.wallet

import android.app.Application
import app.getvela.wallet.core.data.ThemePreferenceRepository
import app.getvela.wallet.core.i18n.I18nRuntime
import app.getvela.wallet.core.i18n.LocaleResolver
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Manual composition root (research D8) — no DI framework at this scale.
 * Engine construction is blocking file+FFI work, so it runs on a dedicated
 * single-thread executor; locale updates queue behind it, which makes the
 * ready-before-setLocale ordering structural.
 */
class AppContainer(private val app: Application) {

    val i18nRuntime = I18nRuntime { tag ->
        app.assets.open("i18n/$tag.json").use { it.readBytes() }
    }

    val themeRepository = ThemePreferenceRepository(app)

    private val i18nExecutor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "vela-i18n")
    }

    fun start() {
        i18nExecutor.execute {
            i18nRuntime.initialize(LocaleResolver.resolve(currentLocales()))
        }
    }

    /** Re-resolves the system locale (activity recreation on locale change). */
    fun applySystemLocale() {
        i18nExecutor.execute {
            i18nRuntime.setLocale(LocaleResolver.resolve(currentLocales()))
        }
    }

    private fun currentLocales(): List<Locale> {
        val localeList = app.resources.configuration.locales
        return (0 until localeList.size()).map { localeList[it] }
    }
}

class VelaWalletApplication : Application() {

    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        container.start()
    }
}
