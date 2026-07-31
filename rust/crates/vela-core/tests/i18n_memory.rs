//! SC-009: memory attributable to the i18n engine is flat.
//!
//! A separate file from `i18n_bench.rs` on purpose. Each integration test file is
//! its own binary, and `i18n_bench.rs` installs a **global** counting allocator —
//! running this million-iteration loop in that binary polluted its per-call counts
//! (2 became 5) and its timings. Same reason its own tests are collapsed into one.

/// SC-009: memory attributable to the engine is **flat**.
///
/// Flatness here is *structural*, not sampled. The engine holds no per-key state
/// (FR-024): there is no memoised suffix table, no resolved-key cache, and no
/// analogue of i18next's `pluralRulesCache` — the plural rules are pure functions
/// over `(locale, count)`, so there is nothing to memoise. A sampling test would
/// only prove that a leak had not happened *yet*; this proves there is nowhere for
/// one to live.
#[test]
fn i18n_memory_is_flat_across_unbounded_distinct_keys() {
    use vela_core::i18n::{Catalog, Count, I18n, Options};

    let en = match Catalog::embedded("en") {
        Ok(c) => c,
        Err(e) => unreachable!("{e}"),
    };
    let engine = match I18n::new(en) {
        Ok(e) => e,
        Err(e) => unreachable!("{e}"),
    };

    // Resolve a million DISTINCT keys — none of which exist, so each takes the
    // longest path through the candidate loop. If any of it were cached, residency
    // would climb with the key count.
    let before = engine.resident_bytes();
    for i in 0..1_000_000u32 {
        let key = format!("zz.no.such.key.{i}");
        let opts = Options { count: Some(Count::Num(f64::from(i % 100))), ..Options::default() };
        std::hint::black_box(engine.t(&key, &opts).ok());
    }
    let after = engine.resident_bytes();

    assert_eq!(
        before, after,
        "SC-009: resident bytes moved from {before} to {after} across 1,000,000 \
         distinct keys — something is caching per key"
    );
    println!("SC-009: {after} resident bytes, unchanged across 1,000,000 distinct keys");
}
