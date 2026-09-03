//! The flow panel bodies (spec 021) — what the third column holds.
//!
//! Each function takes a body model and returns the `Div` the page drops into
//! its existing `panel_scaffold`. The scaffold owns the title, the back chevron
//! and the close button; these own only what is under them.

use gpui::{
    App, ClickEvent, Div, ElementId, InteractiveElement as _, IntoElement, ParentElement,
    SharedString, StatefulInteractiveElement as _, Styled, Window, div, px,
};

use crate::icons::{Icon, IconCache};
use crate::identicon::IdenticonCache;
use crate::theme::{self, Theme};
use crate::wallet::components::{activity_row, asset_row, empty_state, icon_img, token_icon};

use super::components::{
    accent_button, address_card, fact_row, fee_row, filter_chips, flow_search, ghost_button,
    inline_mark, mono_field, network_pill, network_row, qr_card, recipient_card, segmented_toggle,
    status_chip, token_header_card,
};
use super::fixtures::{
    AddToken, AddTokenResult, AssetsPanel, BatchImport, ContactPick, FeeTokenPick, FlowBody,
    HistoryGroup, ReceiveList, ReceiveQr, ScanModal, SendConfirm, SendForm, SendPick, SendReceipt,
    TxDetail,
};

/// One prepared click listener. The page builds these from `cx.listener`
/// before rendering, because a panel body has no entity to listen on.
pub type Click = Box<dyn Fn(&ClickEvent, &mut Window, &mut App) + 'static>;

/// The steps a panel can take, as listeners the page has already bound.
///
/// `None` means the affordance is inert — which is what the gallery wants, and
/// what a panel with nowhere to go should be. A chevron that leads nowhere is
/// a defect; an absent listener on a gallery chip is not.
#[derive(Default)]
pub struct PanelActions {
    /// DR1L: a row's QR icon opens that network's code.
    pub open_qr: Option<Click>,
    /// DA1L: a row opens its transaction.
    pub open_tx: Option<Click>,
    /// DSD1L: a row opens the send form for that token.
    pub open_send_form: Option<Click>,
    /// DSD2L: the fee row and the recipient picker.
    pub open_fee_token: Option<Click>,
    pub open_contact_pick: Option<Click>,
    /// DSD2L's recipient pills — one more payee, or a pasted list of them.
    pub add_recipient: Option<Click>,
    pub open_batch_import: Option<Click>,
    /// DT1L's "add a token by address".
    pub open_add_token: Option<Click>,
    /// DSD2eL's scan row — the address that is on a screen, not in the book.
    pub open_scan: Option<Click>,
    /// The panel's own CTA — continue, confirm, done.
    pub advance: Option<Click>,
}

/// Wrap an element so it answers to a click, when the page bound one.
///
/// The listener is MOVED in: each affordance is rendered once per pass, and an
/// action with no listener renders as a plain element rather than as a
/// cursor-pointer that does nothing.
fn clickable(id: impl Into<ElementId>, action: Option<Click>, body: impl IntoElement) -> Div {
    // The wrapper stays a plain `Div` so callers can keep composing columns;
    // the identified element lives inside it, because `.id()` changes the type.
    let wrap = div().flex().flex_col();
    match action {
        Some(action) => wrap.child(
            div()
                .id(id)
                .cursor_pointer()
                .child(body)
                .on_click(move |event, window, cx| action(event, window, cx)),
        ),
        None => wrap.child(body),
    }
}

/// A vertical stack with the panel's own rhythm.
fn column() -> Div {
    div().flex().flex_col().gap(px(12.))
}

/// The hairline that separates rows in every list here.
fn divider(theme: &Theme) -> Div {
    div().h(px(1.)).bg(theme.divider)
}

