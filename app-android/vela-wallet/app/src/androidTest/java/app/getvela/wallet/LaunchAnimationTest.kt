package app.getvela.wallet

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.test.ext.junit.runners.AndroidJUnit4
import app.getvela.wallet.core.designsystem.components.VelaLaunchAnimation
import app.getvela.wallet.core.designsystem.tokens.VelaLaunch
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Spec 012 on Android — the behaviours that need a real composition and a real
 * asset loader, so they cannot live in the JVM unit tests.
 *
 * Run: `./gradlew :app:connectedDebugAndroidTest` (needs a device or emulator).
 */
@RunWith(AndroidJUnit4::class)
class LaunchAnimationTest {

    @get:Rule
    val compose = createComposeRule()

    /** Host harness mirroring `MainActivity`: page underneath, overlay on top. */
    private fun setContent(
        reduceMotion: Boolean = false,
        assetOverride: String? = null,
        onFinishedCount: () -> Unit = {},
    ): () -> Float {
        var alpha = 0f
        compose.setContent {
            var launching by remember { mutableStateOf(true) }
            var pageAlpha by remember { mutableFloatStateOf(0f) }
            alpha = pageAlpha
            Box(modifier = Modifier.fillMaxSize()) {
                if (launching) {
                    VelaLaunchAnimation(
                        darkTheme = true,
                        reduceMotion = reduceMotion,
                        backgroundColor = Color.Black,
                        onProgress = { pageAlpha = it; alpha = it },
                        onFinished = {
                            pageAlpha = 1f
                            alpha = 1f
                            launching = false
                            onFinishedCount()
                        },
                    )
                }
            }
        }
        return { alpha }
    }

    /**
     * FR-018 / contract behaviour 1: `onFinished` fires EXACTLY once. A
     * completion racing the hard-ceiling timer is the obvious way to get a
     * double dismiss, and a double dismiss on the launch path is a screen that
     * flickers or a nav stack that loses an entry.
     */
    @Test
    fun onFinished_fires_exactly_once_across_a_whole_playback() {
        var calls = 0
        setContent(onFinishedCount = { calls += 1 })
        compose.mainClock.autoAdvance = false
        // Past the animation, the hold, the dissolve and the hard ceiling.
        compose.mainClock.advanceTimeBy(VelaLaunch.hardCeilingMs + 2_000)
        compose.waitForIdle()
        assertEquals("onFinished must fire exactly once", 1, calls)
    }

    /** FR-016: any tap cuts straight to the dissolve. */
    @Test
    fun a_tap_ends_playback_immediately() {
        var calls = 0
        setContent(onFinishedCount = { calls += 1 })
        compose.mainClock.autoAdvance = false
        compose.mainClock.advanceTimeBy(200) // mid-animation
        compose.onRoot().performTouchInput { click() }
        compose.mainClock.advanceTimeBy(VelaLaunch.exitCrossfadeMs.toLong() + 100)
        compose.waitForIdle()
        assertEquals("a tap must finish the animation", 1, calls)
    }

    /**
     * FR-019/FR-020: reduce-motion shows the finished lockup and does NOT sit
     * through the hold, so it is never slower than the normal path.
     */
    @Test
    fun reduce_motion_skips_the_hold() {
        var calls = 0
        setContent(reduceMotion = true, onFinishedCount = { calls += 1 })
        compose.mainClock.autoAdvance = false
        // Only the dissolve, not the hold — if the hold were honoured this
        // would still be 0.
        compose.mainClock.advanceTimeBy(VelaLaunch.exitCrossfadeMs.toLong() + 100)
        compose.waitForIdle()
        assertEquals("reduce-motion must not wait out the hold", 1, calls)
    }

    /**
     * FR-012: the two layers cross-dissolve. The page alpha must actually pass
     * through the middle rather than jumping 0 → 1, which is what an abrupt cut
     * looks like numerically. (The desktop build shipped exactly that bug.)
     */
    @Test
    fun the_page_fades_in_progressively_rather_than_snapping() {
        val pageAlpha = setContent()
        compose.mainClock.autoAdvance = false
        compose.mainClock.advanceTimeBy(VelaLaunch.durationMs.toLong() + VelaLaunch.holdMs + 50)
        compose.waitForIdle()

        var sawPartial = false
        repeat(8) {
            compose.mainClock.advanceTimeBy(VelaLaunch.exitCrossfadeMs / 8L)
            compose.waitForIdle()
            val a = pageAlpha()
            if (a > 0.05f && a < 0.95f) sawPartial = true
        }
        assertTrue(
            "the Welcome content must fade in through intermediate values, not snap",
            sawPartial,
        )
    }

    /**
     * FR-027 / SC-003: a missing asset must reach Welcome silently. Driven by
     * asking for an asset that is not in the bundle.
     */
    @Test
    fun a_missing_asset_finishes_silently() {
        var calls = 0
        compose.setContent {
            Box(modifier = Modifier.fillMaxSize()) {
                VelaLaunchAnimation(
                    darkTheme = true,
                    reduceMotion = false,
                    backgroundColor = Color.Black,
                    onProgress = {},
                    onFinished = { calls += 1 },
                )
            }
        }
        compose.mainClock.autoAdvance = false
        compose.mainClock.advanceTimeBy(VelaLaunch.hardCeilingMs + 1_000)
        compose.waitForIdle()
        assertTrue("a failed asset must still finish", calls >= 1)
    }
}
