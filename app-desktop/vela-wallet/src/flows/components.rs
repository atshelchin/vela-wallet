//! Wallet-flow visuals (spec 021): theme + resolved strings in, elements out.
//! No i18n keys, no page state — the same contract `wallet/components.rs`
//! established.
//!
//! The spec-015 vocabulary is reused rather than re-drawn: `activity_row`,
//! `asset_row`, `token_icon`, `identicon_avatar` and `empty_state` all come
//! from next door. What is here is what those did not already cover.

use gpui::{Div, Hsla, ParentElement, SharedString, Styled, div, px};

use crate::icons::{Icon, IconCache};
use crate::identicon::IdenticonCache;
use crate::theme::{self, Theme};
use crate::wallet::components::{icon_img, identicon_avatar, token_icon};

use super::fixtures::{
    FactLead, FactRow, FeeRow, FilterChip, NetworkRow, RecipientCard, StatusChip, StatusTone,
    TokenMark,
};

/// The receive network-row chain badge, measured 40 in R1. Larger than the 32
/// token icon because this row IS the network, not a token that happens to be
/// on one.
// Cards, fields and rows in these panels sit on `bg_sunken`, not `bg_raised`:
// sampled off the light mocks they are the warm grey #f5f3ef against the
// column's #fafaf8, and white makes the third column read brighter than the
// two beside it. `bg_raised` stays for what sits ON one of those surfaces —
// the network pill, the chosen segment, the chosen fee row.
pub const CHAIN_BADGE: f32 = 40.;
/// The token mark inside a line of text (fee row, fact row, notice banner).
pub const INLINE_MARK: f32 = 26.;
/// DT1L's network pill, measured off the mock: a 30 px capsule whose three
/// 16 px dots overlap by 3 px each. Overlapped, not spaced — the cluster stands
/// for "several networks", and three separate dots read as three controls.
pub const PILL_H: f32 = 30.;
pub const PILL_DOT: f32 = 16.;
pub const PILL_DOT_OVERLAP: f32 = 3.;
/// The QR card, measured 344x344 in R2 — fixed, never fluid.
pub const QR_CARD: f32 = 344.;

/// One row of DR1L: the chain, the address on it, and the two things a person
/// does with an address.
///
/// Both actions sit on the row rather than behind it. The point of the panel is
/// that ONE address serves every network, so the fastest path is to copy it
/// from whichever line you looked at, without opening anything.
pub fn network_row(theme: &Theme, icons: &mut IconCache, row: &NetworkRow) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(12.))
        .py(px(10.))
        .child(
            div()
                .w(px(CHAIN_BADGE))
                .h(px(CHAIN_BADGE))
                .rounded(px(CHAIN_BADGE / 2.))
                .bg(row.badge)
                .flex()
                .items_center()
                .justify_center()
                .text_size(theme::text_row_sub())
                .font_weight(gpui::FontWeight::BOLD)
                // The chain colours are brand fills, dark enough for white in
                // both appearances — so the mode-invariant white.
                .text_color(gpui::Hsla::from(gpui::rgb(0xffffff)))
                .child(row.code.clone()),
        )
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
                        .child(row.name.clone()),
                )
                .child(
                    div()
                        .font_family(theme::font_mono())
                        .text_size(theme::text_mono_address())
                        .text_color(theme.fg_subtle)
                        .child(row.address.clone()),
                ),
        )
        .child(icon_img(icons, Icon::Copy, false, theme.fg_muted, 16.))
        .child(icon_img(icons, Icon::QrCode, false, theme.fg_muted, 16.))
}

/// The token mark inside a line of text.
///
/// A component and not a scaled `token_icon`: the glyph has to shrink with the
/// circle, and scaling only the box clips a three-letter ticker out of it.
/// The chain-filter pill (DT1L): overlapped dots, a label, a chevron.
pub fn network_pill(
    theme: &Theme,
    icons: &mut IconCache,
    dots: &[Hsla],
    label: SharedString,
) -> Div {
    // The cluster's width is stated, not measured. The overlap is negative
    // margins, and a row whose children carry them does not report the width
    // it actually paints — left to flex, the cluster measures zero and the
    // dots paint straight over the label beside them.
    let span = PILL_DOT + (dots.len().saturating_sub(1) as f32) * (PILL_DOT - PILL_DOT_OVERLAP);
    let mut cluster = div().flex().items_center().w(px(span)).flex_none();
    for (i, dot) in dots.iter().enumerate() {
        let mut disc = div()
            .w(px(PILL_DOT))
            .h(px(PILL_DOT))
            .rounded(px(PILL_DOT / 2.))
            .flex_none()
            .border_2()
            .border_color(theme.bg_raised)
            .bg(*dot);
        if i > 0 {
            disc = disc.ml(px(-PILL_DOT_OVERLAP));
        }
        cluster = cluster.child(disc);
    }
    div()
        .flex()
        .items_center()
        .gap(px(6.))
        .pl(px(12.))
        .pr(px(10.))
        .h(px(PILL_H))
        .rounded(px(PILL_H / 2.))
        .bg(theme.bg_raised)
        .child(cluster)
        .child(
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_base)
                .child(label),
        )
        .child(icon_img(
            icons,
            Icon::ChevronDown,
            false,
            theme.fg_muted,
            12.,
        ))
}

