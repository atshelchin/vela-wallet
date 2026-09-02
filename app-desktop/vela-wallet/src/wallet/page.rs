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
use crate::theme::{
    self, CONTACTS_BODY_PAD_TOP, CONTACTS_BUTTON_H, CONTACTS_HEADER_H, CONTACTS_HERO_AVATAR,
    CONTACTS_RAIL_LABEL_H, CONTACTS_RAIL_ROW_H, CONTACTS_RAIL_W, GALLERY_BAR_H, SIDEBAR_PAD,
    SIDEBAR_TOP, SIDEBAR_W, THIRD_PANEL_W, Theme, ThemeMode, WALLET_PAD_TOP, WALLET_PAD_X,
};
use crate::window_frame::{
    CAPTION_H, frame_tiling, owns_titlebar, round_to_frame, titlebar, window_frame,
};

use super::WalletStrings;
use super::components::{
    action_pill, activity_row, asset_row, balance_display, chain_row, empty_state,
    identicon_avatar, nav_row, qr_placeholder, section_header, section_header_parts,
    section_header_row, sidebar_search, skeleton_row, token_icon, wallet_header,
};
use super::fixtures::{self, ADDRESS_FULL, IDENTICON_BOARD_SEEDS, WALLET_NAME};
use crate::flows::{
    FlowEntry, FlowPanel, FlowStep, FlowStrings, fixtures as flow_fixtures, panels,
};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PanelId {
    None,
    Receive,
    AssetDetail,
    /// Spec 018 DC2 — the contacts third-column content.
    ContactDetail,
    /// Spec 021 — whatever is on top of `flows`. The stack is the state; this
    /// variant only says the column belongs to it.
    Flow,
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
}

/// The two anchored menus DC5/DC6 define. Both render through one
/// `menu_card` — the difference is which fixture feeds it and where it hangs.
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
    Components,
    ContactsComponents,
    Identicons,
}

