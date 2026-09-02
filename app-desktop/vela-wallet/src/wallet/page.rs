//! The wallet page entity (spec 015 US2): sidebar + content + closable third
//! column, plus the gallery chrome that exposes every state (FR-004).
//!
//! One entity serves both `VELA_PAGE=wallet` (D1 default, panels open on
//! interaction) and `VELA_PAGE=gallery` (adds the state-switcher strip,
//! component boards and the identicon board).
//!
//! Spec 018 reuses this shell for 通讯录 rather than building a second page:
//! the sidebar, third column, Esc handling and gallery chrome already exist,
//! so contacts is a `Section` switch on the content column (research.md D1).

use gpui::prelude::FluentBuilder as _;
use gpui::{
    Anchor, Context, Div, ElementId, FocusHandle, InteractiveElement as _, IntoElement,
    KeyDownEvent, MouseButton, MouseDownEvent, ParentElement, Pixels, Point, Render, SharedString,
    Stateful, StatefulInteractiveElement as _, Styled, Window, anchored, deferred, div, point, px,
};

use crate::contacts::ContactsStrings;
use crate::contacts::components::{
    RailState, accent_button, add_chip, address_block, contact_row, destructive_text_button,
    empty_state_cta, ghost_add_row, group_chip, icon_button, menu_card, outline_button, rail_label,
    rail_row, row_divider, search_field, section_letter, text_action,
};
use crate::contacts::fixtures as contacts_fixtures;
use crate::icons::{Icon, IconCache};
use crate::identicon::IdenticonCache;
use crate::loc::Loc;
use crate::session;
use crate::settings::SettingsStrings;
use crate::settings::components::{
    CalloutTone, callout, chain_mark, check_list, danger_card, dropdown_menu, dropdown_trigger,
    form_row, key_value_row, network_row, rpc_banner, segmented, settings_nav_row, status_pill,
    storage_bar, storage_group, text_scale, url_field,
};
use crate::settings::fixtures::{self as settings_fixtures, SettingsPage, Tone, latency, pill};
use crate::theme::{
    self, CONTACTS_BODY_PAD_TOP, CONTACTS_BUTTON_H, CONTACTS_HEADER_H, CONTACTS_HERO_AVATAR,
    CONTACTS_RAIL_LABEL_H, CONTACTS_RAIL_ROW_H, CONTACTS_RAIL_W, GALLERY_BAR_H, SETTINGS_DIALOG_W,
    SETTINGS_NAV_W, SETTINGS_PANEL_PAD_X, SETTINGS_PANEL_W, SIDEBAR_PAD, SIDEBAR_TOP, SIDEBAR_W,
    THIRD_PANEL_W, Theme, ThemeMode, WALLET_PAD_TOP, WALLET_PAD_X,
};
use crate::window_frame::{
    CAPTION_H, frame_tiling, owns_titlebar, round_to_frame, titlebar, window_frame,
};

use super::WalletStrings;
use super::components::{
    action_pill, activity_row, asset_row, balance_display, chain_row, empty_state, icon_img,
    identicon_avatar, nav_row, qr_placeholder, section_header, sidebar_search, skeleton_row,
    token_icon, wallet_header,
};
use super::fixtures::{self, ADDRESS_FULL, IDENTICON_BOARD_SEEDS, WALLET_NAME};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PanelId {
    None,
    Receive,
    AssetDetail,
    /// Spec 018 DC2 — the contacts third-column content.
    ContactDetail,
}

/// What the contacts header row adds on top so its search field, buttons and
/// ⋯ start below the drag strip. The row is centred inside
/// `CONTACTS_HEADER_H`, so padding moves the group by only half — 16 buys the
/// ~7px of clearance the 34px strip needs, with a little room to spare.
const CONTACTS_HEADER_CAPTION_PAD: f32 = 16.;

/// What the gallery chip strip adds on top for the same reason. It is not
/// centred, so this is the clearance itself, less the 8 the bar already had.
fn gallery_bar_caption_pad(caption: bool) -> f32 {
    if caption { CAPTION_H + 4. - 8. } else { 0. }
}

/// Which destination the content column renders. The sidebar's selected nav
/// row derives from this (spec 018 research.md D1).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Section {
    Wallet,
    Contacts,
    /// Spec 023: the settings section — a second-level nav plus one panel,
    /// hosted in the same three-column shell contacts already reuses.
    Settings,
}

/// The two anchored menus DC5/DC6 define. Both render through one
/// `menu_card` — the difference is which fixture feeds it and where it hangs.
/// The two centred dialogs the settings section can raise (spec 023).
///
/// The desktop SPEC's rule is that every phone 弹框 becomes either a section of
/// the panel it belongs to or a centred dialog. The account switcher took the
/// first road — it IS the 账户 panel — and these two took the second.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum SettingsDialog {
    /// DST4b — search a chain, check it, add it.
    AddNetwork,
    /// DSR1 — one network's RPC is down and this is where it gets fixed.
    FixRpc,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum ContactsMenu {
    /// Header ⋯ dropdown, right-aligned under the button (DC5 / M1).
    Header,
    /// Group-row context menu, top-left at the cursor (DC6 / M2).
    Group,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum GalleryTab {
    D1,
    D2,
    D3,
    Dc1,
    Dc2,
    Dc3,
    Dc4,
    Dc5,
    Dc6,
    // spec 023 — one chip per settings mock.
    Dst1,
    Dst2,
    Dst3,
    Dst4,
    Dst4b,
    Dst5,
    Dst6,
    Dst7,
    Dst8,
    Dsr1,
    Components,
    ContactsComponents,
    Identicons,
}

impl GalleryTab {
    /// The chip strip, in order. One array so the bar and the inventory test
    /// can never disagree about which states the gallery exposes.
    const ALL: [(GalleryTab, &'static str); 22] = [
        (GalleryTab::D1, "D1"),
        (GalleryTab::D2, "D2"),
        (GalleryTab::D3, "D3"),
        (GalleryTab::Dc1, "DC1"),
        (GalleryTab::Dc2, "DC2"),
        (GalleryTab::Dc3, "DC3"),
        (GalleryTab::Dc4, "DC4"),
        (GalleryTab::Dc5, "DC5"),
        (GalleryTab::Dc6, "DC6"),
        (GalleryTab::Dst1, "DST1"),
        (GalleryTab::Dst2, "DST2"),
        (GalleryTab::Dst3, "DST3"),
        (GalleryTab::Dst4, "DST4"),
        (GalleryTab::Dst4b, "DST4b"),
        (GalleryTab::Dst5, "DST5"),
        (GalleryTab::Dst6, "DST6"),
        (GalleryTab::Dst7, "DST7"),
        (GalleryTab::Dst8, "DST8"),
        (GalleryTab::Dsr1, "DSR1"),
        (GalleryTab::Components, "Components"),
        (GalleryTab::ContactsComponents, "Contacts"),
        (GalleryTab::Identicons, "Identicons"),
    ];

    /// The contacts state code this chip reproduces, if any
    /// (data-model.md §Screen states — `dc1`…`dc6`).
    /// The chip `VELA_SETTINGS_STATE` names, if it names one.
    fn from_settings_env() -> Option<GalleryTab> {
        let want = std::env::var("VELA_SETTINGS_STATE").ok()?;
        GalleryTab::ALL
            .into_iter()
            .find_map(|(tab, _)| (tab.settings_state()? == want).then_some(tab))
    }

    /// The settings state code this chip reproduces, if any (spec 023).
    fn settings_state(self) -> Option<&'static str> {
        match self {
            GalleryTab::Dst1 => Some("dst1"),
            GalleryTab::Dst2 => Some("dst2"),
            GalleryTab::Dst3 => Some("dst3"),
            GalleryTab::Dst4 => Some("dst4"),
            GalleryTab::Dst4b => Some("dst4b"),
            GalleryTab::Dst5 => Some("dst5"),
            GalleryTab::Dst6 => Some("dst6"),
            GalleryTab::Dst7 => Some("dst7"),
            GalleryTab::Dst8 => Some("dst8"),
            GalleryTab::Dsr1 => Some("dsr1"),
            _ => None,
        }
    }

    #[allow(dead_code, reason = "gallery inventory contract, asserted by tests")]
    fn contacts_state(self) -> Option<&'static str> {
        match self {
            GalleryTab::Dc1 => Some("dc1"),
            GalleryTab::Dc2 => Some("dc2"),
            GalleryTab::Dc3 => Some("dc3"),
            GalleryTab::Dc4 => Some("dc4"),
            GalleryTab::Dc5 => Some("dc5"),
            GalleryTab::Dc6 => Some("dc6"),
            _ => None,
        }
    }
}

pub struct WalletPage {
    mode: ThemeMode,
    /// Gallery-only appearance override (the VELA_THEME pin still wins at
    /// detect time; this cycles on top for quick eyeballing).
    override_mode: Option<ThemeMode>,
    strings: WalletStrings,
    contacts: ContactsStrings,
    settings: SettingsStrings,
    section: Section,
    /// Which settings panel the second-level nav is showing (spec 023).
    settings_page: SettingsPage,
    /// The centred dialog over the settings section, when one is open.
    settings_dialog: Option<SettingsDialog>,
    /// Which network row DST4 has expanded in place, if any.
    settings_expanded_network: Option<&'static str>,
    /// Which localization dropdown is open (DST3), by form-row id.
    settings_open_dropdown: Option<&'static str>,
    panel: PanelId,
    /// `None` = 全部联系人; `Some(i)` = the group view for `GROUPS[i]` (DC4).
    group: Option<usize>,
    /// Which contact the third column shows (index into the canon roster).
    contact: usize,
    /// DC3: the fixture roster is empty.
    contacts_empty: bool,
    /// Open anchored menu: which fixture feeds it, the window-coordinate
    /// anchor point, and which of the card's corners sits on that point.
    menu: Option<(ContactsMenu, Point<Pixels>, Anchor)>,
    tab: GalleryTab,
    gallery: bool,
    /// The signed-in account, when there is one.
    ///
    /// `None` means the fixture identity — the design page opened directly with
    /// `VELA_PAGE=wallet`, which is how spec 015's states are reviewed. A real
    /// session replaces the identity and NOTHING else: balances, activity and
    /// networks are still fixtures, and pretending otherwise by hiding them
    /// would make a signed-in wallet look emptier than a fixture one rather
    /// than more honest.
    identity: Option<Identity>,
    icons: IconCache,
    identicons: IdenticonCache,
    focus_handle: FocusHandle,
}

