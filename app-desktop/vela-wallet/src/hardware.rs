//! The three dialogs that belong to the CABLE.
//!
//! Every other Vela client hands its ceremony to a system passkey sheet, and
//! that sheet says all of this on the app's behalf: your key is blinking, type
//! its PIN, which of these wallets did you mean. The desktop has no such sheet
//! — the app IS the sheet — so these three exist here and nowhere else in the
//! codebase.
//!
//! They are free functions over `(theme, loc, request)` rather than methods on
//! a screen, for one reason: the gallery renders the SAME cards the flow does.
//! Each of these states needs a particular authenticator in a particular
//! condition to reach on purpose — a key with a PIN, a key with a sensor, two
//! keys holding four wallets — which makes them the states most likely to be
//! reviewed once and then drift. A gallery that drew its own copy would drift
//! with them.

use gpui::{
    App, Div, FontWeight, InteractiveElement as _, ParentElement, SharedString,
    StatefulInteractiveElement as _, Styled, Window, div, px, rgb,
};
use qrcode::{Color as QrColor, QrCode};

use vela_core::app::KeyMethod;

use crate::ctap::usb::{TouchKind, TouchRequest};
use crate::executor::passkey::{CredentialChoice, PinRequest};
use crate::loc::Loc;
use crate::outcome::{SHEET_PAD, SHEET_RADIUS, SHEET_W};
use crate::theme::{self, FLOW_GAP_LG, FLOW_GAP_MD, FLOW_GAP_SM, TOUCH_DISC, Theme};
use crate::ui::{ButtonVariant, NameFieldStrings, text_field, vela_button, vela_button_opts};

fn card(theme: &Theme) -> Div {
    div()
        .w(px(SHEET_W))
        .flex()
        .flex_col()
        .gap(px(FLOW_GAP_LG))
        .p(px(SHEET_PAD))
        .rounded(px(SHEET_RADIUS))
        .bg(theme.bg_raised)
        .border_1()
        .border_color(theme.border_card)
}

fn title(theme: &Theme, text: SharedString) -> Div {
    div()
        .text_size(theme::text_flow_headline())
        .font_weight(FontWeight::BOLD)
        .text_color(theme.fg_base)
        .child(text)
}

fn body(theme: &Theme, text: SharedString) -> Div {
    div()
        .text_size(theme::text_body())
        .line_height(theme::line_height_body())
        .text_color(theme.fg_muted)
        .child(text)
}

/// "Your key is blinking — touch it."
///
/// The first version of this was a caption on the progress screen only, and the
/// first key is minted from the NAME screen — so a person pressed 继续, watched
/// nothing happen, and had no idea a key three feet away was waiting for them.
/// The key knows; the screen has to say so wherever the screen happens to be,
/// which is why the page renders this over everything rather than inside a
/// step.
///
/// **No buttons.** There is nothing to press here — the answer is on the desk,
/// and a Cancel would only be a second way to do what walking away already does
/// (the exchange times out and reports it).
pub fn touch_card(theme: &Theme, loc: &Loc, waiting: &TouchRequest) -> Div {
    // A phone reached over caBLE is not a security key on the desk — it runs the
    // approval behind its own fingerprint/passkey UI, so the prompt tells the
    // person to look at the phone, not to "touch" anything here.
    // TODO(i18n): promote these two strings to the corpus once the caBLE flow is
    // confirmed on-device (they are the copy the founder specified).
    let (title_text, body_text) = if waiting.remote {
        (
            SharedString::from("Follow the steps on your device"),
            SharedString::from("Approve the request on your phone to continue."),
        )
    } else {
        let body_key = match waiting.kind {
            TouchKind::Presence => "onboarding.create.touchBody",
            TouchKind::Fingerprint => "onboarding.create.touchFingerprintBody",
            // No `{{product}}` to fill: several keys are blinking, and naming one
            // of them would be naming the wrong one.
            TouchKind::Select => "onboarding.create.touchSelectBody",
        };
        (
            loc.t("onboarding.create.touchTitle"),
            loc.t_text(body_key, "product", &waiting.product),
        )
    };

    card(theme)
        .items_center()
        // A filled disc where the outcome badge would be: the same place, the
        // same weight, and the only thing on the card that draws the eye.
        .child(
            div()
                .size(px(TOUCH_DISC))
                .flex_none()
                .rounded_full()
                .bg(theme.bg_well)
                .flex()
                .items_center()
                .justify_center()
                .child(
                    div()
                        .size(px(TOUCH_DISC / 2.4))
                        .rounded_full()
                        .bg(theme.accent),
                ),
        )
        .child(title(theme, title_text))
        .child(body(theme, body_text))
}

