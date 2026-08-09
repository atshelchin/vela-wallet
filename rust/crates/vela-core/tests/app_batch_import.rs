//! Rules of the payroll batch importer, one test per rule.
//!
//! The table-interpreter half is the ported jest conformance suite
//! (`src/__tests__/services/recipient-table.test.ts`) — issue #137 and both of
//! its regressions are pinned line by line. The machine half drives the sheet
//! the way `BatchImportSheet.tsx` is used: open, paste/pick, watch the rate
//! mirror, and apply into the send machine's `RecipientDraft` hand-off.

#![cfg(feature = "crux")]

mod support;

use support::DomainDriver;
use vela_core::app::batch_import::{
    interpret_rows, parse_recipient_table_text, BatchFileContent, BatchImport, BatchOperation as Op,
    BatchParseError, BatchParseReason, BatchParseResult, BatchParsedRow, BatchRateStatus,
    BatchShellResult as Res, BatchToken, BatchUnit, Event, BATCH_MAX_RECIPIENTS, TEMPLATE_CSV,
};

type Sut = DomainDriver<BatchImport>;

fn a() -> String {
    format!("0x{}", "aa".repeat(20))
}
fn b() -> String {
    format!("0x{}", "bb".repeat(20))
}
fn c() -> String {
    format!("0x{}", "cc".repeat(20))
}

fn row(line: u32, name: Option<&str>, address: &str, raw_amount: &str) -> BatchParsedRow {
    BatchParsedRow {
        line,
        name: name.map(str::to_owned),
        address: address.to_owned(),
        raw_amount: raw_amount.to_owned(),
    }
}

fn err(line: u32, raw: &str, reason: BatchParseReason) -> BatchParseError {
    BatchParseError {
        line,
        raw: raw.to_owned(),
        reason,
    }
}

fn parse(text: &str) -> BatchParseResult {
    parse_recipient_table_text(text)
}

// ---------------------------------------------------------------------------
// Table interpreter — delimiters
// ---------------------------------------------------------------------------

#[test]
fn comma_delimited_address_amount() {
    let res = parse(&format!("{},5000\n{},3000", a(), b()));
    assert!(res.errors.is_empty());
    assert_eq!(
        res.rows,
        vec![row(1, None, &a(), "5000"), row(2, None, &b(), "3000")]
    );
}

#[test]
fn tab_delimited_tsv() {
    let res = parse(&format!("{}\t5000\n{}\t3000", a(), b()));
    let got: Vec<_> = res
        .rows
        .iter()
        .map(|r| (r.address.clone(), r.raw_amount.clone()))
        .collect();
    assert_eq!(got, vec![(a(), "5000".to_owned()), (b(), "3000".to_owned())]);
}

#[test]
fn semicolon_delimited() {
    let res = parse(&format!("{};5000\n{};3000", a(), b()));
    let amounts: Vec<_> = res.rows.iter().map(|r| r.raw_amount.as_str()).collect();
    assert_eq!(amounts, vec!["5000", "3000"]);
}

// ---------------------------------------------------------------------------
// Table interpreter — header + column order
// ---------------------------------------------------------------------------

#[test]
fn header_row_without_an_address_is_dropped() {
    let res = parse(&format!("name,address,amount\nAlice,{},5000", a()));
    assert_eq!(res.rows, vec![row(1, Some("Alice"), &a(), "5000")]);
}

#[test]
fn first_data_row_is_kept_when_there_is_no_header() {
    let res = parse(&format!("{},5000", a()));
    assert_eq!(res.rows.len(), 1);
    assert_eq!(res.rows[0].address, a());
}

#[test]
fn column_order_is_inferred_not_fixed() {
    let amount_first = parse(&format!("5000,{}", a()));
    assert_eq!(amount_first.rows[0].address, a());
    assert_eq!(amount_first.rows[0].raw_amount, "5000");

    let three_col = parse(&format!("Alice,{},5000", a()));
    assert_eq!(three_col.rows[0].name.as_deref(), Some("Alice"));
    assert_eq!(three_col.rows[0].address, a());
    assert_eq!(three_col.rows[0].raw_amount, "5000");
}

// ---------------------------------------------------------------------------
// Table interpreter — cleaning + robustness
// ---------------------------------------------------------------------------

#[test]
fn bom_and_crlf_are_stripped() {
    let res = parse(&format!("\u{feff}{},5000\r\n{},3000\r\n", a(), b()));
    let addrs: Vec<_> = res.rows.iter().map(|r| r.address.clone()).collect();
    assert_eq!(addrs, vec![a(), b()]);
}

#[test]
fn currency_symbol_and_thousands_separators_are_stripped_inside_a_cell() {
    // Semicolon-delimited so the thousands comma stays inside one cell.
    let res = parse(&format!("{};¥5,000.50", a()));
    assert_eq!(res.rows[0].raw_amount, "5000.50");
}

#[test]
fn checksummed_addresses_are_preserved_as_written() {
    let checksummed = format!("0x{}", "Ab".repeat(20));
    let res = parse(&format!("{checksummed},5000"));
    assert_eq!(res.rows[0].address, checksummed);
}

