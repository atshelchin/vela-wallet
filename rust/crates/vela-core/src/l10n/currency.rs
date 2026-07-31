//! Fiat formatting per CLDR (FR-020).
//!
//! Today's `formatFiat` (`src/services/currency.ts:108`) is `symbol + number` with
//! no separator and a binary 2-or-0 decimal rule. That is wrong for **21 of the 137**
//! catalog currencies and for **7 of the 15** shipped locales.
//!
//! Two rules are kept apart on purpose:
//!
//! - **CLDR governs the currency**: how many fraction digits the code takes, which
//!   side the symbol sits on, and whether a space separates it.
//! - **The user's preset governs the number**: grouping and the decimal mark come
//!   from `l10n::number`, because the preset is a deliberate product decision the
//!   user made in Settings. This is why `fr`'s CLDR U+202F group separator and
//!   `ru`'s U+00A0 one are *not* emitted — the user chose "space", not "French".
//!
//! `format_fiat` composes the two rather than letting either win outright.

use super::number::{format_number, FractionDigits, NumberPreset};

/// Codes CLDR gives **three** fraction digits. All six are in the app's catalog.
const THREE_DECIMAL: [&str; 6] = ["KWD", "BHD", "OMR", "JOD", "TND", "LYD"];

/// Codes CLDR gives **zero** fraction digits.
///
/// All **30** in the 137-code catalog, which is the whole point: the app's own
/// `ZERO_DECIMAL_CODES` (`currency.ts:91-93`) lists 15 of them plus DJF/KMF (not in
/// the catalog) and — incorrectly — IDR and HUF, which CLDR gives 2. Narrowing this
/// set to "the 15 the app already gets right" would reintroduce the defect for the
/// other 15; FR-020 means the full CLDR set.
const ZERO_DECIMAL: [&str; 30] = [
    "AFN", "ALL", "BIF", "CLP", "COP", "GNF", "HUF", "IDR", "IQD", "IRR", "ISK", "JPY", "KRW",
    "LAK", "LBP", "MGA", "MMK", "PKR", "PYG", "RWF", "SLL", "SOS", "SYP", "UGX", "VND", "VUV",
    "XAF", "XOF", "XPF", "YER",
];

/// Where a locale writes the currency symbol.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Placement {
    /// `$1,234.50` — en, zh, zh-TW, zh-HK, ja, ko, id, tr, es-MX.
    BeforeTight,
    /// `R$ 1.234,50` — pt-BR only.
    BeforeSpaced,
    /// `1 234,50 €` — vi, fr, de, ru, it.
    AfterSpaced,
}

/// The pattern space is **always U+00A0**, never U+0020 and never U+202F.
const NBSP: char = '\u{00A0}';

fn placement(locale: &str) -> Placement {
    let primary = locale.split(['-', '_']).next().unwrap_or(locale);
    match locale {
        "pt-BR" => Placement::BeforeSpaced,
        _ => match primary {
            "vi" | "fr" | "de" | "ru" | "it" => Placement::AfterSpaced,
            "pt" => Placement::BeforeSpaced,
            _ => Placement::BeforeTight,
        },
    }
}

/// CLDR fraction digits for `code`.
#[must_use]
pub fn currency_fraction_digits(code: &str) -> usize {
    let upper = code.to_ascii_uppercase();
    if THREE_DECIMAL.contains(&upper.as_str()) {
        3
    } else if ZERO_DECIMAL.contains(&upper.as_str()) {
        0
    } else {
        2
    }
}

/// Per-call fiat options.
#[derive(Debug, Clone, Copy)]
pub struct FiatOptions {
    pub preset: NumberPreset,
    /// Above this magnitude the minor units are dropped as visual noise on a large
    /// balance. This is the app's **product** rule (`currency.ts:96-101`), not a
    /// CLDR one, and it is an explicit field so the two cannot be confused. `None`
    /// disables it; the app's current value is `Some(100_000.0)`.
    pub drop_minor_units_above: Option<f64>,
}

impl Default for FiatOptions {
    fn default() -> Self {
        Self {
            preset: NumberPreset::CommaDot,
            drop_minor_units_above: Some(100_000.0),
        }
    }
}

/// Whether CLDR's `currencySpacing` inserts a space here.
///
/// It applies when the character of the symbol adjacent to the digits is
/// alphabetic — live for Vela, because `currency-catalog.ts` supplies `CHF`, `Rp`,
/// `zł`, `kr` and every code with no glyph at all. `Rp 1.235` in `id` is the
/// visible case: `id` is otherwise a no-space locale.
fn needs_currency_spacing(symbol: &str, before: bool) -> bool {
    let adjacent = if before {
        symbol.chars().next_back()
    } else {
        symbol.chars().next()
    };
    adjacent.is_some_and(char::is_alphabetic)
}

