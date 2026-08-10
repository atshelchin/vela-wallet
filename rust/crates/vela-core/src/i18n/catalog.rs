//! One locale's translations, loaded on demand.
//!
//! Shape (research.md D2, all figures measured):
//!
//! - A **shared** compiled-in path table — the 1,205 sorted paths (1,141 leaf +
//!   64 branch, proved identical in every locale) plus a 151-byte branch bitmap —
//!   paid for **once** across all 15 locales. Key bytes repeated per locale cost
//!   460,471; interned once, 32,173. A 14.8x collapse, and the only reason
//!   `ja` + `en` fits SC-005's 135,345-byte budget at a measured 121,528.
//! - A **per-locale** value blob with a dense offset array and a presence
//!   bitmap, either `&'static` behind a cargo feature or heap-built from host JSON.
//!
//! `u16` offsets rather than `usize`: the 64-bit table came to 135,992, which is
//! 647 bytes *over* budget; `u16` lands `ja` + `en` at 131,168 on every pointer
//! width. The width is chosen PER LOCALE ([`StaticOffsets`]) rather than once for
//! the corpus, because pinning all fifteen to the narrowest common width made the
//! largest locale a corpus-wide ceiling: `ru` reached 65,115 of the 65,535 bytes a
//! `u16` offset can address, so the next sentence added to it would have failed the
//! build for every language. `ru` is emitted `u32` and costs 2,648 bytes more;
//! `ja` and `en` — the two SC-005 measures — are untouched.
//!
//! Lookup is one binary search over the shared path table plus an O(1) index —
//! measured 21.1 ns hot with **zero** allocations, which leaves essentially the
//! whole 1 us SC-007 budget for plurals and interpolation.

use super::paths::{is_branch, path_id, N_PATHS};
use super::plural::{plural_categories, Category};
use super::resolve::Dir;
use crate::error::CoreError;
use alloc_free::LangTag;

/// A BCP-47 tag stored inline. The longest shipped tag is 5 bytes (`zh-TW`), so a
/// `Catalog` carries no heap allocation for its own identity.
mod alloc_free {
    /// Inline language tag: up to 15 bytes, `Copy`, no heap.
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub struct LangTag {
        bytes: [u8; 15],
        len: u8,
    }

    impl LangTag {
        /// `None` when the tag does not fit — no shipped tag comes close.
        pub fn new(s: &str) -> Option<Self> {
            let b = s.as_bytes();
            if b.len() > 15 {
                return None;
            }
            let mut bytes = [0u8; 15];
            bytes[..b.len()].copy_from_slice(b);
            #[allow(clippy::cast_possible_truncation, clippy::allow_attributes)]
            Some(Self {
                bytes,
                len: b.len() as u8,
            })
        }

        pub fn as_str(&self) -> &str {
            // The bytes came from a `&str` and were never split, so this range is a
            // valid UTF-8 boundary by construction. `from_utf8` is checked anyway —
            // the crate forbids unsafe, and the check is a length compare.
            core::str::from_utf8(&self.bytes[..self.len as usize]).unwrap_or("")
        }
    }
}

/// Where a lookup landed.
///
/// `Branch` is first-class rather than "missing" because `t("home")` must return
/// the byte-exact diagnostic `key 'home (en)' returned an object instead of
/// string.` — a flat map cannot tell a branch from an absent key, and getting that
/// wrong is a visible divergence.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Lookup<'a> {
    Value(&'a str),
    Branch,
    Missing,
}

/// A runtime-parsed value table (FR-015).
#[derive(Debug)]
pub(crate) struct OwnedValues {
    blob: String,
    offsets: Vec<u32>,
    present: Vec<u8>,
    /// This catalog's **own** branch bitmap. It must not reuse the compiled-in
    /// `IS_BRANCH`: a runtime-loaded locale's object structure need not match the
    /// shipped corpus, and reporting a leaf as a branch would emit the object
    /// diagnostic in place of a real translation.
    branches: Vec<u8>,
    /// Paths absent from the shared table, sorted, so a runtime catalog is never
    /// silently truncated to the compiled-in key inventory.
    extra: Vec<(String, String)>,
    /// Branch paths absent from the shared table, sorted.
    extra_branches: Vec<String>,
}

