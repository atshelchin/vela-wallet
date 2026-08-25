package app.getvela.wallet.feature.onboarding.flow

import app.getvela.wallet.feature.onboarding.core.CreateKeyRow
import app.getvela.wallet.feature.onboarding.core.CreateStage
import app.getvela.wallet.feature.onboarding.core.CreateView
import app.getvela.wallet.feature.onboarding.core.KeyMethod
import app.getvela.wallet.feature.onboarding.core.PromptKind
import app.getvela.wallet.feature.onboarding.core.StatusKey
import app.getvela.wallet.feature.onboarding.core.SubmitLabel

/**
 * Gallery fixtures for the v2 flow.
 *
 * Spec 014's fixtures were `CreatePanelState` / `LoginPanelState` — presentation
 * types this app owned. Those types are gone: the screens now render `CreateView`
 * straight from the core, so a fixture has to be a `CreateView` too. That is the
 * point of rewriting them rather than adapting them — a fixture in a shape the
 * production path cannot produce is a picture of a screen that cannot happen.
 *
 * The same list the desktop client walks (results.md, Phase 5), so a state that
 * looks wrong on one is checkable against the other.
 */

sealed interface Fixture {
    /** A step of the create journey, rendered by the real flow screens. */
    data class Flow(val view: CreateView) : Fixture

    /** The failure sheet, one entry per outcome the catalog names. */
    data class Sheet(val kind: PromptKind, val confirmable: Boolean) : Fixture
}

data class StateFixture(val group: String, val code: String, val fixture: Fixture)

object FlowFixtures {

    /** A funded-looking address; the identicon and the strip both derive from it. */
    const val FIXTURE_ADDRESS = "0x44EEC06897ff7ab8C7f16819511A64bA168A6D33"

    private fun base(): CreateView = CreateView(
        stage = CreateStage.Form,
        name = "",
        nameEditable = true,
        nameTooLong = false,
        acks = listOf(false, false),
        canSubmit = false,
        submitLabel = SubmitLabel.Create,
        showStartOver = false,
        busy = false,
        status = null,
        keys = emptyList(),
        canAddKey = true,
        canFinish = false,
        needsSecondKey = false,
        canGoBack = true,
        address = null,
        syncErrorDetail = null,
    )

    private fun key(
        name: String,
        method: KeyMethod = KeyMethod.Platform,
        confirmed: Boolean = true,
        synced: Boolean = true,
    ) = CreateKeyRow(
        name = name,
        authenticatorAttachment = if (method == KeyMethod.SecurityKey) "cross-platform" else "platform",
        transports = if (method == KeyMethod.SecurityKey) "usb,nfc" else "internal,hybrid",
        confirmed = confirmed,
        synced = synced,
        aaguid = "",
        method = method,
    )

    val all: List<StateFixture> = buildList {
        fun flow(code: String, view: CreateView) = add(StateFixture("Create", code, Fixture.Flow(view)))
        fun sheet(code: String, kind: String, detail: String? = null, confirmable: Boolean = false) =
            add(StateFixture("Failures", code, Fixture.Sheet(PromptKind(kind, detail), confirmable)))

        flow("name · empty", base())
        flow(
            "name · filled",
            base().copy(name = "Everyday wallet", acks = listOf(true, true), canSubmit = true),
        )
        flow(
            "name · too long",
            base().copy(
                name = "A wallet name that will not fit a WebAuthn user handle",
                nameTooLong = true,
            ),
        )
        // A draft waiting for its signature: the name is frozen, the button
        // changed word, and the status line says why — the state spec 014 drew
        // as a modal "verification cancelled" sheet.
        flow(
            "name · draft waiting",
            base().copy(
                name = "Everyday wallet",
                nameEditable = false,
                acks = listOf(true, true),
                canSubmit = true,
                submitLabel = SubmitLabel.FinishVerify,
                showStartOver = true,
                status = StatusKey.VerifyCancelled,
            ),
        )
        flow(
            "keys · one, needs a second",
            base().copy(
                stage = CreateStage.AddKeys,
                keys = listOf(key("Everyday wallet", synced = false)),
                needsSecondKey = true,
            ),
        )
        flow(
            "keys · two, ready",
            base().copy(
                stage = CreateStage.AddKeys,
                keys = listOf(key("Everyday wallet", synced = false), key("Key 2")),
                canFinish = true,
            ),
        )
        flow(
            "keys · unconfirmed row",
            base().copy(
                stage = CreateStage.AddKeys,
                keys = listOf(key("Everyday wallet"), key("Key 2", confirmed = false)),
            ),
        )
        flow(
            "keys · at the cap",
            base().copy(
                stage = CreateStage.AddKeys,
                keys = (1..MAX_KEYS).map { key("Key $it") },
                canAddKey = false,
                canFinish = true,
            ),
        )
        listOf(
            "progress · verify" to StatusKey.VerifyingIdentity,
            "progress · derive" to StatusKey.ComputingAddress,
            "progress · publish" to StatusKey.SyncingKey,
        ).forEach { (code, status) ->
            flow(
                code,
                base().copy(
                    stage = CreateStage.AddKeys,
                    busy = true,
                    status = status,
                    keys = listOf(key("Everyday wallet"), key("Key 2")),
                ),
            )
        }
        flow(
            "retry · publish failed",
            base().copy(
                stage = CreateStage.SyncFailed,
                syncErrorDetail = "Register failed: 503 · p256-index-v2.getvela.app",
                keys = listOf(key("Everyday wallet")),
            ),
        )
        flow(
            "done",
            base().copy(
                stage = CreateStage.Created,
                address = FIXTURE_ADDRESS,
                keys = listOf(key("Everyday wallet"), key("Key 2", synced = false)),
            ),
        )

        sheet("unsupported", "not_supported_create")
        sheet("unsupported · login", "not_supported_login")
        sheet("not discoverable", "not_discoverable")
        sheet("incompatible", "incompatible_create")
        sheet("incompatible · login", "incompatible_login")
        sheet("recover offer", "recover_offer", confirmable = true)
        sheet("recover failed", "recover_failed")
        // The two prompts that carry a detail string are driven THROUGH the
        // refinement rather than around it, so this list is also a check on it:
        // a `create_failed` whose message is empty renders an empty sheet, and
        // that is exactly the bug this row would show.
        sheet(
            "create failed · unknown",
            "create_failed",
            detail = "the credential provider returned no attestation",
        )
        sheet(
            "create failed · network",
            "create_failed",
            detail = "Register failed: failed to connect",
        )
        sheet("create failed · server", "create_failed", detail = "Register failed: 503")
        sheet("create failed · timeout", "create_failed", detail = "Register timed out after 120s")
        sheet(
            "sign-in failed",
            "sign_in_failed",
            detail = "No passkey for getvela.app on this device",
        )
    }

    fun byCode(code: String): StateFixture? = all.firstOrNull { it.code == code }
}