#[test]
fn fully_blank_lines_are_skipped() {
    let res = parse(&format!("{},5000\n\n\n{},3000", a(), b()));
    assert_eq!(res.rows.len(), 2);
}

// ---------------------------------------------------------------------------
// Table interpreter — errors
// ---------------------------------------------------------------------------

#[test]
fn addressless_row_is_reported_with_header_excluded_line_numbering() {
    let res = parse(&format!("address,amount\n{},5000\n0xdeadbeef,3000", a()));
    assert_eq!(res.rows.len(), 1);
    assert_eq!(
        res.errors,
        vec![err(2, "0xdeadbeef , 3000", BatchParseReason::NoAddress)]
    );
}

#[test]
fn row_without_a_positive_amount_is_reported() {
    let res = parse(&format!("{},abc\n{},0", a(), b()));
    assert!(res.rows.is_empty());
    let reasons: Vec<_> = res.errors.iter().map(|e| e.reason).collect();
    assert_eq!(
        reasons,
        vec![BatchParseReason::NoAmount, BatchParseReason::NoAmount]
    );
}

#[test]
fn second_addressless_row_is_an_error_not_a_swallowed_header() {
    let res = parse(&format!("{},5000\njust some text", a()));
    assert_eq!(res.rows.len(), 1);
    assert_eq!(
        res.errors,
        vec![err(2, "just some text", BatchParseReason::NoAddress)]
    );
}

#[test]
fn empty_input_is_an_empty_result() {
    assert_eq!(parse(""), BatchParseResult::default());
    assert_eq!(parse("   \n  \n"), BatchParseResult::default());
}

// ---------------------------------------------------------------------------
// Table interpreter — issue #137: digit-bearing names
// ---------------------------------------------------------------------------

#[test]
fn digit_only_name_among_plain_names_takes_amount_from_the_amount_column() {
    let res = parse(&format!("Alice,{},0.01\n123123,{},0.01", a(), b()));
    assert!(res.errors.is_empty());
    assert_eq!(
        res.rows,
        vec![
            row(1, Some("Alice"), &a(), "0.01"),
            row(2, Some("123123"), &b(), "0.01"),
        ]
    );
}

#[test]
fn single_ambiguous_row_resolves_by_position_amount_after_address() {
    let res = parse(&format!("123123,{},0.01", a()));
    assert_eq!(res.rows, vec![row(1, Some("123123"), &a(), "0.01")]);
}

#[test]
fn letters_glued_to_digits_are_a_name_never_an_amount() {
    let res = parse(&format!("Alice123,{},5000", a()));
    assert_eq!(res.rows, vec![row(1, Some("Alice123"), &a(), "5000")]);
}

#[test]
fn cjk_name_with_digits_is_a_name() {
    let res = parse(&format!("团队2024,{},300", a()));
    assert_eq!(res.rows, vec![row(1, Some("团队2024"), &a(), "300")]);
}

#[test]
fn leading_row_number_column_never_becomes_the_amount() {
    let res = parse(&format!("1,Alice,{},5000\n2,Bob,{},5000", a(), b()));
    let got: Vec<_> = res
        .rows
        .iter()
        .map(|r| (r.name.as_deref(), r.raw_amount.as_str()))
        .collect();
    assert_eq!(got, vec![(Some("Alice"), "5000"), (Some("Bob"), "5000")]);
}

#[test]
fn digits_inside_a_text_cell_are_not_an_amount_so_the_row_errors() {
    let res = parse(&format!("Alice123,{}", a()));
    assert!(res.rows.is_empty());
    let reasons: Vec<_> = res.errors.iter().map(|e| e.reason).collect();
    assert_eq!(reasons, vec![BatchParseReason::NoAmount]);
}

// ---------------------------------------------------------------------------
// Table interpreter — a recognized header pins column roles
// ---------------------------------------------------------------------------

#[test]
fn english_header_pins_roles_for_digit_only_employee_ids() {
    let res = parse(&format!("name,address,amount\n1001,{},5000\n1002,{},5000", a(), b()));
    assert!(res.errors.is_empty());
    assert_eq!(
        res.rows,
        vec![
            row(1, Some("1001"), &a(), "5000"),
            row(2, Some("1002"), &b(), "5000"),
        ]
    );
}

#[test]
fn chinese_header_pins_roles() {
    let res = parse(&format!("姓名,地址,金额\n1001,{},5000", a()));
    assert_eq!(res.rows, vec![row(1, Some("1001"), &a(), "5000")]);
}

#[test]
fn headered_row_with_unparseable_amount_cell_is_a_no_amount_error() {
    let res = parse(&format!("name,address,amount\nAlice,{},abc\n123123,{},5", a(), b()));
    assert_eq!(res.rows, vec![row(2, Some("123123"), &b(), "5")]);
    assert_eq!(
        res.errors,
        vec![err(1, &format!("Alice , {} , abc", a()), BatchParseReason::NoAmount)]
    );
}

// ---------------------------------------------------------------------------
// Table interpreter — currency-flanked amounts keep working
// ---------------------------------------------------------------------------

