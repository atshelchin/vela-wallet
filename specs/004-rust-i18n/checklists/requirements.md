# Specification Quality Checklist: i18n / L10n in the shared Rust core

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-31
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *see note 1*
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders — *see note 2*
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain — *zero, verified by grep across the
      whole feature directory*
- [x] Requirements are testable and unambiguous — *findings 1 and 2 raised and fixed*
- [x] Success criteria are measurable — *every SC names a number or a command; two
      of them were measured during this review and came out false, which is
      finding 3 and finding 4, not a measurability defect*
- [x] Success criteria are technology-agnostic (no implementation details) — *see
      note 1*
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified — *see note 3*
- [x] Scope is clearly bounded — *FR-018 (content defects out), FR-028 (no RN
      migration), and the Assumptions block on what "i18next functionality" means*
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria — *finding 5 raised and fixed: SC-011 now owns FR-022 and FR-023*
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria — *findings 3 and 4 raised and fixed*
- [x] No implementation details leak into specification

## Notes

- **Note 1**: Rust, the target crate (`rust/crates/vela-core`), the four consuming
  platforms and the uniffi/wasm-bindgen binding routes are explicit constraints
  from the requester, not planning choices; they sit under Assumptions as a
  technology mandate, exactly as in feature 003. The functional requirements
  themselves stay behaviour-level (byte-identical output, typed errors,
  cross-platform parity, defined residency, bounded memory). The one residual
  mechanism mention is FR-014's "behind a cargo feature", which names a delivery
  mechanism rather than a behaviour; the behavioural half of that requirement —
  per-locale artefacts a platform can link or fetch individually — stands on its
  own if the wording is loosened. SC-002's platform names and SC-004/SC-007's "on a
  development machine" follow the precedent set by 003's SC-002 and SC-004.
- **Note 2**: This is developer-facing infrastructure for a solo technical founder.
  The user-visible stake is stated in plain language in "Why": a wallet's
  translated strings are the surface a user reads before authorising an
  irreversible transfer, so "Send" versus "Sign" and `21 получателей` versus
  `21 получатель` are correctness, not polish.
- **Note 3**: The edge cases are measured, not speculative. Every bullet traces to a
  Phase 0 experiment in [research.md](../research.md): the absent
  `Intl.PluralRules` and the two plural modes to D1 and D4 (75 of 825 plural cases
  differ between the modes); the branch-node diagnostic string, the `t([])` throw
  and the `count: 5n` throw to D4's oracle-anomaly register; the corpus's
  load-bearing whitespace and 120 escaped newlines to D6's tokenizer sweep; the
  reproduce-don't-fix list to D5's defect table A1–A6. Spot-checked independently
  during this review: `src/screens/wallet/ConfirmStep.tsx:247` does pass
  `{ count, n }` together; `operationLabelKey` at
  `src/components/ui/TransactionDetailSheet.tsx:52` does return dApp-supplied
  `tx.intent` straight into `t()` as a key; the diagnostic string is built at
  `node_modules/i18next/dist/esm/i18next.js:618` and the non-CLDR `_zero` candidate
  at `:602`; the installed package really is `i18next@26.3.1`; the corpus really is
  240 files / 990,499 bytes, with `ja` at 75,608 and `en` at 59,737 (SC-005's
  135,345 budget is their exact sum); `MAX_WASM_BYTES = 1_000_000` really is at
  `rust/scripts/build-web.mjs:42`.
- **Note 4 — decisions taken during specification, still overridable**: four
  material choices were made by the requester while the spec was being written, and
  each is recorded under Assumptions rather than buried in a requirement, so the
  review gate can reverse any of them. (a) **MODE A over MODE B** — the conformance
  target is `i18next` running with a complete `Intl.PluralRules`, so the degraded
  Hermes behaviour is treated as a defect being closed, not a contract; FR-007 keeps
  MODE B reproducible so the delta stays enumerable rather than assumed. (b) **The
  corpus moves into the crate** and every downstream artefact is generated from it,
  which inverts this repository's existing codegen direction (plan.md says so
  explicitly). (c) **On-demand loading is mandatory** (FR-012), not an optimisation
  — it is what forces the API shape and rules out a construct-with-everything
  engine. (d) **No React Native runtime migration** (FR-028), mirroring how 003
  landed. Reversing (a) would rewrite FR-005, SC-001 and SC-003; reversing (b) would
  rewrite FR-010 and US3; reversing (c) would rewrite FR-012–FR-016 and US4;
  reversing (d) would widen the feature substantially.
- **Note 5 — SC-001's count changed during specification**: it was written against
  16,817 (the sum of per-locale leaf counts) and is now the full **1,141 × 15 =
  17,115** cross-product. The change was forced by the oracle, not chosen for
  roundness: the 298-case difference is exactly the set of (locale, key) pairs where
  the key is absent from that locale, which is precisely the set that exercises
  `fallbackLng: 'en'`. Restricting to 16,817 would have left the fallback branch —
  the branch that produces the English leaks in D5 A1 and A2 — with no exhaustive
  coverage at all, and it costs nothing in file size because those cases resolve to
  an `en` string already present in the suite. 16,817 survives in the spec's "Why"
  and in research.md's pin table as the *corpus* leaf count, which is still correct;
  only the *suite* count moved.

