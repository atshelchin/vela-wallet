//! The Onboarding welcome page — composition and interaction intent only.
//! Colors come from `theme`, strings from `loc`, visuals from `ui`
//! (spec 007 FR-009/FR-010).

use crate::loc::Loc;
use crate::theme::{
    self, BRAND_INDENT, BRAND_TOP, CARD_GAP_X, CARD_GAP_Y, CONTENT_INSET, CONTENT_INSET_RIGHT,
    GAP_BRAND_TAGLINE, GAP_BUTTONS, GAP_LOGO_WORDMARK, GAP_TAGLINE_GRID, LOGO_SIZE, PANEL_INSET,
    PANEL_W, Theme, ThemeMode,
};
use crate::ui::{ButtonVariant, LaunchAnimation, feature_card, vela_button, vela_mark};
use crate::window_frame::{FRAME_ROUNDING, FRAME_SHADOW, frame_tiling, round_to_frame, window_frame};
use gpui::{
    Context, Div, FocusHandle, FontWeight, InteractiveElement as _, IntoElement, KeyDownEvent,
    MouseButton, ParentElement, Render, SharedString, Stateful, StatefulInteractiveElement as _,
    Styled, Tiling, Window, div, px,
};

/// What the user chose on this screen. One sink (FR-010): later features attach
/// navigation here without touching components.
#[derive(Clone, Copy, Debug)]
pub enum Intent {
    CreateWallet,
    RecoverWallet,
}

/// The six feature cards, in mock order. Key leaves under `onboarding.welcome.`.
const FEATURES: [(&str, &str); 6] = [
    ("featureNoMnemonicTitle", "featureNoMnemonicBody"),
    ("featureOneAddressTitle", "featureOneAddressBody"),
    ("featureOpenSourceTitle", "featureOpenSourceBody"),
    ("featureKeyCustodyTitle", "featureKeyCustodyBody"),
    ("featureSafeContractTitle", "featureSafeContractBody"),
    ("featureStablecoinGasTitle", "featureStablecoinGasBody"),
];

/// Height of the drag strip under client-side decorations: the empty band
/// above the brand row (which starts at `BRAND_TOP`), so the strip never
/// covers anything interactive.
const DRAG_STRIP_H: f32 = 96.;

pub struct OnboardingPage {
    mode: ThemeMode,
    loc: Loc,
    /// Keyboard target for the window-level shortcuts (F11). The page never
    /// shows focus — it only needs to sit on the dispatch path.
    focus_handle: FocusHandle,
    /// True between a press on the drag strip and the first movement after
    /// it. Moving on the *move*, not the press, is what keeps double-click
    /// detection alive (Zed's `should_move` dance in `platform_title_bar`).
    drag_pending: bool,
    /// The launch animation, for this cold start only (spec 012). `None` once
    /// it has finished — there is no path back, which is FR-008.
    launch: Option<LaunchAnimation>,
}

impl OnboardingPage {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let loc = Loc::from_env();
        eprintln!(
            "[vela-wallet] onboarding: locale resolved to `{}`",
            loc.language()
        );

        // Restyle when the OS appearance flips, unless VELA_THEME pins it.
        let page = cx.weak_entity();
        window
            .observe_window_appearance(move |window, cx| {
                if ThemeMode::is_pinned() {
                    return;
                }
                let mode = ThemeMode::detect(window);
                if let Some(page) = page.upgrade() {
                    page.update(cx, |this, cx| {
                        this.mode = mode;
                        cx.notify();
                    });
                }
            })
            .detach();

        let mode = ThemeMode::detect(window);

        // F11 (and any later shortcut) needs a focused element to dispatch
        // through; nothing else on this page takes focus.
        let focus_handle = cx.focus_handle();
        focus_handle.focus(window, cx);