#[test]
fn currency_flanked_amounts_parse_to_clean_values() {
    for (cell, expected) in [
        ("5000 USDT", "5000"),
        ("USD 5000", "5000"),
        ("MATIC 5000", "5000"),
        ("R$ 5000", "5000"),
        ("US$ 5,000.50", "5000.50"),
        ("5000元", "5000"),
        ("5000usdt", "5000"),
        ("¥ 300", "300"),
    ] {
        let res = parse(&format!("{};{}", a(), cell));
        assert!(res.errors.is_empty(), "{cell} must not error");
        assert_eq!(res.rows[0].raw_amount, expected, "{cell}");
    }
}

#[test]
fn mixed_order_paste_still_resolves_per_row() {
    let res = parse(&format!("5000,{}\n{},3000", a(), b()));
    let got: Vec<_> = res
        .rows
        .iter()
        .map(|r| (r.address.clone(), r.raw_amount.clone()))
        .collect();
    assert_eq!(got, vec![(a(), "5000".to_owned()), (b(), "3000".to_owned())]);
}

// ---------------------------------------------------------------------------
// Table interpreter — evidence stays scoped to a row shape (#137 regression 2)
// ---------------------------------------------------------------------------

#[test]
fn a_two_column_amount_first_row_does_not_decide_a_three_column_row() {
    let res = parse(&format!("5000,{}\n123123,{},0.01", a(), b()));
    assert_eq!(
        res.rows,
        vec![row(1, None, &a(), "5000"), row(2, Some("123123"), &b(), "0.01")]
    );
}

#[test]
fn a_tie_between_shapes_never_resolves_to_the_leftmost_name_column() {
    let res = parse(&format!("Alice,{},5000\n3000,{}\n123123,{},0.01", a(), b(), c()));
    let got: Vec<_> = res
        .rows
        .iter()
        .map(|r| (r.name.as_deref(), r.raw_amount.as_str()))
        .collect();
    assert_eq!(
        got,
        vec![(Some("Alice"), "5000"), (None, "3000"), (Some("123123"), "0.01")]
    );
}

#[test]
fn a_blank_amount_cell_errors_instead_of_paying_the_digit_only_name() {
    let res = parse(&format!("1001,{},\n1002,{},0.01\n1003,{},0.01", a(), b(), c()));
    let got: Vec<_> = res
        .rows
        .iter()
        .map(|r| (r.name.as_deref(), r.raw_amount.as_str()))
        .collect();
    assert_eq!(got, vec![(Some("1002"), "0.01"), (Some("1003"), "0.01")]);
    assert_eq!(
        res.errors,
        vec![err(1, &format!("1001 , {} , ", a()), BatchParseReason::NoAmount)]
    );
}

#[test]
fn a_currency_suffixed_amount_is_still_found_next_to_a_digit_only_name() {
    let res = parse(&format!("Alice,{},5000 USDT\n123123,{},0.01 USDT", a(), b()));
    let got: Vec<_> = res
        .rows
        .iter()
        .map(|r| (r.name.as_deref(), r.raw_amount.as_str()))
        .collect();
    assert_eq!(got, vec![(Some("Alice"), "5000"), (Some("123123"), "0.01")]);
}

#[test]
fn exotic_name_amount_address_order_resolves_from_the_table() {
    let res = parse(&format!("Alice,0.01,{}\n123123,0.01,{}", a(), b()));
    let got: Vec<_> = res
        .rows
        .iter()
        .map(|r| (r.name.as_deref(), r.raw_amount.as_str()))
        .collect();
    assert_eq!(got, vec![(Some("Alice"), "0.01"), (Some("123123"), "0.01")]);
}

// ---------------------------------------------------------------------------
// Table interpreter — cells that only LOOK numeric are not amounts
// ---------------------------------------------------------------------------

#[test]
fn numeric_looking_cells_are_rejected_as_amounts() {
    for cell in [
        "Team 2024", // a capitalized word before digits
        "Bob 007",   // a name with a numeric suffix
        "3M",        // a single trailing letter is not a currency code
        "1e5",       // scientific notation used to pay 15
        "1.00E+05",  // Excel scientific rendering used to pay 1.0005
        "2026-08-05", // a date used to pay 20,260,805
        "0x123",     // a truncated address used to pay 123
        "1,23",      // an ambiguous European decimal comma
    ] {
        let res = parse(&format!("{};{}", cell, a()));
        assert!(res.rows.is_empty(), "{cell} must not become a payment");
        let reasons: Vec<_> = res.errors.iter().map(|e| e.reason).collect();
        assert_eq!(reasons, vec![BatchParseReason::NoAmount], "{cell}");
    }
}

// ---------------------------------------------------------------------------
// Table interpreter — header pinning edge cases
// ---------------------------------------------------------------------------

#[test]
fn ragged_row_lacking_the_labelled_column_falls_back_to_inference() {
    let res = parse(&format!("name,address,amount\n{},5000\n{},3000", a(), b()));
    assert!(res.errors.is_empty());
    let amounts: Vec<_> = res.rows.iter().map(|r| r.raw_amount.as_str()).collect();
    assert_eq!(amounts, vec!["5000", "3000"]);
}

