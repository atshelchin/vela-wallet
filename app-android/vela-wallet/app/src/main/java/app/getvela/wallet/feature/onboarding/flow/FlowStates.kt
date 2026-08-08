package app.getvela.wallet.feature.onboarding.flow

import app.getvela.wallet.core.designsystem.components.BadgeVariant
import app.getvela.wallet.core.i18n.I18nKeys

/**
 * Presentation state model for the onboarding create/login flows (spec 014,
 * data-model.md). Renderable-only: field names align with the spec-011 crux
 * ViewModels (`name`, `name_too_long`, `can_submit`, `busy`, `status`,
 * `address`) so the later wiring feature maps mechanically. No business
 * behaviour lives here (FR-011).
 */

/** The create flow always shows 5 stepped segments (A4–A8). */
const val TOTAL_CREATE_STEPS: Int = 5

/**
 * Visual-only mirror of vela-core's `MAX_USER_NAME_BYTES` (64 − 37 = 27 UTF-8
 * bytes, rust/crates/vela-core/src/app/mod.rs). Drives the A3 over-length hint
 * while typing in the pure-UI phase; the crux machine remains the authority
 * once wired.
 */
const val NAME_BYTE_BUDGET_VISUAL: Int = 27

fun nameTooLongVisual(name: String): Boolean =
    name.trim().toByteArray(Charsets.UTF_8).size > NAME_BYTE_BUDGET_VISUAL

/** Shared action vocabulary (contracts/presentation-states.md §2). */
enum class ActionId {
    SubmitCreate,
    EnterWallet,
    FinishVerify,
    StartOverNewPasskey,
    Retry,
    RetryUpload,
    RetryVerify,
    RetryLogin,
    RecreateWallet,
    CreateNewWallet,
    RecoverNow,
    NotNow,
    EditIndexEndpoint,
    ReportError,
    OpenBiometricSettings,
    OpenCredentialManagerSettings,
    Back,
    Cancel,
    Close,
    CopyAddress,
    ToggleDetails,
    OpenPrivacyPolicy,
    OpenTerms,
}

enum class ActionRole { Primary, Secondary }

data class FlowAction(
    val role: ActionRole,
    val labelKey: String,
    val id: ActionId,
)

/**
 * Technical-details disclosure content (E2x anatomy). Runtime diagnostics, not
 * copy — gallery fixtures carry representative values.
 */
data class TechDetails(
    val code: String,
    val context: String,
    val endpoint: String? = null,
)

/**
 * One shape renders every result/error state (data-model §3). Components render
 * the spec; they never branch on [OutcomeKind].
 */
data class OutcomeSpec(
    val scaffoldTitleKey: String,
    val badge: BadgeVariant,
    val headlineKey: String,
    val bodyKey: String,
    val bodyVars: Map<String, String> = emptyMap(),
    /** Some → copyable address strip (A11 only). */
    val address: String? = null,
    /** A11's verify line under the address strip (mock: create.verifyHint). */
    val footnoteKey: String? = null,
    /** A11 renders its headline in the badge's base color (mock-verified). */
    val headlineTinted: Boolean = false,
    /** Some → 技术详情 disclosure present. */
    val details: TechDetails? = null,
    /** Default collapsed on every entry; the E2x fixture opens expanded. */
    val detailsExpanded: Boolean = false,
    /** Exactly 1 primary + 0..2 secondary, top-to-bottom. */
    val actions: List<FlowAction>,
)

/** Create working statuses — mirrors spec 011 `StatusKey` working subset. */
enum class CreateStatus(val step: Int, val headlineKey: String) {
    SettingUpIdentity(1, I18nKeys.Create.STATUS_SETTING_UP_IDENTITY),
    VerifyingIdentity(2, I18nKeys.Create.STATUS_VERIFYING_IDENTITY),
    ExtractingKey(3, I18nKeys.Create.STATUS_EXTRACTING_KEY),
    ComputingAddress(4, I18nKeys.Create.STATUS_COMPUTING_ADDRESS),
    SyncingKey(5, I18nKeys.Create.STATUS_SYNCING_KEY),
}

sealed interface CreatePanelState {
    /** A1–A3. */
    data class Form(
        val name: String = "",
        val nameTooLong: Boolean = false,
        val acks: List<Boolean> = listOf(false, false, false),
        val canSubmit: Boolean = false,
        val busy: Boolean = false,
    ) : CreatePanelState

    /** A4–A8 (+`c` countdown variants). */
    data class Working(
        val step: Int,
        val status: CreateStatus,
        /** A4's 请在系统弹窗中确认 sub-caption (step 1 only in mocks). */
        val showHint: Boolean = false,
        /** Non-null renders the frozen countdown ring (no timing behaviour). */
        val elapsedSecs: Int? = null,
    ) : CreatePanelState

    data class Outcome(val spec: OutcomeSpec) : CreatePanelState
}