/// Dispatch one body model to its panel. `Scan` never arrives — the page draws
/// DS1L as a centred modal instead of a column.
pub fn render(
    body: &FlowBody,
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
    actions: PanelActions,
) -> Div {
    match body {
        FlowBody::Receive(model) => receive(model, theme, icons, actions.open_qr),
        FlowBody::ReceiveQr(model) => receive_qr(model, theme, icons, identicons),
        FlowBody::History(groups) => history(groups, theme, icons, actions.open_tx),
        FlowBody::TxDetail(model) => tx_detail(model, theme, icons, identicons),
        FlowBody::Assets(model) => assets(model, theme, icons, actions.open_add_token),
        FlowBody::AddToken(model) => add_token(model, theme, icons, identicons),
        FlowBody::SendPick(model) => send_pick(model, theme, icons, actions.open_send_form),
        FlowBody::SendForm(model) => send_form(model, theme, icons, identicons, actions),
        FlowBody::ContactPick(model) => {
            contact_pick(model, theme, icons, identicons, actions.open_scan)
        }
        FlowBody::FeeToken(model) => fee_token(model, theme, icons),
        FlowBody::BatchImport(model) => batch_import(model, theme, icons),
        FlowBody::SendConfirm(model) => {
            send_confirm(model, theme, icons, identicons, actions.advance)
        }
        FlowBody::SendReceipt(model) => send_receipt(model, theme, icons, actions.advance),
        // The page routes this away before it gets here; a column-shaped
        // viewfinder is the thing DS1L exists to avoid.
        FlowBody::Scan(model) => scan_placeholder(model, theme),
    }
}

fn receive(
    model: &ReceiveList,
    theme: &Theme,
    icons: &mut IconCache,
    mut open_qr: Option<Click>,
) -> Div {
    let mut col = column()
        .child(
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_muted)
                .child(model.subtitle.clone()),
        )
        .child(flow_search(theme, icons, model.search_placeholder.clone()));
    for (i, row) in model.rows.iter().enumerate() {
        if i > 0 {
            col = col.child(divider(theme));
        }
        // Only the first row carries the listener: the page has one bound
        // action per render, and every row opens the same address anyway.
        let action = if i == 0 { open_qr.take() } else { None };
        col = col.child(clickable(
            ElementId::from(("network", i)),
            action,
            network_row(theme, icons, row),
        ));
    }
    col
}

fn receive_qr(
    model: &ReceiveQr,
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
) -> Div {
    let mut col = column().child(
        div()
            .text_size(theme::text_row_sub())
            .text_color(theme.fg_base)
            .child(model.title.clone()),
    );

    if let Some((label, value)) = &model.contract {
        col = col.child(
            div()
                .flex()
                .items_center()
                .gap(px(6.))
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_subtle)
                        .child(label.clone()),
                )
                .child(
                    div()
                        .font_family(theme::font_mono())
                        .text_size(theme::text_mono_address())
                        .text_color(theme.fg_base)
                        .child(value.clone()),
                )
                .child(icon_img(icons, Icon::Copy, false, theme.fg_subtle, 13.)),
        );
    }

    col.child(address_card(
        theme,
        icons,
        identicons,
        model.account.name.clone(),
        model.account.seed.as_ref(),
        model.account.lines.clone(),
    ))
    .child(div().flex().justify_center().child(qr_card(
        theme,
        // The card is white in BOTH palettes, so its cut-out mark is
        // drawn against the LIGHT theme rather than the active one —
        // the dark palette's disc would punch an unreadable hole in a
        // code that a camera still has to resolve.
        Some(token_icon(
            &Theme::light(),
            model.centre.ticker.as_ref(),
            model.centre.badge,
        )),
    )))
    .child(
        div()
            .text_size(theme::text_row_sub())
            .text_color(theme.fg_subtle)
            .child(model.warning.clone()),
    )
    .child(ghost_button(theme, model.save_image.clone()))
    .child(ghost_button(theme, model.view_on_explorer.clone()))
}

fn history(
    groups: &[HistoryGroup],
    theme: &Theme,
    icons: &mut IconCache,
    mut open_tx: Option<Click>,
) -> Div {
    let mut col = div().flex().flex_col();
    let mut index = 0usize;
    for group in groups {
        col = col.child(
            div()
                .pt(px(12.))
                .pb(px(4.))
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_subtle)
                .child(group.label.clone()),
        );
        for row in &group.rows {
            let action = if index == 0 { open_tx.take() } else { None };
            col = col.child(clickable(
                ElementId::from(("history", index)),
                action,
                activity_row(theme, icons, row),
            ));
            index += 1;
        }
    }
    col
}

