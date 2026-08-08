//! The wallet page entity (spec 015 US2): sidebar + content + closable third
//! column, plus the gallery chrome that exposes every state (FR-004).
//!
//! One entity serves both `VELA_PAGE=wallet` (D1 default, panels open on
//! interaction) and `VELA_PAGE=gallery` (adds the state-switcher strip,
//! component boards and the identicon board).

use gpui::{
    Context, Div, ElementId, FocusHandle, InteractiveElement as _, IntoElement, KeyDownEvent,
    ParentElement, Render, SharedString, Stateful, StatefulInteractiveElement as _, Styled, Window,
    div, px,
};

use crate::icons::{Icon, IconCache};
use crate::identicon::IdenticonCache;
use crate::loc::Loc;
use crate::theme::{
    self, SIDEBAR_PAD, SIDEBAR_TOP, SIDEBAR_W, THIRD_PANEL_W, Theme, ThemeMode, WALLET_PAD_TOP,
    WALLET_PAD_X,
};
use crate::window_frame::window_frame;

use super::WalletStrings;
use super::components::{
    action_pill, activity_row, asset_row, balance_display, chain_row, empty_state,
    identicon_avatar, nav_row, qr_placeholder, section_header, sidebar_search, skeleton_row,
    token_icon, wallet_header,
};
use super::fixtures::{
    self, ADDRESS_DISPLAY, ADDRESS_FULL, IDENTICON_BOARD_SEEDS, WALLET_NAME,
};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PanelId {
    None,
    Receive,
    AssetDetail,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum GalleryTab {
    D1,
    D2,
    D3,
    Components,
    Identicons,
}

pub struct WalletPage {
    mode: ThemeMode,
    /// Gallery-only appearance override (the VELA_THEME pin still wins at
    /// detect time; this cycles on top for quick eyeballing).
    override_mode: Option<ThemeMode>,
    strings: WalletStrings,
    panel: PanelId,
    tab: GalleryTab,
    gallery: bool,
    icons: IconCache,
    identicons: IdenticonCache,
    focus_handle: FocusHandle,
}

impl WalletPage {
    pub fn new(gallery: bool, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let loc = Loc::from_env();
        eprintln!(
            "[vela-wallet] wallet: locale `{}`, gallery {gallery}",
            loc.language()
        );
        let strings = WalletStrings::resolve(&loc);

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

        let focus_handle = cx.focus_handle();
        focus_handle.focus(window, cx);

        Self {
            mode: ThemeMode::detect(window),
            override_mode: None,
            strings,
            panel: PanelId::None,
            tab: GalleryTab::D1,
            gallery,
            icons: IconCache::default(),
            identicons: IdenticonCache::default(),
            focus_handle,
        }
    }

    fn theme_mode(&self) -> ThemeMode {
        self.override_mode.unwrap_or(self.mode)
    }

    // -- column 1: sidebar ---------------------------------------------------

    fn sidebar(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let _ = cx;
        let s = &self.strings;
        let bg = match self.theme_mode() {
            ThemeMode::Light => theme.bg_sunken,
            ThemeMode::Dark => theme.bg_base,
        };

        let nav = [
            (Icon::NavWallet, s.nav_wallet.clone(), true),
            (Icon::NavContacts, s.nav_contacts.clone(), false),
            (Icon::NavExplore, s.nav_explore.clone(), false),
            (Icon::NavSettings, s.nav_settings.clone(), false),
        ];
        let mut nav_col = div().flex().flex_col().gap(px(2.));
        for (i, (icon, label, selected)) in nav.into_iter().enumerate() {
            nav_col = nav_col.child(nav_row(
                ElementId::from(("nav", i)),
                theme,
                &mut self.icons,
                icon,
                label,
                selected,
            ));
        }

        let mut networks = div().flex().flex_col().gap(px(2.)).flex_1().min_h(px(0.));
        for (i, row) in fixtures::chains(s).iter().enumerate() {
            networks = networks.child(chain_row(
                ElementId::from(("chain", i)),
                theme,
                &mut self.icons,
                row,
            ));
        }

        div()
            .w(px(SIDEBAR_W))
            .h_full()
            .flex_none()
            .bg(bg)
            .border_r_1()
            .border_color(theme.divider)
            .p(px(SIDEBAR_PAD))
            .pt(px(SIDEBAR_TOP))
            .flex()
            .flex_col()
            .gap(px(16.))
            .child(wallet_header(
                theme,
                &mut self.icons,
                &mut self.identicons,
                ADDRESS_FULL,
                WALLET_NAME.into(),
                ADDRESS_DISPLAY.into(),
            ))
            .child(nav_col)
            .child(div().h(px(1.)).bg(theme.divider))
            .child(
                div()
                    .px(px(12.))
                    .text_size(theme::text_label())
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .text_color(theme.fg_subtle)
                    .child(self.strings.networks_title.clone()),
            )
            .child(networks)
            .child(sidebar_search(
                theme,
                &mut self.icons,
                self.strings.search_placeholder.clone(),
            ))
    }

    // -- column 2: content ---------------------------------------------------

    fn content(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let s_activity = self.strings.section_activity.clone();
        let s_assets = self.strings.section_assets.clone();
        let s_all = self.strings.action_all.clone();
        let s_add = self.strings.action_add.clone();

        let balance = fixtures::balance_default(&self.strings);
        let activity = fixtures::activity_default(&self.strings);
        let assets = fixtures::assets_default(&self.strings);

        let pills = div()
            .flex()
            .gap(px(12.))
            .max_w(px(600.))
            .pt(px(20.))
            .pb(px(24.))
            .child(
                action_pill(
                    "pill-receive",
                    theme,
                    &mut self.icons,
                    Icon::ArrowDownLeft,
                    self.strings.action_receive.clone(),
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    this.panel = PanelId::Receive;
                    cx.notify();
                })),
            )
            .child(action_pill(
                "pill-send",
                theme,
                &mut self.icons,
                Icon::ArrowUpRight,
                self.strings.action_send.clone(),
            ))
            .child(action_pill(
                "pill-scan",
                theme,
                &mut self.icons,
                Icon::ScanLine,
                self.strings.action_scan.clone(),
            ));

        let mut activity_col = div().flex().flex_col();
        for row in &activity {
            activity_col = activity_col.child(activity_row(theme, &mut self.icons, row));
        }

        let mut assets_col = div().flex().flex_col();
        for (i, row) in assets.iter().enumerate() {
            assets_col = assets_col.child(
                asset_row(ElementId::from(("asset", i)), theme, &mut self.icons, row).on_click(
                    cx.listener(|this, _, _, cx| {
                        this.panel = PanelId::AssetDetail;
                        cx.notify();
                    }),
                ),
            );
        }

        div()
            .flex_1()
            .min_w(px(0.))
            .h_full()
            .overflow_hidden()
            .px(px(WALLET_PAD_X))
            .pt(px(WALLET_PAD_TOP))
            .flex()
            .flex_col()
            .child(balance_display(theme, &mut self.icons, &balance))
            .child(pills)
            .child(section_header(
                theme,
                &mut self.icons,
                s_activity,
                s_all,
            ))
            .child(activity_col)
            .child(section_header(theme, &mut self.icons, s_assets, s_add))
            .child(assets_col)
    }

    // -- column 3: the closable panel (desktop bottom-sheet stand-in) --------

    fn panel_scaffold(
        &mut self,
        theme: &Theme,
        title: SharedString,
        body: Div,
        cx: &mut Context<Self>,
    ) -> Div {
        div()
            .w(px(THIRD_PANEL_W))
            .h_full()
            .flex_none()
            .bg(theme.bg_base)
            .border_l_1()
            .border_color(theme.divider)
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .px(px(20.))
                    .pt(px(SIDEBAR_TOP))
                    .pb(px(8.))
                    .child(
                        div()
                            .text_size(theme::text_panel_title())
                            .font_weight(gpui::FontWeight::BOLD)
                            .text_color(theme.fg_base)
                            .child(title),
                    )
                    .child(
                        div()
                            .id("panel-close")
                            .w(px(32.))
                            .h(px(32.))
                            .rounded(px(16.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .hover(|el| el.bg(theme.bg_sunken))
                            .child(crate::wallet::components::close_icon(
                                theme,
                                &mut self.icons,
                            ))
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.panel = PanelId::None;
                                cx.notify();
                            })),
                    ),
            )
            .child(
                div()
                    .flex_1()
                    .min_h(px(0.))
                    .overflow_hidden()
                    .px(px(20.))
                    .pb(px(20.))
                    .child(body),
            )
    }

    fn receive_body(&mut self, theme: &Theme) -> Div {
        let s = &self.strings;
        let picker = div()
            .flex()
            .items_center()
            .gap(px(12.))
            .p(px(12.))
            .rounded(px(14.))
            .bg(theme.bg_raised)
            .border_1()
            .border_color(theme.border_card)
            .child(token_icon(theme, "BNB", fixtures::chain_bnb()))
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.))
                    .flex()
                    .flex_col()
                    .gap(px(2.))
                    .child(
                        div()
                            .text_size(theme::text_row_title())
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .text_color(theme.fg_base)
                            .child("BNB"),
                    )
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_muted)
                            .child(fixtures::receive_network_detail(s)),
                    ),
            );

        let address_box = div()
            .p(px(14.))
            .rounded(px(10.))
            .bg(theme.bg_sunken)
            .font_family(theme::font_mono())
            .text_size(theme::text_mono_address())
            .text_color(theme.fg_base)
            .child(SharedString::from(ADDRESS_FULL));

        let copy = div()
            .id("copy-address")
            .h(px(48.))
            .rounded(px(14.))
            .bg(theme.bg_raised)
            .border_1()
            .border_color(theme.outline_strong)
            .flex()
            .items_center()
            .justify_center()
            .gap(px(8.))
            .cursor_pointer()
            .hover(|el| el.bg(theme.bg_sunken))
            .text_size(theme::text_row_title())
            .font_weight(gpui::FontWeight::SEMIBOLD)
            .text_color(theme.fg_base)
            .child(crate::wallet::components::copy_icon(theme, &mut self.icons))
            .child(s.copy_address.clone());

        let warning = div()
            .p(px(14.))
            .rounded(px(14.))
            .bg(theme.warning_soft)
            .border_1()
            .border_color(theme.warning_border)
            .flex()
            .flex_col()
            .gap(px(6.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .text_size(theme::text_row_title())
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .text_color(theme.warning)
                    .child(crate::wallet::components::warning_icon(
                        theme,
                        &mut self.icons,
                    ))
                    .child(s.warning_title.clone()),
            )
            .child(
                div()
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_muted)
                    .child(s.warning_reminder.clone()),
            )
            .child(
                div()
                    .text_size(theme::text_label())
                    .text_color(theme.fg_subtle)
                    .child(fixtures::receive_networks_line(s)),
            );

        div()
            .flex()
            .flex_col()
            .gap(px(14.))
            .child(picker)
            .child(qr_placeholder(theme, s.qr_caption.clone(), px(220.)))
            .child(
                div()
                    .text_size(theme::text_label())
                    .font_weight(gpui::FontWeight::MEDIUM)
                    .text_color(theme.fg_subtle)
                    .child(s.address_label.clone()),
            )
            .child(address_box)
            .child(copy)
            .child(warning)
    }

    fn asset_detail_body(&mut self, theme: &Theme) -> Div {
        let s = &self.strings;

        let head = div()
            .flex()
            .items_center()
            .gap(px(12.))
            .child(token_icon(theme, "BNB", fixtures::chain_bnb()))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(2.))
                    .child(
                        div()
                            .text_size(theme::text_panel_title())
                            .font_weight(gpui::FontWeight::BOLD)
                            .text_color(theme.fg_base)
                            .child("0.8533 BNB"),
                    )
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_muted)
                            .child("$496.46 · BNB Chain"),
                    ),
            );

        let buttons = div()
            .flex()
            .gap(px(12.))
            .child(action_pill(
                "detail-send",
                theme,
                &mut self.icons,
                Icon::ArrowUpRight,
                s.detail_send.clone(),
            ))
            .child(action_pill(
                "detail-receive",
                theme,
                &mut self.icons,
                Icon::ArrowDownLeft,
                s.detail_receive.clone(),
            ));

        let mut facts = div().flex().flex_col();
        for (i, (label, value)) in fixtures::bnb_facts(s).into_iter().enumerate() {
            let mut row = div()
                .flex()
                .items_center()
                .justify_between()
                .py(px(12.))
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_muted)
                        .child(label),
                )
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .font_weight(gpui::FontWeight::MEDIUM)
                        .text_color(theme.fg_base)
                        .child(value),
                );
            if i > 0 {
                row = row.border_t_1().border_color(theme.divider);
            }
            facts = facts.child(row);
        }

        let explorer = div()
            .flex()
            .items_center()
            .gap(px(4.))
            .text_size(theme::text_row_sub())
            .text_color(theme.fg_muted)
            .child(s.view_on_explorer.clone())
            .child(crate::wallet::components::chevron_icon(
                theme,
                &mut self.icons,
            ));

        let mut tx = div().flex().flex_col().child(
            div()
                .pt(px(8.))
                .text_size(theme::text_row_title())
                .font_weight(gpui::FontWeight::BOLD)
                .text_color(theme.fg_base)
                .child(s.label_transactions.clone()),
        );
        for row in fixtures::bnb_activity(s) {
            tx = tx.child(activity_row(theme, &mut self.icons, &row));
        }

        div()
            .flex()
            .flex_col()
            .gap(px(16.))
            .child(head)
            .child(buttons)
            .child(facts)
            .child(explorer)
            .child(tx)
    }

    // -- gallery chrome ------------------------------------------------------

    fn chip(
        &self,
        id: impl Into<ElementId>,
        theme: &Theme,
        label: SharedString,
        active: bool,
    ) -> Stateful<Div> {
        let chip = div()
            .id(id)
            .h(px(28.))
            .px(px(12.))
            .rounded(px(14.))
            .flex()
            .items_center()
            .cursor_pointer()
            .text_size(theme::text_row_sub())
            .border_1()
            .child(label);
        if active {
            chip.bg(theme.accent)
                .border_color(theme.accent)
                .text_color(theme.fg_inverse)
        } else {
            chip.bg(theme.bg_raised)
                .border_color(theme.border_card)
                .text_color(theme.fg_muted)
                .hover(|el| el.bg(theme.bg_sunken))
        }
    }

    fn gallery_bar(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let tabs = [
            (GalleryTab::D1, "D1"),
            (GalleryTab::D2, "D2"),
            (GalleryTab::D3, "D3"),
            (GalleryTab::Components, "Components"),
            (GalleryTab::Identicons, "Identicons"),
        ];
        let mut bar = div()
            .flex()
            .items_center()
            .gap(px(8.))
            .px(px(16.))
            .py(px(8.))
            .bg(theme.bg_base)
            .border_b_1()
            .border_color(theme.divider)
            // Clear the traffic lights on macOS.
            .pl(px(84.));
        for (i, (tab, label)) in tabs.into_iter().enumerate() {
            let active = self.tab == tab;
            bar = bar.child(
                self.chip(ElementId::from(("tab", i)), theme, label.into(), active)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.tab = tab;
                        this.panel = match tab {
                            GalleryTab::D2 => PanelId::Receive,
                            GalleryTab::D3 => PanelId::AssetDetail,
                            _ => PanelId::None,
                        };
                        cx.notify();
                    })),
            );
        }
        let mode_label: SharedString = match self.theme_mode() {
            ThemeMode::Light => "light".into(),
            ThemeMode::Dark => "dark".into(),
        };
        bar.child(div().flex_1()).child(
            self.chip("toggle-theme", theme, mode_label, false)
                .on_click(cx.listener(|this, _, _, cx| {
                    this.override_mode = Some(match this.theme_mode() {
                        ThemeMode::Light => ThemeMode::Dark,
                        ThemeMode::Dark => ThemeMode::Light,
                    });
                    cx.notify();
                })),
        )
    }

    fn board(theme: &Theme, title: &str, body: Div) -> Div {
        div()
            .w(px(560.))
            .p(px(16.))
            .rounded(px(12.))
            .bg(theme.bg_base)
            .border_1()
            .border_color(theme.divider)
            .flex()
            .flex_col()
            .gap(px(10.))
            .child(
                div()
                    .text_size(theme::text_label())
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .text_color(theme.fg_subtle)
                    .child(SharedString::from(title.to_owned())),
            )
            .child(body)
    }

    fn components_tab(&mut self, theme: &Theme) -> Stateful<Div> {
        let s_clone = fixtures::balance_variants(&self.strings);
        let mut balances = div().flex().flex_col().gap(px(16.));
        for model in &s_clone {
            balances = balances.child(balance_display(theme, &mut self.icons, model));
        }

        let mut rows = div().flex().flex_col();
        for row in fixtures::activity_default(&self.strings) {
            rows = rows.child(activity_row(theme, &mut self.icons, &row));
        }
        for row in fixtures::activity_masked(&self.strings) {
            rows = rows.child(activity_row(theme, &mut self.icons, &row));
        }

        let mut assets = div().flex().flex_col();
        for (i, row) in fixtures::assets_variants(&self.strings).iter().enumerate() {
            assets = assets.child(asset_row(
                ElementId::from(("board-asset", i)),
                theme,
                &mut self.icons,
                row,
            ));
        }

        let mut chains_col = div().flex().flex_col().gap(px(2.));
        for (i, row) in fixtures::chains(&self.strings).iter().enumerate() {
            chains_col = chains_col.child(chain_row(
                ElementId::from(("board-chain", i)),
                theme,
                &mut self.icons,
                row,
            ));
        }

        let empties = div()
            .flex()
            .gap(px(16.))
            .child(empty_state(
                theme,
                &mut self.icons,
                Icon::Inbox,
                self.strings.empty_activity_title.clone(),
                self.strings.empty_activity_caption.clone(),
            ))
            .child(empty_state(
                theme,
                &mut self.icons,
                Icon::WalletOutline,
                self.strings.empty_assets_title.clone(),
                self.strings.empty_assets_caption.clone(),
            ));

        let skeletons = div()
            .flex()
            .flex_col()
            .child(skeleton_row(theme))
            .child(skeleton_row(theme));

        let qr = qr_placeholder(theme, self.strings.qr_caption.clone(), px(160.));

        div()
            .id("components-scroll")
            .flex_1()
            .min_h(px(0.))
            .overflow_y_scroll()
            .p(px(24.))
            .bg(theme.bg_sunken)
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(16.))
                    .child(Self::board(theme, "BalanceDisplay", balances))
                    .child(Self::board(theme, "ActivityRow", rows))
                    .child(Self::board(theme, "AssetRow", assets))
                    .child(Self::board(theme, "ChainFilterList", chains_col))
                    .child(Self::board(theme, "EmptyState", empties))
                    .child(Self::board(theme, "SkeletonRow", skeletons))
                    .child(Self::board(theme, "QRPlaceholder", qr)),
            )
    }

    fn identicons_tab(&mut self, theme: &Theme) -> Stateful<Div> {
        let mut wrap = div().flex().flex_wrap().gap(px(24.));
        for seed in IDENTICON_BOARD_SEEDS {
            let caption: SharedString = if seed.is_empty() {
                "(empty)".into()
            } else {
                seed.into()
            };
            wrap = wrap.child(
                div()
                    .w(px(160.))
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(8.))
                    .child(identicon_avatar(&mut self.identicons, seed, 56.))
                    .child(
                        div()
                            .font_family(theme::font_mono())
                            .text_size(theme::text_label())
                            .text_color(theme.fg_subtle)
                            .whitespace_nowrap()
                            .truncate()
                            .w_full()
                            .text_center()
                            .child(caption),
                    ),
            );
        }
        div()
            .id("identicons-scroll")
            .flex_1()
            .min_h(px(0.))
            .overflow_y_scroll()
            .p(px(24.))
            .bg(theme.bg_sunken)
            .child(wrap)
    }

    fn wallet_columns(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let mut columns = div()
            .flex_1()
            .min_h(px(0.))
            .flex()
            .child(self.sidebar(theme, cx))
            .child(self.content(theme, cx));
        columns = match self.panel {
            PanelId::None => columns,
            PanelId::Receive => {
                let body = self.receive_body(theme);
                let title = self.strings.receive_title.clone();
                columns.child(self.panel_scaffold(theme, title, body, cx))
            }
            PanelId::AssetDetail => {
                let body = self.asset_detail_body(theme);
                columns.child(self.panel_scaffold(theme, "BNB".into(), body, cx))
            }
        };
        columns
    }
}

impl Render for WalletPage {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = Theme::of(self.theme_mode());

        let body = if self.gallery {
            let bar = self.gallery_bar(&theme, cx);
            let content: gpui::AnyElement = match self.tab {
                GalleryTab::Components => self.components_tab(&theme).into_any_element(),
                GalleryTab::Identicons => self.identicons_tab(&theme).into_any_element(),
                _ => self.wallet_columns(&theme, cx).into_any_element(),
            };
            div()
                .size_full()
                .flex()
                .flex_col()
                .child(bar)
                .child(content)
        } else {
            div()
                .size_full()
                .flex()
                .flex_col()
                .child(self.wallet_columns(&theme, cx))
        };

        let root = div()
            .size_full()
            .bg(theme.bg_base)
            .text_color(theme.fg_base)
            .child(body)
            .track_focus(&self.focus_handle)
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                let ks = &event.keystroke;
                if ks.key == "escape" && this.panel != PanelId::None {
                    this.panel = PanelId::None;
                    cx.notify();
                }
                if ks.key == "f11" {
                    window.toggle_fullscreen();
                }
            }));

        window_frame(root, &theme, window)
    }
}