        Self {
            launch: if theme::launch_disabled() {
                None
            } else {
                Some(LaunchAnimation::new(mode, cx))
            },
            mode,
            loc,
            focus_handle,
            drag_pending: false,
        }
    }

    fn on_intent(&mut self, intent: Intent) {
        // This release records the choice; wallet creation/sign-in are later
        // features (spec 007 Out of scope).
        eprintln!("[vela-wallet] onboarding: intent {intent:?}");
    }

    fn t(&self, leaf: &str) -> SharedString {
        self.loc.t(&format!("onboarding.welcome.{leaf}"))
    }

    // -- left column --------------------------------------------------------

    fn brand_row(&self, theme: &Theme) -> Div {
        div()
            .flex()
            .items_center()
            .ml(px(BRAND_INDENT))
            .gap(px(GAP_LOGO_WORDMARK))
            .child(vela_mark(theme, px(LOGO_SIZE)))
            .child(
                div()
                    .text_size(theme::text_brand())
                    .font_weight(FontWeight::BOLD)
                    .text_color(theme.fg_base)
                    // The wordmark is a proper name, rendered verbatim (FR-005).
                    .child("Vela Wallet"),
            )
    }

    fn card_grid(&self, theme: &Theme) -> Div {
        let mut rows = div().flex().flex_col().gap(px(CARD_GAP_Y));
        for (row_idx, row) in FEATURES.chunks(3).enumerate() {
            // align-items defaults to stretch: the tallest card in a row sets
            // the row height, so long-locale copy never clips (spec edge case).
            let mut cols = div().flex().gap(px(CARD_GAP_X));
            for (col_idx, (title, body)) in row.iter().enumerate() {
                let numeral = format!("{:02}", row_idx * 3 + col_idx + 1);
                cols = cols.child(feature_card(
                    theme,
                    SharedString::from(numeral),
                    self.t(title),
                    self.t(body),
                ));
            }
            rows = rows.child(cols);
        }
        rows
    }

    fn left_column(&self, theme: &Theme) -> Div {
        div()
            .flex_1()
            // Without this the column's automatic minimum is its content
            // width, and a window below the design size pushes the
            // fixed-width action panel clean out of the window instead of
            // compressing the cards. Same taffy lesson as the demo's
            // `min_h(0)` note — flex children must opt in to shrinking.
            .min_w(px(0.))
            .h_full()
            .pt(px(BRAND_TOP))
            .pl(px(CONTENT_INSET))
            // Default align-items stretch: the card grid fills the column's
            // width, so the cards flex with the window (user request on top of
            // the fixed-canvas mock).
            .pr(px(CONTENT_INSET_RIGHT))
            .flex()
            .flex_col()
            .child(self.brand_row(theme))
            .child(
                div()
                    .mt(px(GAP_BRAND_TAGLINE))
                    .text_size(theme::text_tagline())
                    .text_color(theme.fg_muted)
                    .child(self.t("desktopTagline")),
            )
            .child(div().mt(px(GAP_TAGLINE_GRID)).child(self.card_grid(theme)))
    }

    // -- window chrome ------------------------------------------------------

    /// The invisible titlebar. Rendered only under client-side decorations —
    /// macOS never sees it; there AppKit's transparent titlebar already
    /// drags, double-clicks and menus (`appears_transparent` in main.rs).
    fn drag_strip(&self, cx: &mut Context<Self>) -> Stateful<Div> {
        div()
            .id("drag-strip")
            .absolute()
            .top_0()
            .left_0()
            .w_full()
            .h(px(DRAG_STRIP_H))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, _, _, _| this.drag_pending = true),
            )
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, _, _, _| this.drag_pending = false),
            )
            .on_mouse_down_out(cx.listener(|this, _, _, _| this.drag_pending = false))
            // Press-then-move is a drag: hand the window to the compositor.
            .on_mouse_move(cx.listener(|this, _, window, _| {
                if this.drag_pending {
                    this.drag_pending = false;
                    window.start_window_move();
                }
            }))
            .on_click(|event, window, _| {
                if event.click_count() == 2 {
                    window.zoom_window();
                }
            })
            .on_mouse_down(MouseButton::Right, |event, window, _| {
                window.show_window_menu(event.position);
            })
    }

    // -- right action panel -------------------------------------------------

    fn action_panel(&self, theme: &Theme, tiling: Option<Tiling>, cx: &mut Context<Self>) -> Div {
        let panel = div()
            .w(px(PANEL_W))
            .h_full()
            .flex_none()
            .bg(theme.bg_raised)
            .border_l_1()
            .border_color(theme.panel_edge)
            .px(px(PANEL_INSET))
            // justify_center lands the two-CTA group within 1 px of the mock's
            // position at the design height (group center 401 vs 400).
            .flex()
            .flex_col()
            .justify_center();

        // The panel owns the whole right edge, and gpui does not clip children
        // to a parent's rounding — square corners here would paint straight
        // over the frame's rounded ones.
        let panel = match tiling {
            Some(tiling) => {
                let mut panel = panel;
                if !tiling.top && !tiling.right {
                    panel = panel.rounded_tr(FRAME_ROUNDING);
                }
                if !tiling.bottom && !tiling.right {
                    panel = panel.rounded_br(FRAME_ROUNDING);
                }
                panel
            }
            None => panel,
        };

        panel
            .child(vela_button(
                "create-wallet",
                ButtonVariant::Primary,
                self.t("createWallet"),
                theme,
                cx.listener(|this, _, _, _| this.on_intent(Intent::CreateWallet)),
            ))
            .child(div().h(px(GAP_BUTTONS)))
            .child(vela_button(
                "already-have-wallet",
                ButtonVariant::Secondary,
                self.t("alreadyHaveWallet"),
                theme,
                cx.listener(|this, _, _, _| this.on_intent(Intent::RecoverWallet)),
            ))
    }
}