/// A compiled-in offset array, at whichever width that locale's blob needs.
///
/// Generated code names the variant (`scripts/gen-i18n.mjs` emits
/// `[u16; N]` or `[u32; N]` and the matching constructor), so the choice is made
/// once, from the measured blob size, and can never disagree with the array it
/// describes. Reading goes through [`Self::get`], which widens to `usize` — no
/// call site sees the difference.
///
/// `allow(dead_code)`: the DEFAULT feature set is zero locales — which is what
/// the wasm build and `cargo check` compile — so `i18n_catalogs::embedded` has
/// every arm cfg'd out and neither variant is ever constructed there. The
/// alternative is a `cfg(any(feature = "i18n-en", ... × 15))` that has to be
/// edited whenever a locale is added, which fails in the direction of silence.
#[derive(Debug, Clone, Copy)]
#[allow(dead_code)]
pub(crate) enum StaticOffsets {
    U16(&'static [u16]),
    U32(&'static [u32]),
}

impl StaticOffsets {
    fn len(self) -> usize {
        match self {
            Self::U16(o) => o.len(),
            Self::U32(o) => o.len(),
        }
    }

    /// Bytes one entry occupies — the SC-005 instrument's per-locale term.
    fn width(self) -> usize {
        match self {
            Self::U16(_) => 2,
            Self::U32(_) => 4,
        }
    }

    fn get(self, index: usize) -> Option<usize> {
        match self {
            Self::U16(o) => o.get(index).map(|&v| v as usize),
            Self::U32(o) => o.get(index).map(|&v| v as usize),
        }
    }
}

/// The value storage backing a catalog.
#[derive(Debug)]
pub(crate) enum Values {
    /// Compiled in behind a per-locale cargo feature. Costs no heap.
    Static {
        blob: &'static str,
        offsets: StaticOffsets,
        present: &'static [u8],
    },
    /// Parsed at runtime from host JSON. Interned against the **shared** path
    /// table, which is what keeps it to 84,388 heap bytes for `ja` rather than the
    /// 171,975 a naive re-materialised-keys form costs.
    Owned(OwnedValues),
}

/// One locale's catalog.
#[derive(Debug)]
pub struct Catalog {
    lang: LangTag,
    values: Values,
}

fn bit(bitmap: &[u8], i: usize) -> bool {
    bitmap.get(i >> 3).is_some_and(|b| b & (1 << (i & 7)) != 0)
}

fn set_bit(bitmap: &mut [u8], i: usize) {
    if let Some(b) = bitmap.get_mut(i >> 3) {
        *b |= 1 << (i & 7);
    }
}

impl Catalog {
    /// The compiled-in catalog for `lang`, if its cargo feature is enabled.
    pub fn embedded(lang: &str) -> Result<Self, CoreError> {
        let tag = LangTag::new(lang).ok_or_else(|| {
            CoreError::I18nCatalogUnavailable(format!("language tag too long: {lang}"))
        })?;
        let (blob, offsets, present) = crate::i18n_catalogs::embedded(lang).ok_or_else(|| {
            CoreError::I18nCatalogUnavailable(format!(
                "no compiled-in catalog for `{lang}` — enable the `i18n-{}` cargo \
                 feature, or supply it at runtime with Catalog::from_json",
                lang.to_ascii_lowercase()
            ))
        })?;
        Ok(Self {
            lang: tag,
            values: Values::Static {
                blob,
                offsets,
                present,
            },
        })
    }

    /// Parse a catalog from host-supplied JSON — the on-demand path (FR-015).
    ///
    /// The bytes are one locale's merged translation object, exactly what the
    /// generator emits per locale.
    pub fn from_json(lang: &str, bytes: &[u8]) -> Result<Self, CoreError> {
        let tag = LangTag::new(lang)
            .ok_or_else(|| CoreError::I18nCatalogParse(format!("language tag too long: {lang}")))?;
        let root: serde_json::Value = serde_json::from_slice(bytes)
            .map_err(|e| CoreError::I18nCatalogParse(format!("{lang}: {e}")))?;
        let obj = root
            .as_object()
            .ok_or_else(|| CoreError::I18nCatalogParse(format!("{lang}: root is not an object")))?;

        let bitmap_len = N_PATHS.div_ceil(8);
        let mut present = vec![0u8; bitmap_len];
        let mut branches = vec![0u8; bitmap_len];
        let mut extra: Vec<(String, String)> = Vec::new();
        let mut extra_branches: Vec<String> = Vec::new();
        // Pass 1 borrows values out of the parsed document, indexed by path id.
        // Pass 2 then appends them in PATH ORDER, which is what makes the dense
        // `offsets[id]..offsets[id + 1]` layout valid — traversal order is not path
        // order, so appending as we walk would interleave the blob and make every
        // range wrong.
        let mut slots: Vec<Option<&str>> = vec![None; N_PATHS];

        // Explicit stack rather than recursion: a host-supplied catalog is
        // untrusted input, and the crate must not be stack-overflowable by a
        // deeply nested document.
        let mut stack: Vec<(String, &serde_json::Value)> =
            obj.iter().map(|(k, v)| (k.clone(), v)).collect();
        stack.reverse();
        while let Some((path, value)) = stack.pop() {
            match value {
                serde_json::Value::Object(map) => {
                    match path_id(&path) {
                        Some(id) => set_bit(&mut branches, id),
                        None => extra_branches.push(path.clone()),
                    }
                    for (k, v) in map.iter().rev() {
                        stack.push((format!("{path}.{k}"), v));
                    }
                }
                serde_json::Value::String(s) => match path_id(&path) {
                    Some(id) => {
                        if let Some(slot) = slots.get_mut(id) {
                            *slot = Some(s.as_str());
                        }
                        set_bit(&mut present, id);
                    }
                    None => extra.push((path.clone(), s.clone())),
                },
                // The corpus is all strings; anything else is a malformed catalog
                // rather than something to coerce.
                other => {
                    return Err(CoreError::I18nCatalogParse(format!(
                        "{lang}: `{path}` is {}, expected a string",
                        match other {
                            serde_json::Value::Null => "null",
                            serde_json::Value::Bool(_) => "a boolean",
                            serde_json::Value::Number(_) => "a number",
                            serde_json::Value::Array(_) => "an array",
                            _ => "not a string",
                        }
                    )))
                }
            }
        }

        // Pass 2: emit in path order, so offsets are dense and monotonic exactly
        // as in the compiled-in layout.
        let mut blob = String::new();
        let mut offsets = vec![0u32; N_PATHS + 1];
        for id in 0..N_PATHS {
            if let Some(Some(v)) = slots.get(id) {
                blob.push_str(v);
            }
            // Even for an absent path the running length is recorded, which makes
            // `offsets[id]..offsets[id + 1]` an EMPTY range rather than a
            // neighbour's bounds — otherwise a missing key would return someone
            // else's translation.
            #[allow(clippy::cast_possible_truncation, clippy::allow_attributes)]
            if let Some(slot) = offsets.get_mut(id + 1) {
                *slot = blob.len() as u32;
            }
        }

        extra.sort_by(|a, b| a.0.cmp(&b.0));
        extra_branches.sort();

        Ok(Self {
            lang: tag,
            values: Values::Owned(OwnedValues {
                blob,
                offsets,
                present,
                branches,
                extra,
                extra_branches,
            }),
        })
    }

    #[must_use]
    pub fn lang(&self) -> &str {
        self.lang.as_str()
    }

    /// The CLDR categories this locale can produce.
    #[must_use]
    pub fn plural_categories(&self) -> &'static [Category] {
        plural_categories(self.lang.as_str())
    }

    /// Text direction for this locale.
    #[must_use]
    pub fn dir(&self) -> Dir {
        super::resolve::dir_of(self.lang.as_str())
    }

    /// Bytes attributable to this catalog — the SC-005 instrument.
    #[must_use]
    pub fn resident_bytes(&self) -> usize {
        match &self.values {
            Values::Static {
                blob,
                offsets,
                present,
            } => blob.len() + offsets.len() * offsets.width() + present.len(),
            Values::Owned(o) => {
                o.blob.len()
                    + o.offsets.len() * 4
                    + o.present.len()
                    + o.branches.len()
                    + o.extra
                        .iter()
                        .map(|(k, v)| k.len() + v.len())
                        .sum::<usize>()
                    + o.extra_branches.iter().map(String::len).sum::<usize>()
            }
        }
    }

    /// Look up one already-resolved dotted path.
    pub(crate) fn get(&self, path: &str) -> Lookup<'_> {
        match &self.values {
            Values::Static {
                blob,
                offsets,
                present,
            } => {
                let Some(id) = path_id(path) else {
                    return Lookup::Missing;
                };
                if is_branch(id) {
                    return Lookup::Branch;
                }
                if !bit(present, id) {
                    return Lookup::Missing;
                }
                match (offsets.get(id), offsets.get(id + 1)) {
                    (Some(s), Some(e)) => {
                        blob.get(s..e).map_or(Lookup::Missing, Lookup::Value)
                    }
                    _ => Lookup::Missing,
                }
            }
            Values::Owned(o) => {
                if let Some(id) = path_id(path) {
                    if bit(&o.branches, id) {
                        return Lookup::Branch;
                    }
                    if bit(&o.present, id) {
                        return match (o.offsets.get(id), o.offsets.get(id + 1)) {
                            (Some(&s), Some(&e)) => o
                                .blob
                                .get(s as usize..e as usize)
                                .map_or(Lookup::Missing, Lookup::Value),
                            _ => Lookup::Missing,
                        };
                    }
                    return Lookup::Missing;
                }
                // Paths the shared table never saw.
                if o.extra_branches
                    .binary_search_by(|p| p.as_str().cmp(path))
                    .is_ok()
                {
                    return Lookup::Branch;
                }
                match o.extra.binary_search_by(|(k, _)| k.as_str().cmp(path)) {
                    Ok(i) => o
                        .extra
                        .get(i)
                        .map_or(Lookup::Missing, |(_, v)| Lookup::Value(v)),
                    Err(_) => Lookup::Missing,
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A runtime catalog exercising all four shapes: a path the shared table knows,
    /// a branch the shared table knows, and a leaf/branch pair it has never seen.
    fn sample() -> Catalog {
        let json = br#"{
            "common": { "cancel": "ANNULLA" },
            "brandNew": { "nested": "FRESH" }
        }"#;
        match Catalog::from_json("it", json) {
            Ok(c) => c,
            Err(e) => unreachable!("fixture must parse: {e}"),
        }
    }

    #[test]
    fn runtime_catalog_resolves_known_paths() {
        assert_eq!(sample().get("common.cancel"), Lookup::Value("ANNULLA"));
    }

    /// The D2 gap plan.md's risk list requires closing in this phase: an `Owned`
    /// catalog must carry its OWN branch bitmap. Reusing the compiled-in
    /// `IS_BRANCH` would be wrong for a runtime locale whose object structure need
    /// not match the shipped corpus. No compiled-in vector can reach this path,
    /// which is exactly why it needs a test of its own.
    #[test]
    fn runtime_catalog_reports_its_own_branches() {
        let c = sample();
        // A branch the shared table also knows.
        assert_eq!(c.get("common"), Lookup::Branch);
        // A branch the shared table has NEVER seen — only an own bitmap can find it.
        assert_eq!(c.get("brandNew"), Lookup::Branch);
    }

    #[test]
    fn runtime_catalog_keeps_paths_outside_the_shared_table() {
        // Without the `extra` overflow list this key would be silently truncated
        // away, and the catalog would quietly serve fewer strings than it was given.
        assert_eq!(sample().get("brandNew.nested"), Lookup::Value("FRESH"));
    }

    #[test]
    fn absent_paths_do_not_inherit_a_neighbours_bytes() {
        // The offset array is dense, so a path this locale does not define must
        // produce an EMPTY range rather than the next value's bounds. Getting this
        // wrong returns someone else's translation, which no type can catch.
        assert_eq!(sample().get("common.error"), Lookup::Missing);
        assert_eq!(sample().get("home.totalBalance"), Lookup::Missing);
    }

    #[test]
    fn a_non_string_leaf_is_a_parse_error_not_a_coercion() {
        let err = Catalog::from_json("it", br#"{"common": {"cancel": 42}}"#);
        assert!(matches!(err, Err(CoreError::I18nCatalogParse(_))));
    }

    #[test]
    fn lang_tag_is_inline_and_round_trips() {
        assert_eq!(sample().lang(), "it");
    }
}
