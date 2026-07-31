# Quickstart — 005 Web adoption of the Rust i18n engine

## What this feature is

Two property assignments. On web, `i18n.t` and `i18n.exists` are replaced with Rust-backed
functions, and the originals are kept as a live oracle. Nothing else about the app's i18n
changes, and **no translation call site is edited**.

Native is untouched — `src/i18n/index.ts` still initialises plain i18next.

## What it is *not*

It does not fix a user-visible bug. The plural defect 004 exists to fix is native-only
(Hermes ships `Intl` without `PluralRules`); web already renders those strings correctly.
Web is a **proving ground** — the only surface that can run the engine today, used to
generate the evidence that licenses the native rollout.

---

## Verify the engine defects this feature fixes

Both reproduce against the shipped artefact before Phase 0 lands:

```bash
# 1. A rejected option permanently poisons the engine
node -e '
const {readFileSync} = require("fs");
(async () => {
  const {initSync, ...w} = await import("./rust/pkg-web/vela_core.js");
  const {WASM_BASE64} = await import("./rust/pkg-web/vela_core_bg.base64.js");
  initSync({module: Buffer.from(WASM_BASE64, "base64")});
  const b = (l) => new Uint8Array(readFileSync(`public/i18n/${l}.json`));
  const e = new w.I18n(b("en"));
  e.loadCatalog("ja", b("ja")); e.changeLanguage("ja");
  try { e.t("common.cancel", {ordinal: undefined}); } catch {}
  try { e.changeLanguage("ja"); console.log("healthy"); }
  catch (err) { console.log("POISONED:", err.message); }
})()'
```

Expected before the fix: `POISONED: recursive use of an object detected...`

```bash
# 2. Non-finite interpolation variables diverge
#    i18next renders "NaN分前"; the engine renders "分前"
```

---

## Run the verification

```bash
npx jest src/__tests__/i18n          # differential replay + contract tests (~3 s added)
npx tsc --noEmit                     # the seam must typecheck under strict
npm run verify:i18n                  # the 004 offline parity script, unchanged
```

The differential test imports the web module **by explicit path**:

```ts
import * as web from '@/i18n/index.web';   // resolves — moduleFileExtensions appends .ts
import * as native from '@/i18n';          // resolves index.ts, NOT index.web.ts
```

A bare `@/i18n` gives you the native module. This is the single most likely way to write a
test that proves nothing.

---

## The one rule for writing tests here

**Compare `rust` against `oracle`. Never assert on the seam's return value.**

Under FR-016 the seam returns the oracle's result whenever the engines disagree — that is
what keeps the product safe while the engine is on trial. It also means:

```ts
expect(i18n.t('common.cancel')).toBe(oracle.t('common.cancel'));   // ALWAYS passes. Useless.
expect(report.divergences).toHaveLength(0);                        // the real assertion
```

The first form passes no matter how wrong the engine is.

Two more traps worth knowing before you write a test:

- **Make each locale resident before comparing it.** The engine holds one non-`en` slot, so a
  loop over 15 locales that never calls `loadCatalog` silently compares 14 of them against
  English and reports a clean run.
- **`delete inst.getFixedT` proves nothing** — own properties shadow the prototype, so the
  instance keeps working. Negative tests must be built some other way.

---

## Using the harness during development

```ts
setHarnessMode('every');     // compare on every call
harnessReport();             // { compared, divergences }
```

Default in dev is `first-seen`: an input is cached only *after* the engines agreed, so a
divergent input keeps being compared. Tests must set the mode explicitly — `jest.setup.js`
sets `__DEV__`, so inheriting the default means asserting under a mode you did not pick.

When a divergence is found, the harness prints a paste-ready `add(...)` line for
`scripts/dump-vectors/i18n.dump.mjs`. Do **not** hand-add a case to the committed vectors:
CI regenerates them and diffs, so a pasted case is deleted on the next run.

---

## Rolling back

Delete the two property assignments. `resources` stays bundled for the whole proving period
(FR-018), so plain i18next is always one flag away — that is deliberate, and it is why the
oracle exists at all.
