//! Bidirectional isolation (FR-022) and text direction (FR-023).
//!
//! Both exist for one reason: user-controlled text — contact aliases, ENS names,
//! dApp origins — is interpolated into translated labels. A right-to-left name
//! dropped into `to {{addr}}` can reorder the sentence around it, which on a
//! signing surface means the user reads a different sentence from the one the
//! wallet wrote.
//!
//! **Isolation defaults to OFF.** Wrapping every substitution would change output
//! for every locale and break FR-005's byte-parity claim against i18next, so it is
//! an explicit per-call-site decision. Nothing turns it on yet; the facility exists
//! so a call site can, and so RTL support is not a rewrite later.
//!
//! **Direction is compiled in, never asked of the host.** i18next consults
//! `Intl.Locale(...).textInfo` first (`i18next.js:2142`) and falls back to a
//! hardcoded list — inheriting exactly the host-ICU dependency this feature exists
//! to remove. For the 15 shipped locales the two agree (all `Ltr`), so this is a
//! recorded divergence in *mechanism* with no divergence in *result*.

/// Unicode FIRST STRONG ISOLATE — opens a directional isolate whose direction is
/// inferred from the first strong character inside it.
pub const FSI: char = '\u{2068}';
/// Unicode POP DIRECTIONAL ISOLATE — closes the innermost isolate.
pub const PDI: char = '\u{2069}';

/// Text direction of a locale.
pub use super::super::i18n::Dir;

/// Direction for an arbitrary BCP-47 tag.
///
/// Reproduces i18next's two script quirks (`:2150-2151`): an explicit `-Latn`
/// subtag forces LTR even on an RTL language, and an explicit `-Arab` subtag forces
/// RTL even on an LTR one. Both are checked before the language list, because the
/// script is the stronger signal.
#[must_use]
pub fn text_direction(lng: &str) -> Dir {
    super::super::i18n::resolve::dir_of(lng)
}

/// Wrap `value` in FSI…PDI.
///
/// Only the substituted value is wrapped, never the surrounding template — the
/// point is to stop the *inserted* text from reordering its neighbours, not to
/// isolate the sentence from itself.
#[must_use]
pub fn isolate(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + FSI.len_utf8() + PDI.len_utf8());
    isolate_into(&mut out, value);
    out
}

/// Append `value`, isolated, to an existing buffer — the allocation-free form for
/// the interpolation hot path.
pub fn isolate_into(out: &mut String, value: &str) {
    out.push(FSI);
    out.push_str(value);
    out.push(PDI);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_shipped_locale_is_ltr() {
        for lng in crate::i18n::SUPPORTED {
            assert_eq!(text_direction(lng), Dir::Ltr, "{lng}");
        }
    }

    #[test]
    fn rtl_languages_are_detected() {
        for lng in ["ar", "he", "fa", "ur", "ps", "yi", "dv", "ku"] {
            assert_eq!(text_direction(lng), Dir::Rtl, "{lng}");
        }
        // Regional and script-suffixed forms resolve through the primary subtag.
        assert_eq!(text_direction("ar-EG"), Dir::Rtl);
    }

    #[test]
    fn isolation_wraps_only_the_value() {
        assert_eq!(isolate("مرحبا"), "\u{2068}مرحبا\u{2069}");
        // Empty input still produces a well-formed isolate rather than nothing:
        // an unbalanced FSI would corrupt everything after it.
        assert_eq!(isolate(""), "\u{2068}\u{2069}");
    }

    #[test]
    fn isolate_into_matches_isolate() {
        let mut buf = String::from("to ");
        isolate_into(&mut buf, "Alice");
        assert_eq!(buf, format!("to {}", isolate("Alice")));
    }
}
