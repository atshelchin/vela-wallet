# Delivery Report — 006 Web App Foundation + Onboarding Welcome

**Date**: 2026-08-01 · **Branch**: `codex/006-web-onboarding` · Satisfies SC-007

## What shipped

The SvelteKit rewrite's foundation inside `app-web/vela-wallet`, and its first
page. Four pieces:

1. **Token pipeline** — `scripts/gen-tokens.mjs` reads the Penpot DTCG export
   (`docs/design-tokens.json`) and emits committed, drift-gated
   `src/lib/tokens/tokens.css` (dark base + light via `prefers-color-scheme`,
   dormant `[data-theme]` hooks for a future in-app setting) and `tokens.ts`.
   Six documented web additions (control sizes 36/44/52, breakpoint 1280,
   `--color-onAccent`, `--opacity-hover`); everything else comes from the
   export verbatim.
2. **i18n via the real engine** — all Welcome copy resolves through the
   vela-core wasm engine (`rust/pkg-web`, the 005-proven artefact) at
   **build time**; 15 locale pages are prerendered; zero translation runtime
   in the client; the deployed Worker serves only a wasm-free
   Accept-Language 307 at `/`. New corpus keys `onboarding.welcomeWeb.*`
   (16 leaves × 15 locales) added at the source
   (`rust/crates/vela-core/i18n/locales/`) and regenerated via `gen:i18n`
   (path-count pin 1205 → 1230; resources leaf pin 16,833 → 17,073).
3. **Base components** — `Button` (primary/secondary), `FeatureCard`,
   `BrandMark` (mode-aware hull per design-system §Brand), `Carousel`
   (scroll-snap, JS-off safe, no autoplay), `PlaceholderPage`; pages hold
   composition only.
4. **Welcome page** — mobile `<1280px` (centered brand, single-card carousel +
   6-dot pager, bottom CTA stack) and desktop `≥1280px` (brand + tagline +
   2×3 grid left; raised action pane right). Brand mark + wordmark share one
   row on both layouts. The passkey-index link and its divider were REMOVED
   per founder direction (2026-08-01, superseding the earlier keep); the
   corpus string `onboarding.welcomeWeb.passkeyIndexLink` is retained for the
   future settings screen. Placeholder destinations: `create`, `import`.

File map: `app-web/vela-wallet/{scripts/gen-tokens.mjs, src/lib/{tokens,i18n,ui},
src/routes/{+server.ts, [locale]/**}, src/{app.html,app.css,hooks.server.ts},
e2e/*.e2e.ts}` + corpus edits under `rust/crates/vela-core/i18n/locales/` with
their `gen:i18n` artefacts (`paths.rs`, `i18n_catalogs/*.rs`,
`src/i18n/resources.ts`, `public/i18n/*.json`).

## SSR / SEO conclusion (the asked-for verdict)

**Server-rendered multilingual content: YES, shipped and proven.** Each of the
15 locales is a distinct prerendered URL (`/{locale}`) whose raw HTML — no JS —
contains the full localized first screen; e2e fetches all 15 and diffs the
strings against the corpus catalogs.

- **SEO impact**: positive. Per-locale URLs; 16-entry hreflang matrix
  (15 + `x-default → /en`); self-canonicals; correct `<html lang>`; localized
  `<title>`/`<meta description>`; content visible with JS disabled; `/` does a
  `307` + `Vary: Accept-Language` (standard pattern, crawlers still reach every
  locale directly).
- **Recommended approach (implemented)**: resolve translations at build time
  with the real vela-core wasm engine; prerender per locale; keep the runtime
  Worker wasm-free.