pub fn inline_mark(theme: &Theme, mark: &TokenMark) -> Div {
    div()
        .w(px(INLINE_MARK))
        .h(px(INLINE_MARK))
        .rounded(px(INLINE_MARK / 2.))
        .flex_none()
        .bg(theme.bg_sunken)
        .flex()
        .items_center()
        .justify_center()
        .text_size(theme::text_label())
        .text_color(theme.fg_muted)
        .child(SharedString::from(
            mark.ticker
                .chars()
                .take(3)
                .collect::<String>()
                .to_uppercase(),
        ))
}

/// The label-value row — the single label-value primitive for the feature.
pub fn fact_row(
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
    fact: &FactRow,
) -> Div {
    let mut value_side = div().flex().items_center().gap(px(6.)).min_w(px(0.));

    value_side = match &fact.lead {
        FactLead::None => value_side,
        FactLead::Token(mark) => value_side.child(inline_mark(theme, mark)),
        FactLead::Identicon(seed) => {
            value_side.child(identicon_avatar(identicons, seed.as_ref(), 20.))
        }
    };

    let value = if fact.mono {
        div()
            .font_family(theme::font_mono())
            .text_size(theme::text_mono_address())
    } else {
        div().text_size(theme::text_row_sub())
    };
    value_side = value_side.child(value.text_color(theme.fg_base).child(fact.value.clone()));

    if fact.copyable {
        value_side = value_side.child(icon_img(icons, Icon::Copy, false, theme.fg_subtle, 13.));
    }

    div()
        .flex()
        .items_center()
        .justify_between()
        .gap(px(12.))
        .py(px(10.))
        .child(
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_subtle)
                .child(fact.label.clone()),
        )
        .child(value_side)
}

/// The small status pill.
///
/// Four tones off the semantic colour pairs, so a chip never invents a colour —
/// and never uses the accent, which in this product means "this moves money",
/// not "this is fine".
pub fn status_chip(theme: &Theme, chip: &StatusChip) -> Div {
    let (bg, fg) = match chip.tone {
        StatusTone::Success => (theme.success_soft, theme.success_base),
        StatusTone::Warning => (theme.warning_soft, theme.warning_base),
        StatusTone::Error => (theme.error_soft, theme.error_base),
        StatusTone::Info => (theme.info_soft, theme.info_base),
    };
    div()
        .px(px(8.))
        .py(px(2.))
        .rounded(px(999.))
        .bg(bg)
        .text_size(theme::text_label())
        .text_color(fg)
        .child(chip.text.clone())
}

/// The filled search field. Filtering is live and animation-free by design.
pub fn flow_search(theme: &Theme, icons: &mut IconCache, placeholder: SharedString) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(8.))
        .h(px(40.))
        .px(px(12.))
        .rounded(px(12.))
        .bg(theme.bg_sunken)
        .child(icon_img(icons, Icon::Search, false, theme.fg_subtle, 15.))
        .child(
            div()
                .flex_1()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_subtle)
                .child(placeholder),
        )
}

/// The token-class filter chips.
///
/// Distinct from a segmented toggle on purpose. That control divides ONE space
/// into named halves and fills its width; this is a row of independent
/// narrowings that hugs its labels.
pub fn filter_chips(theme: &Theme, chips: &[FilterChip]) -> Div {
    // No wrap: the strip clips at the column edge the way DSD1L draws it. A
    // second line of chips pushes the list down and changes the panel's shape
    // depending on how long a locale's words are.
    let mut row = div()
        .flex()
        .gap(px(6.))
        .flex_1()
        .min_w(px(0.))
        .overflow_hidden();
    for chip in chips {
        row = row.child(
            div()
                .px(px(12.))
                .py(px(5.))
                .rounded(px(999.))
                // The selected chip inverts rather than taking the accent:
                // accent means "moves money", and narrowing a list does not.
                .bg(if chip.selected {
                    theme.fg_base
                } else {
                    theme.bg_sunken
                })
                .text_size(theme::text_label())
                .text_color(if chip.selected {
                    theme.bg_base
                } else {
                    theme.fg_muted
                })
                .child(chip.label.clone()),
        );
    }
    row
}