/// The three ways to sign in — this device, a phone by scan, a security key —
/// the same set creating a wallet offers per key. A wallet that lives on a
/// security key (or a phone) is reachable even where a platform passkey would be
/// the silent default. `Platform` has no route on the desktop and shows as
/// unavailable-with-a-reason, exactly as it does in the create picker.
pub fn signin_method_card(
    theme: &Theme,
    loc: &Loc,
    on_pick: std::sync::Arc<dyn Fn(KeyMethod, &mut Window, &mut App)>,
    on_dismiss: impl Fn(&gpui::ClickEvent, &mut Window, &mut App) + 'static,
) -> Div {
    // "This device" is real on exactly one desktop. Windows has Windows Hello
    // behind `webauthn.dll`; macOS and Linux reach no platform authenticator
    // from gpui at all, so there the row stays greyed and says why.
    let this_device = crate::executor::passkey::platform_supported();
    let entry = |method: KeyMethod, title_key: &str, body_key: &str, available: bool| {
        let on_pick = on_pick.clone();
        let row = div()
            .id(("signin-method", method as u64))
            .w_full()
            .flex()
            .items_center()
            .gap(px(FLOW_GAP_MD))
            .py(px(FLOW_GAP_MD))
            .border_b_1()
            .border_color(theme.border_card)
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.))
                    .flex()
                    .flex_col()
                    .gap(px(2.))
                    .child(
                        div()
                            .text_size(theme::text_card_title())
                            .text_color(theme.fg_base)
                            .child(loc.t(title_key)),
                    )
                    .child(body(theme, loc.t(body_key))),
            );
        if available {
            row.cursor_pointer()
                .hover(|s| s.bg(theme.bg_well))
                .on_click(move |_, window, cx| on_pick(method, window, cx))
        } else {
            row.opacity(0.4)
        }
    };

    card(theme)
        .child(title(theme, loc.t("onboarding.login.header")))
        .child(entry(
            KeyMethod::SecurityKey,
            "onboarding.create.methodSecurityKeyTitle",
            "onboarding.create.methodSecurityKeyBody",
            true,
        ))
        .child(entry(
            KeyMethod::Hybrid,
            "onboarding.create.methodHybridTitle",
            "onboarding.create.methodHybridBody",
            true,
        ))
        .child(entry(
            KeyMethod::Platform,
            "onboarding.create.methodPlatformTitle",
            if this_device {
                "onboarding.create.methodPlatformBody"
            } else {
                "onboarding.create.securityKeyRequiredBody"
            },
            this_device,
        ))
        .child(vela_button(
            "signin-methods-cancel",
            ButtonVariant::Secondary,
            loc.t("onboarding.common.close"),
            theme,
            on_dismiss,
        ))
}

/// The caBLE QR the person scans with their phone to sign in or add a key over
/// the hybrid transport.
///
/// **Black on white, always — not themed.** A QR is not UI chrome; it is a
/// scannable target, and a phone camera needs dark modules on a light field
/// whatever the app's theme is. So the matrix ignores the palette and draws its
/// own white quiet-zone box, the one place in this file that names a literal
/// colour on purpose.
///
/// **No buttons.** The answer is the phone; there is nothing to press. It clears
/// itself the moment the tunnel is up.
pub fn qr_card(theme: &Theme, loc: &Loc, payload: &str) -> Div {
    // A module size that keeps a typical caBLE payload (~40 modules a side) to a
    // card-sized target without a second layout pass.
    const MODULE_PX: f32 = 5.0;

    let matrix: Div = match QrCode::new(payload.as_bytes()) {
        Ok(code) => {
            let width = code.width();
            let colors = code.to_colors();
            let mut grid = div().flex().flex_col();
            for row in 0..width {
                let mut line = div().flex().flex_row();
                for col in 0..width {
                    let dark = matches!(colors.get(row * width + col), Some(QrColor::Dark));
                    let mut cell = div().size(px(MODULE_PX));
                    if dark {
                        cell = cell.bg(rgb(0x000000));
                    }
                    line = line.child(cell);
                }
                grid = grid.child(line);
            }
            grid
        }
        // A payload too large for a QR should never reach here (the caBLE payload
        // is well within capacity); fall back to nothing rather than panic.
        Err(_) => div(),
    };

    card(theme).items_center().child(title(theme, loc.t("onboarding.create.methodHybridTitle")))
        .child(
            // The white quiet-zone box the matrix needs to scan.
            div()
                .p(px(FLOW_GAP_MD))
                .rounded(px(SHEET_RADIUS))
                .bg(rgb(0xffffff))
                .child(matrix),
        )
        .child(body(theme, loc.t("onboarding.create.methodHybridBody")))
}