fn tx_detail(
    model: &TxDetail,
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
) -> Div {
    let mut col = column()
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_base)
                        .child(model.title.clone()),
                )
                .child(status_chip(theme, &model.status)),
        )
        .child(
            div()
                .text_size(theme::text_balance_hero())
                .font_weight(gpui::FontWeight::BOLD)
                // Money in is green; money out is plain ink, not red. Red means
                // something went wrong, and a transfer you chose to make did not.
                .text_color(if model.positive {
                    theme.success_base
                } else {
                    theme.fg_base
                })
                .child(model.amount.clone()),
        )
        .child(
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_subtle)
                .child(model.fiat.clone()),
        );

    for (i, fact) in model.facts.iter().enumerate() {
        if i > 0 {
            col = col.child(divider(theme));
        }
        col = col.child(fact_row(theme, icons, identicons, fact));
    }
    col.child(ghost_button(theme, model.view_on_explorer.clone()))
}

fn assets(
    model: &AssetsPanel,
    theme: &Theme,
    icons: &mut IconCache,
    open_add_token: Option<Click>,
) -> Div {
    let mut col = column();
    if let Some((dots, label, add)) = &model.filter {
        col = col.child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(network_pill(theme, icons, dots, label.clone()))
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_base)
                        .child(add.clone()),
                ),
        );
    }
    col = col.child(flow_search(theme, icons, model.search_placeholder.clone()));

    if let Some(empty) = &model.empty {
        return col
            .child(empty_state(
                theme,
                icons,
                Icon::WalletOutline,
                empty.title.clone(),
                empty.caption.clone(),
            ))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.))
                    .p(px(12.))
                    .rounded(px(14.))
                    .border_1()
                    .border_color(theme.border_card)
                    // Question, answer, then the button — DT4L puts the CTA at
                    // the BOTTOM of the card, because it is what to do about
                    // the paragraph above it, not a heading for it.
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_base)
                            .child(empty.hint_title.clone()),
                    )
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_muted)
                            .child(empty.hint_body.clone()),
                    )
                    .child(clickable(
                        "assets-empty-cta",
                        open_add_token,
                        ghost_button(theme, empty.cta.clone()),
                    )),
            );
    }

    for (i, row) in model.rows.iter().enumerate() {
        col = col.child(asset_row(
            ElementId::from(("flow-asset", i)),
            theme,
            icons,
            row,
        ));
    }
    // DT1L hangs this centred and quiet under the list — it is the way out of
    // "my token is missing", not a call to action competing with the rows.
    col.child(clickable(
        "assets-add-by-address",
        open_add_token,
        div()
            .flex()
            .justify_center()
            .py(px(8.))
            .text_size(theme::text_row_sub())
            .text_color(theme.fg_muted)
            .child(model.add_by_address.clone()),
    ))
}

fn add_token(
    model: &AddToken,
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
) -> Div {
    let mut col = column().child(segmented_toggle(
        theme,
        model.tab_erc20.clone(),
        model.tab_native.clone(),
        !model.native,
    ));

    if let Some((mark, name)) = &model.network {
        col = col.child(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .p(px(10.))
                .rounded(px(12.))
                .bg(theme.bg_sunken)
                .child(inline_mark(theme, mark))
                .child(
                    div()
                        .flex_1()
                        .text_size(theme::text_row_title())
                        .text_color(theme.fg_base)
                        .child(name.clone()),
                )
                .child(icon_img(
                    icons,
                    Icon::ChevronDown,
                    false,
                    theme.fg_muted,
                    14.,
                )),
        );
    }

    col = col.child(mono_field(
        theme,
        Some(model.field_label.clone()),
        model.field_value.clone(),
    ));

    col = match &model.result {
        AddTokenResult::Token { mark, name, detail } => col.child(
            div()
                .flex()
                .items_center()
                .gap(px(12.))
                .p(px(12.))
                .rounded(px(12.))
                .border_1()
                .border_color(theme.border_card)
                .child(token_icon(theme, mark.ticker.as_ref(), mark.badge))
                .child(
                    div()
                        .flex_1()
                        .min_w(px(0.))
                        .flex()
                        .flex_col()
                        .child(
                            div()
                                .text_size(theme::text_row_title())
                                .text_color(theme.fg_base)
                                .child(name.clone()),
                        )
                        .child(
                            div()
                                .text_size(theme::text_row_sub())
                                .text_color(theme.fg_muted)
                                .child(detail.clone()),
                        ),
                ),
        ),
        AddTokenResult::Network {
            mark,
            name,
            chip,
            facts,
        } => {
            let mut card = div()
                .flex()
                .flex_col()
                .p(px(12.))
                .rounded(px(12.))
                .border_1()
                .border_color(theme.border_card)
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(12.))
                        .child(token_icon(theme, mark.ticker.as_ref(), mark.badge))
                        .child(
                            div()
                                .flex_1()
                                .text_size(theme::text_row_title())
                                .text_color(theme.fg_base)
                                .child(name.clone()),
                        )
                        .child(status_chip(theme, chip)),
                );
            for fact in facts {
                card = card.child(fact_row(theme, icons, identicons, fact));
            }
            col.child(card)
        }
    };

    col.child(accent_button(theme, model.cta.clone()))
}