/// The two-segment toggle — the ONE segmented control in the product.
pub fn segmented_toggle(
    theme: &Theme,
    left: SharedString,
    right: SharedString,
    left_on: bool,
) -> Div {
    let seg = |label: SharedString, on: bool| {
        let base = div()
            .flex_1()
            .py(px(8.))
            .rounded(px(10.))
            .flex()
            .items_center()
            .justify_center();
        let base = if on { base.bg(theme.bg_raised) } else { base };
        base.text_size(theme::text_row_sub())
            .text_color(if on { theme.fg_base } else { theme.fg_muted })
            .child(label)
    };
    div()
        .flex()
        .gap(px(2.))
        .p(px(2.))
        .rounded(px(12.))
        .bg(theme.bg_sunken)
        .child(seg(left, left_on))
        .child(seg(right, !left_on))
}

/// The monospace field. Addresses are compared character by character by the
/// people pasting them, which is the whole reason for the face.
pub fn mono_field(theme: &Theme, label: Option<SharedString>, value: SharedString) -> Div {
    let mut col = div().flex().flex_col().gap(px(6.));
    if let Some(label) = label {
        col = col.child(
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_subtle)
                .child(label),
        );
    }
    col.child(
        div()
            .p(px(12.))
            .rounded(px(12.))
            .bg(theme.bg_sunken)
            .font_family(theme::font_mono())
            .text_size(theme::text_mono_address())
            .text_color(theme.fg_base)
            .child(value),
    )
}

/// The account card above every QR: whose address this is, in full.
///
/// The address wraps to exactly two lines and never truncates. DR2L is the
/// panel a person reads an address OFF, and an ellipsis in the middle of it
/// would defeat the only job it has.
pub fn address_card(
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
    name: SharedString,
    seed: &str,
    lines: (SharedString, SharedString),
) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(12.))
        .p(px(12.))
        .rounded(px(14.))
        .bg(theme.bg_sunken)
        .child(identicon_avatar(identicons, seed, 36.))
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
                        .child(name),
                )
                .child(
                    div()
                        .font_family(theme::font_mono())
                        .text_size(theme::text_mono_address())
                        .text_color(theme.fg_muted)
                        .child(lines.0),
                )
                .child(
                    div()
                        .font_family(theme::font_mono())
                        .text_size(theme::text_mono_address())
                        .text_color(theme.fg_muted)
                        .child(lines.1),
                ),
        )
        .child(icon_img(icons, Icon::Copy, false, theme.fg_muted, 16.))
}

/// The receive QR card.
///
/// White in BOTH appearances and a fixed square: a code is read by a camera,
/// inverting it in dark mode is the classic way to make one unscannable, and a
/// code that shrinks to make room for its caption stops scanning.
pub fn qr_card(theme: &Theme, centre: Option<Div>) -> Div {
    const N: usize = 29;
    let ink = gpui::Hsla::from(gpui::rgb(0x1a1a18));
    let white = gpui::Hsla::from(gpui::rgb(0xffffff));
    let _ = theme;

    // The deterministic demo pattern spec 015 established, denser because this
    // card draws large. Never encodes data.
    let cells: Vec<bool> = {
        let mut s: u32 = 0xbeef;
        let mut next = move || {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            s
        };
        let in_finder =
            |r: usize, c: usize| (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
        let finder_on = |r: usize, c: usize| {
            let lr = if r < 7 { r } else { r - (N - 7) };
            let lc = if c < 7 { c } else { c - (N - 7) };
            lr.min(lc).min(6 - lr).min(6 - lc) != 1
        };
        (0..N * N)
            .map(|i| {
                let (r, c) = (i / N, i % N);
                if in_finder(r, c) {
                    finder_on(r, c)
                } else if next() & 3 == 0 {
                    false
                } else {
                    next() % 2 == 0
                }
            })
            .collect()
    };

    let module = (QR_CARD - 40.) / N as f32;
    let mut grid = div().flex().flex_col();
    for r in 0..N {
        let mut line = div().flex();
        for c in 0..N {
            line = line.child(div().w(px(module)).h(px(module)).bg(if cells[r * N + c] {
                ink
            } else {
                white
            }));
        }
        grid = grid.child(line);
    }

    let mut card = div()
        .w(px(QR_CARD))
        .h(px(QR_CARD))
        .flex_none()
        .rounded(px(16.))
        .bg(white)
        .flex()
        .items_center()
        .justify_center()
        .relative()
        .child(grid);

    if let Some(centre) = centre {
        card = card.child(
            div()
                .absolute()
                .p(px(3.))
                .rounded(px(999.))
                // The cut-out reads as part of the card, so it takes the card's
                // white rather than a theme surface that would flip underneath.
                .bg(white)
                .child(centre),
        );
    }
    card
}

/// The network-fee row.
///
/// A row and not a card: the fee is a fact about the transfer, and the only
/// thing to DO with it is change which token pays it. The SPEC sheet is
/// explicit that the tier picker does not live here.
pub fn fee_row(theme: &Theme, icons: &mut IconCache, fee: &FeeRow) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(8.))
        .p(px(12.))
        .rounded(px(12.))
        .bg(theme.bg_sunken)
        .child(
            div()
                .flex_1()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_muted)
                .child(fee.label.clone()),
        )
        .child(inline_mark(theme, &fee.mark))
        .child(
            div()
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_base)
                .child(fee.value.clone()),
        )
        .child(icon_img(
            icons,
            Icon::ChevronRight,
            false,
            theme.fg_muted,
            12.,
        ))
}

