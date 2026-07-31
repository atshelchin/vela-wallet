//! CLDR cardinal plural rules for the 15 shipped locales, plus the legacy mode.
//!
//! Hand-written rather than `icu_plurals`: measured at **1,204 wasm bytes** against
//! ICU4X's **57,960** (48x, 12.35% of the entire headroom), and ICU4X would not have
//! removed the hard part — `PluralOperands` has no `From<f64>`, so the operand
//! bridge is hand-written either way. Cross-validated against node's full-ICU oracle
//! at **182,790 / 182,790**, zero disagreements. See research.md D1.
//!
//! The 15 locales collapse to **five** rule bodies (four distinct category *sets*;
//! the fifth body exists because `it`/`es-MX` and `fr`/`pt-BR` disagree at count 0).
//!
//! ## Documented divergence from ICU
//!
//! Exact for `|count| < 1e18`. At or above 1e18 ICU switches to a scientific
//! representation (*i*=1, *e*=18) and returns `other` for `it` / `one` for `fr`,
//! where the literal CLDR rule text computes `many`. `5e17` still agrees. No wallet
//! count reaches 1e18, so this is recorded rather than fixed.

/// A CLDR plural category.
///
/// `Zero` is present for completeness but **no shipped locale produces it**.
/// i18next's `_zero` candidate is its own extension (`i18next.js:602`), appended for
/// `count == 0` on top of the real CLDR category, never in place of it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Zero,
    One,
    Two,
    Few,
    Many,
    Other,
}

impl Category {
    /// The i18next suffix for this category, including the `pluralSeparator`.
    #[must_use]
    pub fn suffix(self) -> &'static str {
        match self {
            Category::Zero => "_zero",
            Category::One => "_one",
            Category::Two => "_two",
            Category::Few => "_few",
            Category::Many => "_many",
            Category::Other => "_other",
        }
    }

    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Category::Zero => "zero",
            Category::One => "one",
            Category::Two => "two",
            Category::Few => "few",
            Category::Many => "many",
            Category::Other => "other",
        }
    }
}

/// Which plural rule an engine applies.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum PluralMode {
    /// Full CLDR — the conformance target, and what web and Jest already produce.
    #[default]
    Cldr,
    /// i18next's `dummyRule` (`i18next.js:1030-1035`), which is what every native
    /// build silently falls back to today because Hermes ships `Intl` without
    /// `PluralRules`. Kept so the delta stays enumerable: **75 of 825** corpus
    /// plural cases differ between the two modes.
    Legacy,
}

/// The five distinct CLDR cardinal rule bodies across the 15 shipped locales.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Rule {
    /// zh, zh-TW, zh-HK, ja, ko, vi, id — `[other]`.
    Other,
    /// en, de, tr — `[one, other]`.
    OneOther,
    /// it, es-MX — `[one, many, other]`, `one` when *i*=1 and *v*=0.
    OneManyOther,
    /// fr, pt-BR — `[one, many, other]`, `one` when *i* is 0 **or** 1.
    ZeroOneManyOther,
    /// ru — `[one, few, many, other]`.
    Russian,
}

/// Map a BCP-47 tag to its rule body.
///
/// **Take the primary subtag with `split`, never `&locale[..i]`.** Range-slicing a
/// `&str` emits a UTF-8 boundary check whose failure path links `core::fmt` and the
/// panic formatter into the module: **+28,553 wasm bytes** measured (research D1).
/// This is the same class of instruction as feature 003's "multiply order is
/// contract, never `mul_add`" — a harmless-looking rewrite with a large cost.
fn rule_for(locale: &str) -> Rule {
    let primary = locale.split(['-', '_']).next().unwrap_or(locale);
    match primary {
        "zh" | "ja" | "ko" | "vi" | "id" => Rule::Other,
        "it" | "es" => Rule::OneManyOther,
        "fr" | "pt" => Rule::ZeroOneManyOther,
        "ru" => Rule::Russian,
        // en, de, tr, and anything unknown. i18next resolves an unknown code's
        // rule through `dev == en` (`i18next.js:1059`), so falling through to the
        // English shape is the faithful behaviour, not a guess.
        _ => Rule::OneOther,
    }
}

/// The CLDR operands this engine needs: *i* (integer part) and *v* (visible
/// fraction digits). *e* (compact exponent) is always 0 — nothing here formats in
/// compact notation — and *w*/*f*/*t* are not referenced by any of the five rules.
struct Operands {
    i: u64,
    v: u32,
}