### Findings — raised by this review, and how each was resolved

All five were fixed in `spec.md` before the plan was accepted. They are kept here in
full, because the corrected numbers are only trustworthy alongside the wrong ones they
replaced.

- **Finding 1 (contradiction, FR-021 vs FR-028)**: FR-021 requires the core to
  provide relative time, date headers and weekday names, "removing the last
  host-`Intl` call at `src/services/activity.ts:121` and the hardcoded English
  `AM`/`PM` in `formatTime`", and US5's acceptance scenario 3 repeats the claim.
  Both cited sites are React Native application sources — `activity.ts:121` is the
  `d.toLocaleDateString(i18n.language, { weekday: 'short' })` inside
  `relativeTime`, and the `AM`/`PM` literal is `src/services/locale-format.ts:269`.
  FR-028 permits the app exactly one change in this feature, consuming the
  generated resources. As written the two requirements cannot both be satisfied.
  plan.md resolves it silently in FR-028's favour (Phase 6's gate is
  "`locale-format.ts` parity + CLDR currency matrix", with no app-side edit), but
  the spec should say so: "enabling the removal of" rather than "removing", or an
  explicit carve-out in FR-028.
- **Finding 2 (undecided behaviour presented as a requirement, FR-016)**: FR-016
  says resolution against a non-resident locale "MUST have defined behaviour —
  documented, tested, and never a panic or a partial read", but never says what the
  behaviour is. The matching edge case offers two mutually exclusive options ("fall
  back to `en`, or a typed 'catalog not loaded' error") and research.md does not
  settle it — D2 stops at storage layout and D3 at placement. This is a
  clarification marker that has not been tagged as one: no test can be written from
  FR-016 without a further decision, and the two options have different
  user-visible results (a stale English string versus a caught error) at exactly
  the moment FR-012 makes reachable, a mid-flight language switch.
- **Finding 3 (SC-003's exception set does not survive measurement)**: SC-003 claims
  zero rendering changes "except for the 10 Russian plural keys covered by SC-004".
  Driving the installed `i18next@26.3.1` over the shipped corpus for the five plural
  base keys (`contacts.sends`, `contacts.groupMembers`, `send.recipientCount`,
  `send.batchRejected`, `send.batchApply`) × counts `{0,1,2,5,21,101,1e6}` × seven
  locales — 245 pairs — MODE A and MODE B differ in **38** of them: ru 14, fr 8,
  pt-BR 8, it 4, es-MX 4. So **24 of the 38 are not Russian**, and **16 of those 24
  are regressions**: MODE A returns the English fallback (`1000000 sends`,
  `Import 1000000 recipients`) where native today renders correct localised text
  (`1000000 envois`, `Importa 1000000 destinatari`), because those locales have
  `_one`/`_other` but no `_many` (D5 A2) and MODE A's `many` category misses into
  `en`. research.md already records both halves of this — D4's "75 of 825" and D5's
  A2 — but SC-003 reconciles with neither, and the risk list in plan.md mentions
  only the Russian change. Relatedly, US2's acceptance scenario 3 says the engine
  "reproduces today's rendered output exactly" for the A2/A3 gaps; for A2 that is
  true of today's *web and Jest* output and false of today's *native* output, and
  the scenario does not say which it means. Either SC-003's exception clause must
  enumerate the non-Russian MODE B deltas, or it must state that its baseline is
  MODE A (web/Jest) and a separate criterion must own the native delta.
- **Finding 4 (FR-020 and SC-010's currency counts are wrong)**: the headline "21 of
  the 137 catalog currencies" is right — `src/services/currency-catalog.ts` holds
  exactly **137** entries — but the breakdown under it is not. (a) **Seven**, not
  six, of those 137 are CLDR 3-decimal: the spec's `KWD/BHD/OMR/JOD/TND/LYD` omits
  **IQD**, which is in the catalog. (b) The CLDR zero-decimal codes present in the
  catalog number **14**, not 15 — BIF, CLP, GNF, ISK, JPY, KRW, PYG, RWF, UGX, VND,
  VUV, XAF, XOF, XPF; DJF, KMF and UYI are absent (DJF and KMF are nonetheless
  listed in the app's `ZERO_DECIMAL_CODES` at `src/services/currency.ts:91-93`).
  7 + 14 = 21, so the total holds and only the split is wrong. (c) That same app set
  also treats **IDR** and **HUF** as zero-decimal, which CLDR does not — both are
  2-digit — so implementing FR-020 literally changes their rendering too, a change
  neither SC-003 nor SC-010 enumerates. (d) Measured against node's full ICU 78.2,
  **`es-MX` places the currency symbol before the amount** (`$1,234.50` for MXN,
  `EUR 1,234.50` for EUR), where `es-ES` places it after (`1234,50 €`). The
  symbol-after set among the 15 shipped locales is therefore **five** — de, fr, it,
  ru, vi — not six, so SC-010's "6 wrong-placement cases" and FR-020's list both
  need correcting, unless the spec means to deliberately map `es-MX` onto `es`, in
  which case it must say so. None of these is fatal to the feature; all of them are
  numbers an implementer would otherwise copy straight into a table.
- **Finding 5 (requirements with no acceptance criteria)**: FR-023 (expose a
  locale's text direction) has neither an acceptance scenario nor a success
  criterion — it is stated once and never exercised. FR-016 has an edge-case bullet
  but no acceptance scenario. FR-022 has US5 scenario 4 but no success criterion;
  SC-010 covers only `locale-format.ts` parity and the currency matrix, so the
  bidi-isolation requirement lands in no measurable outcome. Given no RTL language
  ships today (the spec says so, and calls FR-022/FR-023 forward investment), the
  cheapest honest fix is to fold them into SC-010 as a small enumerated matrix
  rather than to leave them unmeasured.

### Resolutions applied to spec.md

| Finding | Resolution |
|---|---|
| 1 — FR-021 vs FR-028 | FR-021 and US5 scenario 3 now say the app-side `Intl` call and the `AM`/`PM` literal *can* be retired, and that retiring them is follow-up under FR-028. No contradiction remains. |
| 2 — FR-016 undefined | FR-016 now specifies **fall through to the pinned `en` catalog**, never a panic, block or partial read, and requires the engine to expose residency so a host can tell "fell back" from "translated". |
| 3 — SC-003 unmeasurable | SC-003 now names its baseline explicitly (MODE A = zero change) and bounds the MODE B delta with a re-measured figure: **42 of 675** resolutions, ru 18 / pt-BR 8 / fr 8 / es-MX 4 / it 4. The 16 regressions are eliminated, not accepted — see finding 3a. |
| 3a — the regressions | New **FR-017** pulls D5 anomaly A2 into scope: the 16 missing CLDR `many` entries are added, because MODE A would otherwise turn 16 correct localised strings into English. Renumbered FR-018…FR-028 follow. |
| 4 — currency counts | Partly upheld, partly overturned by re-measurement. **6 three-decimal is correct** — IQD is 0-decimal under ICU 78.2, not 3, so the review's "seven" was wrong. **21 of 137 is correct** (6 three-decimal + 15 that CLDR gives 0 and the app renders with 2). **Symbol placement was wrong**: es-MX is symbol-*first*; the symbol-after set is five (vi, ru, fr, it, de) and pt-BR is symbol-first-with-NBSP, so **7 of 15** locales differ from today's no-space concatenation. FR-020 and SC-010 now carry the corrected breakdown. |
| 5 — unmeasured FRs | New **SC-011** owns FR-022 and FR-023: direction for all 15 shipped locales plus an RTL tag, and isolation that is byte-identical when disabled so FR-005 parity is unaffected. |

Finding 4's IDR/HUF observation stands and is genuinely useful: the app's
`ZERO_DECIMAL_CODES` treats both as zero-decimal where CLDR gives them 2, so
implementing FR-020 literally changes their rendering. That is a deliberate
correction rather than a regression, and the currency matrix in SC-010 will surface it
as a reviewed diff.

Two cross-document conflicts surfaced by the contract authors were also settled here:
the malformed-catalog error is **`I18nCatalogParse`** (matching `AbiParse` /
`Eip712Parse`), and **every** `CoreError` variant carries a `String`, so
`I18nEmptyKeyList(String)` does not become the enum's first payload-free variant.
Ordinal rules **are** ported (research.md D8, overturning D1), and per-locale JSON
assets are served from `public/i18n/<lng>.json` (research.md D9).

### Residual judgement calls, named

- **"Ten Russian keys"** was imprecise and has been corrected. `ru.json` plus
  `ru/*.json` carry five `_few` and five `_many` entries across **five** base keys —
  `contacts.sends`, `contacts.groupMembers`, `send.recipientCount`,
  `send.batchRejected`, `send.batchApply`. Ten counts catalog *entries*, which reads as
  ten call sites and is misleading. The "Why" section and SC-004 now count
  *resolutions* instead — 18 of the 675 measured — because a before/after string is a
  property of a (base key, count) pair, not of a suffixed entry.
- **FR-025's "recognisably close"** is inherently a judgement call, but it names the
  seven exported items, which makes it checkable in review even though it is not
  mechanically testable.
- **FR-005's byte-parity versus FR-022's bidi isolation** is resolved by defaulting
  isolation off. That is the right call for provability, but it means the feature
  ships a safety facility that nothing turns on; whether any call site opts in is
  deferred, and no requirement obliges one to.
- Zero [NEEDS CLARIFICATION] markers remain anywhere under `specs/004-rust-i18n/`.
  The genuine open questions that were *not* silently resolved — which platform
  adopts the engine first, and the `$t()` nesting sink reachable from dApp-supplied
  text — are recorded as open questions in research.md rather than smuggled into a
  requirement, and the second of them should be filed as a security finding
  independent of this feature.
