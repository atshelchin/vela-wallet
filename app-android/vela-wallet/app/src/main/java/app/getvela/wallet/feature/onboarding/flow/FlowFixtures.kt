package app.getvela.wallet.feature.onboarding.flow

/**
 * Gallery fixtures — one per design code (spec 014, contracts §1: 34 unique
 * codes; E10 is shared and listed in BOTH gallery groups). Representative data
 * mirrors the mocks (A11 address, E2x detail lines, ring values 19/8/41).
 * Fixtures are reachable only from the dev gallery, never from production
 * code paths.
 */

enum class FixtureFlow { Create, Login, Shared }

sealed interface FixturePanel {
    data class Create(val state: CreatePanelState) : FixturePanel
    data class Login(val state: LoginPanelState) : FixturePanel
}

data class StateFixture(
    val code: String,
    val flow: FixtureFlow,
    val panel: FixturePanel,
)

object FlowFixtures {

    /** Full 42-char fixture value; display truncates the tail, copy uses this. */
    const val A11_ADDRESS = "0x44EEC06897ff7ab8C7f16819511A64bA168A6D33"

    /** E2x detail lines — pinned verbatim by contracts/presentation-states.md §1. */
    private val serverDetails = TechDetails(
        code = "E_SERVER",
        context = "第 5 步同步公钥；以及登录",
        endpoint = "HTTP 503 · p256-index.getvela.app",
    )

    private fun create(code: String, flow: FixtureFlow, state: CreatePanelState) =
        StateFixture(code, flow, FixturePanel.Create(state))

    private fun login(code: String, flow: FixtureFlow, state: LoginPanelState) =
        StateFixture(code, flow, FixturePanel.Login(state))

    private fun createOutcome(code: String, spec: OutcomeSpec, flow: FixtureFlow = FixtureFlow.Create) =
        create(code, flow, CreatePanelState.Outcome(spec))

    private fun loginOutcome(code: String, spec: OutcomeSpec) =
        login(code, FixtureFlow.Login, LoginPanelState.Outcome(spec))

    private fun working(step: Int, showHint: Boolean = false, elapsedSecs: Int? = null) =
        CreatePanelState.Working(
            step = step,
            status = CreateStatus.entries[step - 1],
            showHint = showHint,
            elapsedSecs = elapsedSecs,
        )

