//! `money` — a figure welded to the unit it is denominated in.
//!
//! Five defects in this wallet were the same defect wearing different clothes:
//! **a missing conversion factor silently became `1`.**
//!
//! ```text
//! getRate()                    resolveRate(code) ?? 1
//! display_currency::commit     rate.unwrap_or(1.0)
//! token_price_in_fiat          if rate > 0 { rate } else { 1.0 }
//! EnterDetailsStep.tsx:175     amount / (fiatPrice || 1)
//! toggle_fiat_input            conversion SKIPPED, number kept, LABEL changed
//! ```
//!
//! The last one is the interesting one, because it contains no `1` at all. It
//! took a figure typed in CNY, declined to divide it (no rate), and then wrote
//! "USDC" next to it. Multiplying by 1 and relabelling the unit are the same
//! operation; only one of them is greppable. So the defence cannot be another
//! guard at another call site — the guards were already there, and the bug
//! walked around them by never converting at all.
//!
//! The defence is this module. [`DenominatedAmount`]'s fields are private *to
//! this module*, so no amount of code elsewhere in the crate can change a
//! figure's unit while keeping its digits. The single way to obtain a figure in
//! another unit is [`DenominatedAmount::convert`], which restates the number and
//! the unit **together** — or returns [`ConvertError`] and hands the caller no
//! amount at all. There is deliberately no `set_denom`, no `retag`, no
//! `input_in_fiat = !input_in_fiat`.
//!
//! Companion invariant, same reasoning one level up: [`TokenPrice`] carries the
//! currency code it is quoted in, and [`TokenPrice::new`] refuses to exist
//! without a positive finite price *and* a positive finite rate. "Absent" is a
//! constructor failure here, never parity.

// ---------------------------------------------------------------------------
// Numeric helpers — JS-number semantics, shared by every money path
// ---------------------------------------------------------------------------

/// `parseFloat` — longest valid numeric prefix, `NaN` when none.
pub(crate) fn js_parse_float(s: &str) -> f64 {
    let t = s.trim_start();
    let b = t.as_bytes();
    let mut i = 0usize;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    let int_start = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    let has_int = i > int_start;
    let mut has_frac = false;
    if i < b.len() && b[i] == b'.' {
        let f0 = i + 1;
        let mut k = f0;
        while k < b.len() && b[k].is_ascii_digit() {
            k += 1;
        }
        has_frac = k > f0;
        if has_int || has_frac {
            i = k;
        }
    }
    if !has_int && !has_frac {
        return f64::NAN;
    }
    let mut end = i;
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        let mut k = i + 1;
        if k < b.len() && (b[k] == b'+' || b[k] == b'-') {
            k += 1;
        }
        let e0 = k;
        while k < b.len() && b[k].is_ascii_digit() {
            k += 1;
        }
        if k > e0 {
            end = k;
        }
    }
    t[..end].parse::<f64>().unwrap_or(f64::NAN)
}

/// `Number.prototype.toFixed` (display path — f64 is fine per the migration
/// notes; sub-ulp rounding differences from V8 are acceptable drift).
pub(crate) fn to_fixed(v: f64, decimals: u32) -> String {
    format!("{v:.*}", decimals as usize)
}

/// `stripTrailingZeros` (`fiat-convert.ts:17-20`): integers untouched.
pub(crate) fn strip_trailing_zeros(s: &str) -> String {
    if !s.contains('.') {
        return s.to_owned();
    }
    let s = s.trim_end_matches('0');
    s.trim_end_matches('.').to_owned()
}

/// The `replace(/\.?0+$/, '')` used by the fiat toggle
/// (`EnterDetailsStep.tsx:170, 184`). Ported verbatim — including the quirk
/// that it also eats trailing zeros of an INTEGER ("100" → "1"), which only a
/// 0-decimal token could hit.
pub(crate) fn strip_zeros_regex(s: &str) -> String {
    let b = s.as_bytes();
    let mut end = b.len();
    while end > 0 && b[end - 1] == b'0' {
        end -= 1;
    }
    if end == b.len() {
        return s.to_owned(); // the regex needs at least one trailing zero
    }
    if end > 0 && b[end - 1] == b'.' {
        end -= 1;
    }
    s[..end].to_owned()
}