/// Derive `(i, v)` from an `f64`, reproducing what `Intl` renders with
/// `maximumFractionDigits: 3` and `roundingMode: halfExpand`.
///
/// Three instructions here are contract, each measured:
///
/// 1. **Scale the whole value, never the fraction.** `i = n.trunc()` followed by
///    `round((n - i) * 1000.0)` produced **6 disagreements out of 15,810**, all at
///    `count = 1.0005` in en/tr/ru/es-MX/it/de: `(1.0005 - 1.0) * 1000.0` is
///    `0.49999999999994`, which rounds to *v*=0, while ICU renders `"1.001"` and
///    gets *v*=3. `1.0005 * 1000.0` is exactly `1000.5` and rounds correctly.
/// 2. **Carry the operands as `u64`, never `f64`.** wasm has no `f64.rem`, so every
///    `%` on a float calls `compiler_builtins`' `fmod` and drags in `__udivti3` /
///    `__multi3`: measured **+2,935 bytes** (4,230 -> 1,295 stripped).
/// 3. **The `is_finite` guard is load-bearing.** `f64 as u64` saturates in Rust, so
///    without it `NaN` would become *i*=0 and select `one` under the fr/pt-BR rule.
fn operands(count: f64) -> Option<Operands> {
    if !count.is_finite() {
        return None;
    }
    let a = count.abs();

    // Above 2^52 an f64 has no fractional part at all, so scaling by 1000 can only
    // overflow. Take the integer directly; v is 0 by construction.
    if a >= 4_503_599_627_370_496.0 {
        return Some(Operands {
            i: if a >= u64::MAX as f64 {
                u64::MAX
            } else {
                a as u64
            },
            v: 0,
        });
    }

    // Value in thousandths, rounded half-away-from-zero — `f64::round` is exactly
    // halfExpand for a non-negative input.
    let scaled = (a * 1000.0).round() as u64;
    let i = scaled / 1000;
    let frac = scaled % 1000;
    // Visible fraction digits AFTER trailing zeros are trimmed, because
    // `minimumFractionDigits` defaults to 0.
    let v = if frac == 0 {
        0
    } else if frac % 100 == 0 {
        1
    } else if frac % 10 == 0 {
        2
    } else {
        3
    };
    Some(Operands { i, v })
}

/// The CLDR cardinal category for `count` under `locale`.
#[must_use]
pub fn plural_category(locale: &str, count: f64) -> Category {
    let rule = rule_for(locale);
    let Some(Operands { i, v }) = operands(count) else {
        // NaN and the infinities have no CLDR operands; ICU answers `other`.
        return Category::Other;
    };

    match rule {
        Rule::Other => Category::Other,
        // en/de: `one: i = 1 and v = 0`. tr: `one: n = 1`. The two differ only when
        // v != 0 at n == 1, which no f64 can express (1.00 IS 1), so one body serves
        // all three — verified by a 7,016-probe equivalence partition (research D1).
        Rule::OneOther => {
            if i == 1 && v == 0 {
                Category::One
            } else {
                Category::Other
            }
        }
        // it/es: `one: i = 1 and v = 0`,
        //        `many: e = 0 and i != 0 and i % 1000000 = 0 and v = 0`.
        Rule::OneManyOther => {
            if i == 1 && v == 0 {
                Category::One
            } else if i != 0 && i % 1_000_000 == 0 && v == 0 {
                Category::Many
            } else {
                Category::Other
            }
        }
        // fr/pt: `one: i = 0,1` — note this ignores v, so 0.5 is `one` in French.
        //        `many: e = 0 and i != 0 and i % 1000000 = 0 and v = 0`.
        Rule::ZeroOneManyOther => {
            if i == 0 || i == 1 {
                Category::One
            } else if i % 1_000_000 == 0 && v == 0 {
                Category::Many
            } else {
                Category::Other
            }
        }
        // ru: one:  v = 0 and i % 10 = 1 and i % 100 != 11
        //     few:  v = 0 and i % 10 = 2..4 and i % 100 != 12..14
        //     many: v = 0 and (i % 10 = 0 or i % 10 = 5..9 or i % 100 = 11..14)
        Rule::Russian => {
            if v != 0 {
                return Category::Other;
            }
            let i10 = i % 10;
            let i100 = i % 100;
            if i10 == 1 && i100 != 11 {
                Category::One
            } else if (2..=4).contains(&i10) && !(12..=14).contains(&i100) {
                Category::Few
            } else {
                Category::Many
            }
        }
    }
}