/// The PIN a security key without a sensor verifies with.
///
/// The helper line under the field carries the ONE fact that changes between
/// attempts: a refused PIN says so, and says what running out costs. Otherwise
/// it is the remaining count — which is the number a person needs BEFORE they
/// guess, not after.
#[allow(clippy::too_many_arguments, clippy::allow_attributes)]
pub fn pin_card(
    theme: &Theme,
    loc: &Loc,
    request: &PinRequest,
    value: &str,
    focus: &gpui::FocusHandle,
    window: &Window,
    on_change: impl Fn(String, &mut Window, &mut App) + 'static,
    on_confirm: impl Fn(&gpui::ClickEvent, &mut Window, &mut App) + 'static,
    on_cancel: impl Fn(&gpui::ClickEvent, &mut Window, &mut App) + 'static,
) -> Div {
    let helper = if request.retry {
        loc.t("onboarding.create.pinRejected")
    } else {
        match request.retries {
            Some(left) => loc.t_vars(
                "onboarding.create.pinAttemptsLeft",
                &[("attempts", f64::from(left))],
            ),
            // A key that will not answer `getPinRetries` still deserves a
            // dialog — just without a number it cannot supply.
            None => loc.t("onboarding.create.pinLabel"),
        }
    };
    let strings = NameFieldStrings {
        label: loc.t("onboarding.create.pinLabel"),
        placeholder: SharedString::from("••••"),
        helper,
        too_long_hint: loc.t("onboarding.create.pinRejected"),
    };

    card(theme)
        .child(title(theme, loc.t("onboarding.create.pinTitle")))
        // The key names ITSELF here — the product string it reports over USB.
        // "YubiKey 5C NFC" is what is on the desk; "your authenticator" is what
        // a form says.
        .child(body(
            theme,
            loc.t_text("onboarding.create.pinBody", "product", &request.product),
        ))
        .child(text_field(
            "pin-field",
            theme,
            &strings,
            value,
            request.retry,
            true,
            focus,
            window,
            on_change,
        ))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(FLOW_GAP_MD))
                .child(vela_button_opts(
                    "pin-confirm",
                    ButtonVariant::Primary,
                    loc.t("onboarding.create.nextBtn"),
                    !value.is_empty(),
                    theme,
                    on_confirm,
                ))
                .child(vela_button(
                    "pin-cancel",
                    ButtonVariant::Row,
                    loc.t("common.cancel"),
                    theme,
                    on_cancel,
                )),
        )
}

/// Which of several wallets on one key.
///
/// A security key can hold more than one Vela wallet, and "who are you?" then
/// has more than one answer. Without this, the first credential the key happens
/// to return wins — leaving the others unreachable from this computer, which is
/// indistinguishable from having lost them.
///
/// The assertions behind these rows are ALREADY SIGNED: choosing is choosing
/// which one to hand the core, not asking the key to do more work.
pub fn pick_card(
    theme: &Theme,
    loc: &Loc,
    choices: &[CredentialChoice],
    on_pick: impl Fn(&usize, &mut Window, &mut App) + Clone + 'static,
    on_cancel: impl Fn(&gpui::ClickEvent, &mut Window, &mut App) + 'static,
) -> Div {
    // The key is not blinking any more by the time this is on screen — the
    // touch is what produced the list — so the product name comes from the
    // choices themselves.
    let product = choices
        .first()
        .map(|choice| choice.product.clone())
        .unwrap_or_default();

    let mut rows = div().w_full().flex().flex_col();
    for (index, choice) in choices.iter().enumerate() {
        let name = if choice.name.trim().is_empty() {
            loc.t("onboarding.login.pickUnnamed")
        } else {
            SharedString::from(choice.name.clone())
        };
        // The second line is the KEY, the way a browser's own picker labels
        // these rows — every wallet here lives on the same authenticator, so it
        // is the same line on every row, and that is the honest answer to
        // "where is this passkey".
        //
        // UNLESS two rows share a name. Then, and only then, the credential
        // id's head is appended: two identical rows are worse than a little
        // hex, because the person has no way to say which they meant.
        let ambiguous = choices
            .iter()
            .filter(|other| other.name == choice.name)
            .count()
            > 1;
        let subtitle = if ambiguous {
            SharedString::from(format!(
                "{product} · {}",
                choice
                    .credential_id
                    .get(..12)
                    .unwrap_or(&choice.credential_id)
            ))
        } else {
            SharedString::from(product.clone())
        };
        let on_pick = on_pick.clone();
        rows = rows.child(
            div()
                .id(("wallet-choice", index as u64))
                .w_full()
                .flex()
                .flex_col()
                .gap(px(2.))
                .py(px(FLOW_GAP_MD))
                .px(px(FLOW_GAP_SM))
                .rounded(px(8.))
                .cursor_pointer()
                .border_b_1()
                .border_color(theme.divider)
                .hover(|style| style.bg(theme.bg_sunken))
                .on_click(move |_, window, cx| on_pick(&index, window, cx))
                .child(
                    div()
                        .text_size(theme::text_card_title())
                        .text_color(theme.fg_base)
                        .child(name),
                )
                .child(
                    div()
                        .text_size(theme::text_flow_caption())
                        .text_color(theme.fg_subtle)
                        .child(subtitle),
                ),
        );
    }

    card(theme)
        .child(title(theme, loc.t("onboarding.login.pickTitle")))
        .child(body(
            theme,
            loc.t_text("onboarding.login.pickBody", "product", &product),
        ))
        .child(rows)
        .child(vela_button(
            "wallet-pick-cancel",
            ButtonVariant::Row,
            loc.t("common.cancel"),
            theme,
            on_cancel,
        ))
}
