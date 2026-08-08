package app.getvela.wallet

import app.getvela.wallet.core.designsystem.components.BadgeVariant
import app.getvela.wallet.feature.onboarding.flow.ActionRole
import app.getvela.wallet.feature.onboarding.flow.CreatePanelState
import app.getvela.wallet.feature.onboarding.flow.FixturePanel
import app.getvela.wallet.feature.onboarding.flow.FlowFixtures
import app.getvela.wallet.feature.onboarding.flow.LoginPanelState
import app.getvela.wallet.feature.onboarding.flow.OutcomeSpec
import app.getvela.wallet.feature.onboarding.flow.StateFixture
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Spec 014 T031 — mechanical coverage gate (research D9): a dropped or
 * duplicated design state fails here, not in a visual walkthrough. The code
 * set is pinned verbatim by contracts/presentation-states.md §1 (34 unique
 * codes; E10 renders once but is listed in BOTH gallery groups, making the 35
 * spec renderings).
 */
class FlowFixturesTest {

    private val pinnedCodes = listOf(
        "A1", "A2", "A3",
        "A4", "A4c", "A5", "A5c", "A6", "A6c", "A7", "A7c", "A8", "A8c",
        "A11", "A12", "A13",
        "E1", "E2", "E2x", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10",
        "B1", "B1c", "B2", "B3", "B4", "B5", "B6",
    )

    private fun StateFixture.outcomeSpec(): OutcomeSpec? = when (val panel = panel) {
        is FixturePanel.Create -> (panel.state as? CreatePanelState.Outcome)?.spec
        is FixturePanel.Login -> (panel.state as? LoginPanelState.Outcome)?.spec
    }

    @Test
    fun fixtureSetIsExactlyThePinned34DesignCodes() {
        assertEquals(34, pinnedCodes.size)
        assertEquals(34, FlowFixtures.all.size)
        // Set equality both ways: nothing missing, nothing extra, no duplicates.
        assertEquals(pinnedCodes.toSet(), FlowFixtures.all.map { it.code }.toSet())
        assertEquals(34, FlowFixtures.all.map { it.code }.toSet().size)
    }

    @Test
    fun sharedE10IsReachableFromBothGalleryGroups() {
        assertTrue(
            "E10 missing from the create gallery group",
            FlowFixtures.createGallery.any { it.code == "E10" },
        )
        assertTrue(
            "E10 missing from the login gallery group",
            FlowFixtures.loginGallery.any { it.code == "E10" },
        )
        // Every fixture stays reachable through the two gallery groups.
        assertEquals(
            pinnedCodes.toSet(),
            (FlowFixtures.createGallery + FlowFixtures.loginGallery).map { it.code }.toSet(),
        )
    }

    @Test
    fun everyOutcomeHasExactlyOnePrimaryFirstAndAtMostTwoSecondaries() {
        val outcomes = FlowFixtures.all.mapNotNull { fixture ->
            fixture.outcomeSpec()?.let { fixture.code to it }
        }
        // All non-form/non-progress codes are outcome-shaped:
        // 34 − 3 form (A1–A3) − 10 working (A4–A8 + c) − 2 waiting (B1/B1c) = 19.
        assertEquals(19, outcomes.size)
        for ((code, spec) in outcomes) {
            val primaries = spec.actions.count { it.role == ActionRole.Primary }
            val secondaries = spec.actions.count { it.role == ActionRole.Secondary }
            assertEquals("$code must have exactly 1 primary action", 1, primaries)
            assertTrue("$code has $secondaries secondaries (max 2)", secondaries <= 2)
            assertEquals(
                "$code must list its primary action first (top-to-bottom order)",
                ActionRole.Primary,
                spec.actions.first().role,
            )
        }
    }

    @Test
    fun spotBadgeMappingMatchesTheDataModel() {
        assertEquals(BadgeVariant.Success, FlowFixtures.byCode("A11").outcomeSpec()?.badge)
        assertEquals(BadgeVariant.Timeout, FlowFixtures.byCode("E3").outcomeSpec()?.badge)
        assertEquals(BadgeVariant.Info, FlowFixtures.byCode("B2").outcomeSpec()?.badge)
    }
}
