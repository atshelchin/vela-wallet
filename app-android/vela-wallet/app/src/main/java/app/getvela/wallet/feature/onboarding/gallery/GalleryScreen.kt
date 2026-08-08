package app.getvela.wallet.feature.onboarding.gallery

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBorder
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaLetterSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.LocalVelaStrings
import app.getvela.wallet.feature.onboarding.flow.ActionId
import app.getvela.wallet.feature.onboarding.flow.FixturePanel
import app.getvela.wallet.feature.onboarding.flow.FlowFixtures
import app.getvela.wallet.feature.onboarding.flow.FlowSheet
import app.getvela.wallet.feature.onboarding.flow.StateFixture

/**
 * Dev-only state gallery (spec 014, FR-013/FR-014): lists all 35 renderings —
 * 34 fixtures with E10 in BOTH groups — grouped create/login, renders the
 * selected fixture inside the real [FlowSheet], and toggles light/dark by
 * re-wrapping in [VelaTheme]. Reachable only via MainActivity's
 * `--ez vela.gallery true` intent extra (house pattern); release builds never
 * receive the extra.
 */
@Composable
fun GalleryScreen(initialDarkTheme: Boolean) {
    var darkTheme by rememberSaveable { mutableStateOf(initialDarkTheme) }
    var selectedCode by rememberSaveable { mutableStateOf<String?>(null) }

    VelaTheme(darkTheme = darkTheme) {
        val strings = LocalVelaStrings.current
        val colors = VelaTheme.colors

        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.bgBase)
                .safeDrawingPadding(),
        ) {
            item(key = "themeToggle") {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = VelaSizing.hitTarget)
                        .padding(horizontal = VelaSizing.screenPaddingX),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = strings.t(I18nKeys.Settings.THEME_DARK),
                        color = colors.fgBase,
                        fontFamily = VelaFontFamily,
                        fontWeight = VelaFontWeight.medium,
                        fontSize = VelaTextSize.lg,
                        modifier = Modifier.weight(1f),
                    )
                    Switch(
                        checked = darkTheme,
                        onCheckedChange = { darkTheme = it },
                    )
                }
                HorizontalDivider(color = colors.borderBase, thickness = VelaBorder.hairline)
            }
            item(key = "createHeader") {
                GalleryGroupHeader(strings.t(I18nKeys.Create.HEADER))
            }
            items(FlowFixtures.createGallery, key = { "create-${it.code}" }) { fixture ->
                GalleryFixtureRow(fixture) { selectedCode = fixture.code }
            }
            item(key = "loginHeader") {
                GalleryGroupHeader(strings.t(I18nKeys.Login.HEADER))
            }
            items(FlowFixtures.loginGallery, key = { "login-${it.code}" }) { fixture ->
                GalleryFixtureRow(fixture) { selectedCode = fixture.code }
            }
        }

        val fixture = selectedCode?.let { code -> FlowFixtures.byCode(code) }
        if (fixture != null) {
            val dismiss = { selectedCode = null }
            // Gallery action sink (contract §2): dismissal semantics for the
            // back-flavoured ids; everything else is a visual no-op here.
            val sink: (ActionId) -> Unit = { id ->
                when (id) {
                    ActionId.Back, ActionId.Cancel, ActionId.NotNow, ActionId.Close -> dismiss()
                    else -> Unit
                }
            }
            when (val panel = fixture.panel) {
                is FixturePanel.Create -> FlowSheet(
                    state = panel.state,
                    onAction = sink,
                    onDismiss = dismiss,
                )
                is FixturePanel.Login -> FlowSheet(
                    state = panel.state,
                    onAction = sink,
                    onDismiss = dismiss,
                )
            }
        }
    }
}

@Composable
private fun GalleryGroupHeader(label: String) {
    val colors = VelaTheme.colors
    Text(
        text = label,
        color = colors.fgSubtle,
        fontFamily = VelaFontFamily,
        fontWeight = VelaFontWeight.semibold,
        fontSize = VelaTextSize.sm,
        letterSpacing = VelaLetterSpacing.sectionLabel,
        modifier = Modifier
            .fillMaxWidth()
            .padding(
                start = VelaSizing.screenPaddingX,
                end = VelaSizing.screenPaddingX,
                top = VelaSpacing.xl3,
                bottom = VelaSpacing.md,
            ),
    )
}

@Composable
private fun GalleryFixtureRow(fixture: StateFixture, onClick: () -> Unit) {
    val colors = VelaTheme.colors
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = VelaSizing.hitTarget)
            .clickable(onClick = onClick)
            .padding(horizontal = VelaSizing.screenPaddingX),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The design code is fixture data, not UI copy.
        Text(
            text = fixture.code,
            color = colors.fgBase,
            fontFamily = VelaFontFamily,
            fontWeight = VelaFontWeight.medium,
            fontSize = VelaTextSize.lg,
        )
        Spacer(modifier = Modifier.width(VelaSpacing.lg))
    }
}