/// The CLDR cardinal suffix for `count` under `locale` (MODE A).
#[must_use]
pub fn plural_suffix(locale: &str, count: f64) -> String {
    plural_category(locale, count).suffix().to_owned()
}

/// Every CLDR cardinal category `locale` can produce, in CLDR order
/// (`zero < one < two < few < many < other`, `i18next.js:1022-1029`).
#[must_use]
pub fn plural_categories(locale: &str) -> &'static [Category] {
    match rule_for(locale) {
        Rule::Other => &[Category::Other],
        Rule::OneOther => &[Category::One, Category::Other],
        Rule::OneManyOther | Rule::ZeroOneManyOther => {
            &[Category::One, Category::Many, Category::Other]
        }
        Rule::Russian => &[
            Category::One,
            Category::Few,
            Category::Many,
            Category::Other,
        ],
    }
}

/// The CLDR-ordered suffix list for `locale`.
#[must_use]
pub fn plural_suffixes(locale: &str) -> Vec<String> {
    plural_categories(locale)
        .iter()
        .map(|c| c.suffix().to_owned())
        .collect()
}

/// The legacy category (MODE B): `count === 1 ? "one" : "other"`, locale-independent.
///
/// `count == 1.0` in Rust matches JS `count === 1` for every `f64`, including `-0.0`
/// (equal to 1 in neither) and `NaN` (equal to nothing).
#[must_use]
pub fn plural_category_legacy(count: f64) -> Category {
    if count == 1.0 {
        Category::One
    } else {
        Category::Other
    }
}

/// The legacy suffix (MODE B).
#[must_use]
pub fn plural_suffix_legacy(count: f64) -> String {
    plural_category_legacy(count).suffix().to_owned()
}

/// The legacy category set: always `["_one", "_other"]`, locale-independent
/// (`i18next.js:1033`).
#[must_use]
pub fn plural_suffixes_legacy() -> Vec<String> {
    vec!["_one".to_owned(), "_other".to_owned()]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn russian_matches_cldr() {
        // The ten keys this whole feature exists for. 21 and 101 are the cases that
        // render wrongly on every native build today.
        assert_eq!(plural_category("ru", 1.0), Category::One);
        assert_eq!(plural_category("ru", 2.0), Category::Few);
        assert_eq!(plural_category("ru", 5.0), Category::Many);
        assert_eq!(plural_category("ru", 21.0), Category::One);
        assert_eq!(plural_category("ru", 101.0), Category::One);
        assert_eq!(plural_category("ru", 11.0), Category::Many);
        assert_eq!(plural_category("ru", 0.0), Category::Many);
        assert_eq!(plural_category("ru", 1.5), Category::Other);
    }

    #[test]
    fn decimal_midpoint_uses_whole_value_scaling() {
        // The 6/15,810 disagreement that fraction-first extraction produced.
        // ICU renders 1.0005 as "1.001", so v = 3 and the category is `other`.
        assert_eq!(plural_category("en", 1.0005), Category::Other);
        assert_eq!(plural_category("ru", 1.0005), Category::Other);
    }

    #[test]
    fn non_finite_counts_do_not_saturate_into_one() {
        // Without the is_finite guard, `NaN as u64` is 0 and fr would answer `one`.
        assert_eq!(plural_category("fr", f64::NAN), Category::Other);
        assert_eq!(plural_category("fr", f64::INFINITY), Category::Other);
        assert_eq!(plural_category("en", f64::NAN), Category::Other);
    }

    #[test]
    fn million_selects_many_in_the_romance_locales() {
        for lng in ["fr", "it", "es-MX", "pt-BR"] {
            assert_eq!(plural_category(lng, 1_000_000.0), Category::Many, "{lng}");
        }
        assert_eq!(plural_category("en", 1_000_000.0), Category::Other);
    }

    #[test]
    fn french_treats_zero_as_one_and_italian_does_not() {
        assert_eq!(plural_category("fr", 0.0), Category::One);
        assert_eq!(plural_category("pt-BR", 0.0), Category::One);
        assert_eq!(plural_category("it", 0.0), Category::Other);
        assert_eq!(plural_category("es-MX", 0.0), Category::Other);
    }

    #[test]
    fn negative_counts_use_the_absolute_value() {
        assert_eq!(plural_category("en", -1.0), Category::One);
        assert_eq!(plural_category("ru", -21.0), Category::One);
    }
}