/// Inventory invariant ⑧ — an address pasted into the NAME column cannot
/// capture the payment when the header labels the real address column.
#[test]
fn labelled_address_column_beats_an_address_pasted_into_the_name_column() {
    let res = parse(&format!("name,address,amount\n{},{},5000", b(), a()));
    assert_eq!(res.rows[0].address, a());
    assert_eq!(res.rows[0].raw_amount, "5000");
    assert_eq!(res.rows[0].name.as_deref(), Some(b().as_str()));
}

// ---------------------------------------------------------------------------
// Table interpreter — the Excel matrix path
// ---------------------------------------------------------------------------

/// Port of the jest SheetJS dispatch test: the shell flattens the workbook to
/// a cell matrix; `interpret_rows` treats it exactly like split text.
#[test]
fn workbook_matrix_interprets_like_text() {
    let matrix: Vec<Vec<String>> = vec![
        vec!["name".into(), "address".into(), "amount".into()],
        vec!["Alice".into(), a(), "5000".into()],
        vec!["Bob".into(), b(), "3000".into()],
        vec!["Carol".into(), c(), String::new()],
    ];
    let res = interpret_rows(&matrix);
    assert_eq!(
        res.rows,
        vec![
            row(1, Some("Alice"), &a(), "5000"),
            row(2, Some("Bob"), &b(), "3000"),
        ]
    );
    assert_eq!(
        res.errors,
        vec![err(3, &format!("Carol , {} , ", c()), BatchParseReason::NoAmount)]
    );
}

/// The downloadable template must parse cleanly through this machine's own
/// interpreter — the round trip a user actually performs.
#[test]
fn template_csv_parses_with_its_own_parser() {
    let res = parse(TEMPLATE_CSV);
    assert!(res.errors.is_empty());
    let got: Vec<_> = res
        .rows
        .iter()
        .map(|r| (r.name.as_deref(), r.raw_amount.as_str()))
        .collect();
    assert_eq!(
        got,
        vec![
            (Some("Alice"), "5000"),
            (Some("Bob"), "8000"),
            (Some("Carol"), "6500"),
        ]
    );
}

// ---------------------------------------------------------------------------
// Machine fixtures
// ---------------------------------------------------------------------------

fn usdt(balance: &str) -> BatchToken {
    BatchToken {
        symbol: "USDT".to_owned(),
        decimals: 6,
        balance: balance.to_owned(),
        price_usd: Some(1.0),
    }
}

fn unpriced(balance: &str) -> BatchToken {
    BatchToken {
        symbol: "XYZ".to_owned(),
        decimals: 6,
        balance: balance.to_owned(),
        price_usd: None,
    }
}

fn open_event(token: BatchToken, cap: u32) -> Event {
    Event::Open {
        token,
        currency_code: "CNY".to_owned(),
        max_recipients: cap,
    }
}

fn opened_with_cap(token: BatchToken, cap: u32) -> Sut {
    let mut sut = Sut::new();
    let ops = sut.dispatch(open_event(token, cap));
    assert_eq!(
        ops,
        vec![Op::FetchUsdFiatRate {
            code: "CNY".to_owned()
        }]
    );
    sut
}

fn opened(token: BatchToken) -> Sut {
    opened_with_cap(token, BATCH_MAX_RECIPIENTS)
}

fn cny(rate: f64) -> Res {
    Res::RateResolved {
        code: "CNY".to_owned(),
        rate: Some(rate),
    }
}

/// Open + rate resolved: the steady state most tests start from.
fn rated(token: BatchToken, rate: f64) -> Sut {
    let mut sut = opened(token);
    let ops = sut.resolve(cny(rate));
    assert!(ops.is_empty());
    sut
}

fn paste(sut: &mut Sut, text: String) {
    let ops = sut.dispatch(Event::SetRawText { text });
    assert!(ops.is_empty());
}

// ---------------------------------------------------------------------------
// Machine — the rate mirror (inventory invariants ① and ②)
// ---------------------------------------------------------------------------

/// The cap constant this machine exports is batch-send's `BATCH_MAX_RECIPIENTS`.
#[test]
fn the_cap_is_sixty() {
    assert_eq!(BATCH_MAX_RECIPIENTS, 60);
}

/// Ported quirk — while the rate is loading, `tokenPriceInFiat(price, 0)`
/// treats the missing rate as 1, so the mirror shows the token's USD price as
/// if it were the fiat price (`usdFiatRate ?? 0` + the `: 1` fallback).
#[test]
fn loading_rate_mirrors_the_usd_price_verbatim_quirk() {
    let sut = opened(usdt("1000"));
    let view = sut.view();
    assert!(view.opened);
    assert!(view.priced);
    assert_eq!(view.rate_status, BatchRateStatus::Loading);
    assert_eq!(view.rate_input, "1", "USD price shown until the rate lands");
}

/// Invariant ① — the auto rate mirrors into the input with significant-digit
/// formatting, and that string is what converts every row.
#[test]
fn resolved_rate_mirrors_into_the_input_and_converts_rows() {
    let mut sut = rated(usdt("1000"), 7.2);
    assert_eq!(sut.view().rate_status, BatchRateStatus::Ok);
    assert_eq!(sut.view().rate_input, "7.2");
    paste(&mut sut, format!("{},72", a()));
    assert_eq!(sut.view().preview[0].token_amount, "10");
}