sealed interface LoginPanelState {
    /** B1 / B1c — single partially-filled bar, no step segments. */
    data class Waiting(val elapsedSecs: Int? = null) : LoginPanelState

    data class Outcome(val spec: OutcomeSpec) : LoginPanelState
}

/** Scaffold title for the sheet header (contract §3: title per state). */
fun CreatePanelState.scaffoldTitleKey(): String = when (this) {
    is CreatePanelState.Outcome -> spec.scaffoldTitleKey
    else -> I18nKeys.Create.HEADER
}

fun LoginPanelState.scaffoldTitleKey(): String = when (this) {
    is LoginPanelState.Outcome -> spec.scaffoldTitleKey
    else -> I18nKeys.Login.HEADER
}

private fun primary(id: ActionId, labelKey: String) =
    FlowAction(ActionRole.Primary, labelKey, id)

private fun secondary(id: ActionId, labelKey: String) =
    FlowAction(ActionRole.Secondary, labelKey, id)

/**
 * Outcome taxonomy — the authoritative `kind → OutcomeSpec` catalog
 * (data-model §4). Runtime data (address, diagnostics, interpolations) is
 * passed in; everything else is fixed per kind.
 */
enum class OutcomeKind {
    Created,
    SyncFailed,
    VerifyStuck,
    Network,
    Server,
    Timeout,
    CancelledSetup,
    CancelledVerify,
    Unsupported,
    Incompatible,
    NotDiscoverable,
    AccountNotFound,
    Unknown,
    RecoverOffer,
    RecoverFailed,
    SignInFailed,
    SignedIn,
    LoginCancelled,
    ;

    fun spec(
        address: String? = null,
        details: TechDetails? = null,
        detailsExpanded: Boolean = false,
        bodyVars: Map<String, String> = emptyMap(),
    ): OutcomeSpec = base().copy(
        address = address,
        details = details,
        detailsExpanded = detailsExpanded,
        bodyVars = bodyVars,
    )