fn send_pick(
    model: &SendPick,
    theme: &Theme,
    icons: &mut IconCache,
    mut open_form: Option<Click>,
) -> Div {
    let (dots, pill_label) = &model.pill;
    let mut col = column()
        .child(flow_search(theme, icons, model.search_placeholder.clone()))
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .gap(px(8.))
                .child(filter_chips(theme, &model.filters))
                .child(network_pill(theme, icons, dots, pill_label.clone()).flex_none()),
        );
    for (i, row) in model.rows.iter().enumerate() {
        let action = if i == 0 { open_form.take() } else { None };
        col = col.child(clickable(
            ElementId::from(("flow-send-row", i)),
            action,
            asset_row(ElementId::from(("flow-send", i)), theme, icons, row),
        ));
    }
    // DSD1L sets this as a quiet centred link, not a button: sending several
    // tokens at once is a different journey, not the main one on this panel.
    col.child(
        div()
            .flex()
            .justify_center()
            .py(px(8.))
            .text_size(theme::text_row_sub())
            .text_color(theme.fg_muted)
            .child(model.cta.clone()),
    )
}

fn send_form(
    model: &SendForm,
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
    mut actions: PanelActions,
) -> Div {
    let (mark, symbol, detail, max) = &model.token;
    let mut col = column().child(token_header_card(
        theme,
        mark,
        symbol.clone(),
        detail.clone(),
        max.clone(),
    ));

    if let Some((value, fiat)) = &model.amount {
        col = col.child(
            div()
                .flex()
                .flex_col()
                .items_center()
                .py(px(16.))
                .child(
                    div()
                        .text_size(theme::text_balance_hero())
                        .font_weight(gpui::FontWeight::BOLD)
                        .text_color(theme.fg_base)
                        .child(value.clone()),
                )
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_muted)
                        .child(fiat.clone()),
                ),
        );
    }

    if let Some((label, lines, seed)) = &model.recipient {
        col = col
            .child(
                div()
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_subtle)
                    .child(label.clone()),
            )
            .child(clickable(
                "flow-recipient",
                actions.open_contact_pick.take(),
                address_card(
                    theme,
                    icons,
                    identicons,
                    lines.0.clone(),
                    seed.as_ref(),
                    (lines.1.clone(), SharedString::default()),
                ),
            ));
    }

    if let Some(add) = &model.add_recipient {
        col = col.child(clickable(
            "flow-add-recipient",
            actions.add_recipient.take(),
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_muted)
                .child(SharedString::from(format!("+  {add}"))),
        ));
    }

    for recipient in &model.recipients {
        col = col.child(recipient_card(theme, icons, identicons, recipient));
    }

    if !model.recipient_actions.is_empty() {
        // The pills are ordered the way the fixture builds them — one more
        // payee, the contact book, a pasted list — so each gets the listener
        // that matches the label the mock prints on it.
        let mut bound = [
            actions.add_recipient.take(),
            actions.open_contact_pick.take(),
            actions.open_batch_import.take(),
        ];
        let mut pills = div().flex().gap(px(6.));
        for (i, label) in model.recipient_actions.iter().enumerate() {
            let pill = div()
                .flex_1()
                .py(px(8.))
                .rounded(px(999.))
                .border_1()
                .border_color(theme.border_card)
                .flex()
                .items_center()
                .justify_center()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_base)
                .child(label.clone());
            let action = bound.get_mut(i).and_then(Option::take);
            pills = pills
                .child(clickable(ElementId::from(("recipient-action", i)), action, pill).flex_1());
        }
        col = col.child(pills);
    }

    if let Some((label, value)) = &model.summary {
        col = col.child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_subtle)
                        .child(label.clone()),
                )
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_base)
                        .child(value.clone()),
                ),
        );
    }

    col.child(clickable(
        "flow-fee-row",
        actions.open_fee_token.take(),
        fee_row(theme, icons, &model.fee),
    ))
    .child(clickable(
        "flow-form-cta",
        actions.advance.take(),
        accent_button(theme, model.cta.clone()),
    ))
}