/// Invariant ② — a positive sub-cent rate never mirrors as "0". The old
/// `toFixed(2)` mirror showed "0" while converting at the true value, and a
/// touch then zeroed every row via `parseFloat("0")`.
#[test]
fn positive_rate_never_mirrors_as_zero() {
    let mut sut = opened(BatchToken {
        symbol: "PEPE".to_owned(),
        decimals: 18,
        balance: "10000000".to_owned(),
        price_usd: Some(0.000042),
    });
    sut.resolve(cny(1.0));
    let view = sut.view();
    assert_eq!(view.rate_input, "0.000042");
    // And the shown string is the applied rate: ¥42 at 0.000042/token = 1M.
    let mut sut = sut;
    paste(&mut sut, format!("{},42", a()));
    assert_eq!(sut.view().preview[0].token_amount, "1000000");
}

/// Invariant ① — an edited rate string IS the applied rate, character for
/// character; the numeric prefix is what `parseFloat` applies.
#[test]
fn edited_rate_string_is_the_applied_rate() {
    let mut sut = rated(usdt("10000"), 7.2);
    paste(&mut sut, format!("{},5000", a()));
    assert_eq!(sut.view().preview[0].token_amount, "694.444444");

    sut.dispatch(Event::EditRate {
        text: "8".to_owned(),
    });
    let view = sut.view();
    assert!(view.rate_edited);
    assert_eq!(view.rate_input, "8");
    assert_eq!(view.preview[0].token_amount, "625");
}

/// The `[^0-9.]` strip keeps extra dots (the mirror quirk); the applied value
/// is the numeric prefix, exactly `parseFloat(rateInput) || 0`.
#[test]
fn rate_input_is_stripped_and_applied_as_numeric_prefix() {
    let mut sut = rated(usdt("1000"), 7.2);
    paste(&mut sut, format!("{},10", a()));
    sut.dispatch(Event::EditRate {
        text: "2x.5y.9".to_owned(),
    });
    let view = sut.view();
    assert_eq!(view.rate_input, "2.5.9", "dots survive, letters do not");
    assert_eq!(view.preview[0].token_amount, "4", "applied at prefix 2.5");
}

#[test]
fn reset_to_auto_returns_the_mirror() {
    let mut sut = rated(usdt("1000"), 7.2);
    sut.dispatch(Event::EditRate {
        text: "9".to_owned(),
    });
    assert_eq!(sut.view().rate_input, "9");
    let ops = sut.dispatch(Event::ResetRateToAuto);
    assert!(ops.is_empty());
    let view = sut.view();
    assert!(!view.rate_edited);
    assert_eq!(view.rate_input, "7.2");
}

/// A failed fetch is a status, not a silent zero — and the mirror falls back
/// to the USD-price quirk so the sheet stays workable.
#[test]
fn failed_rate_sets_status_and_keeps_the_quirk_mirror() {
    let mut sut = opened(usdt("1000"));
    sut.resolve(Res::RateResolved {
        code: "CNY".to_owned(),
        rate: None,
    });
    let view = sut.view();
    assert_eq!(view.rate_status, BatchRateStatus::Failed);
    assert_eq!(view.rate_input, "1");
}

// ---------------------------------------------------------------------------
// Machine — the per-batch currency (issue #80 scope)
// ---------------------------------------------------------------------------

/// Issue #80 — the "Priced in" pick re-fetches the rate and resets the mirror,
/// and this machine's operation vocabulary contains NO storage write: the
/// app-wide display currency cannot be touched from here.
#[test]
fn currency_pick_refetches_and_never_writes_storage() {
    let mut sut = rated(usdt("1000"), 7.2);
    let ops = sut.dispatch(Event::SetFiatCode {
        code: "EUR".to_owned(),
    });
    assert_eq!(
        ops,
        vec![Op::FetchUsdFiatRate {
            code: "EUR".to_owned()
        }],
        "a rate fetch is the ONLY side effect of a currency pick"
    );
    assert_eq!(sut.view().fiat_code, "EUR");
    assert_eq!(sut.view().rate_status, BatchRateStatus::Loading);
}

/// Ported quirk — until the new currency's fetch lands, the mirror keeps
/// converting at the OLD currency's rate (the component's mirror effect
/// re-runs on `rateEdited=false` before the fetch resolves).
#[test]
fn currency_switch_keeps_the_old_rate_until_the_new_fetch_lands() {
    let mut sut = rated(usdt("1000"), 7.2);
    sut.dispatch(Event::SetFiatCode {
        code: "EUR".to_owned(),
    });
    assert_eq!(sut.view().rate_input, "7.2", "old currency's rate, verbatim");
    sut.resolve(Res::RateResolved {
        code: "EUR".to_owned(),
        rate: Some(0.9),
    });
    assert_eq!(sut.view().rate_input, "0.9");
    assert_eq!(sut.view().rate_status, BatchRateStatus::Ok);
}