// ---------------------------------------------------------------------------
// The unit
// ---------------------------------------------------------------------------

/// What a figure is counted in.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub enum Denom {
    /// The selected token's own units — the unit a signature is built in.
    #[default]
    Token,
    /// A fiat currency, named by the display-currency code the figure was typed
    /// in. The code is part of the unit: "5000" is not "an amount of fiat", it
    /// is 5000 *CNY*, and the display currency can change under a screen that
    /// already has a figure on it.
    Fiat(String),
}

impl Denom {
    /// A fiat unit for `code`.
    pub fn fiat(code: impl Into<String>) -> Self {
        Denom::Fiat(code.into())
    }

    pub fn is_fiat(&self) -> bool {
        matches!(self, Denom::Fiat(_))
    }

    pub fn fiat_code(&self) -> Option<&str> {
        match self {
            Denom::Token => None,
            Denom::Fiat(code) => Some(code.as_str()),
        }
    }
}

// ---------------------------------------------------------------------------
// The price
// ---------------------------------------------------------------------------

/// Why a figure could not be restated in another unit. Every variant means
/// "you do not have a converted amount" — never "use the original digits".
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConvertError {
    /// Nothing can price this pair right now: no token price, or no USD→fiat
    /// rate for the currency. The honest outcomes are to refuse the unit change
    /// or to drop the figure — not to keep the digits under a new label.
    Unpriced,
    /// The figure is denominated in a different currency than the price on
    /// offer. Converting anyway would re-denominate it silently, which is the
    /// exact defect this module exists to prevent.
    CurrencyMismatch,
}

/// A token's unit price **in one named fiat currency**.
///
/// The only constructor is [`TokenPrice::new`], and it yields `None` whenever
/// any input is absent or not a positive finite number. That is the whole
/// point: an absent price and an absent rate are absent *factors*, and the one
/// thing this codebase has proven it must never do is spell an absent factor
/// `1`.
///
/// Same discipline as `batch_import`'s `FiatRate` and `display_currency`'s
/// `Pair` one level up (a RATE inseparable from its currency), carried down to
/// the PRICE this screen divides by — and then, via [`DenominatedAmount`], to
/// the AMOUNT itself. Same rule at all three levels: a number that moves money
/// never travels without its unit.
#[derive(Clone, Debug, PartialEq)]
pub struct TokenPrice {
    code: String,
    per_token: f64,
}

impl TokenPrice {
    /// `price_usd × usd_to_fiat_rate`, quoted in `code`. `None` when either
    /// factor is missing, non-finite or non-positive.
    pub fn new(price_usd: Option<f64>, usd_to_fiat_rate: Option<f64>, code: &str) -> Option<Self> {
        let price = price_usd.filter(|p| p.is_finite() && *p > 0.0)?;
        let rate = usd_to_fiat_rate.filter(|r| r.is_finite() && *r > 0.0)?;
        let per_token = price * rate;
        (per_token.is_finite() && per_token > 0.0).then(|| Self {
            code: code.to_owned(),
            per_token,
        })
    }

    pub fn code(&self) -> &str {
        &self.code
    }

    pub fn per_token(&self) -> f64 {
        self.per_token
    }
}

// ---------------------------------------------------------------------------
// The amount
// ---------------------------------------------------------------------------

/// A decimal figure that cannot be separated from its unit.
///
/// `value` is kept as the canonical dot-decimal STRING the user typed (or that
/// a conversion produced), because every downstream consumer — `to_base_units`,
/// the confirm screen, the receipt — is string-exact and must not be routed
/// through an f64 round trip.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct DenominatedAmount {
    value: String,
    denom: Denom,
}