fn contact_pick(
    model: &ContactPick,
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
    open_scan: Option<Click>,
) -> Div {
    let mut col = column()
        .child(flow_search(theme, icons, model.search_placeholder.clone()))
        // Scan sits above the saved people: most sends go to someone already in
        // the book, but the ones that don't are the ones where a person is
        // holding a phone in one hand and an address in the other.
        .child(clickable(
            "flow-scan-row",
            open_scan,
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .p(px(12.))
                .rounded(px(12.))
                .bg(theme.bg_sunken)
                .child(icon_img(icons, Icon::QrCode, false, theme.fg_subtle, 15.))
                .child(
                    div()
                        .flex_1()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_base)
                        .child(model.scan_row.clone()),
                )
                .child(icon_img(
                    icons,
                    Icon::ChevronRight,
                    false,
                    theme.fg_subtle,
                    12.,
                )),
        ))
        .child(
            div()
                .pt(px(4.))
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_subtle)
                .child(model.groups_title.clone()),
        );

    for (name, count, first, second) in &model.groups {
        col = col.child(
            div()
                .flex()
                .items_center()
                .gap(px(12.))
                .py(px(8.))
                // Two overlapping discs stand for "several people" without
                // drawing any of them — a group has no single face to show.
                .child(
                    div()
                        .flex()
                        .child(div().w(px(28.)).h(px(28.)).rounded(px(14.)).bg(*first))
                        .child(
                            div()
                                .w(px(28.))
                                .h(px(28.))
                                .rounded(px(14.))
                                .bg(*second)
                                .ml(px(-10.)),
                        ),
                )
                .child(
                    div()
                        .flex_1()
                        .text_size(theme::text_row_title())
                        .text_color(theme.fg_base)
                        .child(name.clone()),
                )
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_subtle)
                        .child(count.clone()),
                ),
        );
    }

    col = col.child(
        div()
            .pt(px(4.))
            .text_size(theme::text_row_sub())
            .text_color(theme.fg_subtle)
            .child(model.contacts_title.clone()),
    );

    for contact in &model.contacts {
        let mut name_row = div().flex().items_center().gap(px(6.)).child(
            div()
                .text_size(theme::text_row_title())
                .text_color(theme.fg_base)
                .child(contact.name.clone()),
        );
        if let Some(group) = &contact.group {
            name_row = name_row.child(
                div()
                    .px(px(6.))
                    .rounded(px(4.))
                    .bg(theme.bg_sunken)
                    .text_size(theme::text_label())
                    .text_color(theme.fg_muted)
                    .child(group.clone()),
            );
        }
        col = col.child(
            div()
                .flex()
                .items_center()
                .gap(px(12.))
                .py(px(8.))
                .child(crate::wallet::components::identicon_avatar(
                    identicons,
                    contact.seed.as_ref(),
                    28.,
                ))
                .child(
                    div()
                        .flex_1()
                        .min_w(px(0.))
                        .flex()
                        .flex_col()
                        .child(name_row)
                        .child(
                            div()
                                .font_family(theme::font_mono())
                                .text_size(theme::text_mono_address())
                                .text_color(theme.fg_subtle)
                                .child(contact.address.clone()),
                        ),
                )
                .child(icon_img(
                    icons,
                    Icon::ChevronRight,
                    false,
                    theme.fg_subtle,
                    12.,
                )),
        );
    }
    col
}

