package app.getvela.wallet.core.designsystem.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.dp
import app.getvela.wallet.core.designsystem.tokens.VelaLaunch
import com.airbnb.lottie.compose.LottieAnimation
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.animateLottieCompositionAsState
import com.airbnb.lottie.compose.rememberLottieComposition
import kotlinx.coroutines.delay

/**
 * The launch animation — the only file in this app that imports Lottie
 * (spec 012 FR-024). Contract:
 * `specs/012-launch-animation-lottie/contracts/launch-animation-api.md`.
 *
 * Everything about the shape of this is shared with the other three platforms:
 * play once → hold the finished lockup → cross-dissolve into Welcome, with any
 * input cutting straight to the dissolve and every failure path ending silently
 * on Welcome.
 *
 * @param onProgress fraction of the cross-dissolve completed, 0..1. The HOST
 *   applies this to the Welcome content's alpha so the two layers dissolve into
 *   each other. It is not the animation's own progress.
 * @param onFinished called EXACTLY once, for every outcome — completion, skip,
 *   budget expiry, ceiling, asset failure, reduce-motion. The host does not
 *   distinguish between them; it only removes the overlay.
 */
@Composable
fun VelaLaunchAnimation(
    darkTheme: Boolean,
    reduceMotion: Boolean,
    backgroundColor: Color,
    onProgress: (Float) -> Unit,
    onFinished: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val configuration = LocalConfiguration.current
    val largeScreen = VelaLaunch.isLargeScreen(
        configuration.screenWidthDp.dp,
        configuration.screenHeightDp.dp,
    )
    val (boxWidth, boxHeight) = VelaLaunch.boxSize(configuration.screenWidthDp.dp, largeScreen)

    val composition by rememberLottieComposition(
        LottieCompositionSpec.Asset(VelaLaunch.assetName(largeScreen, darkTheme)),
    )

    // Latched so a completion racing a timeout cannot dismiss twice
    // (contract behaviour 1). `rememberUpdatedState` keeps the timers pointed at
    // the current lambda without restarting them.
    val finish by rememberUpdatedState(onFinished)
    var finished by remember { mutableStateOf(false) }
    val finishOnce = remember {
        {
            if (!finished) {
                finished = true
                finish()
            }
        }
    }

    var exiting by remember { mutableStateOf(false) }
    var presented by remember { mutableStateOf(false) }

    val progress by animateLottieCompositionAsState(
        composition = composition,
        iterations = 1,
        isPlaying = composition != null && !reduceMotion && !exiting,
    )

    // Reduce-motion shows the finished lockup and skips the hold entirely: the
    // point of the setting is less time spent on motion (FR-019/FR-020).
    val shownProgress = if (reduceMotion) 1f else progress

    // Cross-dissolve. The HOST fades the Welcome content in by the same fraction
    // over a background that never fades, which is what stops the transition
    // washing out through to the bare window.
    val dissolve by animateFloatAsState(
        targetValue = if (exiting) 1f else 0f,
        animationSpec = tween(durationMillis = VelaLaunch.exitCrossfadeMs),
        label = "launchDissolve",
    )
    LaunchedEffect(dissolve) {
        onProgress(dissolve)
        if (exiting && dissolve >= 1f) finishOnce()
    }

    // FR-014: nothing on screen within the budget → abandon, silently.
    LaunchedEffect(Unit) {
        delay(VelaLaunch.firstFrameBudgetMs)
        if (!presented) finishOnce()
    }

    // FR-017: a missing or unparseable asset is not an error the user hears
    // about. `rememberLottieComposition` reports it by never producing one.
    LaunchedEffect(composition) {
        if (composition != null) presented = true
    }

    // FR-015: hard ceiling from the first presented frame.
    LaunchedEffect(presented) {
        if (!presented) return@LaunchedEffect
        delay(VelaLaunch.hardCeilingMs)
        exiting = true
    }

    // Play → hold → dissolve. Reduce-motion skips straight past the hold.
    LaunchedEffect(shownProgress, reduceMotion) {
        if (shownProgress < 1f) return@LaunchedEffect
        if (!reduceMotion) delay(VelaLaunch.holdMs)
        exiting = true
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            // Opaque until the dissolve starts — Welcome must not be visible
            // through it (FR-013). During the dissolve the host's identically
            // coloured background takes over, so this fades with the overlay.
            .background(backgroundColor.copy(alpha = 1f - dissolve))
            .alpha(1f - dissolve)
            // FR-016: any tap cuts to the dissolve. `pointerInput` rather than
            // `clickable` so there is no ripple and no accessibility affordance
            // on what is decoration.
            .pointerInput(Unit) {
                awaitPointerEventScope {
                    while (true) {
                        awaitPointerEvent()
                        exiting = true
                    }
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        if (composition != null) {
            LottieAnimation(
                composition = composition,
                progress = { shownProgress },
                modifier = Modifier.size(boxWidth, boxHeight),
            )
        }
    }
}

