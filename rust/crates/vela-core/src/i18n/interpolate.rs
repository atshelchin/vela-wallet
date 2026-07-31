//! `{{var}}` / `{{- var}}` substitution and `$t()` nesting.
//!
//! Hand-rolled scanner, no regex: i18next's patterns are trivial and
//! non-backtracking (`\{\{(.+?)\}\}`, `\{\{\-(.+?)\}\}`), while the `regex` crate
//! would cost roughly the entire wasm headroom for four fixed patterns.
//!
//! Four behaviours that look like implementation detail and are actually contract:
//!
//! 1. **Unescape runs first** (`i18next.js:1195-1201`), so `{{- v}}` is matched
//!    before `{{v}}`.
//! 2. **Replacement is `str.replace(match[0], value)` — first occurrence, not
//!    splice-at-index.** Observable whenever a placeholder repeats.
//! 3. **Absent and `undefined` are different.** With `skipOnVariables: true`
//!    (v26's default, `:1711`) a genuinely absent variable is **left on screen** as
//!    the literal `{{var}}`; a variable that is an own property but `undefined`
//!    becomes `''`. Two code paths, two user-visible results.
//! 4. **A substituted value is not re-scanned** (`:1225-1228`), so a value
//!    containing `{{v}}` survives verbatim.

use super::{Options, Var};
use crate::error::CoreError;

/// `maxReplaces` (`i18next.js:1710`) — the bound on substitution passes.
const MAX_REPLACES: usize = 1000;
/// The `$t()` nesting recursion bound. i18next breaks a self-reference at depth 1,
/// so anything beyond this is already outside observable behaviour.
pub(crate) const MAX_NEST_DEPTH: usize = 8;

/// Render `name` from the options.
///
/// i18next interpolates against the WHOLE options object
/// (`const data = options.replace ?? options`), not just a variables sub-object,
/// so the reserved names are interpolatable too — `{{count}}` is the single most
/// common placeholder in the corpus. Explicit variables win over the reserved
/// names, matching a plain property lookup.
#[allow(clippy::too_many_lines, clippy::allow_attributes)]
fn render_into(out: &mut String, opts: &Options<'_>, name: &str) -> bool {
    if let Some((_, v)) = opts.vars.iter().find(|(k, _)| *k == name) {
        match v {
            Var::Str(s) => out.push_str(s),
            // ECMAScript `Number::toString`, not Rust's `{}`: `1e21` must render
            // `"1e+21"` and `-0.0` must render `"0"`. `ryu-js` is already a
            // workspace dependency for exactly this reason (feature 003, D2).
            Var::Num(n) => {
                let mut buf = ryu_js::Buffer::new();
                out.push_str(buf.format(*n));
            }
            Var::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            // `null` and own-property `undefined` both render empty.
            Var::Null | Var::Undefined => {}
            Var::Object => out.push_str("[object Object]"),
            Var::Array(items) => {
                for (i, it) in items.iter().enumerate() {
                    if i > 0 {
                        out.push(',');
                    }
                    out.push_str(it);
                }
            }
        }
        return true;
    }
    match name {
        "count" => match opts.count.as_ref() {
            Some(super::Count::Num(n)) => {
                let mut buf = ryu_js::Buffer::new();
                out.push_str(buf.format(*n));
                true
            }
            Some(super::Count::Str(s)) => {
                out.push_str(s);
                true
            }
            Some(super::Count::BigInt(v)) => {
                let mut b = itoa_i128(*v);
                out.push_str(b.as_str());
                b.clear();
                true
            }
            // `String(null)` inside a template literal is `""`, not `"null"` —
            // i18next renders the *interpolated* form, not `String(value)`.
            Some(super::Count::Null) => true,
            Some(super::Count::Object) => {
                out.push_str("[object Object]");
                true
            }
            None => false,
        },
        "context" => match opts.context {
            Some(c) => {
                out.push_str(c);
                true
            }
            None => false,
        },
        _ => false,
    }
}

/// A BigInt count never reaches interpolation in practice — `t()` rejects it with
/// `I18nInvalidCount` first — so correctness matters more than the allocation.
fn itoa_i128(v: i128) -> String {
    v.to_string()
}

