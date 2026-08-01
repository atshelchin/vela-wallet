# Contract: Base UI Components

All components: visual values only via `var(--…)` tokens; focus visible using
`--color-fixed-focusRingInner/Outer`; hover/active per motion tokens
(`--motion-duration-fast`, press scale `--motion-press-button`).

## `Button.svelte`

```ts
props: {
  variant: 'primary' | 'secondary';
  href?: string;          // renders <a>; else <button>
  disabled?: boolean;
  onclick?: () => void;
  children: Snippet;      // label
}
```
- Height `--size-control-lg` (52px); min touch target 44px; padding-inline `--space-3xl`.
- Radius `--radius-full` (pill) in both modes — documented deviation from D1L's rounded-rect mock.
- Primary: bg `--color-accent-base`, label `--color-fg-inverse` (dark mode note:
  label uses light-mode's inverse i.e. white — implemented as `--color-fixed-*`?
  No: white-on-orange in both modes, so label color is `#FFFFFF` via
  `color.fg.inverse` from **light** set; the generator's fixed table exposes it
  as `--color-on-accent` web addition if inverse flips per mode — resolved in
  implementation, recorded in the token map).
- Secondary: transparent bg, `--border-hairline` solid `--color-border-strong`,
  label `--color-fg-muted` (per mocks) — contrast-checked.
- Disabled: `--opacity-disabled`, no pointer events.
- Accent discipline: `variant='primary'` is the only accent surface on the page.

## `FeatureCard.svelte`

```ts
props: { number: string;   // '01'…'06'
         title: string; description: string }
```
- Surface `--color-bg-raised`, radius `--radius-xl`, padding `--space-2xl`,
  number in `--color-fg-subtle` + `--text-base`/`--weight-medium`, title
  `--text-xl`/`--weight-semibold` `--color-fg-base`, description `--text-lg`
  `--color-fg-muted`, `--leading-relaxed`. No shadow (mocks show flat cards;
  borders/bg define structure).

## `BrandMark.svelte`

```ts
props: { size?: number /* px, default 48 */ }
```
- Inline SVG, in-app mark rules: hull auto-switches Warm Graphite `#554B46`
  (light) / Dusk Ivory `#DED5CE` (dark) via CSS var defined in the SVG's own
  scoped style (asset colors, exempt from the literal audit by whitelist);
  orange main sail + peach secondary sail preserved; never boxed on an
  app-icon background.

## `Carousel.svelte`

```ts
props: { items: T[]; children: Snippet<[T, number]> }  // slide renderer
```
- Horizontal scroll-snap track (`scroll-snap-type: x mandatory`), one slide per
  viewport; slides are real DOM content (crawlable, JS-off accessible).
- Dot pager: `items.length` dots, active dot `--color-accent-base` +
  pill-widened (per W1 mock), inactive `--color-border-strong`; driven by
  IntersectionObserver; dots are buttons that `scrollIntoView` their slide.
- No autoplay. Overscroll contained (`overscroll-behavior-x: contain`) so page
  never pans horizontally.
- ARIA: `role="group"` slides with `aria-roledescription="slide"`,
  `aria-label` "n of 6"; pager `aria-controls`.

## Welcome page composition (routes/[locale]/+page.svelte)

- `< 1280px`: column — BrandMark+wordmark centered, tagline, Carousel(6 ×
  FeatureCard), pager, CTA stack (primary, secondary). Brand mark and wordmark share one row (founder, 2026-08-01).
- `≥ 1280px`: two panes — left `--color-bg-base` (brand row, tagline, 3×2 grid
  of FeatureCard at `--space-2xl` gap); right pane `--color-bg-raised` (the
  mocks' right pane is the raised surface: white in D1L, `#1E1E1B`-ish in D1),
  hairline `--color-border-base` divider, vertically centered action stack
  (primary, secondary, max-width constrained; the divider + passkey-index link were removed per founder direction, 2026-08-01).
- Wordmark: styled text (`--font-ui`, `--weight-bold`), not an image, so it
  localizes/scales; mocks show "Vela Wallet" latin in all locales.