    private fun base(): OutcomeSpec = when (this) {
        Created -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Success,
            headlineKey = I18nKeys.Create.SUCCESS_TITLE,
            bodyKey = I18nKeys.Create.SUCCESS_MESSAGE,
            footnoteKey = I18nKeys.Create.VERIFY_HINT,
            headlineTinted = true,
            actions = listOf(primary(ActionId.EnterWallet, I18nKeys.Create.ENTER_WALLET_BTN)),
        )
        SyncFailed -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER_SYNC_FAILED,
            badge = BadgeVariant.Warning,
            headlineKey = I18nKeys.Create.SYNC_FAILED_TITLE,
            bodyKey = I18nKeys.Flow.SYNC_FAILED_BODY,
            actions = listOf(
                primary(ActionId.RetryUpload, I18nKeys.Create.RETRY_UPLOAD_BTN),
                secondary(ActionId.EditIndexEndpoint, I18nKeys.Flow.EDIT_INDEX_ENDPOINT),
                secondary(ActionId.ReportError, I18nKeys.Flow.REPORT_ERROR),
            ),
        )
        VerifyStuck -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Warning,
            headlineKey = I18nKeys.Flow.VERIFY_STUCK_TITLE,
            bodyKey = I18nKeys.Flow.VERIFY_STUCK_BODY,
            actions = listOf(
                primary(ActionId.FinishVerify, I18nKeys.Create.FINISH_VERIFY_BTN),
                secondary(ActionId.StartOverNewPasskey, I18nKeys.Create.START_OVER_BTN),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        Network -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Error,
            headlineKey = I18nKeys.Flow.NETWORK_TITLE,
            bodyKey = I18nKeys.Flow.NETWORK_BODY,
            actions = listOf(
                primary(ActionId.Retry, I18nKeys.Flow.RETRY),
                secondary(ActionId.Cancel, I18nKeys.Common.CANCEL),
            ),
        )
        Server -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Error,
            headlineKey = I18nKeys.Flow.SERVER_TITLE,
            bodyKey = I18nKeys.Flow.SERVER_BODY,
            actions = listOf(
                primary(ActionId.Retry, I18nKeys.Flow.RETRY),
                secondary(ActionId.EditIndexEndpoint, I18nKeys.Flow.EDIT_INDEX_ENDPOINT),
                secondary(ActionId.ReportError, I18nKeys.Flow.REPORT_ERROR),
            ),
        )
        Timeout -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Timeout,
            headlineKey = I18nKeys.Flow.TIMEOUT_TITLE,
            bodyKey = I18nKeys.Flow.TIMEOUT_BODY,
            actions = listOf(
                primary(ActionId.Retry, I18nKeys.Flow.RETRY),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        CancelledSetup -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Neutral,
            headlineKey = I18nKeys.Flow.CANCELLED_SETUP_TITLE,
            bodyKey = I18nKeys.Flow.CANCELLED_SETUP_BODY,
            actions = listOf(
                primary(ActionId.RecreateWallet, I18nKeys.Flow.RECREATE_WALLET),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        CancelledVerify -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Neutral,
            headlineKey = I18nKeys.Flow.CANCELLED_VERIFY_TITLE,
            bodyKey = I18nKeys.Flow.CANCELLED_VERIFY_BODY,
            actions = listOf(
                primary(ActionId.RetryVerify, I18nKeys.Create.RETRY_VERIFY_BTN),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        Unsupported -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Error,
            headlineKey = I18nKeys.Flow.UNSUPPORTED_TITLE,
            bodyKey = I18nKeys.Flow.UNSUPPORTED_BODY,
            actions = listOf(
                primary(ActionId.OpenBiometricSettings, I18nKeys.Flow.OPEN_BIOMETRIC_SETTINGS),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        Incompatible -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Error,
            headlineKey = I18nKeys.Flow.INCOMPATIBLE_TITLE,
            bodyKey = I18nKeys.Flow.INCOMPATIBLE_BODY,
            actions = listOf(
                primary(
                    ActionId.OpenCredentialManagerSettings,
                    I18nKeys.Flow.OPEN_CREDENTIAL_MANAGER_SETTINGS,
                ),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        NotDiscoverable -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Create.HEADER,
            badge = BadgeVariant.Warning,
            headlineKey = I18nKeys.Flow.NOT_DISCOVERABLE_TITLE,
            bodyKey = I18nKeys.Flow.NOT_DISCOVERABLE_BODY,
            actions = listOf(
                primary(ActionId.RecreateWallet, I18nKeys.Flow.RECREATE_WALLET),
                secondary(
                    ActionId.OpenCredentialManagerSettings,
                    I18nKeys.Flow.OPEN_CREDENTIAL_MANAGER_SETTINGS,
                ),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        AccountNotFound -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Login.HEADER,
            badge = BadgeVariant.Error,
            headlineKey = I18nKeys.Flow.NOT_FOUND_TITLE,
            bodyKey = I18nKeys.Flow.NOT_FOUND_BODY,
            actions = listOf(
                primary(ActionId.CreateNewWallet, I18nKeys.Login.CREATE_NEW_WALLET_BTN),
                secondary(ActionId.EditIndexEndpoint, I18nKeys.Flow.EDIT_INDEX_ENDPOINT),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        Unknown -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Flow.HEADER_SHARED,
            badge = BadgeVariant.Error,
            headlineKey = I18nKeys.Flow.UNKNOWN_TITLE,
            bodyKey = I18nKeys.Flow.UNKNOWN_BODY,
            actions = listOf(
                primary(ActionId.Retry, I18nKeys.Flow.RETRY),
                secondary(ActionId.ReportError, I18nKeys.Flow.REPORT_ERROR),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        RecoverOffer -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Login.HEADER,
            badge = BadgeVariant.Info,
            headlineKey = I18nKeys.Login.RECOVER_OFFER_TITLE,
            bodyKey = I18nKeys.Login.RECOVER_OFFER_BODY,
            actions = listOf(
                primary(ActionId.RecoverNow, I18nKeys.Login.RECOVER_CONFIRM),
                secondary(ActionId.NotNow, I18nKeys.Login.RECOVER_CANCEL),
            ),
        )
        RecoverFailed -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Login.HEADER,
            badge = BadgeVariant.Error,
            headlineKey = I18nKeys.Login.RECOVER_FAILED_TITLE,
            bodyKey = I18nKeys.Login.RECOVER_FAILED_BODY,
            actions = listOf(
                primary(ActionId.Retry, I18nKeys.Flow.RETRY),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        SignInFailed -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Login.HEADER,
            badge = BadgeVariant.Error,
            headlineKey = I18nKeys.Login.SIGN_IN_FAILED_TITLE,
            bodyKey = I18nKeys.Login.SIGN_IN_FAILED_BODY,
            actions = listOf(
                primary(ActionId.Retry, I18nKeys.Flow.RETRY),
                secondary(ActionId.ReportError, I18nKeys.Flow.REPORT_ERROR),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
        SignedIn -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Login.HEADER,
            badge = BadgeVariant.Success,
            headlineKey = I18nKeys.Login.SUCCESS_TITLE,
            bodyKey = I18nKeys.Login.SUCCESS_MESSAGE,
            actions = listOf(primary(ActionId.EnterWallet, I18nKeys.Create.ENTER_WALLET_BTN)),
        )
        LoginCancelled -> OutcomeSpec(
            scaffoldTitleKey = I18nKeys.Login.HEADER,
            badge = BadgeVariant.Neutral,
            headlineKey = I18nKeys.Login.STATUS_CANCELLED_TITLE,
            bodyKey = I18nKeys.Login.STATUS_CANCELLED_BODY,
            actions = listOf(
                primary(ActionId.RetryLogin, I18nKeys.Login.RETRY_LOGIN_BTN),
                secondary(ActionId.Back, I18nKeys.Flow.BACK),
            ),
        )
    }
}