/// The account the header and the receive panel name.
#[derive(Clone, Debug)]
pub struct Identity {
    pub name: SharedString,
    pub address: String,
}

impl Identity {
    /// `0x14fB1f…D1eA5c` — the same middle-truncation every other client uses.
    fn display(&self) -> SharedString {
        let address = &self.address;
        if address.len() <= 14 {
            return SharedString::from(address.clone());
        }
        SharedString::from(format!(
            "{}…{}",
            &address[..8],
            &address[address.len() - 6..]
        ))
    }
}

impl WalletPage {
    pub fn new(gallery: bool, window: &mut Window, cx: &mut Context<Self>) -> Self {
        Self::with_section(Section::Wallet, gallery, window, cx)
    }

    /// The wallet as a signed-in person sees it.
    pub fn signed_in(identity: Identity, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut page = Self::with_section(Section::Wallet, false, window, cx);
        page.identity = Some(identity);
        page
    }

    /// What the header, the receive panel and the identicon are drawn from.
    fn identity(&self) -> Identity {
        self.identity.clone().unwrap_or_else(|| Identity {
            name: WALLET_NAME.into(),
            address: ADDRESS_FULL.to_owned(),
        })
    }

    /// `VELA_PAGE=settings` opens straight onto 设置 (spec 023).
    ///
    /// `VELA_SETTINGS_STATE=dst7` picks WHICH panel, the same env-pin family as
    /// `VELA_PAGE`/`VELA_THEME`/`VELA_LANG` and the same seam iOS has. Without
    /// it a screenshot pass can only ever see DST1 — which is how a
    /// left-alignment bug survived review on seven panels it also broke.
    pub fn settings(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut page = Self::with_section(Section::Settings, false, window, cx);
        if let Some(tab) = GalleryTab::from_settings_env() {
            page.select_tab(tab, window);
        }
        page
    }

    /// `VELA_PAGE=contacts` opens straight onto 通讯录 (spec 018 research D1).
    pub fn contacts(window: &mut Window, cx: &mut Context<Self>) -> Self {
        Self::with_section(Section::Contacts, false, window, cx)
    }