    /**
     * All 34 fixtures. Order = gallery order: create block (A*, E1–E8/E2x),
     * then login block (B*, E9), then the shared catch-all E10.
     */
    val all: List<StateFixture> = listOf(
        // Form (A1–A3). A3's over-length name re-derives the red hint locally.
        create("A1", FixtureFlow.Create, CreatePanelState.Form()),
        create(
            "A2",
            FixtureFlow.Create,
            CreatePanelState.Form(
                name = "大表哥",
                acks = listOf(true, true, true),
                canSubmit = true,
            ),
        ),
        create(
            "A3",
            FixtureFlow.Create,
            CreatePanelState.Form(
                name = "一个特别特别特别长的账户名称示例",
                nameTooLong = true,
            ),
        ),
        // Progress (A4–A8 + countdown variants; ring pins: A4c=19, A8c=8).
        create("A4", FixtureFlow.Create, working(step = 1, showHint = true)),
        create("A4c", FixtureFlow.Create, working(step = 1, showHint = true, elapsedSecs = 19)),
        create("A5", FixtureFlow.Create, working(step = 2)),
        create("A5c", FixtureFlow.Create, working(step = 2, elapsedSecs = 6)),
        create("A6", FixtureFlow.Create, working(step = 3)),
        create("A6c", FixtureFlow.Create, working(step = 3, elapsedSecs = 9)),
        create("A7", FixtureFlow.Create, working(step = 4)),
        create("A7c", FixtureFlow.Create, working(step = 4, elapsedSecs = 12)),
        create("A8", FixtureFlow.Create, working(step = 5)),
        create("A8c", FixtureFlow.Create, working(step = 5, elapsedSecs = 8)),
        // Create outcomes.
        createOutcome(
            "A11",
            OutcomeKind.Created.spec(
                address = A11_ADDRESS,
                bodyVars = mapOf("count" to "12"),
            ),
        ),
        createOutcome(
            "A12",
            OutcomeKind.SyncFailed.spec(
                details = TechDetails(
                    code = "E_SYNC_UPLOAD",
                    context = "第 5 步同步公钥",
                    endpoint = "HTTP 502 · p256-index.getvela.app",
                ),
            ),
        ),
        createOutcome(
            "A13",
            OutcomeKind.VerifyStuck.spec(
                details = TechDetails(code = "E_VERIFY_STUCK", context = "第 2 步验证身份"),
            ),
        ),
        createOutcome(
            "E1",
            OutcomeKind.Network.spec(
                details = TechDetails(
                    code = "E_NETWORK",
                    context = "第 5 步同步公钥；以及登录",
                    endpoint = "p256-index.getvela.app",
                ),
            ),
        ),
        createOutcome("E2", OutcomeKind.Server.spec(details = serverDetails)),
        createOutcome(
            "E2x",
            OutcomeKind.Server.spec(details = serverDetails, detailsExpanded = true),
        ),
        createOutcome(
            "E3",
            OutcomeKind.Timeout.spec(
                details = TechDetails(code = "E_TIMEOUT", context = "第 1 步创建通行密钥"),
                bodyVars = mapOf("seconds" to "60"),
            ),
        ),
        createOutcome(
            "E4",
            OutcomeKind.CancelledSetup.spec(
                details = TechDetails(code = "E_CANCELLED_SETUP", context = "第 1 步创建通行密钥"),
            ),
        ),
        createOutcome(
            "E5",
            OutcomeKind.CancelledVerify.spec(
                details = TechDetails(code = "E_CANCELLED_VERIFY", context = "第 2 步验证身份"),
            ),
        ),
        createOutcome(
            "E6",
            OutcomeKind.Unsupported.spec(
                details = TechDetails(code = "E_UNSUPPORTED", context = "第 1 步创建通行密钥"),
            ),
        ),
        createOutcome(
            "E7",
            OutcomeKind.Incompatible.spec(
                details = TechDetails(code = "E_INCOMPATIBLE", context = "第 1 步创建通行密钥"),
            ),
        ),
        createOutcome(
            "E8",
            OutcomeKind.NotDiscoverable.spec(
                details = TechDetails(code = "E_NOT_DISCOVERABLE", context = "第 2 步验证身份"),
            ),
        ),
        // Login flow (B1–B6, E9; ring pin B1c=41).
        login("B1", FixtureFlow.Login, LoginPanelState.Waiting()),
        login("B1c", FixtureFlow.Login, LoginPanelState.Waiting(elapsedSecs = 41)),
        loginOutcome(
            "B2",
            OutcomeKind.RecoverOffer.spec(
                details = TechDetails(code = "RECOVER_OFFER", context = "登录"),
            ),
        ),
        loginOutcome(
            "B3",
            OutcomeKind.RecoverFailed.spec(
                details = TechDetails(code = "E_RECOVER_FAILED", context = "登录"),
            ),
        ),
        loginOutcome(
            "B4",
            OutcomeKind.SignInFailed.spec(
                details = TechDetails(code = "E_SIGN_IN_FAILED", context = "登录"),
            ),
        ),
        loginOutcome(
            "B5",
            OutcomeKind.SignedIn.spec(
                details = TechDetails(code = "LOGIN_OK", context = "登录"),
            ),
        ),
        loginOutcome(
            "B6",
            OutcomeKind.LoginCancelled.spec(
                details = TechDetails(code = "E_LOGIN_CANCELLED", context = "登录"),
            ),
        ),
        loginOutcome(
            "E9",
            OutcomeKind.AccountNotFound.spec(
                details = TechDetails(
                    code = "E_NOT_FOUND",
                    context = "登录",
                    endpoint = "HTTP 404 · p256-index.getvela.app",
                ),
            ),
        ),
        // Shared catch-all — one fixture, listed in both gallery groups.
        createOutcome(
            "E10",
            OutcomeKind.Unknown.spec(
                details = TechDetails(code = "E_UNKNOWN", context = "创建钱包 / 登录"),
            ),
            flow = FixtureFlow.Shared,
        ),
    )

    fun byCode(code: String): StateFixture = all.first { it.code == code }

    /** Create gallery group: create fixtures + the shared E10 (last). */
    val createGallery: List<StateFixture> = all.filter { it.flow != FixtureFlow.Login }

    /** Login gallery group: login fixtures + the shared E10 (last). */
    val loginGallery: List<StateFixture> = all.filter { it.flow != FixtureFlow.Create }
}