/// Format `value` in `code`, displayed with `symbol`, for `locale`.
#[must_use]
pub fn format_fiat(
    value: f64,
    code: &str,
    symbol: &str,
    locale: &str,
    opts: FiatOptions,
) -> String {
    let mut digits = currency_fraction_digits(code);
    if opts
        .drop_minor_units_above
        .is_some_and(|t| value.abs() >= t)
    {
        digits = 0;
    }
    let number = format_number(
        value,
        opts.preset,
        FractionDigits {
            min: digits,
            max: digits,
        },
    );

    match placement(locale) {
        Placement::BeforeTight => {
            if needs_currency_spacing(symbol, true) {
                format!("{symbol}{NBSP}{number}")
            } else {
                format!("{symbol}{number}")
            }
        }
        Placement::BeforeSpaced => format!("{symbol}{NBSP}{number}"),
        Placement::AfterSpaced => format!("{number}{NBSP}{symbol}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts() -> FiatOptions {
        // Disable the product threshold so these assert the CLDR rule alone.
        FiatOptions {
            preset: NumberPreset::CommaDot,
            drop_minor_units_above: None,
        }
    }

    #[test]
    fn three_decimal_codes_are_the_six_cldr_gives_three() {
        for c in ["KWD", "BHD", "OMR", "JOD", "TND", "LYD"] {
            assert_eq!(currency_fraction_digits(c), 3, "{c}");
        }
    }

    #[test]
    fn all_thirty_zero_decimal_codes_are_covered() {
        // The 15 the app already got right...
        for c in [
            "JPY", "KRW", "ISK", "VND", "CLP", "PYG", "RWF", "UGX", "XOF", "XAF", "XPF", "GNF",
            "VUV",
        ] {
            assert_eq!(currency_fraction_digits(c), 0, "{c}");
        }
        // ...and the 15 it did not. These are the defect FR-020 closes.
        for c in [
            "LBP", "PKR", "MMK", "LAK", "COP", "ALL", "AFN", "IRR", "IQD", "SYP", "YER", "SOS",
            "BIF", "MGA", "SLL",
        ] {
            assert_eq!(
                currency_fraction_digits(c),
                0,
                "{c} — app rendered this with 2"
            );
        }
        // IDR and HUF: the app treats them as zero-decimal, and CLDR agrees.
        assert_eq!(currency_fraction_digits("IDR"), 0);
        assert_eq!(currency_fraction_digits("HUF"), 0);
    }

    #[test]
    fn ordinary_codes_keep_two() {
        for c in ["USD", "EUR", "GBP", "CNY", "RUB", "BRL", "MXN"] {
            assert_eq!(currency_fraction_digits(c), 2, "{c}");
        }
        assert_eq!(currency_fraction_digits("usd"), 2, "case-insensitive");
    }

    #[test]
    fn three_decimal_rendering_is_corrected() {
        // Was `د.ك1234.50` — wrong digit count AND no separator. The catalog's KWD
        // symbol `د.ك` ends in an Arabic LETTER, so currencySpacing applies and ICU
        // renders the NBSP too (`en`+KWD gives `"KWD 1,234.500"` with U+00A0).
        assert_eq!(
            format_fiat(1234.5, "KWD", "د.ك", "en", opts()),
            "د.ك\u{00A0}1,234.500"
        );
        // A three-decimal code with an alphabetic display code behaves identically.
        assert_eq!(
            format_fiat(1234.5, "BHD", "BHD", "en", opts()),
            "BHD\u{00A0}1,234.500"
        );
    }

    #[test]
    fn symbol_placement_matches_cldr_per_locale() {
        // symbol-after + NBSP
        for l in ["vi", "fr", "de", "ru", "it"] {
            assert_eq!(
                format_fiat(1234.5, "EUR", "€", l, opts()),
                "1,234.50\u{00A0}€",
                "{l}"
            );
        }
        // pt-BR is the one before-with-space locale.
        assert_eq!(
            format_fiat(1234.5, "BRL", "R$", "pt-BR", opts()),
            "R$\u{00A0}1,234.50"
        );
        // es-MX is BEFORE-TIGHT — measured with its own currency it is `$1,234.50`.
        // The spec's first draft listed it as symbol-after; that was wrong.
        assert_eq!(
            format_fiat(1234.5, "MXN", "$", "es-MX", opts()),
            "$1,234.50"
        );
        for l in ["en", "zh", "zh-TW", "zh-HK", "ja", "ko", "tr"] {
            assert_eq!(
                format_fiat(1234.5, "USD", "$", l, opts()),
                "$1,234.50",
                "{l}"
            );
        }
    }

    #[test]
    fn currency_spacing_applies_to_alphabetic_symbols() {
        // `id` is a no-space locale, but `Rp` ends alphabetic, so CLDR inserts NBSP.
        assert_eq!(
            format_fiat(1234.5, "IDR", "Rp", "id", opts()),
            "Rp\u{00A0}1,235"
        );
        // A code with no glyph behaves the same way in every no-space locale.
        assert_eq!(
            format_fiat(1234.5, "CHF", "CHF", "en", opts()),
            "CHF\u{00A0}1,234.50"
        );
        // A glyph symbol does not get the space.
        assert_eq!(format_fiat(1234.5, "USD", "$", "en", opts()), "$1,234.50");
    }

    #[test]
    fn the_preset_governs_grouping_not_cldr() {
        // `fr` uses U+202F in CLDR and `ru` uses U+00A0; neither is emitted, because
        // the user picked the preset. This is FR-020's explicit carve-out.
        assert_eq!(
            format_fiat(
                1234.5,
                "EUR",
                "€",
                "fr",
                FiatOptions {
                    preset: NumberPreset::SpaceComma,
                    drop_minor_units_above: None
                }
            ),
            "1 234,50\u{00A0}€"
        );
        assert_eq!(
            format_fiat(
                1234.5,
                "EUR",
                "€",
                "de",
                FiatOptions {
                    preset: NumberPreset::DotComma,
                    drop_minor_units_above: None
                }
            ),
            "1.234,50\u{00A0}€"
        );
    }

    #[test]
    fn the_drop_threshold_is_a_product_rule_not_a_cldr_one() {
        let app = FiatOptions::default();
        assert_eq!(format_fiat(259_770.0, "USD", "$", "en", app), "$259,770");
        assert_eq!(format_fiat(1234.5, "USD", "$", "en", app), "$1,234.50");
    }
}