fn fee_token(model: &FeeTokenPick, theme: &Theme, icons: &mut IconCache) -> Div {
    let mut col = column().child(
        // Paying gas in a stablecoin is unusual enough that someone seeing USDC
        // offered as a fee token will wonder whether they are being asked to
        // send it. Saying what the choice is for, once, is cheaper than a
        // tooltip on each row.
        div()
            .text_size(theme::text_row_sub())
            .text_color(theme.fg_muted)
            .child(model.hint.clone()),
    );
    for row in &model.rows {
        let shell = div()
            .flex()
            .items_center()
            .gap(px(12.))
            .p(px(10.))
            .rounded(px(12.));
        let shell = if row.selected {
            shell.bg(theme.bg_raised)
        } else {
            shell
        };
        let mut entry = shell
            .child(token_icon(theme, row.mark.ticker.as_ref(), row.mark.badge))
            .child(
                div()
                    .flex_1()
                    .min_w(px(0.))
                    .flex()
                    .flex_col()
                    .child(
                        div()
                            .text_size(theme::text_row_title())
                            .text_color(theme.fg_base)
                            .child(row.symbol.clone()),
                    )
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_muted)
                            .child(row.balance.clone()),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .items_end()
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_base)
                            .child(row.fee.clone()),
                    )
                    .child(
                        div()
                            .text_size(theme::text_label())
                            .text_color(theme.fg_subtle)
                            .child(model.estimate_label.clone()),
                    ),
            );
        // Only the chosen row draws the tick; the others leave the space, so
        // choosing one does not shift the rows under it.
        if row.selected {
            entry = entry.child(icon_img(icons, Icon::Check, false, theme.accent, 14.));
        }
        col = col.child(entry);
    }
    col
}

fn batch_import(model: &BatchImport, theme: &Theme, icons: &mut IconCache) -> Div {
    let mut col = column()
        .child(segmented_toggle(
            theme,
            model.unit_fiat.clone(),
            model.unit_token.clone(),
            true,
        ))
        .child(mono_field(theme, None, model.paste.clone()))
        .child(
            div()
                .flex()
                .justify_center()
                .gap(px(8.))
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_muted)
                        .child(model.import_file.clone()),
                )
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_muted)
                        .child(model.template.clone()),
                ),
        )
        .child(divider(theme))
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_subtle)
                        .child(model.rate_section.clone()),
                )
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_base)
                        .child(model.rate_value.clone()),
                ),
        )
        .child(
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_subtle)
                .child(model.rate_hint.clone()),
        )
        .child(
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_muted)
                .child(model.parsed.clone()),
        );

    for row in &model.rows {
        col = col.child(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .py(px(6.))
                .child(icon_img(
                    icons,
                    if row.ok { Icon::Check } else { Icon::X },
                    false,
                    if row.ok {
                        theme.success_base
                    } else {
                        theme.error_base
                    },
                    13.,
                ))
                .child(
                    div()
                        .flex_1()
                        .min_w(px(0.))
                        .font_family(theme::font_mono())
                        .text_size(theme::text_mono_address())
                        .text_color(theme.fg_base)
                        .child(row.address.clone()),
                )
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_muted)
                        .child(row.conversion.clone()),
                ),
        );
    }

    col.child(
        div()
            .text_size(theme::text_row_sub())
            .text_color(theme.error_base)
            .child(model.rejected.clone()),
    )
    // Bad rows are marked and skipped, never silently dropped, and the CTA
    // counts only the good ones — a button that says "Import 3" and imports 2
    // is how someone underpays a contractor.
    .child(accent_button(theme, model.cta.clone()))
}

fn send_confirm(
    model: &SendConfirm,
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
    advance: Option<Click>,
) -> Div {
    let mut col = column().child(
        div()
            .flex()
            .flex_col()
            .items_center()
            .py(px(12.))
            .child(
                div()
                    .text_size(theme::text_balance_hero())
                    .font_weight(gpui::FontWeight::BOLD)
                    .text_color(theme.fg_base)
                    .child(model.amount.clone()),
            )
            .child(
                div()
                    .text_size(theme::text_row_sub())
                    .text_color(theme.fg_subtle)
                    .child(model.subline.clone()),
            ),
    );

    let mut card = div()
        .flex()
        .flex_col()
        .px(px(12.))
        .rounded(px(12.))
        .bg(theme.bg_sunken);
    for (i, fact) in model.facts.iter().enumerate() {
        if i > 0 {
            card = card.child(divider(theme));
        }
        card = card.child(fact_row(theme, icons, identicons, fact));
    }
    col = col.child(card);

    if !model.breakdown.is_empty() {
        let mut list = div()
            .flex()
            .flex_col()
            .px(px(12.))
            .rounded(px(12.))
            .bg(theme.bg_sunken);
        for item in &model.breakdown {
            list = list.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .py(px(8.))
                    .child(
                        div()
                            .flex_1()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_base)
                            .child(item.label.clone()),
                    )
                    .child(
                        div()
                            .text_size(theme::text_row_sub())
                            .text_color(theme.fg_base)
                            .child(item.value.clone()),
                    ),
            );
        }
        col = col.child(list);
    }

    // Per the SPEC sheet this is the ONE accent CTA in the whole send journey.
    col.child(clickable(
        "flow-confirm-cta",
        advance,
        accent_button(theme, model.cta.clone()),
    ))
}