/// Substitute `opts.vars` into `template`.
///
/// **One pass, one allocation.** The earlier shape ran the unescape scan and the
/// escape scan as two separate string-rewriting passes and then a third to undo
/// `$`-doubling — three allocations where one suffices, which the SC-007 bench
/// caught at 14 per `t()` against a budget of 2.
///
/// The `$`-doubling is gone entirely, and that is a *simplification*, not a
/// shortcut: i18next needs `regexSafe` (`:1105`) only because it substitutes via
/// `String.prototype.replace`, where `$&` and `$1` in the replacement are
/// meaningful. This scanner splices literally, so the value already lands verbatim
/// — doubling and then un-doubling would be two passes to arrive back where we
/// started. The corpus proves the equivalence: `natural/"Price: $1.00"` and the
/// `$`-bearing interpolation cases all stay green.
pub fn interpolate(template: &str, opts: &Options<'_>) -> Result<String, CoreError> {
    // The overwhelmingly common case: nothing to substitute, so hand back a plain
    // copy without scanning twice.
    if !template.contains("{{") {
        return Ok(template.to_owned());
    }

    let mut out = String::with_capacity(template.len() + 16);
    let mut rest = template;
    let mut replaces = 0usize;

    while replaces < MAX_REPLACES {
        let Some(start) = rest.find("{{") else { break };
        let after = &rest[start + 2..];
        let Some(end_rel) = after.find("}}") else {
            break;
        };
        let raw = &after[..end_rel];

        // The unescape form `{{- v}}` is matched FIRST upstream (`:1195-1201`).
        // With `escapeValue: false` the two forms differ only in the prefix, so one
        // scanner handles both — but the prefix must still be stripped, or the
        // variable name would be `- v`.
        let name = raw.strip_prefix('-').unwrap_or(raw).trim();

        out.push_str(&rest[..start]);
        if !render_into(&mut out, opts, name) {
            // ABSENT (`skipOnVariables: true`, `:1711`) — the placeholder stays on
            // screen rather than rendering empty. This is i18next's behaviour, not a
            // choice, and the corpus pins it.
            //
            // It is latent rather than live: of the 107 literal-key call sites whose
            // key declares a `{{var}}`, ZERO fail to supply every variable it needs
            // (re-derived 2026-07-31). It would surface at a dynamic-key site, which
            // cannot be checked statically — hence keeping the fidelity.
            out.push_str(&rest[start..start + 2 + end_rel + 2]);
        }
        rest = &rest[start + 2 + end_rel + 2..];
        replaces += 1;
    }

    out.push_str(rest);
    Ok(out)
}

/// A `$t(...)` call found in a rendered string.
pub(crate) struct NestCall {
    /// Byte range of the whole `$t(...)` expression, including the delimiters.
    pub range: core::ops::Range<usize>,
    /// The key being referenced.
    pub key: String,
    /// A `count` supplied inline, e.g. `$t(k, {"count": 5})`.
    pub count: Option<f64>,
}

/// Find the first `$t(...)` call in `input`.
///
/// Returns `None` for a malformed call with no closing parenthesis, which i18next
/// leaves verbatim rather than treating as an error. Parenthesis depth is tracked
/// so an inline options object containing `(` does not truncate the match.
pub(crate) fn find_nest(input: &str) -> Option<NestCall> {
    let start = input.find("$t(")?;
    let after = &input[start + 3..];
    let mut depth = 1usize;
    let mut end = None;
    for (i, c) in after.char_indices() {
        match c {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    end = Some(i);
                    break;
                }
            }
            _ => {}
        }
    }
    let end = end?;
    let inner = &after[..end];
    // `key` up to the first comma; anything after it is an inline options object.
    let (key, rest) = match inner.find(',') {
        Some(i) => (inner[..i].trim(), Some(inner[i + 1..].trim())),
        None => (inner.trim(), None),
    };
    let count = rest
        .and_then(|r| serde_json::from_str::<serde_json::Value>(r).ok())
        .and_then(|v| v.get("count").and_then(serde_json::Value::as_f64));
    Some(NestCall {
        range: start..start + 3 + end + 1,
        key: key.to_owned(),
        count,
    })
}