/// A rate that resolves for a currency the user already switched away from
/// must not label the current currency (the effect-cleanup `cancelled` flag).
#[test]
fn rate_for_a_switched_away_currency_is_dropped() {
    let mut sut = opened(usdt("1000"));
    sut.dispatch(Event::SetFiatCode {
        code: "EUR".to_owned(),
    });
    // The stale CNY fetch resolves first — dropped.
    let ops = sut.resolve(cny(7.2));
    assert!(ops.is_empty());
    assert_eq!(sut.view().rate_status, BatchRateStatus::Loading);
    assert_eq!(sut.view().rate_input, "1", "still the missing-rate quirk");
    // The EUR fetch lands normally.
    sut.resolve(Res::RateResolved {
        code: "EUR".to_owned(),
        rate: Some(0.9),
    });
    assert_eq!(sut.view().rate_status, BatchRateStatus::Ok);
    assert_eq!(sut.view().rate_input, "0.9");
}

/// Re-picking the same code only resets the mirror (React state identity —
/// the fetch effect does not re-run).
#[test]
fn repicking_the_same_code_resets_the_mirror_without_a_refetch() {
    let mut sut = rated(usdt("1000"), 7.2);
    sut.dispatch(Event::EditRate {
        text: "9".to_owned(),
    });
    let ops = sut.dispatch(Event::SetFiatCode {
        code: "CNY".to_owned(),
    });
    assert!(ops.is_empty(), "no second fetch for the same code");
    let view = sut.view();
    assert!(!view.rate_edited);
    assert_eq!(view.rate_input, "7.2");
}

// ---------------------------------------------------------------------------
// Machine — preview gates (inventory invariants ③ and ④)
// ---------------------------------------------------------------------------

/// Invariant ③ — a duplicate address is skipped and the FIRST occurrence
/// keeps the payment (case-insensitive match).
#[test]
fn duplicate_addresses_skip_all_but_the_first() {
    let mut sut = rated(usdt("1000"), 7.2);
    sut.dispatch(Event::EditRate {
        text: "8".to_owned(),
    });
    let upper = format!("0x{}", "AA".repeat(20));
    paste(&mut sut, format!("{},100\n{upper},200", a()));
    let view = sut.view();
    assert!(view.preview[0].ok);
    assert!(!view.preview[0].dup);
    assert!(view.preview[1].dup, "same address, different case");
    assert!(!view.preview[1].ok);
    assert_eq!(view.recipient_count, 1);
    assert_eq!(view.recipients[0].amount, "12.5");
    assert_eq!(view.rejected, 1);
}

/// Invariant ③ — over-cap truncation and rejected rows are TWO notices that
/// never hide each other (`BatchImportSheet.tsx:365-377`).
#[test]
fn over_cap_and_rejected_notices_never_hide_each_other() {
    let mut sut = opened_with_cap(usdt("100000"), 2);
    sut.resolve(cny(7.2));
    sut.dispatch(Event::EditRate {
        text: "8".to_owned(),
    });
    paste(
        &mut sut,
        format!("{},800\n{},1600\n{},2400\n0xdeadbeef,3000", a(), b(), c()),
    );
    let view = sut.view();
    assert!(view.over_cap, "three ok rows, cap two");
    assert_eq!(view.rejected, 1, "the bad-address line, shown TOGETHER");
    assert_eq!(view.recipient_count, 2, "only the first cap-many are sent");
    assert_eq!(view.total_token, "300", "totals cover the capped set only");
    let addrs: Vec<_> = view.recipients.iter().map(|r| r.address.clone()).collect();
    assert_eq!(addrs, vec![a(), b()]);
}

/// Invariant ④ — a capped total above the balance blocks apply, and Apply is
/// a no-op while blocked.
#[test]
fn over_balance_blocks_apply() {
    let mut sut = rated(usdt("1000"), 7.2);
    sut.dispatch(Event::EditRate {
        text: "8".to_owned(),
    });
    paste(&mut sut, format!("{},5000\n{},8000", a(), b()));
    let view = sut.view();
    assert_eq!(view.total_token, "1625");
    assert!(view.over_balance, "1625 > 1000 balance");
    assert!(!view.can_apply);

    assert!(sut.dispatch(Event::Apply).is_empty());
    assert!(!sut.view().applied, "a blocked apply changes nothing");

    // Doubling the rate halves the token amounts — back under balance.
    sut.dispatch(Event::EditRate {
        text: "16".to_owned(),
    });
    let view = sut.view();
    assert_eq!(view.total_token, "812.5");
    assert!(!view.over_balance);
    assert!(view.can_apply);
}

/// Invariant ④ — fiat mode without a positive rate cannot apply: rows show no
/// conversion and the button stays down until the operator pins a rate. This
/// is the unpriced-token payroll flow ("1 XYZ = 8 CNY" typed by hand).
#[test]
fn fiat_mode_without_a_positive_rate_cannot_apply() {
    let mut sut = rated(unpriced("1000"), 7.2);
    let view = sut.view();
    assert!(!view.priced);
    assert_eq!(view.unit, BatchUnit::Token, "unpriced defaults to token unit");

    sut.dispatch(Event::SetUnit {
        unit: BatchUnit::Fiat,
    });
    assert_eq!(sut.view().rate_input, "", "no price, no auto rate");
    paste(&mut sut, format!("{},72", a()));
    let view = sut.view();
    assert_eq!(view.preview[0].token_amount, "", "no rate, no conversion");
    assert!(!view.preview[0].ok);
    assert!(!view.can_apply);

    // The operator pins their own rate — the whole payroll point.
    sut.dispatch(Event::EditRate {
        text: "7.2".to_owned(),
    });
    let view = sut.view();
    assert_eq!(view.preview[0].token_amount, "10");
    assert!(view.can_apply);
}

