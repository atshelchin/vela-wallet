//! Presentation state model + panel renderers for the onboarding create/login
//! flows (spec 014). Pure UI: no passkey, network, storage, or timing behaviour
//! lives here — every interaction is emitted as a [`PanelEvent`] to a
//! host-provided sink, and the host (Welcome page or the dev gallery) decides
//! what, if anything, happens next (FR-011).
//!
//! Field vocabulary follows `specs/014-onboarding-flow-ui/data-model.md`, which
//! itself aligns with the spec-011 crux ViewModels so the later wiring feature
//! is a mechanical mapping.

use std::rc::Rc;

use crate::loc::Loc;
use crate::theme::{self, FLOW_GAP_LG, FLOW_GAP_MD, FLOW_GAP_SM, LOGIN_BAR_FILL, Theme};
use crate::ui::{
    ButtonVariant, NameFieldStrings, ack_row, action_stack, address_strip, elapsed_ring,
    flow_scaffold, login_progress, name_field, status_badge, step_progress, tech_details,
    vela_button_opts,
};
use gpui::{
    App, Div, FocusHandle, FontWeight, ParentElement, SharedString, Styled, Window, div, px,
};

/// Byte budget for the account name — mirror of vela-core's
/// `MAX_USER_NAME_BYTES` (64-byte WebAuthn user handle − 37 bytes of envelope).
/// Mirrored rather than imported because the source constant lives behind the
/// `crux` feature gate, which this shell does not enable.
pub const MAX_NAME_BYTES: usize = 64 - 37;

// ---------------------------------------------------------------------------
// State model (data-model.md §2)
// ---------------------------------------------------------------------------

/// Create-flow renderable condition. Field names match the spec-011 ViewModel.
#[derive(Clone, Debug)]
pub enum CreatePanelState {
    Form {
        name: String,
        name_too_long: bool,
        acks: [bool; 3],
        can_submit: bool,
        /// Reserved by spec 011; not exercised in this feature.
        busy: bool,
    },
    Working {
        /// 1..=5 — drives the 5-segment bar and the 第 N/5 步 caption.
        step: u8,
        status: CreateStatusKey,
        /// A4's 请在系统弹窗中确认 sub-caption (step 1 only in the mocks).
        show_hint: bool,
        /// `Some(n)` renders the frozen elapsed-seconds ring (`c` variants).
        elapsed_secs: Option<u16>,
    },
    Outcome(OutcomeSpec),
}

/// Login-flow renderable condition.
#[derive(Clone, Debug)]
pub enum LoginPanelState {
    Waiting { elapsed_secs: Option<u16> },
    Outcome(OutcomeSpec),
}

/// The five create working steps — mirrors spec 011's `StatusKey` subset.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CreateStatusKey {
    SettingUpIdentity,
    VerifyingIdentity,
    ExtractingKey,
    ComputingAddress,
    SyncingKey,
}

impl CreateStatusKey {
    /// The headline's corpus key (all five EXIST — spec 007 era).
    pub fn key(self) -> &'static str {
        match self {
            Self::SettingUpIdentity => "onboarding.create.statusSettingUpIdentity",
            Self::VerifyingIdentity => "onboarding.create.statusVerifyingIdentity",
            Self::ExtractingKey => "onboarding.create.statusExtractingKey",
            Self::ComputingAddress => "onboarding.create.statusComputingAddress",
            Self::SyncingKey => "onboarding.create.statusSyncingKey",
        }
    }
}

/// Badge circle variants (data-model.md §3, 6 refined from the mocks).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BadgeVariant {
    Success,
    Warning,
    Neutral,
    Error,
    Timeout,
    Info,
}

/// Which scaffold title an outcome renders under.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TitleKey {
    Create,
    Login,
    Sync,
    Shared,
}

impl TitleKey {
    /// The corpus key of the scaffold title this outcome renders under.
    pub fn key(self) -> &'static str {
        match self {
            Self::Create => "onboarding.create.headerDefault",
            Self::Login => "onboarding.login.header",
            Self::Sync => "onboarding.create.headerSyncFailed",
            Self::Shared => "onboarding.common.headerShared",
        }
    }
}

/// Every action a flow control can emit (contract §2 — shared across the four
/// shells). Components never interpret these; the host sink does.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ActionId {
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ActionRole {
    Primary,
    Secondary,
}

/// One stacked action: role decides the button treatment, id names the press.
#[derive(Clone, Debug)]
pub struct Action {
    pub role: ActionRole,
    pub id: ActionId,
    pub label: SharedString,
}

/// The 技术详情 disclosure content. Runtime diagnostics, not copy (research
/// D1) — gallery fixtures carry representative strings verbatim.
#[derive(Clone, Debug)]
pub struct TechDetails {
    /// e.g. `E_SERVER` — rendered in the error color.
    pub code: String,
    /// e.g. 第 5 步同步公钥；以及登录.
    pub context: String,
    /// e.g. `HTTP 503 · p256-index.getvela.app`.
    pub endpoint: Option<String>,
}