impl DenominatedAmount {
    /// A figure in the selected token's own units.
    pub fn token(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            denom: Denom::Token,
        }
    }

    /// A figure in `code`. Note the caller must name both halves — there is no
    /// way to promote an existing token figure to fiat without restating it.
    pub fn fiat(value: impl Into<String>, code: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            denom: Denom::fiat(code),
        }
    }

    pub fn value(&self) -> &str {
        &self.value
    }

    pub fn denom(&self) -> &Denom {
        &self.denom
    }

    pub fn is_fiat(&self) -> bool {
        self.denom.is_fiat()
    }

    pub fn fiat_code(&self) -> Option<&str> {
        self.denom.fiat_code()
    }

    pub fn is_empty(&self) -> bool {
        self.value.is_empty()
    }

    /// Retype the FIGURE, keeping the unit — this is the amount text field, and
    /// the only mutation that does not need a conversion factor.
    pub fn with_value(&self, value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            denom: self.denom.clone(),
        }
    }

    /// Same unit, no figure.
    pub fn cleared(&self) -> Self {
        self.with_value("")
    }

    /// The figure as a JS `parseFloat` would read it (`NaN` when unparsable, a
    /// blank field reading as `0`).
    pub fn as_f64(&self) -> f64 {
        js_parse_float(if self.value.is_empty() {
            "0"
        } else {
            &self.value
        })
    }

    /// Restate this figure in `target`.
    ///
    /// On `Ok` the digits AND the unit have both been rewritten together. On
    /// `Err` the caller holds nothing — and the one thing it must not do is
    /// invent an amount by keeping `self.value` under `target`. That is the
    /// implicit rate of 1 this module exists to make unwritable.
    ///
    /// `price` must be quoted in whichever fiat currency is involved; a price
    /// for a different code is [`ConvertError::CurrencyMismatch`], not an
    /// approximation.
    #[allow(clippy::neg_cmp_op_on_partial_ord)] // NaN is not a positive amount
    pub fn convert(
        &self,
        target: &Denom,
        price: Option<&TokenPrice>,
        token_decimals: u32,
        fiat_decimals: u32,
    ) -> Result<Self, ConvertError> {
        if self.denom == *target {
            return Ok(self.clone());
        }
        // Zero and blank are the same figure in every unit, so relabelling them
        // invents nothing and needs no factor. This is the ONLY unit change
        // that is legitimate without a price — and it is why an empty amount
        // field can still flip between token and fiat with no rate at all.
        let val = self.as_f64();
        if !(val > 0.0) {
            return Ok(Self {
                value: self.value.clone(),
                denom: target.clone(),
            });
        }
        let price = price.ok_or(ConvertError::Unpriced)?;
        match (&self.denom, target) {
            (Denom::Token, Denom::Fiat(code)) => {
                if code != price.code() {
                    return Err(ConvertError::CurrencyMismatch);
                }
                Ok(Self {
                    value: to_fixed(val * price.per_token(), fiat_decimals),
                    denom: target.clone(),
                })
            }
            (Denom::Fiat(code), Denom::Token) => {
                if code != price.code() {
                    return Err(ConvertError::CurrencyMismatch);
                }
                Ok(Self {
                    value: strip_zeros_regex(&to_fixed(val / price.per_token(), token_decimals)),
                    denom: Denom::Token,
                })
            }
            // Fiat → a DIFFERENT fiat is a cross rate this screen never has.
            // Refusing beats inventing one.
            (Denom::Fiat(_), Denom::Fiat(_)) => Err(ConvertError::CurrencyMismatch),
            (Denom::Token, Denom::Token) => Ok(self.clone()),
        }
    }

    /// The figure in token units — the ONE number a signature may be built
    /// from, and therefore the only number the confirm screen may show
    /// (invariant "displayed == signed").
    ///
    /// A token-denominated figure passes through byte-exact: an unpriceable
    /// display currency costs a token-denominated send nothing. A
    /// fiat-denominated figure that cannot be converted resolves to `"0"`,
    /// which every downstream gate already reads as "no amount" — it never
    /// resolves to its own fiat digits.
    ///
    /// This is `resolveTokenAmount`'s rounding (`fiatToTokenAmount` +
    /// `stripTrailingZeros`), which is deliberately NOT the toggle's sloppier
    /// `replace(/\.?0+$/, '')` in [`Self::convert`]; the two have always
    /// differed for 0-decimal tokens and the difference is ported, not fixed
    /// here.
    #[allow(clippy::neg_cmp_op_on_partial_ord)] // NaN resolves to "0", not to digits
    pub fn to_token_units(&self, price: Option<&TokenPrice>, token_decimals: u32) -> String {
        let Denom::Fiat(code) = &self.denom else {
            return self.value.clone();
        };
        // A price quoted in another currency is no price for THIS figure.
        let Some(price) = price.filter(|p| p.code() == code) else {
            return "0".to_owned();
        };
        let fiat = self.as_f64();
        if !(fiat > 0.0) {
            return "0".to_owned();
        }
        strip_trailing_zeros(&to_fixed(fiat / price.per_token(), token_decimals))
    }
}