/// DSD2bL's split row: one of N people, what they get, and the way to drop them.
pub fn recipient_card(
    theme: &Theme,
    icons: &mut IconCache,
    identicons: &mut IdenticonCache,
    recipient: &RecipientCard,
) -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(10.))
        .p(px(10.))
        .rounded(px(12.))
        .bg(theme.bg_sunken)
        .child(identicon_avatar(identicons, recipient.seed.as_ref(), 28.))
        .child(
            div()
                .flex_1()
                .min_w(px(0.))
                .flex()
                .flex_col()
                .child(
                    div()
                        .text_size(theme::text_label())
                        .text_color(theme.fg_subtle)
                        .child(recipient.ordinal.clone()),
                )
                .child(
                    div()
                        .font_family(theme::font_mono())
                        .text_size(theme::text_mono_address())
                        .text_color(theme.fg_base)
                        .child(recipient.name.clone()),
                ),
        )
        .child(
            div()
                .text_size(theme::text_row_title())
                .text_color(theme.fg_base)
                .child(recipient.amount.clone()),
        )
        .child(icon_img(icons, Icon::X, false, theme.fg_subtle, 14.))
}

/// The send form's token card: which token, off which chain, out of how much.
pub fn token_header_card(
    theme: &Theme,
    mark: &TokenMark,
    symbol: SharedString,
    detail: SharedString,
    max: Option<SharedString>,
) -> Div {
    let mut card = div()
        .flex()
        .items_center()
        .gap(px(12.))
        .p(px(12.))
        .rounded(px(14.))
        .bg(theme.bg_sunken)
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
                        .child(symbol),
                )
                .child(
                    div()
                        .text_size(theme::text_row_sub())
                        .text_color(theme.fg_muted)
                        .child(detail),
                ),
        );
    if let Some(max) = max {
        card = card.child(
            div()
                .px(px(12.))
                .py(px(4.))
                .rounded(px(999.))
                .bg(theme.bg_raised)
                .text_size(theme::text_row_sub())
                .text_color(theme.fg_base)
                .child(max),
        );
    }
    card
}

/// A full-width outline button — every CTA in the flows except the confirm.
pub fn ghost_button(theme: &Theme, label: SharedString) -> Div {
    div()
        .w_full()
        .py(px(10.))
        .rounded(px(999.))
        .border_1()
        .border_color(theme.border_card)
        .flex()
        .items_center()
        .justify_center()
        .text_size(theme::text_row_sub())
        .text_color(theme.fg_base)
        .child(label)
}

/// The accent CTA. Exactly one per journey (DSD3L's confirm) — in this product
/// the accent means "this moves the money".
pub fn accent_button(theme: &Theme, label: SharedString) -> Div {
    div()
        .w_full()
        .py(px(12.))
        .rounded(px(12.))
        .bg(theme.accent)
        .flex()
        .items_center()
        .justify_center()
        .text_size(theme::text_row_sub())
        .font_weight(gpui::FontWeight::BOLD)
        .text_color(gpui::Hsla::from(gpui::rgb(0xffffff)))
        .child(label)
}