/// One shape renders every result/error state (data-model.md §3). Strings are
/// already key-resolved ([`OutcomeKind::spec`]) so components stay i18n-free.
#[derive(Clone, Debug)]
pub struct OutcomeSpec {
    /// Which scaffold title to render under (resolved via [`TitleKey::key`]).
    pub scaffold_title: TitleKey,
    pub badge: BadgeVariant,
    pub headline: SharedString,
    pub body: SharedString,
    /// `Some` → copyable address strip (A11 only). Full untruncated value.
    pub address: Option<SharedString>,
    /// A11's under-strip verify line (`onboarding.create.verifyHint`).
    pub footnote: Option<SharedString>,
    /// `Some` → 技术详情 disclosure present.
    pub details: Option<TechDetails>,
    /// Default collapsed on every entry to a state; E2x fixture opens it.
    pub details_expanded: bool,
    /// Exactly 1 primary + 0..=2 secondary, top-to-bottom.
    pub actions: Vec<Action>,
}

/// The outcome taxonomy: 18 kinds, one authoritative catalog (data-model §4).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutcomeKind {
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
}

impl OutcomeKind {
    /// The pure `kind → OutcomeSpec` catalog. Components render the spec and
    /// never branch on the kind. `address`/`details` are runtime data — the
    /// catalog leaves them empty and fixtures (later, the wiring) fill them.
    pub fn spec(self, loc: &Loc) -> OutcomeSpec {
        let a = |role, id, key: &str| Action {
            role,
            id,
            label: loc.t(key),
        };
        let p = |id, key: &str| a(ActionRole::Primary, id, key);
        let s = |id, key: &str| a(ActionRole::Secondary, id, key);
        use ActionId::*;

        let (title, badge, headline, body, footnote, actions) = match self {
            Self::Created => (
                TitleKey::Create,
                BadgeVariant::Success,
                loc.t("onboarding.create.successTitle"),
                // 12 supported networks — the count the whole app ships today.
                loc.t_vars("onboarding.create.successMessage", &[("count", 12.)]),
                Some(loc.t("onboarding.create.verifyHint")),
                vec![p(EnterWallet, "onboarding.create.enterWalletBtn")],
            ),
            Self::SyncFailed => (
                TitleKey::Sync,
                BadgeVariant::Warning,
                loc.t("onboarding.create.syncFailedTitle"),
                loc.t("onboarding.common.syncFailedBody"),
                None,
                vec![
                    p(RetryUpload, "onboarding.create.retryUploadBtn"),
                    s(EditIndexEndpoint, "onboarding.common.editIndexEndpoint"),
                    s(ReportError, "onboarding.common.reportError"),
                ],
            ),
            Self::VerifyStuck => (
                TitleKey::Create,
                BadgeVariant::Warning,
                loc.t("onboarding.common.verifyStuckTitle"),
                loc.t("onboarding.common.verifyStuckBody"),
                None,
                vec![
                    p(FinishVerify, "onboarding.create.finishVerifyBtn"),
                    s(StartOverNewPasskey, "onboarding.create.startOverBtn"),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::Network => (
                TitleKey::Create,
                BadgeVariant::Error,
                loc.t("onboarding.common.networkTitle"),
                loc.t("onboarding.common.networkBody"),
                None,
                vec![
                    p(Retry, "onboarding.common.retry"),
                    // Root key, reused deliberately (contract i18n-keys.md).
                    s(Cancel, "common.cancel"),
                ],
            ),
            Self::Server => (
                TitleKey::Create,
                BadgeVariant::Error,
                loc.t("onboarding.common.serverTitle"),
                loc.t("onboarding.common.serverBody"),
                None,
                vec![
                    p(Retry, "onboarding.common.retry"),
                    s(EditIndexEndpoint, "onboarding.common.editIndexEndpoint"),
                    s(ReportError, "onboarding.common.reportError"),
                ],
            ),
            Self::Timeout => (
                TitleKey::Create,
                BadgeVariant::Timeout,
                loc.t("onboarding.common.timeoutTitle"),
                // The mock's 60 s budget; the wiring feature passes the real one.
                loc.t_vars("onboarding.common.timeoutBody", &[("seconds", 60.)]),
                None,
                vec![
                    p(Retry, "onboarding.common.retry"),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::CancelledSetup => (
                TitleKey::Create,
                BadgeVariant::Neutral,
                loc.t("onboarding.common.cancelledSetupTitle"),
                loc.t("onboarding.common.cancelledSetupBody"),
                None,
                vec![
                    p(RecreateWallet, "onboarding.common.recreateWallet"),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::CancelledVerify => (
                TitleKey::Create,
                BadgeVariant::Neutral,
                loc.t("onboarding.common.cancelledVerifyTitle"),
                loc.t("onboarding.common.cancelledVerifyBody"),
                None,
                vec![
                    p(RetryVerify, "onboarding.create.retryVerifyBtn"),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::Unsupported => (
                TitleKey::Create,
                BadgeVariant::Error,
                loc.t("onboarding.common.unsupportedTitle"),
                loc.t("onboarding.common.unsupportedBody"),
                None,
                vec![
                    p(
                        OpenBiometricSettings,
                        "onboarding.common.openBiometricSettings",
                    ),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::Incompatible => (
                TitleKey::Create,
                BadgeVariant::Error,
                loc.t("onboarding.common.incompatibleTitle"),
                loc.t("onboarding.common.incompatibleBody"),
                None,
                vec![
                    p(
                        OpenCredentialManagerSettings,
                        "onboarding.common.openCredentialManagerSettings",
                    ),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::NotDiscoverable => (
                TitleKey::Create,
                BadgeVariant::Warning,
                loc.t("onboarding.common.notDiscoverableTitle"),
                loc.t("onboarding.common.notDiscoverableBody"),
                None,
                vec![
                    p(RecreateWallet, "onboarding.common.recreateWallet"),
                    s(
                        OpenCredentialManagerSettings,
                        "onboarding.common.openCredentialManagerSettings",
                    ),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::AccountNotFound => (
                TitleKey::Login,
                BadgeVariant::Error,
                loc.t("onboarding.common.notFoundTitle"),
                loc.t("onboarding.common.notFoundBody"),
                None,
                vec![
                    p(CreateNewWallet, "onboarding.login.createNewWalletBtn"),
                    s(EditIndexEndpoint, "onboarding.common.editIndexEndpoint"),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::Unknown => (
                TitleKey::Shared,
                BadgeVariant::Error,
                loc.t("onboarding.common.unknownTitle"),
                loc.t("onboarding.common.unknownBody"),
                None,
                vec![
                    p(Retry, "onboarding.common.retry"),
                    s(ReportError, "onboarding.common.reportError"),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::RecoverOffer => (
                TitleKey::Login,
                BadgeVariant::Info,
                loc.t("onboarding.login.recoverOfferTitle"),
                loc.t("onboarding.login.recoverOfferBody"),
                None,
                vec![
                    p(RecoverNow, "onboarding.login.recoverConfirm"),
                    s(NotNow, "onboarding.login.recoverCancel"),
                ],
            ),
            Self::RecoverFailed => (
                TitleKey::Login,
                BadgeVariant::Error,
                loc.t("onboarding.login.recoverFailedTitle"),
                loc.t("onboarding.login.recoverFailedBody"),
                None,
                vec![
                    p(Retry, "onboarding.common.retry"),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::SignInFailed => (
                TitleKey::Login,
                BadgeVariant::Error,
                loc.t("onboarding.login.alertSignInFailedTitle"),
                loc.t("onboarding.login.signInFailedBody"),
                None,
                vec![
                    p(Retry, "onboarding.common.retry"),
                    s(ReportError, "onboarding.common.reportError"),
                    s(Back, "onboarding.common.back"),
                ],
            ),
            Self::SignedIn => (
                TitleKey::Login,
                BadgeVariant::Success,
                loc.t("onboarding.login.successTitle"),
                loc.t("onboarding.login.successMessage"),
                None,
                vec![p(EnterWallet, "onboarding.create.enterWalletBtn")],
            ),
            Self::LoginCancelled => (
                TitleKey::Login,
                BadgeVariant::Neutral,
                loc.t("onboarding.login.statusCancelledTitle"),
                loc.t("onboarding.login.statusCancelledBody"),
                None,
                vec![
                    p(RetryLogin, "onboarding.login.retryLoginBtn"),
                    s(Back, "onboarding.common.back"),
                ],
            ),
        };

        OutcomeSpec {
            scaffold_title: title,
            badge,
            headline,
            body,
            address: None,
            footnote,
            details: None,
            details_expanded: false,
            actions,
        }
    }
}

// ---------------------------------------------------------------------------
// Derivation rules the model carries (data-model.md validation notes)
// ---------------------------------------------------------------------------

/// spec 011's rule: the name must fit the WebAuthn user handle budget.
pub fn name_too_long(name: &str) -> bool {
    name.trim().len() > MAX_NAME_BYTES
}

/// `can_submit == (!name_too_long && name nonempty && all acks)`.
pub fn derive_can_submit(name: &str, too_long: bool, acks: &[bool; 3]) -> bool {
    !too_long && !name.trim().is_empty() && acks.iter().all(|a| *a)
}

// ---------------------------------------------------------------------------
// Gallery fixtures (data-model.md §5 — 34 codes, E10 listed in both groups)
// ---------------------------------------------------------------------------

/// Which gallery group(s) a fixture belongs to. `Shared` (E10) appears under
/// both Create and Login.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FixtureFlow {
    Create,
    Login,
    Shared,
}

/// The state a fixture instantiates. E10 carries a Create-shaped state; its
/// rendering is identical from either flow.
#[derive(Clone, Debug)]
pub enum FixtureState {
    Create(CreatePanelState),
    Login(LoginPanelState),
}

/// A named, gallery-selectable Presentation State with representative data.
#[derive(Clone, Debug)]
pub struct StateFixture {
    pub code: &'static str,
    pub flow: FixtureFlow,
    pub state: FixtureState,
}

/// The A11 success address — full 42 chars; display truncates, copy does not.
pub const FIXTURE_ADDRESS: &str = "0x44EEC06897ff7ab8C7f16819511A64bA168A6D33";

/// All 34 fixture codes in inventory order. TechDetails contents are
/// representative runtime diagnostics: E2/E2x carry the contract-pinned
/// strings verbatim; the rest carry plausible values in the same shape.
pub fn fixtures(loc: &Loc) -> Vec<StateFixture> {
    use CreatePanelState as C;
    use FixtureFlow as F;
    use FixtureState as S;
    use LoginPanelState as L;

    let form = |name: &str, too_long: bool, acks: [bool; 3]| C::Form {
        name: name.to_owned(),
        name_too_long: too_long,
        can_submit: derive_can_submit(name, too_long, &acks),
        acks,
        busy: false,
    };
    let working = |step: u8, status: CreateStatusKey, elapsed: Option<u16>| C::Working {
        step,
        status,
        show_hint: step == 1,
        elapsed_secs: elapsed,
    };
    let details = |code: &str, context: &str, endpoint: Option<&str>| {
        Some(TechDetails {
            code: code.to_owned(),
            context: context.to_owned(),
            endpoint: endpoint.map(str::to_owned),
        })
    };
    let outcome = |kind: OutcomeKind, d: Option<TechDetails>, expanded: bool| -> OutcomeSpec {
        let mut spec = kind.spec(loc);
        spec.details = d;
        spec.details_expanded = expanded;
        spec
    };
    let create = |code: &'static str, state: C| StateFixture {
        code,
        flow: F::Create,
        state: S::Create(state),
    };
    let login = |code: &'static str, state: L| StateFixture {
        code,
        flow: F::Login,
        state: S::Login(state),
    };

    use CreateStatusKey::*;
    let server_details = || {
        details(
            "E_SERVER",
            "第 5 步同步公钥；以及登录",
            Some("HTTP 503 · p256-index.getvela.app"),
        )
    };

    let mut a11 = outcome(OutcomeKind::Created, None, false);
    a11.address = Some(FIXTURE_ADDRESS.into());

    vec![
        create("A1", form("", false, [false; 3])),
        create("A2", form("大表哥", false, [true; 3])),
        create(
            "A3",
            form("一个特别特别特别长的账户名称示例", true, [false; 3]),
        ),
        create("A4", working(1, SettingUpIdentity, None)),
        create("A4c", working(1, SettingUpIdentity, Some(19))),
        create("A5", working(2, VerifyingIdentity, None)),
        create("A5c", working(2, VerifyingIdentity, Some(6))),
        create("A6", working(3, ExtractingKey, None)),
        create("A6c", working(3, ExtractingKey, Some(9))),
        create("A7", working(4, ComputingAddress, None)),
        create("A7c", working(4, ComputingAddress, Some(12))),
        create("A8", working(5, SyncingKey, None)),
        create("A8c", working(5, SyncingKey, Some(8))),
        create("A11", C::Outcome(a11)),
        create(
            "A12",
            C::Outcome(outcome(OutcomeKind::SyncFailed, server_details(), false)),
        ),
        create(
            "A13",
            C::Outcome(outcome(
                OutcomeKind::VerifyStuck,
                details("E_VERIFY_STUCK", "第 2 步验证身份", None),
                false,
            )),
        ),
        create(
            "E1",
            C::Outcome(outcome(
                OutcomeKind::Network,
                details("E_NETWORK", "第 5 步同步公钥；以及登录", None),
                false,
            )),
        ),
        create(
            "E2",
            C::Outcome(outcome(OutcomeKind::Server, server_details(), false)),
        ),
        create(
            "E2x",
            C::Outcome(outcome(OutcomeKind::Server, server_details(), true)),
        ),
        create(
            "E3",
            C::Outcome(outcome(
                OutcomeKind::Timeout,
                details("E_TIMEOUT", "第 5 步同步公钥；60 秒无响应", None),
                false,
            )),
        ),
        create(
            "E4",
            C::Outcome(outcome(
                OutcomeKind::CancelledSetup,
                details("E_CANCELLED", "第 1 步创建通行密钥", None),
                false,
            )),
        ),
        create(
            "E5",
            C::Outcome(outcome(
                OutcomeKind::CancelledVerify,
                details("E_CANCELLED", "第 2 步验证身份", None),
                false,
            )),
        ),
        create(
            "E6",
            C::Outcome(outcome(
                OutcomeKind::Unsupported,
                details("E_UNSUPPORTED", "第 1 步创建通行密钥", None),
                false,
            )),
        ),
        create(
            "E7",
            C::Outcome(outcome(
                OutcomeKind::Incompatible,
                details("E_INCOMPATIBLE", "第 1 步创建通行密钥", None),
                false,
            )),
        ),
        create(
            "E8",
            C::Outcome(outcome(
                OutcomeKind::NotDiscoverable,
                details("E_NOT_DISCOVERABLE", "第 2 步验证身份", None),
                false,
            )),
        ),
        StateFixture {
            code: "E9",
            flow: F::Login,
            state: S::Login(L::Outcome(outcome(
                OutcomeKind::AccountNotFound,
                details(
                    "E_NOT_FOUND",
                    "登录查询",
                    Some("HTTP 404 · p256-index.getvela.app"),
                ),
                false,
            ))),
        },
        StateFixture {
            code: "E10",
            flow: F::Shared,
            state: S::Create(C::Outcome(outcome(
                OutcomeKind::Unknown,
                details("E_UNKNOWN", "未归类的异常", None),
                false,
            ))),
        },
        login("B1", L::Waiting { elapsed_secs: None }),
        login(
            "B1c",
            L::Waiting {
                elapsed_secs: Some(41),
            },
        ),
        login(
            "B2",
            L::Outcome(outcome(
                OutcomeKind::RecoverOffer,
                details(
                    "E_NOT_INDEXED",
                    "索引服务没有这枚通行密钥的记录",
                    Some("p256-index.getvela.app"),
                ),
                false,
            )),
        ),
        login(
            "B3",
            L::Outcome(outcome(
                OutcomeKind::RecoverFailed,
                details("E_RECOVER", "两次签名恢复公钥", None),
                false,
            )),
        ),
        login(
            "B4",
            L::Outcome(outcome(
                OutcomeKind::SignInFailed,
                details("E_SIGNIN", "通行密钥断言失败", None),
                false,
            )),
        ),
        login(
            "B5",
            L::Outcome(outcome(
                OutcomeKind::SignedIn,
                details(
                    "SIGNED_IN",
                    "通行密钥验证通过",
                    Some("p256-index.getvela.app"),
                ),
                false,
            )),
        ),
        login(
            "B6",
            L::Outcome(outcome(
                OutcomeKind::LoginCancelled,
                details("E_CANCELLED", "通行密钥验证未完成", None),
                false,
            )),
        ),
    ]
}

// ---------------------------------------------------------------------------
// Panel events + renderers (contract §2/§3)
// ---------------------------------------------------------------------------

/// Everything a flow panel can emit. `Action` presses carry the shared
/// [`ActionId`] vocabulary; the payload variants are the local visual state
/// FR-011 allows (typing, checkboxes). Hosts mutate their copy of the state
/// and `cx.notify()`.
#[derive(Clone, Debug)]
pub enum PanelEvent {
    Action(ActionId),
    NameChanged(String),
    AckToggled(usize),
}

/// The host-provided sink. `Rc` so the many child closures share one handler.
pub type PanelSink = Rc<dyn Fn(PanelEvent, &mut Window, &mut App)>;

/// Everything a panel render needs from its host besides the state itself.
pub struct PanelHost<'a> {
    pub theme: &'a Theme,
    pub loc: &'a Loc,
    /// Focus handle for the name field (host-owned so it persists per frame).
    pub name_focus: &'a FocusHandle,
    /// Transient 已复制 feedback for the address strip (host bool + notify).
    pub copied: bool,
    pub sink: PanelSink,
}

fn on_action(sink: &PanelSink, id: ActionId) -> impl Fn(&mut Window, &mut App) + 'static {
    let sink = sink.clone();
    move |window, cx| sink(PanelEvent::Action(id), window, cx)
}

/// Render the create flow panel for `state`, scaffold included, sized for the
/// 512 px action panel (or the gallery's replica of it).
pub fn render_create_panel(state: &CreatePanelState, host: &PanelHost<'_>, window: &Window) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let title = match state {
        CreatePanelState::Outcome(spec) => loc.t(spec.scaffold_title.key()),
        _ => loc.t(TitleKey::Create.key()),
    };
    let content = match state {
        CreatePanelState::Form {
            name,
            name_too_long,
            acks,
            can_submit,
            busy,
        } => render_form(name, *name_too_long, acks, *can_submit, *busy, host, window),
        CreatePanelState::Working {
            step,
            status,
            show_hint,
            elapsed_secs,
        } => render_working(*step, *status, *show_hint, *elapsed_secs, host),
        CreatePanelState::Outcome(spec) => render_outcome(spec, host),
    };
    flow_scaffold(
        theme,
        title,
        on_action(&host.sink, ActionId::Close),
        content,
    )
}

/// Render the login flow panel for `state`, scaffold included.
pub fn render_login_panel(state: &LoginPanelState, host: &PanelHost<'_>) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let title = match state {
        LoginPanelState::Outcome(spec) => loc.t(spec.scaffold_title.key()),
        LoginPanelState::Waiting { .. } => loc.t(TitleKey::Login.key()),
    };
    let content = match state {
        LoginPanelState::Waiting { elapsed_secs } => {
            let headline = loc.t("onboarding.login.statusAwaitingPasskey");
            let hint = loc.t("onboarding.login.statusAwaitingPasskeyHint");
            let mut headline_row = div()
                .flex()
                .items_center()
                .justify_between()
                .gap(px(FLOW_GAP_MD))
                .child(
                    div()
                        .min_w(px(0.))
                        .text_size(theme::text_flow_headline())
                        .font_weight(FontWeight::BOLD)
                        .text_color(theme.fg_base)
                        .child(headline),
                );
            if let Some(secs) = elapsed_secs {
                headline_row = headline_row.child(elapsed_ring(theme, *secs));
            }
            div()
                .flex()
                .flex_col()
                .child(login_progress(theme, LOGIN_BAR_FILL))
                .child(div().h(px(FLOW_GAP_LG)))
                .child(headline_row)
                .child(
                    div()
                        .mt(px(FLOW_GAP_SM))
                        .text_size(theme::text_body())
                        .line_height(theme::line_height_body())
                        .text_color(theme.fg_muted)
                        .child(hint),
                )
        }
        LoginPanelState::Outcome(spec) => render_outcome(spec, host),
    };
    flow_scaffold(
        theme,
        title,
        on_action(&host.sink, ActionId::Close),
        content,
    )
}

// -- pattern bodies ----------------------------------------------------------

fn render_form(
    name: &str,
    too_long: bool,
    acks: &[bool; 3],
    can_submit: bool,
    busy: bool,
    host: &PanelHost<'_>,
    window: &Window,
) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let sink = &host.sink;

    let strings = NameFieldStrings {
        label: loc.t("onboarding.create.accountNameLabel"),
        placeholder: loc.t("onboarding.create.accountNamePlaceholder"),
        helper: loc.t("onboarding.create.accountNameHint"),
        too_long_hint: loc.t("onboarding.create.nameTooLong"),
    };
    let field = {
        let sink = sink.clone();
        name_field(
            theme,
            &strings,
            name,
            too_long,
            host.name_focus,
            window,
            move |next, window, cx| sink(PanelEvent::NameChanged(next), window, cx),
        )
    };

    // Rows 1–2 are plain sentences; row 3 wraps the inline Privacy Policy /
    // Terms links (individually activatable — spec edge case).
    let mut rows = div().flex().flex_col().gap(px(FLOW_GAP_LG));
    for (ix, checked) in acks.iter().enumerate() {
        let (text, links) = match ix {
            0 => (loc.t("onboarding.create.ack0").to_string(), vec![]),
            1 => (loc.t("onboarding.create.ack1").to_string(), vec![]),
            _ => {
                let lead = loc.t("onboarding.create.ack3").to_string();
                let privacy = loc.t("onboarding.create.ack3PrivacyPolicy").to_string();
                let and = loc.t("onboarding.create.ack3And").to_string();
                let terms = loc.t("onboarding.create.ack3Terms").to_string();
                let period = loc.t("onboarding.create.ack3Period").to_string();
                let privacy_range = lead.len()..lead.len() + privacy.len();
                let terms_start = privacy_range.end + and.len();
                let terms_range = terms_start..terms_start + terms.len();
                (
                    format!("{lead}{privacy}{and}{terms}{period}"),
                    vec![
                        (privacy_range, ActionId::OpenPrivacyPolicy),
                        (terms_range, ActionId::OpenTerms),
                    ],
                )
            }
        };
        let on_toggle = {
            let sink = sink.clone();
            move |window: &mut Window, cx: &mut App| sink(PanelEvent::AckToggled(ix), window, cx)
        };
        let on_link = {
            let sink = sink.clone();
            move |id: ActionId, window: &mut Window, cx: &mut App| {
                sink(PanelEvent::Action(id), window, cx)
            }
        };
        rows = rows.child(ack_row(
            ix,
            theme,
            *checked,
            SharedString::from(text),
            links,
            on_toggle,
            on_link,
        ));
    }

    let cta = {
        let on_submit = on_action(sink, ActionId::SubmitCreate);
        vela_button_opts(
            "create-submit",
            ButtonVariant::Primary,
            loc.t("onboarding.create.createWalletBtn"),
            can_submit && !busy,
            theme,
            move |_, window, cx| on_submit(window, cx),
        )
    };

    div()
        .flex()
        .flex_col()
        .child(field)
        .child(div().h(px(FLOW_GAP_LG)))
        .child(rows)
        .child(div().h(px(FLOW_GAP_LG)))
        .child(cta)
}

fn render_working(
    step: u8,
    status: CreateStatusKey,
    show_hint: bool,
    elapsed_secs: Option<u16>,
    host: &PanelHost<'_>,
) -> Div {
    let theme = host.theme;
    let loc = host.loc;

    let caption = loc.t_vars(
        "onboarding.common.stepCounter",
        &[("current", f64::from(step)), ("total", 5.)],
    );
    let mut headline_row = div()
        .flex()
        .items_center()
        .justify_between()
        .gap(px(FLOW_GAP_MD))
        .child(
            div()
                .min_w(px(0.))
                .text_size(theme::text_flow_headline())
                .font_weight(FontWeight::BOLD)
                .text_color(theme.fg_base)
                .child(loc.t(status.key())),
        );
    if let Some(secs) = elapsed_secs {
        headline_row = headline_row.child(elapsed_ring(theme, secs));
    }

    let mut col = div()
        .flex()
        .flex_col()
        .child(step_progress(theme, step, 5))
        .child(
            div()
                .mt(px(FLOW_GAP_MD))
                .text_size(theme::text_flow_caption())
                .text_color(theme.fg_muted)
                .child(caption),
        )
        .child(div().mt(px(FLOW_GAP_SM)).child(headline_row));
    if show_hint {
        col = col.child(
            div()
                .mt(px(FLOW_GAP_SM))
                .text_size(theme::text_body())
                .line_height(theme::line_height_body())
                .text_color(theme.fg_subtle)
                .child(loc.t("onboarding.common.confirmInPrompt")),
        );
    }
    col
}

fn render_outcome(spec: &OutcomeSpec, host: &PanelHost<'_>) -> Div {
    let theme = host.theme;
    let loc = host.loc;
    let sink = &host.sink;

    // A11's headline is set in the success green; every other outcome —
    // including B5's — keeps the base foreground (both per the mocks).
    let headline_color = if spec.badge == BadgeVariant::Success && spec.address.is_some() {
        theme.success_base
    } else {
        theme.fg_base
    };

    let mut col = div()
        .flex()
        .flex_col()
        .child(
            div()
                .flex()
                .justify_center()
                .child(status_badge(theme, spec.badge)),
        )
        .child(
            div()
                .mt(px(FLOW_GAP_LG))
                .text_size(theme::text_flow_headline())
                .font_weight(FontWeight::BOLD)
                .text_color(headline_color)
                .text_center()
                .child(spec.headline.clone()),
        )
        .child(
            div()
                .mt(px(FLOW_GAP_SM))
                .text_size(theme::text_body())
                .line_height(theme::line_height_body())
                .text_color(theme.fg_muted)
                .text_center()
                .child(spec.body.clone()),
        );

    if let Some(address) = &spec.address {
        let on_copied = on_action(sink, ActionId::CopyAddress);
        col = col.child(div().mt(px(FLOW_GAP_LG)).child(address_strip(
            theme,
            address.clone(),
            host.copied,
            loc.t("onboarding.common.copied"),
            on_copied,
        )));
    }
    if let Some(footnote) = &spec.footnote {
        col = col.child(
            div()
                .mt(px(FLOW_GAP_MD))
                .text_size(theme::text_flow_caption())
                .text_color(theme.fg_subtle)
                .text_center()
                .child(footnote.clone()),
        );
    }

    if let Some(details) = &spec.details {
        let on_toggle = on_action(sink, ActionId::ToggleDetails);
        col = col
            .child(
                div()
                    .mt(px(FLOW_GAP_LG))
                    .h(px(theme::HAIRLINE))
                    .w_full()
                    .bg(theme.divider),
            )
            .child(tech_details(
                theme,
                loc.t("onboarding.create.technicalDetails"),
                details,
                spec.details_expanded,
                on_toggle,
            ));
    }

    // Stacked actions: primary capsule, then the mock's dark solid rows —
    // one authority (`action_stack`) decides that styling.
    let press = {
        let sink = sink.clone();
        move |id: ActionId, window: &mut Window, cx: &mut App| {
            sink(PanelEvent::Action(id), window, cx)
        }
    };
    col.child(
        div()
            .mt(px(FLOW_GAP_LG))
            .child(action_stack(theme, &spec.actions, press)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The design codes, verbatim and in inventory order (contract §1). E10
    /// appears ONCE — the gallery lists it under both flow groups, but the
    /// fixture set holds 34 unique entries.
    const EXPECTED_CODES: [&str; 34] = [
        "A1", "A2", "A3", "A4", "A4c", "A5", "A5c", "A6", "A6c", "A7", "A7c", "A8", "A8c", "A11",
        "A12", "A13", "E1", "E2", "E2x", "E3", "E4", "E5", "E6", "E7", "E8", "E9", "E10", "B1",
        "B1c", "B2", "B3", "B4", "B5", "B6",
    ];

    /// Every outcome kind in the catalog (data-model §4 — 18 kinds).
    const ALL_KINDS: [OutcomeKind; 18] = [
        OutcomeKind::Created,
        OutcomeKind::SyncFailed,
        OutcomeKind::VerifyStuck,
        OutcomeKind::Network,
        OutcomeKind::Server,
        OutcomeKind::Timeout,
        OutcomeKind::CancelledSetup,
        OutcomeKind::CancelledVerify,
        OutcomeKind::Unsupported,
        OutcomeKind::Incompatible,
        OutcomeKind::NotDiscoverable,
        OutcomeKind::AccountNotFound,
        OutcomeKind::Unknown,
        OutcomeKind::RecoverOffer,
        OutcomeKind::RecoverFailed,
        OutcomeKind::SignInFailed,
        OutcomeKind::SignedIn,
        OutcomeKind::LoginCancelled,
    ];

    fn outcome_of(fixture: &StateFixture) -> Option<&OutcomeSpec> {
        match &fixture.state {
            FixtureState::Create(CreatePanelState::Outcome(spec)) => Some(spec),
            FixtureState::Login(LoginPanelState::Outcome(spec)) => Some(spec),
            _ => None,
        }
    }

    /// Data-model §3: exactly 1 primary + 0..=2 secondary, primary on top.
    fn assert_action_shape(what: &str, actions: &[Action]) {
        assert!(
            (1..=3).contains(&actions.len()),
            "{what}: {} actions, expected 1..=3",
            actions.len()
        );
        let primaries = actions
            .iter()
            .filter(|a| a.role == ActionRole::Primary)
            .count();
        assert_eq!(primaries, 1, "{what}: expected exactly 1 primary action");
        assert_eq!(
            actions[0].role,
            ActionRole::Primary,
            "{what}: the primary action must lead the stack"
        );
    }

    /// SC-001's mechanical half: dropping (or duplicating) a design state
    /// fails here, not in a visual pass.
    #[test]
    fn fixture_set_is_the_34_design_codes() {
        let loc = Loc::pinned("en");
        let codes: Vec<&str> = fixtures(&loc).iter().map(|f| f.code).collect();
        assert_eq!(codes, EXPECTED_CODES);
    }

    /// E10 is the one shared fixture — the gallery derives both group listings
    /// from this flag, so exactly one `Shared` entry means exactly one E10 per
    /// group (contract §1).
    #[test]
    fn e10_is_the_only_shared_fixture() {
        let loc = Loc::pinned("en");
        let shared: Vec<&str> = fixtures(&loc)
            .iter()
            .filter(|f| f.flow == FixtureFlow::Shared)
            .map(|f| f.code)
            .collect();
        assert_eq!(shared, ["E10"]);
    }

    /// The action-shape invariant, over the whole catalog AND every outcome
    /// fixture built from it.
    #[test]
    fn outcome_actions_are_one_primary_and_at_most_two_secondary() {
        let loc = Loc::pinned("en");
        for kind in ALL_KINDS {
            assert_action_shape(&format!("{kind:?}"), &kind.spec(&loc).actions);
        }
        for fixture in fixtures(&loc) {
            if let Some(spec) = outcome_of(&fixture) {
                assert_action_shape(fixture.code, &spec.actions);
            }
        }
    }

    /// Spot checks of the badge mapping (data-model §3 table).
    #[test]
    fn badge_mapping_spot_checks() {
        let loc = Loc::pinned("en");
        // A11 success ✓, E3 timeout clock, B2 recovery-offer info, E4 neutral.
        assert_eq!(OutcomeKind::Created.spec(&loc).badge, BadgeVariant::Success);
        assert_eq!(OutcomeKind::Timeout.spec(&loc).badge, BadgeVariant::Timeout);
        assert_eq!(
            OutcomeKind::RecoverOffer.spec(&loc).badge,
            BadgeVariant::Info
        );
        assert_eq!(
            OutcomeKind::CancelledSetup.spec(&loc).badge,
            BadgeVariant::Neutral
        );
    }

    /// Contract §1 fixture pins: the full 42-char A11 address, E2x as the one
    /// expanded-disclosure entry, and the model rule that `details_expanded`
    /// requires `details`.
    #[test]
    fn fixture_pins_hold() {
        let loc = Loc::pinned("en");
        let all = fixtures(&loc);

        assert_eq!(FIXTURE_ADDRESS.len(), 42);
        let a11 = all.iter().find(|f| f.code == "A11").expect("A11 exists");
        let a11_spec = outcome_of(a11).expect("A11 is an outcome");
        assert_eq!(a11_spec.address.as_deref(), Some(FIXTURE_ADDRESS));

        let expanded: Vec<&str> = all
            .iter()
            .filter(|f| outcome_of(f).is_some_and(|s| s.details_expanded))
            .map(|f| f.code)
            .collect();
        assert_eq!(expanded, ["E2x"]);

        for fixture in &all {
            if let Some(spec) = outcome_of(fixture) {
                assert!(
                    !spec.details_expanded || spec.details.is_some(),
                    "{}: details_expanded without details",
                    fixture.code
                );
            }
        }
    }
}