#[cfg(test)]
mod tests {
    // The crate denies `unwrap` because a core must never fail on its caller's
    // behalf. Inside a test the panic IS the assertion, so it is allowed here
    // and nowhere else in this module.
    #![allow(clippy::unwrap_used)]

    use super::*;

    #[test]
    fn a_missing_factor_is_never_parity() {
        assert!(TokenPrice::new(None, Some(7.17), "CNY").is_none());
        assert!(TokenPrice::new(Some(1.0), None, "CNY").is_none());
        assert!(TokenPrice::new(Some(1.0), Some(0.0), "CNY").is_none());
        assert!(TokenPrice::new(Some(1.0), Some(-1.0), "CNY").is_none());
        assert!(TokenPrice::new(Some(1.0), Some(f64::NAN), "CNY").is_none());
        assert!(TokenPrice::new(Some(f64::INFINITY), Some(1.0), "CNY").is_none());
    }

    /// The whole point of the module: without a price, a fiat figure has no
    /// token twin — and it does not get to keep its digits under a token label.
    #[test]
    fn an_unpriced_fiat_figure_cannot_become_a_token_figure() {
        let typed = DenominatedAmount::fiat("5000", "CNY");
        assert_eq!(
            typed.convert(&Denom::Token, None, 6, 2),
            Err(ConvertError::Unpriced)
        );
        assert_eq!(typed.to_token_units(None, 6), "0");
    }

    #[test]
    fn a_price_in_the_wrong_currency_is_refused_not_approximated() {
        let usd = TokenPrice::new(Some(1.0), Some(1.0), "USD").unwrap();
        let typed = DenominatedAmount::fiat("5000", "CNY");
        assert_eq!(
            typed.convert(&Denom::Token, Some(&usd), 6, 2),
            Err(ConvertError::CurrencyMismatch)
        );
        assert_eq!(typed.to_token_units(Some(&usd), 6), "0");
    }

    #[test]
    fn a_real_rate_converts_both_ways() {
        let cny = TokenPrice::new(Some(1.0), Some(7.17), "CNY").unwrap();
        let typed = DenominatedAmount::fiat("5000", "CNY");
        assert_eq!(typed.to_token_units(Some(&cny), 6), "697.35007");
        let back = DenominatedAmount::token("697.35007")
            .convert(&Denom::fiat("CNY"), Some(&cny), 6, 2)
            .unwrap();
        assert_eq!(back.value(), "5000.00");
        assert_eq!(back.fiat_code(), Some("CNY"));
    }

    /// Zero carries no information, so it may cross units with no factor —
    /// which is what keeps an empty field from trapping anyone in fiat mode.
    #[test]
    fn zero_and_blank_cross_units_freely() {
        for figure in ["", "0", "0.00"] {
            let typed = DenominatedAmount::fiat(figure, "CNY");
            let out = typed.convert(&Denom::Token, None, 18, 2).unwrap();
            assert_eq!(out.value(), figure);
            assert!(!out.is_fiat());
        }
    }

    #[test]
    fn a_token_figure_is_untouched_by_an_unpriceable_currency() {
        let typed = DenominatedAmount::token("1.5");
        assert_eq!(typed.to_token_units(None, 18), "1.5");
        assert_eq!(typed.to_token_units(None, 6), "1.5");
    }
}
