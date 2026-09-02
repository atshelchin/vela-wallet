package app.getvela.wallet

import app.getvela.wallet.navigation.DEVELOPER_ROUTES
import app.getvela.wallet.navigation.VelaDestinations
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Every gallery route must be exempt from the session guard.
 *
 * The guard sends a device with no wallet back to Welcome. A gallery route
 * that is accepted by the `vela.startDestination` extra but missing from the
 * exempt set therefore launches and is yanked away before it paints — which
 * is exactly what `flows-gallery` did on the first device run (spec 021).
 * Unit tests over fixtures cannot see this; only navigation can.
 */
class DeveloperRoutesTest {
    @Test
    fun `every gallery route the launch extra accepts is exempt from the session guard`() {
        val galleries = VelaDestinations.ALL.filter { it.endsWith("gallery") }
        assertTrue("no gallery routes found — the filter is wrong", galleries.isNotEmpty())
        galleries.forEach { route ->
            assertTrue(
                "$route is launchable but not exempt: the guard will bounce it to Welcome",
                route in DEVELOPER_ROUTES,
            )
        }
    }
}