#[test]
fn empty_preview_cannot_apply() {
    let sut = rated(usdt("1000"), 7.2);
    assert!(!sut.view().can_apply);
}

/// Token mode uses the pasted figures verbatim — no rate involved.
#[test]
fn token_mode_uses_raw_amounts_without_a_rate() {
    let mut sut = rated(unpriced("10"), 7.2);
    paste(&mut sut, format!("{},0.5\n{},1.5", a(), b()));
    let view = sut.view();
    assert_eq!(view.unit, BatchUnit::Token);
    assert_eq!(view.preview[0].token_amount, "0.5");
    assert_eq!(view.preview[1].token_amount, "1.5");
    assert_eq!(view.total_token, "2");
    assert_eq!(view.total_fiat, None, "fiat total only exists in fiat mode");
    assert!(view.can_apply);
}

/// Switching the unit reinterprets the SAME paste: the numbers change meaning,
/// not the table.
#[test]
fn unit_switch_reinterprets_the_same_paste() {
    let mut sut = rated(usdt("100"), 7.2);
    sut.dispatch(Event::EditRate {
        text: "8".to_owned(),
    });
    paste(&mut sut, format!("{},80", a()));
    assert_eq!(sut.view().preview[0].token_amount, "10", "¥80 at 8 = 10 USDT");

    sut.dispatch(Event::SetUnit {
        unit: BatchUnit::Token,
    });
    let view = sut.view();
    assert_eq!(view.preview[0].token_amount, "80", "80 means 80 USDT now");
    assert_eq!(view.total_fiat, None);
}

// ---------------------------------------------------------------------------
// Machine — per-open reset and staleness (inventory invariant ⑤)
// ---------------------------------------------------------------------------

/// Invariant ⑤ — every open is a FULL reset: paste, file, edited rate, saved
/// flags and the applied latch never leak into the next session.
#[test]
fn reopening_resets_everything() {
    let mut sut = rated(usdt("10000"), 7.2);
    sut.dispatch(Event::EditRate {
        text: "8".to_owned(),
    });
    paste(&mut sut, format!("{},5000", a()));
    assert!(sut.dispatch(Event::Apply).is_empty());
    assert!(sut.view().applied);

    let ops = sut.dispatch(open_event(usdt("10000"), BATCH_MAX_RECIPIENTS));
    assert_eq!(
        ops,
        vec![Op::FetchUsdFiatRate {
            code: "CNY".to_owned()
        }]
    );
    let view = sut.view();
    assert_eq!(view.raw_text, "");
    assert!(view.preview.is_empty());
    assert!(view.recipients.is_empty());
    assert!(!view.rate_edited);
    assert_eq!(view.rate_status, BatchRateStatus::Loading, "rate cleared too");
    assert!(!view.applied);
    assert!(!view.can_apply);
}

/// Invariant ⑤ — a rate fetched for a PREVIOUS open must never label this
/// one: the result carries the old attempt and is dropped.
#[test]
fn stale_rate_from_a_previous_open_is_dropped() {
    let mut sut = opened(usdt("1000"));
    sut.dispatch(open_event(usdt("1000"), BATCH_MAX_RECIPIENTS));
    // The FIRST open's fetch resolves — attempt mismatch, dropped.
    let ops = sut.resolve(cny(7.2));
    assert!(ops.is_empty());
    assert_eq!(sut.view().rate_status, BatchRateStatus::Loading);
    assert_eq!(sut.view().rate_input, "1");
    // The current open's fetch lands normally.
    sut.resolve(cny(7.5));
    assert_eq!(sut.view().rate_status, BatchRateStatus::Ok);
    assert_eq!(sut.view().rate_input, "7.5");
}

/// A file picked for a previous open is equally stale — its rows must never
/// seed the new session.
#[test]
fn stale_file_pick_from_a_previous_open_is_dropped() {
    let mut sut = rated(usdt("1000"), 7.2);
    let ops = sut.dispatch(Event::PickFileRequested);
    assert_eq!(ops, vec![Op::PickFile]);
    sut.dispatch(open_event(usdt("1000"), BATCH_MAX_RECIPIENTS));

    sut.resolve(Res::FilePicked {
        name: "payroll.csv".to_owned(),
        content: BatchFileContent::Text {
            text: format!("{},5000", a()),
        },
    });
    let view = sut.view();
    assert_eq!(view.raw_text, "");
    assert!(view.file_name.is_none());
    assert!(view.preview.is_empty());
}

#[test]
fn events_before_the_first_open_are_ignored() {
    let mut sut = Sut::new();
    assert!(sut
        .dispatch(Event::SetRawText {
            text: "x".to_owned()
        })
        .is_empty());
    assert!(sut.dispatch(Event::PickFileRequested).is_empty());
    assert!(sut.dispatch(Event::SaveTemplateRequested).is_empty());
    assert!(sut
        .dispatch(Event::SetUnit {
            unit: BatchUnit::Fiat
        })
        .is_empty());
    assert!(sut.dispatch(Event::Apply).is_empty());
    assert!(!sut.view().opened);
}