    fn with_section(
        section: Section,
        gallery: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let loc = Loc::from_env();
        eprintln!(
            "[vela-wallet] wallet: locale `{}`, gallery {gallery}, section {section:?}",
            loc.language()
        );
        let strings = WalletStrings::resolve(&loc);
        let contacts = ContactsStrings::resolve(&loc);
        let settings = SettingsStrings::resolve(&loc);

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
            contacts,
            settings,
            section,
            settings_page: SettingsPage::Account,
            settings_dialog: None,
            settings_expanded_network: None,
            settings_open_dropdown: None,
            panel: PanelId::None,
            group: None,
            contact: 0,
            contacts_empty: false,
            menu: None,
            tab: match section {
                Section::Wallet => GalleryTab::D1,
                Section::Contacts => GalleryTab::Dc1,
                Section::Settings => GalleryTab::Dst1,
            },
            gallery,
            identity: None,
            icons: IconCache::default(),
            identicons: IdenticonCache::default(),
            focus_handle,
        }
    }

    /// The way out.
    ///
    /// Session state is app-resident and `allowed_route` decides the screen, so
    /// without this row a signed-in desktop has no path back to Welcome at all
    /// — the route guard is a one-way door. It renders only for a REAL session:
    /// the fixture identity (`VELA_PAGE=wallet`) is a design surface with no
    /// session behind it, and offering to sign out of nothing would be a button
    /// that cannot work.
    fn sign_out_row(&self, theme: &Theme, cx: &mut Context<Self>) -> gpui::AnyElement {
        if self.identity.is_none() {
            return div().into_any_element();
        }
        let hover = theme.bg_sunken;
        div()
            .id("sign-out")
            .mt(px(4.))
            .px(px(12.))
            .py(px(8.))
            .rounded(px(8.))
            .flex_none()
            .cursor_pointer()
            .text_size(theme::text_row_sub())
            .text_color(theme.fg_muted)
            .hover(move |style| style.bg(hover).text_color(theme.error_base))
            .on_click(cx.listener(|_, _, _, cx| session::sign_out(cx)))
            .child(self.strings.sign_out_button.clone())
            .into_any_element()
    }

    /// The confirmation the core opens, with the warning it decided on.
    ///
    /// `pending_upload_warning` is not this screen's judgement: the session
    /// machine asks storage whether any public key never reached the registry
    /// and puts the answer here. A key in that state is one this wallet may not
    /// be able to sign in with from anywhere else yet, which is the one fact
    /// that should give someone pause — so the dialog does not open until the
    /// core has the answer.
    fn sign_out_dialog(&self, theme: &Theme, cx: &mut Context<Self>) -> Option<gpui::AnyElement> {
        let view = session::view(cx);
        let dialog = view.sign_out?;
        let s = &self.strings;

        let mut card = div()
            .w(px(400.))
            .flex()
            .flex_col()
            .gap(px(16.))
            .p(px(28.))
            .rounded(px(20.))
            .bg(theme.bg_raised)
            .border_1()
            .border_color(theme.border_card)
            .child(
                div()
                    .text_size(theme::text_panel_title())
                    .font_weight(gpui::FontWeight::BOLD)
                    .text_color(theme.fg_base)
                    .child(s.sign_out_title.clone()),
            )
            .child(
                div()
                    .text_size(theme::text_row_sub())
                    .line_height(px(20.))
                    .text_color(theme.fg_muted)
                    .child(s.sign_out_keeps.clone()),
            );

        if dialog.pending_upload_warning {
            card = card.child(
                div()
                    .p(px(12.))
                    .rounded(px(10.))
                    .bg(theme.warning_soft)
                    .text_size(theme::text_row_sub())
                    .line_height(px(20.))
                    .text_color(theme.fg_base)
                    .child(s.sign_out_warning.clone()),
            );
        }

        // The destructive label changes with the warning, as the shipping
        // client does: "Sign Out Anyway" is the acknowledgement.
        let confirm_label = if dialog.pending_upload_warning {
            s.sign_out_anyway.clone()
        } else {
            s.sign_out_title.clone()
        };
        let hover_confirm = theme.error_base;
        let hover_cancel = theme.bg_sunken;
        card = card.child(
            div()
                .flex()
                .flex_col()
                .gap(px(8.))
                .child(
                    div()
                        .id("sign-out-confirm")
                        .h(px(44.))
                        .rounded(px(12.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .bg(theme.error_soft)
                        .text_size(theme::text_row_title())
                        .text_color(theme.error_base)
                        .hover(move |style| style.bg(hover_confirm).text_color(theme.fg_inverse))
                        .on_click(cx.listener(|_, _, _, cx| session::sign_out_confirmed(cx)))
                        .child(confirm_label),
                )
                .child(
                    div()
                        .id("sign-out-cancel")
                        .h(px(44.))
                        .rounded(px(12.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .cursor_pointer()
                        .text_size(theme::text_row_title())
                        .text_color(theme.fg_base)
                        .hover(move |style| style.bg(hover_cancel))
                        .on_click(cx.listener(|_, _, _, cx| session::sign_out_dismissed(cx)))
                        .child(s.sign_out_cancel.clone()),
                ),
        );

        Some(
            div()
                .id("sign-out-scrim")
                .absolute()
                .inset_0()
                .flex()
                .items_center()
                .justify_center()
                .bg(theme.bg_base.opacity(0.55))
                .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .child(card)
                .into_any_element(),
        )
    }

    fn theme_mode(&self) -> ThemeMode {
        self.override_mode.unwrap_or(self.mode)
    }

    // -- column 1: sidebar ---------------------------------------------------

    fn sidebar(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let s = &self.strings;
        let bg = match self.theme_mode() {
            ThemeMode::Light => theme.bg_sunken,
            ThemeMode::Dark => theme.bg_base,
        };

        let section = self.section;
        let nav = [
            (Icon::NavWallet, s.nav_wallet.clone(), Some(Section::Wallet)),
            (
                Icon::NavContacts,
                s.nav_contacts.clone(),
                Some(Section::Contacts),
            ),
            (Icon::NavExplore, s.nav_explore.clone(), None),
            (
                Icon::NavSettings,
                s.nav_settings.clone(),
                Some(Section::Settings),
            ),
        ];
        let mut nav_col = div().flex().flex_col().gap(px(2.));
        for (i, (icon, label, destination)) in nav.into_iter().enumerate() {
            let row = nav_row(
                ElementId::from(("nav", i)),
                theme,
                &mut self.icons,
                icon,
                label,
                destination == Some(section),
            );
            nav_col = nav_col.child(match destination {
                Some(destination) => row.on_click(cx.listener(move |this, _, _, cx| {
                    this.section = destination;
                    this.panel = PanelId::None;
                    this.menu = None;
                    cx.notify();
                })),
                None => row,
            });
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
            .child({
                let identity = self.identity();
                wallet_header(
                    theme,
                    &mut self.icons,
                    &mut self.identicons,
                    &identity.address,
                    identity.name.clone(),
                    identity.display(),
                )
            })
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
            .child(self.sign_out_row(theme, cx))
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
            .child(section_header(theme, &mut self.icons, s_activity, s_all))
            .child(activity_col)
            .child(section_header(theme, &mut self.icons, s_assets, s_add))
            .child(assets_col)
    }

    // -- column 2 (contacts): header + group rail + sectioned list -----------

    /// Window-space top of the contacts content column: the gallery chip strip
    /// pushes everything down when it is on screen, and the strip is itself
    /// pushed down by the caption row where the page draws one.
    fn contacts_top(&self, window: &Window) -> f32 {
        if self.gallery {
            GALLERY_BAR_H + gallery_bar_caption_pad(owns_titlebar(window))
        } else {
            0.
        }
    }

    /// Where DC5's dropdown hangs when the gallery chip (rather than a click)
    /// opens it: right-aligned under the header hairline, as in the mock.
    fn header_menu_anchor(&self, window: &Window) -> Point<Pixels> {
        point(
            window.viewport_size().width - px(WALLET_PAD_X),
            px(self.contacts_top(window) + CONTACTS_HEADER_H),
        )
    }

    /// Where DC4's group-header ⋯ hangs: right-aligned under that button, one
    /// control height below the top of the content body.
    fn group_header_menu_anchor(&self, window: &Window) -> Point<Pixels> {
        point(
            window.viewport_size().width - px(WALLET_PAD_X),
            px(self.contacts_top(window)
                + CONTACTS_HEADER_H
                + CONTACTS_BODY_PAD_TOP
                + CONTACTS_BUTTON_H),
        )
    }

    /// Where DC6's context menu hangs when the gallery chip opens it: the
    /// trailing edge of the 家人 rail row, which is where a right-click on that
    /// row lands. The interactive path uses the real cursor position instead.
    fn group_menu_anchor(&self, window: &Window) -> Point<Pixels> {
        point(
            px(SIDEBAR_W + WALLET_PAD_X + CONTACTS_RAIL_W),
            px(self.contacts_top(window)
                + CONTACTS_HEADER_H
                + CONTACTS_BODY_PAD_TOP
                + CONTACTS_RAIL_ROW_H
                + CONTACTS_RAIL_LABEL_H
                + CONTACTS_RAIL_ROW_H),
        )
    }

    fn contacts_header(&mut self, theme: &Theme, caption: bool, cx: &mut Context<Self>) -> Div {
        let title = self.contacts.title.clone();
        let placeholder = self.contacts.search_placeholder.clone();
        let add = self.contacts.add_contact.clone();

        // The DC1 hairline is inset to the content column's padding, not bled
        // to the sidebar edge — so it is a sibling row, not a bottom border.
        //
        // The row is centred in `CONTACTS_HEADER_H`, which puts the search
        // field's top edge a few pixels inside the drag strip where the page
        // draws its own caption. Padding the row pushes the whole centred
        // group clear of it; the header's own height is unchanged, so the
        // hairline — and every menu anchor hung off it — stays put.
        let row = div()
            .flex_1()
            .flex()
            .items_center()
            .gap(px(16.))
            .px(px(WALLET_PAD_X))
            .when(caption, |el| el.pt(px(CONTACTS_HEADER_CAPTION_PAD)))
            .child(
                div()
                    .text_size(theme::text_panel_title())
                    .font_weight(gpui::FontWeight::BOLD)
                    .text_color(theme.fg_base)
                    .child(title),
            )
            .child(div().flex_1().min_w(px(0.)))
            .child(search_field(theme, &mut self.icons, placeholder))
            .child(outline_button(
                "contacts-add",
                theme,
                &mut self.icons,
                Some(Icon::UserRoundPlus),
                add,
            ))
            .child(
                icon_button("contacts-more", theme, &mut self.icons, Icon::Ellipsis).on_click(
                    cx.listener(|this, _, window, cx| {
                        this.menu = Some((
                            ContactsMenu::Header,
                            this.header_menu_anchor(window),
                            Anchor::TopRight,
                        ));
                        cx.notify();
                    }),
                ),
            );

        div()
            .flex_none()
            .h(px(CONTACTS_HEADER_H))
            .flex()
            .flex_col()
            .child(row)
            .child(
                div()
                    .mx(px(WALLET_PAD_X))
                    .h(px(1.))
                    .flex_none()
                    .bg(theme.divider),
            )
    }

    fn contacts_rail(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let all = self.contacts.all_contacts.clone();
        let groups_label = self.contacts.section_groups.clone();
        let new_group = self.contacts.group_new.clone();
        let total = if self.contacts_empty {
            0
        } else {
            contacts_fixtures::TOTAL_CONTACTS
        };
        let selected_group = self.group;
        let empty = self.contacts_empty;

        let mut rail = div()
            .w(px(CONTACTS_RAIL_W))
            .flex_none()
            .flex()
            .flex_col()
            .gap(px(2.))
            .child(
                rail_row(
                    "rail-all",
                    theme,
                    &mut self.icons,
                    None,
                    all,
                    Some(total),
                    if selected_group.is_none() {
                        RailState::Selected
                    } else {
                        RailState::Default
                    },
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    this.group = None;
                    this.menu = None;
                    cx.notify();
                })),
            );

        if !empty {
            rail = rail.child(rail_label(theme, groups_label));
            for (i, group) in contacts_fixtures::GROUPS.iter().enumerate() {
                rail = rail.child(
                    rail_row(
                        ElementId::from(("rail-group", i)),
                        theme,
                        &mut self.icons,
                        Some(Icon::UsersRound),
                        SharedString::from(group.name),
                        Some(group.count),
                        if selected_group == Some(i) {
                            RailState::Selected
                        } else {
                            RailState::Default
                        },
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.group = Some(i);
                        this.menu = None;
                        cx.notify();
                    }))
                    .on_mouse_down(
                        MouseButton::Right,
                        cx.listener(move |this, event: &MouseDownEvent, _, cx| {
                            this.group = Some(i);
                            this.menu =
                                Some((ContactsMenu::Group, event.position, Anchor::TopLeft));
                            cx.notify();
                        }),
                    ),
                );
            }
        }

        rail.child(rail_row(
            "rail-new-group",
            theme,
            &mut self.icons,
            Some(Icon::FolderPlus),
            new_group,
            None,
            RailState::Default,
        ))
    }

    /// DC1: the A–Z sectioned roster.
    fn contacts_list(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Stateful<Div> {
        let selected = match self.panel {
            PanelId::ContactDetail => Some(self.contact),
            _ => None,
        };
        let mut list = div()
            .id("contacts-list")
            .flex_1()
            .min_w(px(0.))
            .min_h(px(0.))
            .overflow_y_scroll()
            .flex()
            .flex_col();

        let mut index = 0usize;
        for (letter, rows) in contacts_fixtures::sections() {
            list = list.child(section_letter(theme, letter));
            let last = rows.len() - 1;
            for (i, contact) in rows.iter().enumerate() {
                let at = index;
                list = list.child(
                    contact_row(
                        ElementId::from(("contact", at)),
                        theme,
                        &mut self.identicons,
                        contact,
                        selected == Some(at),
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.contact = at;
                        this.panel = PanelId::ContactDetail;
                        this.menu = None;
                        cx.notify();
                    })),
                );
                if i != last {
                    list = list.child(row_divider(theme));
                }
                index += 1;
            }
        }
        list
    }

    /// DC4: the group view — header with the accent 群发转账, member rows, the
    /// ghost 添加成员 row and the caption line.
    fn contacts_group_view(&mut self, theme: &Theme, group: usize, cx: &mut Context<Self>) -> Div {
        let fixture = contacts_fixtures::GROUPS[group];
        let members = contacts_fixtures::group_members(group);
        let members_label = contacts_fixtures::members_count_label(&self.contacts, fixture.count);
        let caption = contacts_fixtures::batch_send_caption(&self.contacts, fixture.count);
        let batch_send = self.contacts.batch_send.clone();
        let add_member = self.contacts.add_member.clone();

        let header = div()
            .flex()
            .items_center()
            .gap(px(12.))
            .pb(px(12.))
            .child(
                div()
                    .text_size(theme::text_section())
                    .font_weight(gpui::FontWeight::BOLD)
                    .text_color(theme.fg_base)
                    .child(SharedString::from(fixture.name)),
            )
            .child(
                div()
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_muted)
                    .child(members_label),
            )
            .child(div().flex_1().min_w(px(0.)))
            .child(accent_button(
                "group-batch-send",
                theme,
                &mut self.icons,
                None,
                batch_send,
            ))
            .child(
                icon_button("group-more", theme, &mut self.icons, Icon::Ellipsis).on_click(
                    cx.listener(|this, _, window, cx| {
                        this.menu = Some((
                            ContactsMenu::Group,
                            this.group_header_menu_anchor(window),
                            Anchor::TopRight,
                        ));
                        cx.notify();
                    }),
                ),
            );

        let mut column = div().flex_1().min_w(px(0.)).flex().flex_col().child(header);
        let last = members.len().saturating_sub(1);
        for (i, member) in members.iter().enumerate() {
            column = column.child(contact_row(
                ElementId::from(("member", i)),
                theme,
                &mut self.identicons,
                member,
                false,
            ));
            if i != last {
                column = column.child(row_divider(theme));
            }
        }
        column
            .child(row_divider(theme))
            .child(ghost_add_row(
                "group-add-member",
                theme,
                &mut self.icons,
                add_member,
            ))
            .child(
                div()
                    .pt(px(12.))
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_muted)
                    .child(caption),
            )
    }

    /// DC3: the centred empty state with both CTAs.
    fn contacts_empty_view(&mut self, theme: &Theme) -> Div {
        let title = self.contacts.empty.clone();
        let caption = self.contacts.empty_hint.clone();
        let primary = self.contacts.add_contact.clone();
        let secondary = self.contacts.import_file.clone();
        div()
            .flex_1()
            .min_w(px(0.))
            .flex()
            .items_center()
            .justify_center()
            .child(empty_state_cta(
                theme,
                &mut self.icons,
                title,
                caption,
                primary,
                secondary,
            ))
    }

    fn contacts_content(&mut self, theme: &Theme, caption: bool, cx: &mut Context<Self>) -> Div {
        let header = self.contacts_header(theme, caption, cx);
        let rail = self.contacts_rail(theme, cx);
        let body: gpui::AnyElement = if self.contacts_empty {
            self.contacts_empty_view(theme).into_any_element()
        } else if let Some(group) = self.group {
            self.contacts_group_view(theme, group, cx)
                .into_any_element()
        } else {
            self.contacts_list(theme, cx).into_any_element()
        };

        div()
            .flex_1()
            .min_w(px(0.))
            .h_full()
            .overflow_hidden()
            .flex()
            .flex_col()
            .child(header)
            .child(
                div()
                    .flex_1()
                    .min_h(px(0.))
                    .flex()
                    .gap(px(WALLET_PAD_X))
                    .px(px(WALLET_PAD_X))
                    .pt(px(CONTACTS_BODY_PAD_TOP))
                    .child(rail)
                    .child(body),
            )
    }

    /// DC2's third-column body: hero, pill actions, address, 最近往来, footer.
    fn contact_detail_body(&mut self, theme: &Theme) -> Div {
        let contact = contacts_fixtures::CONTACTS[self.contact];
        let model = contacts_fixtures::contact_detail(&self.contacts, &contact);
        let address_label = self.contacts.address_label.clone();
        let recent = self.contacts.recent_activity.clone();
        let view_all = self.contacts.view_all_activity.clone();
        let edit = self.contacts.edit.clone();
        let delete = self.contacts.delete_contact.clone();
        let send = self.contacts.action_send.clone();
        let receive = self.contacts.action_receive.clone();
        let qr = self.contacts.action_qr.clone();

        // DC2 shows membership pills only: the desktop entry point for adding
        // a group is the contact context menu's 移入分组, so the mobile
        // `+ 分组` chip stays off this panel (it lives on the component board).
        let mut chips = div().flex().flex_wrap().gap(px(6.));
        for chip in &model.chips {
            chips = chips.child(group_chip(theme, chip.clone()));
        }

        let hero = div()
            .flex()
            .items_center()
            .gap(px(14.))
            .child(identicon_avatar(
                &mut self.identicons,
                model.seed,
                CONTACTS_HERO_AVATAR,
            ))
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.))
                    .flex()
                    .flex_col()
                    .gap(px(6.))
                    .child(
                        div()
                            .text_size(theme::text_panel_title())
                            .font_weight(gpui::FontWeight::BOLD)
                            .text_color(theme.fg_base)
                            .whitespace_nowrap()
                            .truncate()
                            .child(model.name.clone()),
                    )
                    .child(chips),
            );

        let actions = div()
            .flex()
            .gap(px(10.))
            .child(action_pill(
                "contact-send",
                theme,
                &mut self.icons,
                Icon::ArrowUpRight,
                send,
            ))
            .child(action_pill(
                "contact-receive",
                theme,
                &mut self.icons,
                Icon::ArrowDownLeft,
                receive,
            ))
            .child(action_pill(
                "contact-qr",
                theme,
                &mut self.icons,
                Icon::QrCode,
                qr,
            ));

        let mut activity = div().flex().flex_col().child(
            div()
                .pb(px(4.))
                .text_size(theme::text_label())
                .text_color(theme.fg_subtle)
                .child(recent),
        );
        for row in &model.activity {
            activity = activity.child(activity_row(theme, &mut self.icons, row));
        }
        activity = activity.child(div().pt(px(10.)).child(text_action(
            "contact-view-all",
            theme,
            &mut self.icons,
            None,
            view_all,
        )));

        let footer = div()
            .flex()
            .items_center()
            .justify_between()
            .pt(px(14.))
            .border_t_1()
            .border_color(theme.divider)
            .child(text_action(
                "contact-edit",
                theme,
                &mut self.icons,
                Some(Icon::Pencil),
                edit,
            ))
            .child(destructive_text_button("contact-delete", theme, delete));

        div()
            .h_full()
            .flex()
            .flex_col()
            .gap(px(16.))
            .child(hero)
            .child(actions)
            .child(div().h(px(1.)).bg(theme.divider))
            .child(address_block(
                theme,
                &mut self.icons,
                address_label,
                model.address_full.clone(),
            ))
            .child(div().h(px(1.)).bg(theme.divider))
            .child(activity)
            .child(div().flex_1().min_h(px(0.)))
            .child(footer)
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
            .child(SharedString::from(self.identity().address));

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

    /// One gallery chip = one mock state (FR-004: ≤ 2 interactions from the
    /// gallery root). Every field the mocks differ in is set here, so the
    /// states cannot leak into each other.
    fn select_tab(&mut self, tab: GalleryTab, window: &Window) {
        self.tab = tab;
        self.section = match tab {
            GalleryTab::Dc1
            | GalleryTab::Dc2
            | GalleryTab::Dc3
            | GalleryTab::Dc4
            | GalleryTab::Dc5
            | GalleryTab::Dc6 => Section::Contacts,
            GalleryTab::Dst1
            | GalleryTab::Dst2
            | GalleryTab::Dst3
            | GalleryTab::Dst4
            | GalleryTab::Dst4b
            | GalleryTab::Dst5
            | GalleryTab::Dst6
            | GalleryTab::Dst7
            | GalleryTab::Dst8
            | GalleryTab::Dsr1 => Section::Settings,
            _ => Section::Wallet,
        };
        // Spec 023: which panel, which dialog, and which row is expanded — set
        // together so one chip is one mock and the states cannot leak.
        self.settings_page = match tab {
            GalleryTab::Dst2 => SettingsPage::Appearance,
            GalleryTab::Dst3 => SettingsPage::Localization,
            GalleryTab::Dst4 | GalleryTab::Dst4b => SettingsPage::Networks,
            GalleryTab::Dst5 => SettingsPage::RpcProviders,
            GalleryTab::Dst6 => SettingsPage::Endpoints,
            GalleryTab::Dst7 => SettingsPage::Storage,
            GalleryTab::Dst8 => SettingsPage::About,
            _ => SettingsPage::Account,
        };
        self.settings_dialog = match tab {
            GalleryTab::Dst4b => Some(SettingsDialog::AddNetwork),
            GalleryTab::Dsr1 => Some(SettingsDialog::FixRpc),
            _ => None,
        };
        // DST4 opens Ethereum in place — the one row the mock has expanded.
        self.settings_expanded_network = (tab == GalleryTab::Dst4).then_some("ethereum");
        // DST3 is the only state with an open dropdown, and it hangs off 数字格式.
        self.settings_open_dropdown = (tab == GalleryTab::Dst3).then_some("number");
        self.panel = match tab {
            GalleryTab::D2 => PanelId::Receive,
            GalleryTab::D3 => PanelId::AssetDetail,
            GalleryTab::Dc2 => PanelId::ContactDetail,
            _ => PanelId::None,
        };
        self.contact = 0;
        self.contacts_empty = tab == GalleryTab::Dc3;
        self.group = match tab {
            GalleryTab::Dc4 | GalleryTab::Dc6 => Some(0),
            _ => None,
        };
        self.menu = match tab {
            GalleryTab::Dc5 => Some((
                ContactsMenu::Header,
                self.header_menu_anchor(window),
                Anchor::TopRight,
            )),
            GalleryTab::Dc6 => Some((
                ContactsMenu::Group,
                self.group_menu_anchor(window),
                Anchor::TopLeft,
            )),
            _ => None,
        };
    }

    fn gallery_bar(&mut self, theme: &Theme, caption: bool, cx: &mut Context<Self>) -> Div {
        let tabs = GalleryTab::ALL;
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
            .pl(px(84.))
            // …and the drag strip where the page draws its own caption: a tab
            // under it would hit-test as caption on Windows and never see the
            // click. Same idiom as the traffic-light padding above.
            .pt(px(8. + gallery_bar_caption_pad(caption)));
        for (i, (tab, label)) in tabs.into_iter().enumerate() {
            let active = self.tab == tab;
            bar = bar.child(
                self.chip(ElementId::from(("tab", i)), theme, label.into(), active)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.select_tab(tab, window);
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

    /// The contacts component board (data-model.md §Component boards). Every
    /// new component and its variants, plus the identicon board over the 8+1
    /// canon seeds and the placeholder.
    fn contacts_components_tab(&mut self, theme: &Theme) -> Stateful<Div> {
        let s_all = self.contacts.all_contacts.clone();
        let s_groups = self.contacts.section_groups.clone();
        let s_new_group = self.contacts.group_new.clone();
        let s_add_member = self.contacts.add_member.clone();
        let s_search = self.contacts.search_placeholder.clone();
        let s_address = self.contacts.address_label.clone();
        let s_recent = self.contacts.recent_activity.clone();
        let s_empty = self.contacts.empty.clone();
        let s_empty_hint = self.contacts.empty_hint.clone();
        let s_add_contact = self.contacts.add_contact.clone();
        let s_import = self.contacts.import_file.clone();
        let s_batch = self.contacts.batch_send.clone();
        let s_delete = self.contacts.delete_contact.clone();
        let no_results = contacts_fixtures::no_results_label(&self.contacts, "zzz");

        // ContactRow: default · selected · long-name truncation · member.
        let mut rows = div().flex().flex_col();
        for (i, (contact, selected)) in [
            (contacts_fixtures::CONTACTS[0], false),
            (contacts_fixtures::CONTACTS[1], true),
            (contacts_fixtures::CONTACTS[2], false),
            (contacts_fixtures::COUSIN, false),
        ]
        .into_iter()
        .enumerate()
        {
            rows = rows.child(contact_row(
                ElementId::from(("board-contact", i)),
                theme,
                &mut self.identicons,
                &contact,
                selected,
            ));
            rows = rows.child(row_divider(theme));
        }

        // GroupRail rows: all-contacts (selected) · group · drop-target · new.
        let mut rail = div().flex().flex_col().gap(px(2.));
        rail = rail.child(rail_row(
            "board-rail-all",
            theme,
            &mut self.icons,
            None,
            s_all,
            Some(contacts_fixtures::TOTAL_CONTACTS),
            RailState::Selected,
        ));
        rail = rail.child(rail_label(theme, s_groups));
        for (i, group) in contacts_fixtures::GROUPS.iter().enumerate() {
            rail = rail.child(rail_row(
                ElementId::from(("board-rail-group", i)),
                theme,
                &mut self.icons,
                Some(Icon::UsersRound),
                SharedString::from(group.name),
                Some(group.count),
                // 交易所 shows the drag-over variant (desktop SPEC).
                if i == 2 {
                    RailState::DropTarget
                } else {
                    RailState::Default
                },
            ));
        }
        rail = rail.child(rail_row(
            "board-rail-new",
            theme,
            &mut self.icons,
            Some(Icon::FolderPlus),
            s_new_group,
            None,
            RailState::Default,
        ));

        let search = search_field(theme, &mut self.icons, s_search);

        let dropdown = menu_card(
            theme,
            &mut self.icons,
            &contacts_fixtures::header_dropdown(&self.contacts),
        );
        let group_menu = menu_card(
            theme,
            &mut self.icons,
            &contacts_fixtures::group_context(&self.contacts),
        );
        let contact_menu = menu_card(
            theme,
            &mut self.icons,
            &contacts_fixtures::contact_context(&self.contacts),
        );
        let menus = div()
            .flex()
            .gap(px(16.))
            .child(dropdown)
            .child(group_menu)
            .child(contact_menu);

        let chips = div()
            .flex()
            .gap(px(6.))
            .child(group_chip(theme, "家人".into()))
            .child(add_chip(
                theme,
                &mut self.icons,
                self.contacts.section_groups.clone(),
            ));

        let address = address_block(
            theme,
            &mut self.icons,
            s_address,
            contacts_fixtures::CONTACTS[0].address_full.into(),
        );

        let mut recent = div().flex().flex_col().child(
            div()
                .pb(px(4.))
                .text_size(theme::text_label())
                .text_color(theme.fg_subtle)
                .child(s_recent),
        );
        for row in contacts_fixtures::alice_activity(&self.contacts) {
            recent = recent.child(activity_row(theme, &mut self.icons, &row));
        }

        let empties = div()
            .flex()
            .gap(px(16.))
            .child(empty_state_cta(
                theme,
                &mut self.icons,
                s_empty,
                s_empty_hint,
                s_add_contact,
                s_import,
            ))
            .child(empty_state(
                theme,
                &mut self.icons,
                Icon::Search,
                no_results,
                self.contacts.search_placeholder.clone(),
            ));

        let ghost = div().child(ghost_add_row(
            "board-ghost",
            theme,
            &mut self.icons,
            s_add_member,
        ));

        let buttons = div()
            .flex()
            .gap(px(12.))
            .child(accent_button(
                "board-accent",
                theme,
                &mut self.icons,
                None,
                s_batch,
            ))
            .child(outline_button(
                "board-outline",
                theme,
                &mut self.icons,
                Some(Icon::UserRoundPlus),
                self.contacts.add_contact.clone(),
            ))
            .child(icon_button(
                "board-icon",
                theme,
                &mut self.icons,
                Icon::Ellipsis,
            ))
            .child(destructive_text_button(
                "board-destructive",
                theme,
                s_delete,
            ));

        let mut seeds = div().flex().flex_wrap().gap(px(16.));
        for (i, seed) in contacts_fixtures::IDENTICON_CANON_SEEDS
            .into_iter()
            .enumerate()
        {
            let caption: SharedString = if seed.is_empty() {
                "(empty)".into()
            } else {
                seed.into()
            };
            let _ = i;
            seeds = seeds.child(
                div()
                    .w(px(96.))
                    .flex()
                    .flex_col()
                    .items_center()
                    .gap(px(6.))
                    .child(identicon_avatar(&mut self.identicons, seed, 48.))
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
            .id("contacts-components-scroll")
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
                    .child(Self::board(theme, "ContactRow", rows))
                    .child(Self::board(theme, "GroupRail", rail))
                    .child(Self::board(theme, "SearchField", search))
                    .child(Self::board(theme, "DropdownMenu / ContextMenu", menus))
                    .child(Self::board(theme, "GroupChips", chips))
                    .child(Self::board(theme, "AddressBlock", address))
                    .child(Self::board(theme, "RecentActivity", recent))
                    .child(Self::board(theme, "EmptyStateCTA", empties))
                    .child(Self::board(theme, "GhostAddRow", ghost))
                    .child(Self::board(theme, "Buttons", buttons))
                    .child(Self::board(theme, "IdenticonAvatar (canon seeds)", seeds)),
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

    // -- spec 023: the settings section --------------------------------------

    /// Column 2 of the settings section: the 216px second-level nav.
    ///
    /// The same column the contacts group rail occupies, doing the same job one
    /// section over — which is why it reuses the width rather than inventing a
    /// second one.
    fn settings_nav(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let title = self.settings.title.clone();
        let current = self.settings_page;
        let mut col = div().flex().flex_col().gap(px(2.)).child(
            div()
                .px(px(12.))
                .pb(px(16.))
                .text_size(theme::text_panel_title())
                .font_weight(gpui::FontWeight::BOLD)
                .text_color(theme.fg_base)
                .child(title),
        );
        for (i, page) in SettingsPage::ALL.into_iter().enumerate() {
            let label = page.label(&self.settings);
            let row = settings_nav_row(
                ElementId::from(("settings-nav", i)),
                theme,
                &mut self.icons,
                page.icon(),
                label,
                page == current,
            );
            col = col.child(row.on_click(cx.listener(move |this, _, _, cx| {
                this.settings_page = page;
                this.settings_dialog = None;
                cx.notify();
            })));
        }

        div()
            .w(px(SETTINGS_NAV_W))
            .h_full()
            .flex_none()
            // `.flex()` is load-bearing, not decoration: without it `h_full`
            // does not resolve and the column stopped at its last row, leaving
            // its background and right border hanging in mid-air.
            .flex()
            .flex_col()
            .bg(theme.bg_sunken)
            .border_r_1()
            .border_color(theme.divider)
            .p(px(SIDEBAR_PAD))
            .pt(px(SIDEBAR_TOP))
            .child(col)
    }

    /// Column 3: the panel the nav selected.
    fn settings_panel(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Stateful<Div> {
        let (title, description) = match self.settings_page {
            SettingsPage::Account => (self.settings.nav_account.clone(), None),
            SettingsPage::Appearance => (self.settings.nav_appearance.clone(), None),
            SettingsPage::Localization => (
                self.settings.nav_localization.clone(),
                Some(self.settings.number_subtitle.clone()),
            ),
            SettingsPage::Networks => (
                self.settings.nav_networks.clone(),
                Some(self.settings.networks_subtitle.clone()),
            ),
            SettingsPage::RpcProviders => (self.settings.nav_rpc_providers.clone(), None),
            SettingsPage::Endpoints => (self.settings.nav_endpoints.clone(), None),
            SettingsPage::Storage => (
                self.settings.nav_storage.clone(),
                Some(self.settings.storage_subtitle.clone()),
            ),
            SettingsPage::About => (self.settings.nav_about.clone(), None),
        };

        let mut head = div()
            .flex()
            .items_start()
            .justify_between()
            .gap(px(16.))
            .pb(px(24.))
            .child({
                let mut titles = div().flex().flex_col().gap(px(6.)).child(
                    div()
                        .text_size(theme::text_panel_title())
                        .font_weight(gpui::FontWeight::BOLD)
                        .text_color(theme.fg_base)
                        .child(title),
                );
                if let Some(description) = description {
                    titles = titles.child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_subtle)
                            .child(description),
                    );
                }
                titles
            });

        // 添加网络 sits in the panel header, next to the list it adds to.
        if self.settings_page == SettingsPage::Networks {
            let add = self.settings.add_network.clone();
            head = head.child(
                div()
                    .id("settings-add-network")
                    .h(px(36.))
                    .px(px(16.))
                    .rounded(px(10.))
                    .flex()
                    .flex_none()
                    .items_center()
                    .gap(px(8.))
                    .cursor_pointer()
                    .bg(theme.bg_raised)
                    .border_1()
                    .border_color(theme.divider)
                    .hover(|el| el.bg(theme.bg_sunken))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.settings_dialog = Some(SettingsDialog::AddNetwork);
                        cx.notify();
                    }))
                    .child(icon_img(
                        &mut self.icons,
                        Icon::Plus,
                        false,
                        theme.fg_base,
                        14.,
                    ))
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_base)
                            .child(add),
                    ),
            );
        }

        let body = match self.settings_page {
            SettingsPage::Account => self.settings_account(theme, cx),
            SettingsPage::Appearance => self.settings_appearance(theme),
            SettingsPage::Localization => self.settings_localization(theme, cx),
            SettingsPage::Networks => self.settings_networks(theme, cx),
            SettingsPage::RpcProviders => self.settings_providers(theme),
            SettingsPage::Endpoints => self.settings_endpoints(theme),
            SettingsPage::Storage => self.settings_storage(theme),
            SettingsPage::About => self.settings_about(theme),
        };

        // The banner DSR1 draws over the wallet, kept above the panel content
        // so it reads as a condition of the app rather than of this panel.
        let banner = if self.settings_dialog == Some(SettingsDialog::FixRpc) {
            let text = settings_fixtures::banner_text(&self.settings);
            let chips = settings_fixtures::BANNER_CHAINS
                .iter()
                .map(|id| {
                    let n = settings_fixtures::network(id);
                    (
                        n.letter,
                        n.color,
                        n.name,
                        self.settings.rpc_fix_action.clone(),
                    )
                })
                .collect();
            Some(rpc_banner(theme, &mut self.icons, text, chips))
        } else {
            None
        };

        div()
            .id("settings-panel")
            .flex_1()
            .min_w(px(0.))
            .h_full()
            .overflow_y_scroll()
            // Left-aligned against the nav column, exactly as the wallet's own
            // content column is. The padding is the panel's, the cap is the
            // content's: a settings form stretched to a 2000px window is a
            // different screen from the one that was designed.
            .px(px(SETTINGS_PANEL_PAD_X))
            .pt(px(WALLET_PAD_TOP))
            .pb(px(48.))
            .child(
                div()
                    .max_w(px(SETTINGS_PANEL_W))
                    .child(head)
                    .when_some(banner, |el, banner| {
                        el.child(div().pb(px(24.)).child(banner))
                    })
                    .child(body),
            )
    }

    /// DST1 — the accounts, the way out, and the one irreversible button.
    fn settings_account(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let s = &self.settings;
        let summary = settings_fixtures::accounts_summary(s);
        let create = s.account_create.clone();
        let sign_in = s.account_sign_in.clone();
        let sign_out = s.sign_out_button.clone();
        let sign_out_desc = s.sign_out_desc.clone();
        let erase_title = s.erase_title.clone();
        let erase_subtitle = s.erase_subtitle.clone();
        let erase_confirm = s.erase_confirm.clone();

        let mut list = div().flex().flex_col();
        for (i, account) in settings_fixtures::ACCOUNTS.iter().enumerate() {
            // The active account wears the REAL identity when there is one; the
            // other two stay fixtures, because the core exposes no account list
            // yet and inventing one would be the screen lying about how many
            // wallets this person has.
            let (name, display, seed) = if i == 0 {
                let identity = self.identity();
                (
                    identity.name.clone(),
                    identity.display(),
                    identity.address.clone(),
                )
            } else {
                (
                    gpui::SharedString::from(account.name),
                    gpui::SharedString::from(account.address_display),
                    account.address_full.to_owned(),
                )
            };
            let active = i == 0;
            let mut row = div()
                .flex()
                .items_center()
                .gap(px(12.))
                .py(px(12.))
                .child(identicon_avatar(&mut self.identicons, &seed, 40.))
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
                                .text_color(if active { theme.accent } else { theme.fg_base })
                                .child(name),
                        )
                        .child(
                            div()
                                .font_family(theme::font_mono())
                                .text_size(theme::text_row_sub())
                                .text_color(theme.fg_subtle)
                                .child(display),
                        ),
                )
                .child(
                    div()
                        .text_size(theme::text_row_title())
                        .text_color(theme.fg_base)
                        .child(account.amount),
                );
            if active {
                row = row.child(icon_img(
                    &mut self.icons,
                    Icon::Check,
                    false,
                    theme.accent,
                    18.,
                ));
            }
            list = list.child(row).child(div().h(px(1.)).bg(theme.divider));
        }

        let hover_accent = theme.accent_hover;
        div()
            .flex()
            .flex_col()
            .child(
                div()
                    .pb(px(12.))
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_subtle)
                    .child(summary),
            )
            .child(list)
            .child(
                div()
                    .flex()
                    .gap(px(12.))
                    .pt(px(24.))
                    .child(
                        div()
                            .id("settings-create-account")
                            .h(px(CONTACTS_BUTTON_H))
                            .px(px(32.))
                            .rounded(px(12.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .bg(theme.accent)
                            .hover(move |el| el.bg(hover_accent))
                            .text_size(theme::text_row_title())
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .text_color(theme.fg_inverse)
                            .child(create),
                    )
                    .child(
                        div()
                            .id("settings-sign-in-account")
                            .h(px(CONTACTS_BUTTON_H))
                            .px(px(32.))
                            .rounded(px(12.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .border_1()
                            .border_color(theme.outline_strong)
                            .text_size(theme::text_row_title())
                            .text_color(theme.fg_base)
                            .child(sign_in),
                    ),
            )
            .child(div().h(px(1.)).bg(theme.divider).my(px(32.)))
            .child(
                div()
                    .id("settings-sign-out")
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .cursor_pointer()
                    .on_click(cx.listener(|_, _, _, cx| session::sign_out(cx)))
                    .child(icon_img(
                        &mut self.icons,
                        Icon::LogOut,
                        false,
                        theme.fg_base,
                        18.,
                    ))
                    .child(
                        div()
                            .text_size(theme::text_row_title())
                            .text_color(theme.fg_base)
                            .child(sign_out),
                    ),
            )
            .child(
                div()
                    .pt(px(8.))
                    .pb(px(24.))
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_subtle)
                    .child(sign_out_desc),
            )
            .child(danger_card(
                theme,
                erase_title,
                erase_subtitle,
                erase_confirm,
            ))
    }

    /// DST2 — language, text size, theme, avatar style.
    fn settings_appearance(&mut self, theme: &Theme) -> Div {
        let s = &self.settings;
        let language = s.language.clone();
        let language_value = gpui::SharedString::from(format!("简体中文 · {}", s.note_system));
        let scale_label = s.text_scale.clone();
        let theme_label = s.theme_title.clone();
        let avatar_label = s.avatar_title.clone();
        let themes = [
            (Some(Icon::Sun), s.theme_light.clone()),
            (Some(Icon::Moon), s.theme_dark.clone()),
            (Some(Icon::Monitor), s.theme_auto.clone()),
        ];
        let avatars = [
            (None, s.avatar_initials.clone()),
            (None, s.avatar_identicon.clone()),
        ];
        // Which theme cell reads as chosen follows the appearance the window is
        // actually in — a settings screen that says "Light" while drawing dark
        // is the one thing this row must never do.
        let theme_index = match self.theme_mode() {
            ThemeMode::Light => 0,
            ThemeMode::Dark => 1,
        };

        let language_control = dropdown_trigger(theme, &mut self.icons, language_value);
        let scale_control = text_scale(theme, 7, 3);
        let theme_control = segmented(theme, &mut self.icons, &themes, theme_index);
        let avatar_control = segmented(theme, &mut self.icons, &avatars, 1);

        div()
            .flex()
            .flex_col()
            .child(form_row(theme, language, language_control))
            .child(form_row(theme, scale_label, scale_control))
            .child(form_row(theme, theme_label, theme_control))
            .child(form_row(theme, avatar_label, avatar_control))
    }

    /// DST3 — currency, number, date and time formats.
    ///
    /// One of the four can be OPEN, and the mock's is 数字格式. The menu is an
    /// absolutely-positioned child of that row's control cell so it lies over
    /// the rows beneath instead of pushing them down — the desktop SPEC's
    /// "浮层需逃出容器裁剪" rule.
    fn settings_localization(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let s = &self.settings;
        let auto_note =
            gpui::SharedString::from(format!("{} · {}", s.note_automatic, s.note_system));
        let rows: [(&'static str, gpui::SharedString, gpui::SharedString); 4] = [
            (
                "currency",
                s.currency.clone(),
                gpui::SharedString::from("USD · $1,234.56"),
            ),
            (
                "number",
                s.number_format.clone(),
                gpui::SharedString::from("1,234,567.89"),
            ),
            (
                "date",
                s.date_format.clone(),
                gpui::SharedString::from("2026/06/13"),
            ),
            (
                "time",
                s.time_format.clone(),
                gpui::SharedString::from("13:45"),
            ),
        ];
        let number_menu: [(gpui::SharedString, Option<gpui::SharedString>, bool); 5] = [
            ("1,234,567.89".into(), Some(auto_note), true),
            ("1,234,567.89".into(), None, false),
            ("1.234.567,89".into(), None, false),
            ("1 234 567,89".into(), None, false),
            ("12,34,567.89".into(), Some(s.note_indian.clone()), false),
        ];

        let open = self.settings_open_dropdown;
        let mut col = div().flex().flex_col();
        for (id, label, value) in rows {
            let is_open = open == Some(id);
            let trigger = dropdown_trigger(theme, &mut self.icons, value);
            let menu = (is_open && id == "number")
                .then(|| dropdown_menu(theme, &mut self.icons, &number_menu));
            let control = div()
                .id(SharedString::from(format!("settings-dropdown-{id}")))
                .relative()
                .w_full()
                .cursor_pointer()
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.settings_open_dropdown = if this.settings_open_dropdown == Some(id) {
                        None
                    } else {
                        Some(id)
                    };
                    cx.notify();
                }))
                .child(trigger)
                // `deferred`, the same escape the contacts menus take: gpui
                // paints in child order, so an open menu drawn inside row 2 was
                // painted over by rows 3 and 4 — the date and time triggers sat
                // on top of it and swallowed one of its options.
                .when_some(menu, |el, menu| el.child(deferred(menu).with_priority(1)));
            col = col.child(form_row(theme, label, control));
        }
        col
    }

    /// DST4 — the network list, expanding one row in place.
    fn settings_networks(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Div {
        let expanded = self.settings_expanded_network;
        let mut col = div().flex().flex_col();
        for (i, id) in settings_fixtures::DESKTOP_NETWORK_IDS
            .into_iter()
            .enumerate()
        {
            let n = settings_fixtures::network(id);
            let meta = settings_fixtures::chain_meta(&self.settings, n.chain_id);
            let badge = (!n.custom).then(|| latency(n.latency_ms, None));
            let tag = n.custom.then(|| self.settings.network_custom.clone());
            let is_expanded = expanded == Some(id);
            let row = network_row(
                ElementId::from(("settings-network", i)),
                theme,
                &mut self.icons,
                n.letter,
                n.color,
                n.name,
                meta,
                badge.as_ref(),
                tag,
                n.custom,
                is_expanded,
            );
            col = col
                .child(row.on_click(cx.listener(move |this, _, _, cx| {
                    this.settings_expanded_network = if this.settings_expanded_network == Some(id) {
                        None
                    } else {
                        Some(id)
                    };
                    cx.notify();
                })))
                .child(div().h(px(1.)).bg(theme.divider));
            if is_expanded {
                col = col.child(self.settings_network_detail(theme));
            }
        }
        col
    }

    /// The editor DST4 opens under the expanded row. No identity line: the row
    /// above it already says which chain this is.
    fn settings_network_detail(&mut self, theme: &Theme) -> Div {
        let s = &self.settings;
        let rpc = url_field(
            theme,
            Some(s.rpc_url.clone()),
            gpui::SharedString::from(settings_fixtures::ETHEREUM_RPC),
            Some(&latency(45, None)),
            Some(s.network_save_hint.clone()),
            None,
            None,
        );
        let explorer = url_field(
            theme,
            Some(s.explorer.clone()),
            gpui::SharedString::from(settings_fixtures::ETHEREUM_EXPLORER),
            None,
            None,
            None,
            None,
        );
        div()
            .flex()
            .flex_col()
            .gap(px(16.))
            .my(px(12.))
            .p(px(16.))
            .rounded(px(10.))
            .bg(theme.bg_sunken)
            .border_1()
            .border_color(theme.divider)
            .child(rpc)
            .child(explorer)
    }

    /// DST5 — one card per RPC provider.
    fn settings_providers(&mut self, theme: &Theme) -> Div {
        let mut col = div().flex().flex_col().gap(px(32.)).child(
            div()
                .pb(px(8.))
                .text_size(theme::text_row_sub())
                .line_height(px(20.))
                .text_color(theme.fg_muted)
                .child(self.settings.providers_desc.clone()),
        );
        for p in &settings_fixtures::PROVIDERS {
            let connected = !p.key.is_empty();
            let badge = if connected {
                pill(Tone::Ok, self.settings.provider_connected.clone())
            } else {
                pill(Tone::Neutral, self.settings.provider_not_set.clone())
            };
            let value = if connected {
                gpui::SharedString::from(p.key)
            } else {
                self.settings.provider_not_set.clone()
            };
            let support = settings_fixtures::provider_support(&self.settings, p);
            let mut card = div()
                .flex()
                .flex_col()
                .gap(px(12.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .gap(px(8.))
                        .child(
                            div()
                                .text_size(theme::text_panel_title())
                                .font_weight(gpui::FontWeight::BOLD)
                                .text_color(theme.fg_base)
                                .child(p.name),
                        )
                        .child(status_pill(theme, &badge)),
                )
                .child(url_field(
                    theme,
                    None,
                    value,
                    None,
                    None,
                    None,
                    Some(if connected {
                        self.settings.provider_check_key.clone()
                    } else {
                        self.settings.provider_get_key.clone()
                    }),
                ));
            if let Some(support) = support {
                card = card.child(
                    div()
                        .text_size(theme::text_label())
                        .text_color(theme.fg_subtle)
                        .child(support),
                );
            }
            col = col.child(card);
        }
        col
    }

    /// DST6 — the four services the wallet leans on.
    fn settings_endpoints(&mut self, theme: &Theme) -> Div {
        let copy = settings_fixtures::endpoint_copy(&self.settings);
        let mut col = div().flex().flex_col().gap(px(24.)).child(
            div()
                .text_size(theme::text_row_sub())
                .line_height(px(20.))
                .text_color(theme.fg_muted)
                .child(self.settings.endpoints_desc.clone()),
        );
        for (i, endpoint) in settings_fixtures::ENDPOINTS.iter().enumerate() {
            let (label, hint) = copy[i].clone();
            let badge = latency(endpoint.latency_ms, None);
            col = col.child(url_field(
                theme,
                Some(label),
                gpui::SharedString::from(endpoint.url),
                Some(&badge),
                Some(hint),
                None,
                None,
            ));
        }
        col.child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .pt(px(16.))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.))
                        .child(icon_img(
                            &mut self.icons,
                            Icon::RefreshCw,
                            false,
                            theme.fg_muted,
                            14.,
                        ))
                        .child(
                            div()
                                .text_size(theme::text_row_sub())
                                .text_color(theme.fg_muted)
                                .child(self.settings.endpoints_reset.clone()),
                        ),
                )
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.info_base)
                        .child(self.settings.endpoints_guide.clone()),
                ),
        )
    }

    /// DST7 — how much of this device Vela is using, and what can be given back.
    fn settings_storage(&mut self, theme: &Theme) -> Div {
        let s = &self.settings;
        let summary = gpui::SharedString::from(crate::wallet::fill(
            &s.storage_summary,
            "count",
            &settings_fixtures::STORAGE_RECORDS.to_string(),
        ));
        let mut col = div()
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_baseline()
                    .gap(px(8.))
                    .pb(px(16.))
                    .child(
                        div()
                            .text_size(theme::text_balance_hero())
                            .font_weight(gpui::FontWeight::BOLD)
                            .text_color(theme.fg_base)
                            .child(settings_fixtures::STORAGE_AMOUNT),
                    )
                    .child(
                        div()
                            .text_size(theme::text_row_title())
                            .font_weight(gpui::FontWeight::SEMIBOLD)
                            .text_color(theme.fg_base)
                            .child(settings_fixtures::STORAGE_UNIT),
                    )
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_subtle)
                            .child(summary),
                    ),
            )
            .child(storage_bar(theme, &settings_fixtures::STORAGE_SEGMENTS));
        for group in settings_fixtures::storage_groups(&self.settings) {
            let action = group.action.clone();
            col = col.child(storage_group(theme, &group));
            if let Some(action) = action {
                col = col.child(
                    div()
                        .pt(px(16.))
                        .text_size(theme::text_row_sub())
                        .text_color(theme.info_base)
                        .child(action),
                );
            }
        }
        col
    }

    /// DST8 — the build, the technical inventory, the three links.
    fn settings_about(&mut self, theme: &Theme) -> Div {
        let s = &self.settings;
        let mut col = div()
            .flex()
            .flex_col()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(16.))
                    .pb(px(24.))
                    // DST8 draws the mark beside the tagline; without it the
                    // panel opens on two lines of grey text and no brand.
                    .child(crate::ui::vela_mark(theme, px(44.)))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(4.))
                            .child(
                                div()
                                    .text_size(theme::text_row_title())
                                    .text_color(theme.fg_muted)
                                    .child(s.about_tagline.clone()),
                            )
                            .child(
                                div()
                                    .font_family(theme::font_mono())
                                    .text_size(theme::text_row_sub())
                                    .text_color(theme.fg_subtle)
                                    .child(settings_fixtures::about_version(s)),
                            ),
                    ),
            )
            .child(
                div()
                    .pb(px(4.))
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_subtle)
                    .child(s.about_section_technical.clone()),
            );
        for (label, value, mono) in settings_fixtures::about_rows(&self.settings) {
            col = col.child(key_value_row(
                theme,
                &mut self.icons,
                label,
                value,
                mono,
                false,
            ));
        }
        col = col.child(
            div()
                .pt(px(24.))
                .pb(px(4.))
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_subtle)
                .child(self.settings.about_section_links.clone()),
        );
        for (label, value) in settings_fixtures::about_links(&self.settings) {
            col = col.child(key_value_row(
                theme,
                &mut self.icons,
                label,
                value,
                true,
                true,
            ));
        }
        col.child(
            div()
                .pt(px(24.))
                .text_size(theme::text_label())
                .text_color(theme.fg_subtle)
                .child(self.settings.about_footer.clone()),
        )
    }

    /// The centred dialog over the settings section (DST4b / DSR1).
    fn settings_dialog_overlay(
        &mut self,
        theme: &Theme,
        cx: &mut Context<Self>,
    ) -> Option<gpui::AnyElement> {
        let kind = self.settings_dialog?;
        let s = &self.settings;
        let (title, subtitle) = match kind {
            SettingsDialog::AddNetwork => (
                s.add_network.clone(),
                Some(gpui::SharedString::from(format!(
                    "Zora · {}",
                    settings_fixtures::chain_meta(s, settings_fixtures::ZORA_CHAIN_ID)
                ))),
            ),
            SettingsDialog::FixRpc => (s.rpc_fix_title.clone(), None),
        };

        let body = match kind {
            SettingsDialog::AddNetwork => self.settings_add_network_body(theme),
            SettingsDialog::FixRpc => self.settings_fix_rpc_body(theme),
        };

        let mut header = div()
            .flex()
            .items_start()
            .justify_between()
            .gap(px(12.))
            .child({
                let mut titles = div().flex().flex_col().gap(px(6.)).child(
                    div()
                        .text_size(theme::text_panel_title())
                        .font_weight(gpui::FontWeight::BOLD)
                        .text_color(theme.fg_base)
                        .child(title),
                );
                if let Some(subtitle) = subtitle {
                    titles = titles.child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_subtle)
                            .child(subtitle),
                    );
                }
                titles
            });
        header = header.child(
            div()
                .id("settings-dialog-close")
                .size(px(32.))
                .flex_none()
                .rounded_full()
                .bg(theme.bg_sunken)
                .flex()
                .items_center()
                .justify_center()
                .cursor_pointer()
                .on_click(cx.listener(|this, _, _, cx| {
                    this.settings_dialog = None;
                    cx.notify();
                }))
                .child(icon_img(
                    &mut self.icons,
                    Icon::X,
                    false,
                    theme.fg_muted,
                    18.,
                )),
        );

        let card = div()
            .w(px(SETTINGS_DIALOG_W))
            .flex()
            .flex_col()
            .gap(px(20.))
            .p(px(28.))
            .rounded(px(16.))
            .bg(theme.bg_raised)
            .border_1()
            .border_color(theme.border_card)
            .child(header)
            .child(body);

        Some(
            div()
                .id("settings-dialog-scrim")
                .absolute()
                .inset_0()
                .flex()
                .items_center()
                .justify_center()
                .bg(theme.bg_base.opacity(0.55))
                .on_mouse_down(gpui::MouseButton::Left, |_, _, cx| cx.stop_propagation())
                .child(card)
                .into_any_element(),
        )
    }

    /// DST4b's body: the chosen chain, its verdict, and the CTA.
    fn settings_add_network_body(&mut self, theme: &Theme) -> Div {
        let s = &self.settings;
        let checks = settings_fixtures::compatibility_checks(s, true);
        let badge = pill(Tone::Ok, s.compatible.clone());
        let best = gpui::SharedString::from(crate::wallet::fill(
            &s.best_rpc,
            "latencyMs",
            &settings_fixtures::ZORA_BEST_RPC_MS.to_string(),
        ));
        let checks_title = s.compatibility_check.clone();
        let custom_title = s.custom_rpc_title.clone();
        let custom_placeholder = s.custom_rpc_placeholder.clone();
        let cta = s.add_network.clone();
        let hover_accent = theme.accent_hover;

        let search_placeholder = s.search_placeholder.clone();
        let description = s.add_network_desc.clone();

        div()
            .flex()
            .flex_col()
            .gap(px(20.))
            .child(
                div()
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_subtle)
                    .child(description),
            )
            .child(
                div()
                    .h(px(44.))
                    .px(px(12.))
                    .rounded(px(10.))
                    .bg(theme.bg_sunken)
                    .border_1()
                    .border_color(theme.divider)
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(icon_img(
                        &mut self.icons,
                        Icon::Search,
                        false,
                        theme.fg_subtle,
                        16.,
                    ))
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_subtle)
                            .child(search_placeholder),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(chain_mark("Z", 0x8c8c8c, 32.))
                    .child(
                        div()
                            .flex_1()
                            .min_w(px(0.))
                            .flex()
                            .flex_col()
                            .gap(px(2.))
                            .child(
                                div()
                                    .text_size(theme::text_panel_title())
                                    .font_weight(gpui::FontWeight::BOLD)
                                    .text_color(theme.fg_base)
                                    .child("Zora"),
                            )
                            .child(
                                div()
                                    .text_size(theme::text_row_sub())
                                    .text_color(theme.fg_subtle)
                                    .child(best),
                            ),
                    )
                    .child(status_pill(theme, &badge)),
            )
            .child(check_list(theme, &mut self.icons, checks_title, &checks))
            .child(url_field(
                theme,
                Some(custom_title),
                custom_placeholder,
                None,
                None,
                None,
                None,
            ))
            .child(
                div()
                    .id("settings-add-network-confirm")
                    .h(px(CONTACTS_BUTTON_H))
                    .rounded(px(12.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .bg(theme.accent)
                    .hover(move |el| el.bg(hover_accent))
                    .text_size(theme::text_row_title())
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .text_color(theme.fg_inverse)
                    .child(cta),
            )
    }

    /// DSR1's body: one network is unreachable, and this is where it is fixed.
    fn settings_fix_rpc_body(&mut self, theme: &Theme) -> Div {
        let s = &self.settings;
        let n = settings_fixtures::network(settings_fixtures::RPC_FIX_CHAIN);
        let meta = gpui::SharedString::from(format!(
            "{} · {}",
            settings_fixtures::chain_meta(s, n.chain_id),
            settings_fixtures::RPC_FIX_SYMBOL
        ));
        let badge = pill(Tone::Error, s.offline.clone());
        let warning = s.rpc_fix_warning.clone();
        let label = s.rpc_fix_label.clone();
        let cta = s.rpc_fix_save.clone();
        let providers_hint = s.rpc_providers_hint.clone();
        let report = s.rpc_report.clone();
        let hover_accent = theme.accent_hover;

        let mut chips = div().flex().flex_wrap().gap(px(8.));
        for name in settings_fixtures::RPC_PROVIDER_LINKS {
            chips = chips.child(
                div()
                    .px(px(12.))
                    .py(px(8.))
                    .rounded(px(8.))
                    .bg(theme.bg_raised)
                    .border_1()
                    .border_color(theme.divider)
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_base)
                    .child(name),
            );
        }

        div()
            .flex()
            .flex_col()
            .gap(px(16.))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(chain_mark(n.letter, n.color, 32.))
                    .child(
                        div()
                            .flex_1()
                            .min_w(px(0.))
                            .flex()
                            .flex_col()
                            .gap(px(2.))
                            .child(
                                div()
                                    .text_size(theme::text_panel_title())
                                    .font_weight(gpui::FontWeight::BOLD)
                                    .text_color(theme.fg_base)
                                    .child(n.name),
                            )
                            .child(
                                div()
                                    .font_family(theme::font_mono())
                                    .text_size(theme::text_row_sub())
                                    .text_color(theme.fg_subtle)
                                    .child(meta),
                            ),
                    )
                    .child(status_pill(theme, &badge)),
            )
            .child(callout(
                theme,
                &mut self.icons,
                CalloutTone::Warning,
                warning,
            ))
            .child(url_field(
                theme,
                Some(label),
                gpui::SharedString::from(settings_fixtures::RPC_FIX_URL),
                None,
                None,
                Some(Tone::Error),
                None,
            ))
            .child(
                div()
                    .id("settings-fix-rpc-save")
                    .h(px(CONTACTS_BUTTON_H))
                    .rounded(px(12.))
                    .flex()
                    .items_center()
                    .justify_center()
                    .cursor_pointer()
                    .bg(theme.accent)
                    .hover(move |el| el.bg(hover_accent))
                    .text_size(theme::text_row_title())
                    .font_weight(gpui::FontWeight::SEMIBOLD)
                    .text_color(theme.fg_inverse)
                    .child(cta),
            )
            .child(
                div()
                    .text_size(theme::text_label())
                    .text_color(theme.fg_subtle)
                    .child(providers_hint),
            )
            .child(chips)
            .child(
                div()
                    .text_size(theme::text_row_sub())
                    .text_color(theme.info_base)
                    .child(report),
            )
    }

    fn wallet_columns(&mut self, theme: &Theme, caption: bool, cx: &mut Context<Self>) -> Div {
        let mut columns = div()
            .flex_1()
            .min_h(px(0.))
            .flex()
            .child(self.sidebar(theme, cx));
        columns = match self.section {
            Section::Wallet => columns.child(self.content(theme, cx)),
            Section::Contacts => columns.child(self.contacts_content(theme, caption, cx)),
            Section::Settings => columns
                .child(self.settings_nav(theme, cx))
                .child(self.settings_panel(theme, cx)),
        };
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
            PanelId::ContactDetail => {
                let body = self.contact_detail_body(theme);
                let title = self.contacts.section_contacts.clone();
                columns.child(self.panel_scaffold(theme, title, body, cx))
            }
        };
        columns
    }

    /// The anchored menu overlay (DC5/DC6). Appended last in the page root and
    /// deferred so it paints above the columns; `occlude` keeps clicks off the
    /// list underneath and `on_mouse_down_out` dismisses it (research.md D2).
    fn menu_overlay(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Option<gpui::AnyElement> {
        let (kind, position, anchor) = self.menu?;
        let model = match kind {
            ContactsMenu::Header => contacts_fixtures::header_dropdown(&self.contacts),
            ContactsMenu::Group => contacts_fixtures::group_context(&self.contacts),
        };
        let card = menu_card(theme, &mut self.icons, &model);
        Some(
            deferred(
                anchored()
                    .anchor(anchor)
                    .position(position)
                    .snap_to_window_with_margin(px(8.))
                    .child(
                        div()
                            .id("contacts-menu")
                            .occlude()
                            .on_mouse_down_out(cx.listener(|this, _: &MouseDownEvent, _, cx| {
                                this.menu = None;
                                cx.notify();
                            }))
                            .child(card),
                    ),
            )
            .with_priority(1)
            .into_any_element(),
        )
    }
}

