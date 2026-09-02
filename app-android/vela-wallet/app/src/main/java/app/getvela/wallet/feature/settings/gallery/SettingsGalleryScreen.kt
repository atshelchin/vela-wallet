package app.getvela.wallet.feature.settings.gallery

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaRadius
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.LocalVelaStrings
import app.getvela.wallet.feature.settings.SettingsFixtures
import app.getvela.wallet.feature.settings.SettingsRoute
import app.getvela.wallet.feature.settings.SettingsScreenState

/**
 * Settings preview gallery (spec 023, the spec-018 mechanism): every mobile
 * state — ST1–ST16 and the SR1–SR5 rescue set — reachable in one tap, driven by
 * fixtures alone and fully offline. Reached only via the
 * `vela.startDestination` intent extra; production navigation never links here.
 *
 * Chip labels are state codes (data, not translations), so nothing user-visible
 * bypasses the corpus.
 */
@Composable
fun SettingsGalleryScreen(
    systemDarkTheme: Boolean,
    modifier: Modifier = Modifier,
) {
    val strings = LocalVelaStrings.current
    var state by rememberSaveable { mutableStateOf(SettingsScreenState.ST1) }
    var dark by rememberSaveable { mutableStateOf(systemDarkTheme) }

    VelaTheme(darkTheme = dark) {
        val colors = VelaTheme.colors
        Column(modifier = modifier.fillMaxSize().background(colors.bgBase)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .statusBarsPadding()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = VelaSpacing.lg, vertical = VelaSpacing.md),
                horizontalArrangement = Arrangement.spacedBy(VelaSpacing.md),
            ) {
                SettingsScreenState.entries.forEach { entry ->
                    Chip(
                        label = entry.name,
                        selected = entry == state,
                        onClick = { state = entry },
                    )
                }
                Chip(label = if (dark) "DARK" else "LIGHT", selected = false) { dark = !dark }
            }

            Box(modifier = Modifier.fillMaxSize()) {
                val model = remember(state, strings) {
                    SettingsFixtures.buildState(state, strings)
                }
                SettingsRoute(model = model)
            }
        }
    }
}

@Composable
private fun Chip(label: String, selected: Boolean, onClick: () -> Unit) {
    val colors = VelaTheme.colors
    Text(
        text = label,
        color = if (selected) colors.fgInverse else colors.fgMuted,
        fontFamily = VelaFontFamily,
        fontWeight = if (selected) VelaFontWeight.semibold else VelaFontWeight.regular,
        fontSize = VelaTextSize.sm,
        modifier = Modifier
            .clip(RoundedCornerShape(VelaRadius.full))
            .background(if (selected) colors.accentBase else colors.bgRaised)
            .clickable(onClick = onClick)
            .padding(horizontal = VelaSpacing.lg, vertical = VelaSpacing.md),
    )
}