- **Limitations / adjustments**:
  - Cloudflare Workers cannot compile wasm from bytes, so a future page that
    needs **runtime** SSR translation must either bind the wasm as a wrangler
    module (documented escape hatch, research.md D1) or stay prerendered.
  - Corpus changes require a rebuild (aligned with the repo's "corpus is a
    build input" doctrine).
  - Language switching is URL navigation; no in-page switcher exists (none in
    the mocks). hreflang + negotiation cover discovery.
  - Paraglide was removed from the scaffold — it was a second, incompatible
    translation system.

## Token map (design-system.md handoff format)

```text
Mode: core + color-dark (base) / color-light (media/attribute override)
Surface: color.bg.base (page, left pane) / color.bg.raised (cards, action pane)
Text: fg.base (wordmark, card titles) / fg.muted (tagline, descriptions,
      secondary CTA) / fg.subtle (card numbers 01–06)
Layout: layout.screenPaddingX / space.2xl card padding / space.3xl section
        gaps / space.5xl desktop pane padding / radius.xl cards / radius.full CTAs
Action: color.accent.base + --color-onAccent (primary CTA only) /
        border.hairline + color.border.strong (secondary) / size-control-lg 52px
Effects: motion.duration.fast (hover/press) / motion.press.button /
         opacity.disabled / focus ring: color.fixed.focusRingInner+Outer
Missing tokens proposed (emitted as web additions): sizing.control.sm/md/lg,
breakpoint.desktop, color.onAccent, opacity.hover
```

## Verified (all automated unless noted)

- `pnpm check` 0 errors · `pnpm lint` clean · vitest **71/71** · Playwright
  e2e **38/38** · `pnpm build` prerenders 15 locales + crawled sub-pages.
- SSR: 15/15 raw-HTML locale checks against the corpus; 307 negotiation incl.
  `zh-CN→zh`, `zh-Hant-TW→zh-TW`, `zh-MO→zh-HK`, `pt-PT→pt-BR`, legacy
  `in→id`; unsupported→`/en`; unknown segment 404; JS-disabled content intact;
  `_worker.js` contains no `WASM_BASE64`.
- Layout: no horizontal overflow at 320/375/768/1279/1280/1440/1920; 1279
  mobile vs 1280 desktop structure; carousel pager; CTA navigation
  round-trips; brand mark + wordmark single-row check.
- Modes: computed body colors equal the token values in both schemes, both
  directions; WCAG AA contrast computed from token values for every used pair
  in both modes (thresholds per pair documented in `contrast.test.ts`).
- Tokens: committed output byte-equals regeneration; literal audit (hex/px/
  shadow/font) clean outside the token layer.
- Corpus: `gen:i18n` idempotent; `lint:i18n` no new defects; `verify:i18n`
  67,355 comparisons zero divergence; `cargo test -p vela-core --features
  i18n-all` 24/24; RN resources leaf pin updated and its jest suite green.
- Human: 4 screenshots (`e2e/__screenshots__/`) compared against
  W1/W1L/D1/D1L — structure, hierarchy, and color roles match.

## Deviations & open decisions

| Item | Status |
|---|---|
| Divider + passkey-index link | **Removed per founder 2026-08-01** ("删除 设置通行密钥索引服务", superseding the earlier keep); corpus key retained for the settings screen |
| Primary/secondary CTA = pill (`radius.full`) in both modes; D1L light mock shows a smaller-radius rect | Deviation for consistency; flag if the light mock is authoritative |
| `font.mono` = IBM Plex Mono (export) though design-system.md prose says JetBrains Mono | Export wins per the doc's own authority rule; doc prose should be corrected |
| CTA label white-on-orange ≈ 3.6:1 — **fails strict AA normal-text (4.5:1)**, and at 17px/600 it does not qualify for the large-text 3:1 relaxation | Same treatment as the RN app; options: darken accent for the CTA / enlarge+embolden label / accept — **founder decision pending** (contrast.test.ts holds a 3:1 regression floor meanwhile) |
| `SITE_ORIGIN = https://app.getvela.app` (hreflang/canonical absolute URLs) | **PROVISIONAL** — production domain is a founder decision; one constant in `src/lib/site.ts` |
| 13 non-en/zh locale translations of `welcomeWeb.*` are best-effort | Needs the standing human-review sweep (same as project i18n history) |
| Non-canonical-case locale URLs (`/ZH`) 404 rather than redirect | Prerender-only routes have no runtime matcher; acceptable, documented |
| Root `npm run typecheck` + `web-react-binding.test.ts` fail on **HEAD** too (missing `@types/react-dom` in current node_modules) | Pre-existing, unrelated to this feature; left untouched |
| `[locale]/+layout.svelte` omitted (planned in T014) | Root layout suffices; a locale layout adds a file with no behavior today |
| Noto Sans SC serves as the sole CJK webfont, so ja/zh-TW/zh-HK render SC-variant glyphs | Follows design-system.md ("no other CJK display font"); per-locale Noto JP/TC would need a design-system amendment — founder decision |

## Adversarial review round (post-delivery, 2026-08-01)

A 17-agent review workflow (3 dimensions, refute-style verification) confirmed
11 findings; all actionable ones are FIXED in the follow-up commit:

- `/` redirect now preserves the query string (utm/ref attribution) + e2e.
- The wasm-free-Worker guard now greps the `wrangler deploy --dry-run` bundle
  (the artifact that actually ships) instead of the 4KB adapter shim.
- Carousel dots: 24px hit targets (content-box + hit-slop padding, WCAG 2.5.8)
  and inactive dots moved to `fg.subtle` (≥3:1 non-text contrast, gated).
- Focus ring uses a transparent outline so forced-colors/High-Contrast mode
  repaints it (was invisible there).
- Corpus terminology: de "Verträge"→"Contracts" (app-wide term), tr product
  names kept untranslated per locale convention, zh-HK "單字"→"英文字".
- CTA-contrast claim corrected from "passes AA large-text" to a documented
  sub-AA exception (see deviations).

Refuted (no change): vi product-name wording (faithful to deliberately
different source copy), `reuseExistingServer` risk (suite not in CI), duplicate
`--font-mono` emission (cascade-harmless, intended value wins).
