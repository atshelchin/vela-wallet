package app.getvela.wallet.feature.onboarding

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.times
import app.getvela.wallet.core.designsystem.components.PagerDots
import app.getvela.wallet.core.designsystem.components.VelaCard
import app.getvela.wallet.core.designsystem.components.VelaLogo
import app.getvela.wallet.core.designsystem.components.VelaPrimaryButton
import app.getvela.wallet.core.designsystem.components.VelaSecondaryButton
import app.getvela.wallet.core.designsystem.theme.VelaTheme
import app.getvela.wallet.core.designsystem.tokens.VelaBrand
import app.getvela.wallet.core.designsystem.tokens.VelaFontFamily
import app.getvela.wallet.core.designsystem.tokens.VelaFontWeight
import app.getvela.wallet.core.designsystem.tokens.VelaLeading
import app.getvela.wallet.core.designsystem.tokens.VelaMotion
import app.getvela.wallet.core.designsystem.tokens.VelaSizing
import app.getvela.wallet.core.designsystem.tokens.VelaSpacing
import app.getvela.wallet.core.designsystem.tokens.VelaTextSize
import app.getvela.wallet.core.i18n.I18nKeys
import app.getvela.wallet.core.i18n.LocalVelaStrings
import java.util.Locale
import kotlinx.coroutines.launch

/**
 * Welcome: brand block, tagline, six-card carousel with pager dots, CTA stack.
 * Long-press on the mark opens the theme settings sheet (RN precedent, FR-006).
 *
 * The hero/carousel region scrolls when it cannot fit (large font scale, short
 * screens) while the CTA stack stays pinned and fully visible (US1 AS4); on
 * regular phones nothing scrolls and the spacing follows the mock's rhythm.
 *
 * Spec 019 changed what the two CTAs DO, not what they look like. Creating a
 * wallet now leaves for a full-screen journey instead of raising a sheet over
 * this page, and 我已有钱包 dispatches straight into the login machine — the
 * system passkey sheet is the next thing the person sees, so an intermediate
 * screen of our own would be a screen with nothing on it. [signingIn] is the
 * core's `busy`, and it disables the button rather than hiding it: a control
 * that vanishes while a system dialog is up reads as the app having crashed
 * behind it.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun WelcomeScreen(
    darkTheme: Boolean,
    onIntent: (OnboardingIntent) -> Unit,
    onLongPressLogo: () -> Unit,
    modifier: Modifier = Modifier,
    signingIn: Boolean = false,
) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors
    val pagerState = rememberPagerState { WelcomeCards.size }
    val scope = rememberCoroutineScope()

    val entrance = remember {
        MutableTransitionState(false).apply { targetState = true }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .background(colors.bgBase)
            .safeDrawingPadding()
            .padding(horizontal = VelaSizing.screenPaddingX),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        BoxWithConstraints(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth(),
        ) {
            val region = maxHeight
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState()),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                AnimatedVisibility(
                    visibleState = entrance,
                    enter = fadeIn(tween(VelaMotion.entranceFade)),
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        // Whitespace fractions sit below the mock's rhythm on purpose:
                        // the pager is pinned to the TALLEST card, so the card zone
                        // needs the extra room to clear the pinned CTA stack on
                        // compact/large-font devices.
                        Spacer(modifier = Modifier.height(region * 0.20f))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.combinedClickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                                onClick = {},
                                onLongClick = onLongPressLogo,
                            ),
                        ) {
                            VelaLogo(
                                darkTheme = darkTheme,
                                contentDescription = VelaBrand.WORDMARK,
                                modifier = Modifier.size(VelaSizing.emptyStateCircle),
                            )
                            Spacer(modifier = Modifier.size(VelaSpacing.xl))
                            Text(
                                text = VelaBrand.WORDMARK,
                                color = colors.fgBase,
                                fontFamily = VelaFontFamily,
                                fontWeight = VelaFontWeight.bold,
                                fontSize = VelaTextSize.xl4,
                            )
                        }
                        Spacer(modifier = Modifier.height(VelaSpacing.xl4))
                        Text(
                            text = strings.t(I18nKeys.Welcome.TAGLINE),
                            color = colors.fgMuted,
                            fontFamily = VelaFontFamily,
                            fontWeight = VelaFontWeight.regular,
                            fontSize = VelaTextSize.xl,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(modifier = Modifier.height(region * 0.12f))
                    }
                }
                AnimatedVisibility(
                    visibleState = entrance,
                    enter = fadeIn(tween(VelaMotion.entranceFadeUp)) +
                        slideInVertically(tween(VelaMotion.entranceFadeUp)) { it / 8 },
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        HorizontalPager(
                            state = pagerState,
                            pageSpacing = VelaSpacing.lg,
                            verticalAlignment = Alignment.Top,
                            // Keep all six pages composed so the pager's height is the
                            // TALLEST card ("row height = tallest, wrap not clip"):
                            // the dots row below never shifts while swiping.
                            beyondViewportPageCount = WelcomeCards.size - 1,
                            modifier = Modifier.fillMaxWidth(),
                        ) { page ->
                            WelcomeFeatureCard(card = WelcomeCards[page])
                        }
                        Spacer(modifier = Modifier.height(VelaSpacing.md))
                        PagerDots(
                            pageCount = WelcomeCards.size,
                            currentPage = pagerState.currentPage,
                            onSelect = { page ->
                                scope.launch { pagerState.animateScrollToPage(page) }
                            },
                        )
                    }
                }
            }
        }

        AnimatedVisibility(
            visibleState = entrance,
            enter = fadeIn(tween(VelaMotion.entranceFadeUp)),
        ) {
            Column {
                VelaPrimaryButton(
                    text = strings.t(I18nKeys.Welcome.CREATE_WALLET),
                    onClick = { onIntent(OnboardingIntent.CreateWallet) },
                    enabled = !signingIn,
                )
                Spacer(modifier = Modifier.height(VelaSpacing.lg))
                VelaSecondaryButton(
                    text = strings.t(I18nKeys.Welcome.ALREADY_HAVE_WALLET),
                    onClick = { onIntent(OnboardingIntent.RecoverWallet) },
                    enabled = !signingIn,
                )
                Spacer(modifier = Modifier.height(VelaSpacing.xl))
            }
        }
    }
}

@Composable
private fun WelcomeFeatureCard(card: WelcomeCard) {
    val strings = LocalVelaStrings.current
    val colors = VelaTheme.colors
    VelaCard(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(VelaSpacing.xl2),
            verticalArrangement = Arrangement.spacedBy(VelaSpacing.md),
        ) {
            Text(
                // Ordinal is generated, never translated (FR-003). fg.subtle caption
                // contrast is the recorded DV-005 exception (matches the mock).
                text = String.format(Locale.ROOT, "%02d", card.ordinal),
                color = colors.fgSubtle,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.medium,
                fontSize = VelaTextSize.sm,
            )
            Text(
                text = strings.t(card.titleKey),
                color = colors.fgBase,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.semibold,
                fontSize = VelaTextSize.xl2,
            )
            Text(
                text = strings.t(card.bodyKey),
                color = colors.fgMuted,
                fontFamily = VelaFontFamily,
                fontWeight = VelaFontWeight.regular,
                fontSize = VelaTextSize.lg,
                lineHeight = VelaLeading.normal * VelaTextSize.lg,
            )
        }
    }
}