// ---------------------------------------------------------------------------
// Machine — file and template operations
// ---------------------------------------------------------------------------

#[test]
fn picked_text_file_flows_through_the_paste_parser() {
    let mut sut = rated(usdt("10000"), 7.2);
    let ops = sut.dispatch(Event::PickFileRequested);
    assert_eq!(ops, vec![Op::PickFile]);
    assert!(sut.view().busy);
    // A second tap while the picker is up is ignored — no double picker.
    assert!(sut.dispatch(Event::PickFileRequested).is_empty());

    sut.resolve(Res::FilePicked {
        name: "payroll.csv".to_owned(),
        content: BatchFileContent::Text {
            text: format!("Alice,{},5000", a()),
        },
    });
    let view = sut.view();
    assert!(!view.busy);
    assert_eq!(view.file_name.as_deref(), Some("payroll.csv"));
    assert_eq!(view.preview.len(), 1);
    assert_eq!(view.preview[0].name.as_deref(), Some("Alice"));
}

#[test]
fn picked_workbook_matrix_overrides_paste_until_the_text_is_edited() {
    let mut sut = rated(usdt("10000"), 7.2);
    paste(&mut sut, format!("{},111", a()));
    sut.dispatch(Event::PickFileRequested);
    sut.resolve(Res::FilePicked {
        name: "payroll.xlsx".to_owned(),
        content: BatchFileContent::Matrix {
            rows: vec![
                vec!["name".into(), "address".into(), "amount".into()],
                vec!["Bob".into(), b(), "5000".into()],
            ],
        },
    });
    let view = sut.view();
    assert_eq!(view.raw_text, "", "the paste box is cleared by a workbook");
    assert_eq!(view.preview.len(), 1);
    assert_eq!(view.preview[0].name.as_deref(), Some("Bob"));

    // Typing again drops the file — text is the source once more.
    paste(&mut sut, format!("{},222", a()));
    let view = sut.view();
    assert!(view.file_name.is_none());
    assert_eq!(view.preview[0].address, a());
}

#[test]
fn cancelled_picker_clears_busy_without_an_error() {
    let mut sut = rated(usdt("1000"), 7.2);
    sut.dispatch(Event::PickFileRequested);
    sut.resolve(Res::FilePickCancelled);
    let view = sut.view();
    assert!(!view.busy);
    assert!(!view.file_error);
}

#[test]
fn unreadable_file_sets_the_error_flag() {
    let mut sut = rated(usdt("1000"), 7.2);
    sut.dispatch(Event::PickFileRequested);
    sut.resolve(Res::FilePickFailed);
    let view = sut.view();
    assert!(!view.busy);
    assert!(view.file_error, "the shell shows the alert copy");
    // The next pick starts clean.
    sut.dispatch(Event::PickFileRequested);
    assert!(!sut.view().file_error);
}

#[test]
fn template_save_flips_the_label() {
    let mut sut = rated(usdt("1000"), 7.2);
    let ops = sut.dispatch(Event::SaveTemplateRequested);
    assert_eq!(
        ops,
        vec![Op::SaveTemplateFile {
            name: "vela-payroll-template.csv".to_owned(),
            contents: TEMPLATE_CSV.to_owned(),
            mime: "text/csv".to_owned(),
        }]
    );
    sut.resolve(Res::TemplateSaved);
    assert!(sut.view().template_saved);
}

/// A dismissed share sheet keeps the plain label — silently, as today.
#[test]
fn dismissed_template_share_keeps_the_plain_label() {
    let mut sut = rated(usdt("1000"), 7.2);
    sut.dispatch(Event::SaveTemplateRequested);
    sut.resolve(Res::TemplateSaveFailed);
    assert!(!sut.view().template_saved);
}

// ---------------------------------------------------------------------------
// Machine — the send hand-off
// ---------------------------------------------------------------------------

/// The applied drafts are the capped, CONVERTED rows — address, token amount
/// (decimal string), optional name — exactly what the send machine's split
/// editor seeds from.
#[test]
fn apply_hands_over_capped_converted_recipients() {
    let mut sut = rated(usdt("2000"), 7.2);
    sut.dispatch(Event::EditRate {
        text: "8".to_owned(),
    });
    paste(&mut sut, format!("Alice,{},5000\nBob,{},8000", a(), b()));
    let view = sut.view();
    assert_eq!(view.recipient_count, 2);
    assert_eq!(view.total_token, "1625");
    assert_eq!(view.total_fiat.as_deref(), Some("13000"));
    assert!(view.can_apply);
    assert_eq!(view.recipients.len(), 2);
    assert_eq!(view.recipients[0].name.as_deref(), Some("Alice"));
    assert_eq!(view.recipients[0].address, a());
    assert_eq!(view.recipients[0].amount, "625");
    assert_eq!(view.recipients[1].name.as_deref(), Some("Bob"));
    assert_eq!(view.recipients[1].address, b());
    assert_eq!(view.recipients[1].amount, "1000");

    assert!(sut.dispatch(Event::Apply).is_empty(), "apply is pure hand-off");
    assert!(sut.view().applied, "the shell seeds send and closes the sheet");
}