fn send_receipt(
    model: &SendReceipt,
    theme: &Theme,
    icons: &mut IconCache,
    advance: Option<Click>,
) -> Div {
    let mut col = column().child(
        div()
            .flex()
            .flex_col()
            .items_center()
            .gap(px(6.))
            .py(px(24.))
            .child(
                div()
                    .w(px(88.))
                    .h(px(88.))
                    .rounded(px(44.))
                    .bg(theme.bg_sunken)
                    .flex()
                    .items_center()
                    .justify_center()
                    .child(icon_img(icons, Icon::RefreshCw, false, theme.fg_muted, 26.)),
            )
            .child(
                div()
                    .text_size(theme::text_panel_title())
                    .font_weight(gpui::FontWeight::BOLD)
                    .text_color(theme.fg_base)
                    .child(model.title.clone()),
            ),
    );

    for (i, caption) in model.captions.iter().enumerate() {
        col = col.child(
            div()
                .flex()
                .justify_center()
                .text_size(theme::text_row_sub())
                // The second caption is the one that says "you can leave" —
                // true, useful, and not what the person is waiting to read.
                .text_color(if i == 0 {
                    theme.fg_muted
                } else {
                    theme.fg_subtle
                })
                .child(caption.clone()),
        );
    }

    if let Some((label, value)) = &model.hash {
        col = col.child(
            div()
                .flex()
                .items_center()
                .justify_center()
                .gap(px(6.))
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_subtle)
                        .child(label.clone()),
                )
                .child(
                    div()
                        .font_family(theme::font_mono())
                        .text_size(theme::text_mono_address())
                        .text_color(theme.fg_base)
                        .child(value.clone()),
                ),
        );
    }

    // "Close · keep running" is load-bearing copy: the transaction does not
    // depend on this panel staying open.
    col.child(clickable(
        "flow-receipt-cta",
        advance,
        ghost_button(theme, model.cta.clone()),
    ))
}

/// DS1L's body if it ever reached the column. It does not — the page draws the
/// scanner as a centred modal — so this is the honest fallback rather than a
/// second viewfinder implementation.
fn scan_placeholder(model: &ScanModal, theme: &Theme) -> Div {
    column().child(
        div()
            .text_size(theme::text_row_sub())
            .text_color(theme.fg_muted)
            .child(model.hint.clone()),
    )
}

/// DS1L — the scanner, centred over a dimmed window.
///
/// A scanner is a viewfinder and a 400px column is the wrong shape for one, so
/// this is the single flow the third column does not host.
pub fn scan_modal(model: &ScanModal, theme: &Theme, icons: &mut IconCache) -> Div {
    let mut tools = div().flex().gap(px(8.));
    for label in &model.tools {
        tools = tools.child(ghost_button(theme, label.clone()));
    }

    div()
        .w(px(560.))
        .p(px(24.))
        .rounded(px(20.))
        .bg(theme.bg_base)
        .flex()
        .flex_col()
        .gap(px(16.))
        .child(
            div()
                .flex()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .text_size(theme::text_panel_title())
                        .font_weight(gpui::FontWeight::BOLD)
                        .text_color(theme.fg_base)
                        .child(model.title.clone()),
                )
                .child(icon_img(icons, Icon::X, false, theme.fg_muted, 18.)),
        )
        .child(
            // The viewfinder is landscape, not square — roughly what a webcam
            // hands you, and what DS1L measures.
            div()
                .w_full()
                .h(px(336.))
                .rounded(px(8.))
                .bg(theme.bg_sunken),
        )
        .child(
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_muted)
                .child(model.hint.clone()),
        )
        .child(tools)
}
