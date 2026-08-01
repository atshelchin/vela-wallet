package app.getvela.wallet.core.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

/** Spec entity: Light | Dark | Auto; Auto follows the system (default). */
enum class ThemePreference(val storageValue: String) {
    Light("light"),
    Dark("dark"),
    Auto("auto");

    companion object {
        fun fromStorage(value: String?): ThemePreference =
            entries.firstOrNull { it.storageValue == value } ?: Auto
    }
}

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

/** Persists the theme choice across restarts (spec FR-006, research D9). */
class ThemePreferenceRepository(private val context: Context) {

    private val key = stringPreferencesKey("theme_preference")

    val themePreference: Flow<ThemePreference> =
        context.settingsDataStore.data
            // An unreadable preferences file must degrade to the Auto default, not
            // become a crash loop (DataStore's data flow throws IOException).
            .catch { error ->
                if (error is IOException) emit(emptyPreferences()) else throw error
            }
            .map { prefs -> ThemePreference.fromStorage(prefs[key]) }

    suspend fun setThemePreference(preference: ThemePreference) {
        context.settingsDataStore.edit { prefs -> prefs[key] = preference.storageValue }
    }
}