impl Render for WalletPage {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = Theme::of(self.theme_mode());

        // Windows and Linux CSD have no system caption, so the page draws one
        // (spec 015 results.md deviation 5 assumed Windows was a native path;
        // `appears_transparent` means it is not). Where it lands over content,
        // that content is pushed clear of it below.
        let caption = owns_titlebar(window);

        let body = if self.gallery {
            let bar = self.gallery_bar(&theme, caption, cx);
            let content: gpui::AnyElement = match self.tab {
                GalleryTab::Components => self.components_tab(&theme).into_any_element(),
                GalleryTab::ContactsComponents => {
                    self.contacts_components_tab(&theme).into_any_element()
                }
                GalleryTab::Identicons => self.identicons_tab(&theme).into_any_element(),
                // The bar already cleared the caption row for the page.
                _ => self.wallet_columns(&theme, false, cx).into_any_element(),
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
                .child(self.wallet_columns(&theme, caption, cx))
        };

        let menu = self.menu_overlay(&theme, cx);
        let sign_out = self.sign_out_dialog(&theme, cx);
        let settings_dialog = self.settings_dialog_overlay(&theme, cx);
        let mut root = div()
            .size_full()
            .relative()
            .bg(theme.bg_base)
            .text_color(theme.fg_base)
            .child(body);
        if let Some(menu) = menu {
            root = root.child(menu);
        }
        // Over everything, including the anchored menu: it is the one dialog
        // whose answer changes which screen the app is on.
        if let Some(settings_dialog) = settings_dialog {
            root = root.child(settings_dialog);
        }
        if let Some(sign_out) = sign_out {
            root = root.child(sign_out);
        }
        let root = root
            .track_focus(&self.focus_handle)
            .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                let ks = &event.keystroke;
                // Esc peels one layer at a time: the sign-out dialog first (it
                // is on top), then the anchored menu, then the third column
                // (desktop SPEC keyboard map).
                if ks.key == "escape" && session::view(cx).sign_out.is_some() {
                    session::sign_out_dismissed(cx);
                    cx.notify();
                    return;
                }
                if ks.key == "escape" && this.settings_dialog.is_some() {
                    this.settings_dialog = None;
                    cx.notify();
                    return;
                }
                if ks.key == "escape" {
                    if this.menu.is_some() {
                        this.menu = None;
                        cx.notify();
                    } else if this.panel != PanelId::None {
                        this.panel = PanelId::None;
                        cx.notify();
                    }
                }
                if ks.key == "f11" {
                    window.toggle_fullscreen();
                }
            }));

        // Square corners would poke out of the frame's rounded border.
        let root = match frame_tiling(window) {
            Some(tiling) => round_to_frame(root, tiling),
            None => root,
        };
        // Last child: the caption buttons paint over the page, not under it.
        let root = if caption {
            root.child(titlebar(&theme, window, px(CAPTION_H)))
        } else {
            root
        };

        window_frame(root, &theme, window)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// FR-004 / data-model.md §Screen states: the gallery chip strip exposes
    /// exactly the desktop state inventory, in canon order, each reachable in
    /// one click from the gallery root. `dc2n` is deliberately absent — the
    /// window minimum is 1280 wide, so the narrow overlay is unreachable on
    /// native desktop (research.md D6).
    #[test]
    fn gallery_exposes_every_desktop_contacts_state() {
        let codes: Vec<&str> = GalleryTab::ALL
            .iter()
            .filter_map(|(tab, _)| tab.contacts_state())
            .collect();
        assert_eq!(codes, crate::contacts::fixtures::DESKTOP_STATES);

        // Chip labels are gallery chrome and stay untranslated (spec 018).
        let labels: Vec<&str> = GalleryTab::ALL.iter().map(|(_, label)| *label).collect();
        assert_eq!(
            labels,
            [
                "D1",
                "D2",
                "D3",
                "DC1",
                "DC2",
                "DC3",
                "DC4",
                "DC5",
                "DC6",
                "DST1",
                "DST2",
                "DST3",
                "DST4",
                "DST4b",
                "DST5",
                "DST6",
                "DST7",
                "DST8",
                "DSR1",
                "Components",
                "Contacts",
                "Identicons",
            ]
        );
    }

    /// Spec 023's half of the same contract: one chip per settings mock, in
    /// the order `settings::fixtures::DESKTOP_STATES` declares.
    #[test]
    fn gallery_exposes_every_desktop_settings_state() {
        let codes: Vec<&str> = GalleryTab::ALL
            .iter()
            .filter_map(|(tab, _)| tab.settings_state())
            .collect();
        assert_eq!(codes, crate::settings::fixtures::DESKTOP_STATES);
    }

    /// The second-level nav is the phone's settings list with the rows
    /// collapsed to their titles — same ids, same order, so somebody who
    /// learned one knows the other.
    #[test]
    fn settings_nav_covers_every_panel() {
        assert_eq!(SettingsPage::ALL.len(), 8);
        assert_eq!(SettingsPage::ALL[0], SettingsPage::Account);
        assert_eq!(SettingsPage::ALL[7], SettingsPage::About);
    }

    /// A latency under a second reads "45ms" in the ok tone; a slow one flips
    /// to seconds AND to warning, because "1.2s" beside "45ms" is otherwise a
    /// smaller-looking number.
    #[test]
    fn latency_pill_changes_unit_and_tone_at_one_second() {
        let fast = latency(45, None);
        assert_eq!(fast.label.as_ref(), "45ms");
        assert_eq!(fast.tone, Tone::Ok);

        let slow = latency(1200, None);
        assert_eq!(slow.label.as_ref(), "1.2s");
        assert_eq!(slow.tone, Tone::Warn);
    }

    /// The desktop list drops the two networks DST4 puts below the fold, and
    /// keeps the custom tail — which is the one row with a bin on it.
    #[test]
    fn desktop_network_list_matches_the_mock() {
        let ids = crate::settings::fixtures::DESKTOP_NETWORK_IDS;
        assert_eq!(ids.len(), 6);
        assert!(!ids.contains(&"gnosis"));
        assert!(!ids.contains(&"tempo"));
        assert!(crate::settings::fixtures::network("xlayer").custom);
        assert!(!crate::settings::fixtures::network("ethereum").custom);
    }

    /// Every id in the fixture list resolves — `network()` panics otherwise,
    /// and it is called from the render path.
    #[test]
    fn every_fixture_network_id_resolves() {
        for id in crate::settings::fixtures::DESKTOP_NETWORK_IDS {
            assert_eq!(crate::settings::fixtures::network(id).id, id);
        }
        for id in crate::settings::fixtures::BANNER_CHAINS {
            assert_eq!(crate::settings::fixtures::network(id).id, id);
        }
    }
}