impl GalleryTab {
    /// The chip strip, in order. One array so the bar and the inventory test
    /// can never disagree about which states the gallery exposes.
    const ALL: [(GalleryTab, &'static str); 12] = [
        (GalleryTab::D1, "D1"),
        (GalleryTab::D2, "D2"),
        (GalleryTab::D3, "D3"),
        (GalleryTab::Dc1, "DC1"),
        (GalleryTab::Dc2, "DC2"),
        (GalleryTab::Dc3, "DC3"),
        (GalleryTab::Dc4, "DC4"),
        (GalleryTab::Dc5, "DC5"),
        (GalleryTab::Dc6, "DC6"),
        (GalleryTab::Components, "Components"),
        (GalleryTab::ContactsComponents, "Contacts"),
        (GalleryTab::Identicons, "Identicons"),
    ];

    /// Spec 021's chips are generated from `FlowPanel::ALL` rather than listed
    /// again here, so a state cannot be added to the matrix and forgotten in
    /// the gallery.
    fn flow_chips() -> impl Iterator<Item = (FlowPanel, &'static str)> {
        FlowPanel::ALL.into_iter()
    }

    /// The contacts state code this chip reproduces, if any
    /// (data-model.md §Screen states — `dc1`…`dc6`).
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
    section: Section,
    panel: PanelId,
    /// Spec 021: the open flow panels, deepest last. Empty means no flow.
    ///
    /// A stack, not a single id — the mocks stack: Receive opens a network list
    /// and a network opens its QR; Send runs picker → form → confirm → receipt.
    /// DR2L, DA2L, DT3L and DSD2L all draw a back chevron, and a chevron has to
    /// lead somewhere.
    flows: Vec<FlowPanel>,
    flow_strings: FlowStrings,
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
            section,
            panel: if FlowPanel::from_env().is_some() {
                PanelId::Flow
            } else {
                PanelId::None
            },
            flows: FlowPanel::from_env()
                .map(FlowPanel::stack)
                .unwrap_or_default(),
            flow_strings: FlowStrings::resolve(&loc),
            group: None,
            contact: 0,
            contacts_empty: false,
            menu: None,
            tab: match section {
                Section::Wallet => GalleryTab::D1,
                Section::Contacts => GalleryTab::Dc1,
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
                .bg(theme.backdrop)
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
            (Icon::NavSettings, s.nav_settings.clone(), None),
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
                    this.enter_flow(FlowEntry::Receive);
                    cx.notify();
                })),
            )
            .child(
                action_pill(
                    "pill-send",
                    theme,
                    &mut self.icons,
                    Icon::ArrowUpRight,
                    self.strings.action_send.clone(),
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    this.enter_flow(FlowEntry::Send);
                    cx.notify();
                })),
            )
            .child(
                action_pill(
                    "pill-scan",
                    theme,
                    &mut self.icons,
                    Icon::ScanLine,
                    self.strings.action_scan.clone(),
                )
                .on_click(cx.listener(|this, _, _, cx| {
                    this.enter_flow(FlowEntry::Scan);
                    cx.notify();
                })),
            );

        let mut activity_col = div().flex().flex_col();
        for (i, row) in activity.iter().enumerate() {
            activity_col = activity_col.child(
                div()
                    .id(ElementId::from(("activity", i)))
                    .cursor_pointer()
                    .child(activity_row(theme, &mut self.icons, row))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.enter_flow(FlowEntry::TxDetail);
                        cx.notify();
                    })),
            );
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
            .child(
                div()
                    .id("section-activity")
                    .cursor_pointer()
                    .child(section_header(theme, &mut self.icons, s_activity, s_all))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.enter_flow(FlowEntry::Activity);
                        cx.notify();
                    })),
            )
            .child(activity_col)
            .child({
                // The two halves lead to two different panels: the title names
                // the assets list, and the action reads 添加, so it opens the
                // add-token panel stacked on it — which is what makes DT3L's
                // back chevron lead somewhere.
                let (title, action) = section_header_parts(theme, &mut self.icons, s_assets, s_add);
                section_header_row()
                    .child(
                        div()
                            .id("section-assets")
                            .cursor_pointer()
                            .child(title)
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.enter_flow(FlowEntry::Assets);
                                cx.notify();
                            })),
                    )
                    .child(
                        div()
                            .id("section-assets-add")
                            .cursor_pointer()
                            .child(action)
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.enter_flow(FlowEntry::AddToken);
                                cx.notify();
                            })),
                    )
            })
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
        self.panel_scaffold_with(theme, title, None, false, body, cx)
    }

    /// `panel_scaffold`, with the two things the flow panels need: a chevron
    /// beside the title inside the SAME bar (the mocks draw one row, not a
    /// close floating above a title), and the hairline the flow mocks rule
    /// under it.
    fn panel_scaffold_with(
        &mut self,
        theme: &Theme,
        title: SharedString,
        lead: Option<gpui::AnyElement>,
        underline: bool,
        body: Div,
        cx: &mut Context<Self>,
    ) -> Div {
        let mut heading = div().flex().items_center().gap(px(6.));
        if let Some(lead) = lead {
            heading = heading.child(lead);
        }
        heading = heading.child(
            div()
                .text_size(theme::text_panel_title())
                .font_weight(gpui::FontWeight::BOLD)
                .text_color(theme.fg_base)
                .child(title),
        );
        let mut bar = div()
            .flex()
            .items_center()
            .justify_between()
            .px(px(20.))
            .pt(px(SIDEBAR_TOP))
            .pb(px(8.));
        if underline {
            bar = bar.border_b_1().border_color(theme.divider);
        }
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
                bar.child(heading).child(
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

    /// The flow column: spec 015's panel scaffold plus the back chevron the
    /// wallet-2 mocks draw beside the title.
    fn flow_scaffold(
        &mut self,
        theme: &Theme,
        title: SharedString,
        back: Option<SharedString>,
        body: Div,
        cx: &mut Context<Self>,
    ) -> Div {
        // The root of a flow has nowhere to step back TO — closing the column
        // and stepping back one level are different gestures, and only the
        // close button should offer the first.
        let Some(_label) = back else {
            return self.panel_scaffold_with(theme, title, None, true, body, cx);
        };
        let chevron = div()
            .id("flow-back")
            .w(px(28.))
            .h(px(28.))
            .rounded(px(14.))
            .flex()
            .items_center()
            .justify_center()
            .cursor_pointer()
            .hover(|el| el.bg(theme.bg_sunken))
            .child(crate::wallet::components::icon_img(
                &mut self.icons,
                Icon::ChevronLeft,
                false,
                theme.fg_muted,
                16.,
            ))
            .on_click(cx.listener(|this, _, _, cx| {
                this.flows.pop();
                if this.flows.is_empty() {
                    this.panel = PanelId::None;
                }
                cx.notify();
            }));
        self.panel_scaffold_with(
            theme,
            title,
            Some(chevron.into_any_element()),
            true,
            body,
            cx,
        )
    }

    /// Open a flow from the wallet home (spec 021 SC-002).
    fn enter_flow(&mut self, entry: FlowEntry) {
        self.flows = FlowPanel::entry(entry);
        self.panel = PanelId::Flow;
    }

    /// Take one step deeper into the open flow.
    ///
    /// `FlowPanel::step` is the only place that knows where a step leads, so a
    /// step the mocks do not draw is a no-op here rather than a wrong panel.
    fn push_step(&mut self, step: FlowStep) {
        let Some(current) = self.flows.last().copied() else {
            return;
        };
        if let Some(next) = current.step(step) {
            self.flows.push(next);
        }
    }

    /// One bound listener that pushes `step` onto the flow stack.
    fn step_action(step: FlowStep, cx: &mut Context<Self>) -> panels::Click {
        Box::new(cx.listener(move |this, _: &gpui::ClickEvent, _, cx| {
            this.push_step(step);
            cx.notify();
        }))
    }

    /// The listeners this panel's affordances answer to.
    ///
    /// Bound from `FlowPanel::step`, so an affordance is live exactly when the
    /// mocks draw somewhere for it to go — the chevron and the destination
    /// cannot drift apart.
    fn flow_actions(panel: FlowPanel, cx: &mut Context<Self>) -> panels::PanelActions {
        let bind = |step: FlowStep, cx: &mut Context<Self>| {
            panel.step(step).map(|_| Self::step_action(step, cx))
        };
        let mut actions = panels::PanelActions {
            open_qr: bind(FlowStep::ReceiveQr, cx),
            open_tx: bind(FlowStep::TxDetail, cx),
            open_send_form: bind(FlowStep::SendForm, cx),
            open_fee_token: bind(FlowStep::FeeToken, cx),
            open_contact_pick: bind(FlowStep::ContactPick, cx),
            open_add_token: bind(FlowStep::AddToken, cx),
            open_scan: bind(FlowStep::Scan, cx),
            add_recipient: bind(FlowStep::AddRecipient, cx),
            open_batch_import: bind(FlowStep::BatchImport, cx),
            advance: bind(FlowStep::SendConfirm, cx).or(bind(FlowStep::SendReceipt, cx)),
        };
        // DSD4's CTA is "close · keep running": the transfer outlives the
        // panel, so the last step out of the flow is out of the column.
        if panel == FlowPanel::Dsd4 {
            actions.advance = Some(Box::new(cx.listener(
                |this, _: &gpui::ClickEvent, _, cx| {
                    this.flows.clear();
                    this.panel = PanelId::None;
                    cx.notify();
                },
            )));
        }
        actions
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
    /// Gallery-only: show one flow panel, with the stack the mocks imply so
    /// its back chevron behaves the way it does in the app.
    fn select_flow(&mut self, panel: FlowPanel) {
        self.section = Section::Wallet;
        self.menu = None;
        self.flows = panel.stack();
        self.panel = PanelId::Flow;
    }

    fn select_tab(&mut self, tab: GalleryTab, window: &Window) {
        self.tab = tab;
        self.section = match tab {
            GalleryTab::Dc1
            | GalleryTab::Dc2
            | GalleryTab::Dc3
            | GalleryTab::Dc4
            | GalleryTab::Dc5
            | GalleryTab::Dc6 => Section::Contacts,
            _ => Section::Wallet,
        };
        self.flows.clear();
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
        // Spec 021's nineteen chips, generated from the matrix.
        for (i, (panel, label)) in GalleryTab::flow_chips().enumerate() {
            let active = self.panel == PanelId::Flow && self.flows.last() == Some(&panel);
            bar = bar.child(
                self.chip(
                    ElementId::from(("flow-tab", i)),
                    theme,
                    label.into(),
                    active,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.select_flow(panel);
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

    fn wallet_columns(&mut self, theme: &Theme, caption: bool, cx: &mut Context<Self>) -> Div {
        let mut columns = div()
            .flex_1()
            .min_h(px(0.))
            .flex()
            .child(self.sidebar(theme, cx));
        columns = match self.section {
            Section::Wallet => columns.child(self.content(theme, cx)),
            Section::Contacts => columns.child(self.contacts_content(theme, caption, cx)),
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
            PanelId::Flow => match self.flows.last().copied() {
                // DS1L is a centred modal over the window, not a column — the
                // page root draws it; see `scan_overlay`.
                None | Some(FlowPanel::Ds1) => columns,
                Some(panel) => {
                    let body = flow_fixtures::body(panel, &self.flow_strings);
                    let title = flow_fixtures::panel_title(panel, &self.flow_strings);
                    let actions = Self::flow_actions(panel, cx);
                    let rendered = panels::render(
                        &body,
                        theme,
                        &mut self.icons,
                        &mut self.identicons,
                        actions,
                    );
                    // The chevron appears only once the column is more than one
                    // level deep: closing the whole column is not the same
                    // gesture as stepping back one.
                    let back = (self.flows.len() > 1).then(|| self.flow_strings.back.clone());
                    columns.child(self.flow_scaffold(theme, title, back, rendered, cx))
                }
            },
        };
        columns
    }

    /// The anchored menu overlay (DC5/DC6). Appended last in the page root and
    /// deferred so it paints above the columns; `occlude` keeps clicks off the
    /// list underneath and `on_mouse_down_out` dismisses it (research.md D2).
    /// DS1L — the scanner, centred over a dimmed window.
    ///
    /// The one flow the third column does not host: a scanner is a viewfinder,
    /// and a 400px column is the wrong shape for one. Same scrim idiom as the
    /// sign-out dialog.
    fn scan_overlay(&mut self, theme: &Theme, cx: &mut Context<Self>) -> Option<gpui::AnyElement> {
        if self.flows.last() != Some(&FlowPanel::Ds1) {
            return None;
        }
        let flow_fixtures::FlowBody::Scan(model) =
            flow_fixtures::body(FlowPanel::Ds1, &self.flow_strings)
        else {
            return None;
        };
        let card = panels::scan_modal(&model, theme, &mut self.icons);
        Some(
            div()
                .id("scan-scrim")
                .absolute()
                .inset_0()
                .flex()
                .items_center()
                .justify_center()
                .bg(theme.backdrop)
                .on_click(cx.listener(|this, _, _, cx| {
                    this.flows.clear();
                    this.panel = PanelId::None;
                    cx.notify();
                }))
                .child(card)
                .into_any_element(),
        )
    }

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

        let scan = self.scan_overlay(&theme, cx);
        let menu = self.menu_overlay(&theme, cx);
        let sign_out = self.sign_out_dialog(&theme, cx);
        let mut root = div()
            .size_full()
            .relative()
            .bg(theme.bg_base)
            .text_color(theme.fg_base)
            .child(body);
        if let Some(scan) = scan {
            root = root.child(scan);
        }
        if let Some(menu) = menu {
            root = root.child(menu);
        }
        // Over everything, including the anchored menu: it is the one dialog
        // whose answer changes which screen the app is on.
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
                "Components",
                "Contacts",
                "Identicons",
            ]
        );
    }
}