impl Render for OnboardingPage {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = Theme::of(self.mode);
        let tiling = frame_tiling(window);

        // The page is composed on EVERY frame, including while the launch
        // animation covers it (spec FR-013a). The overlay is opaque until the
        // dissolve, so none of this is visible early — but it means the hand-off
        // has nothing left to build at exactly the wrong moment.
        //
        // NOTE the background is NOT on this div: it sits on the root below, so
        // it stays opaque while the content fades in. Putting it here would fade
        // the backdrop too and the dissolve would wash out through to the bare
        // window instead of cross-dissolving over a continuous colour.
        let page = div()
            .size_full()
            .flex()
            .text_color(theme.fg_base)
            .child(self.left_column(&theme))
            .child(self.action_panel(&theme, tiling, cx));

        // The animation centres itself on the *content* width. Under client-
        // side decorations the viewport is wider than the window by the shadow
        // band on each untiled side; uncorrected, the lockup would land off
        // the brand row by exactly that much at the hand-off.
        let mut viewport_w = f32::from(window.viewport_size().width);
        if let Some(tiling) = tiling {
            if !tiling.left {
                viewport_w -= f32::from(FRAME_SHADOW);
            }
            if !tiling.right {
                viewport_w -= f32::from(FRAME_SHADOW);
            }
        }
        let overlay = self
            .launch
            .as_mut()
            .and_then(|launch| launch.render(viewport_w, window, cx));

        // Welcome fades IN as the launch lockup fades OUT — a cross-dissolve,
        // not a reveal. 1.0 once the animation is gone.
        let page_opacity = self.launch.as_ref().map_or(1., |l| l.page_opacity());

        let root = div()
            .size_full()
            .relative()
            // The one continuous surface. Both the launch screen and Welcome sit
            // on this exact colour, which is what lets them cross-dissolve
            // without a washed-out middle.
            .bg(theme.bg_base)
            .child(page.opacity(page_opacity));

        // Client-side decorations only (never macOS/Windows — `tiling` is
        // `None` there): the bg above rounds flush with the frame, the drag
        // strip stands in for the missing titlebar, and F11 covers fullscreen,
        // which no compositor affordance reaches without a titlebar either.
        let root = match tiling {
            Some(tiling) => round_to_frame(root, tiling)
                .track_focus(&self.focus_handle)
                .on_key_down(cx.listener(|_, event: &KeyDownEvent, window, _| {
                    if event.keystroke.key == "f11" {
                        window.toggle_fullscreen();
                    }
                }))
                .child(self.drag_strip(cx)),
            None => root,
        };

        let root = match overlay {
            None => {
                // Terminal: drop the animation so a later re-render cannot
                // resurrect it (FR-008 — once per cold start, never again).
                self.launch = None;
                root
            }
            // Any pointer input ends playback immediately (FR-016). The overlay
            // is on top, so it receives the event before the page.
            Some(overlay) => {
                let overlay = overlay.on_mouse_down(
                    MouseButton::Left,
                    cx.listener(|this, _, _, cx| {
                        if let Some(launch) = this.launch.as_mut() {
                            launch.skip();
                        }
                        cx.notify();
                    }),
                );
                // The launch cover is opaque and full-bleed; unrounded it
                // would square the window's corners for its ~1.9 s.
                let overlay = match tiling {
                    Some(tiling) => round_to_frame(overlay, tiling),
                    None => overlay,
                };
                root.child(overlay)
            }
        };

        window_frame(root, &theme, window)
    }
}
