// 23-design-language.js — T012: `01 Design Language` page. Sources: docs/DESIGN-LANGUAGE.md
// (normative), inv:01 §22 (resolved conflicts), inv:08 (a11y floor). US1-AS2.
if (!storage.lib) throw new Error('run 10-lib.js first');
const lib = storage.lib;
const PAGE = '01 Design Language';
let created = 0, updated = 0;

const para = (board, name, y, text, o) => {
  const s = Object.assign({ size: 12, weight: 400, color: '#1A1A18', x: 24, y }, o || {});
  const r = lib.upsertText(board, name, { ...s, text });
  if (r.created) created++;
  const t = r.text;
  if (t.growType !== 'auto-height' || Math.round(t.width) !== 752) {
    t.resize(752, 20);
    t.growType = 'auto-height';
  }
  return r;
};
const title = (board, name, y, text) => para(board, name, y, text, { size: 20, weight: 700 });
const sub = (board, name, y, text) => para(board, name, y, text, { size: 11, weight: 600, color: '#8C887E' });

// Board 1: the ten principles
{
  const { board: b, created: c } = await lib.upsertBoard(PAGE, 'D/design-language/principles', lib.docGeom(0, 0, 1140));
  if (c) created++;
  title(b, 'DL/title', 24, 'Vela Design Language — quiet, typographic, de-containered');
  sub(b, 'DL/sub', 58, 'NORMATIVE for every surface. Apple Wallet / Wise register. Reference screen: Home.');
  const P = [
    ['1. De-container', 'Content sits directly on color.bg.base — never boxed per element. Group with whitespace + SectionLabel + hairline Divider. The "card pile" (stacked white rounded panels) is the anti-pattern. Cards are reserved for: sheets (AppModal), deliberate warning/confirm gates, and a selected option — and stay light (hairline border, no heavy shadow).'],
    ['2. Open heroes', 'Balance, screen headers and section intros sit open on the page — no card. SectionLabel above, whitespace below.'],
    ['3. Hairline dividers', 'Between de-boxed rows: 1px color.border.base, inset past the leading icon (marginLeft = icon + gap) so it aligns under the text.'],
    ['4. Section labels', 'SectionLabel is the only section heading: text.sm, weight.semibold, color.fg.subtle, UPPERCASE, letterSpacing 0.6, marginTop space.2xl, marginBottom space.md. Never bold black headings.'],
    ['5. Subordinated symbols', 'In big amounts the number is the hero: currency symbol scales ~0.58, decimals/unit tail ~0.56 (AmountText), lineHeight 1.12, shrink floor 0.6 before compact notation.'],
    ['6. Light controls', 'Tabs = SegmentedToggle: transparent track (gap 2) + ONE floating active chip — bg.raised + 1px border.strong + shadow.sm + radius.full (WCAG fix; supersedes the older "soft sunken chip" wording). Filter pills = soft bg.sunken chips, radius.full, no borders. No chunky filled control boxes.'],
    ['7. Plain icon buttons', 'Header/settings/close icons carry NO background, border or shadow — just the icon with a ≥44×44 target (size or hitSlop 8).'],
    ['8. Restraint', 'Single accent #E8572A, reserved for money-moving CTAs and truly-primary actions. No decorative blobs/glows/gradients. Warm, light, low contrast with the page.'],
    ['9. Tokens only', 'Every value comes from the token sets (core / color-light / color-dark). No raw hex or px in implementations. Every surface must work in light AND dark.'],
    ['10. Entrances play once', 'Entrance animations are an iOS-only enhancement (fade 300ms / fadeUp 400ms, stagger 50ms, total ≤500ms). Android AND web render the settled state instantly. Never replay on re-render (has-entered gating). Press feedback is always spring scale (0.97 button / 0.98 row / 0.92 FAB) + light haptic — never opacity, never timing curves.'],
  ];
  let y = 92;
  for (const [h, body] of P) {
    para(b, 'DL/p/' + h.slice(0, 2).trim(), y, h, { size: 13, weight: 600 });
    para(b, 'DL/pb/' + h.slice(0, 2).trim(), y + 20, body, { size: 11, color: '#6E6B62' });
    y += 100;
  }
}

// Board 2: accessibility floor
{
  const { board: b, created: c } = await lib.upsertBoard(PAGE, 'D/design-language/a11y', lib.docGeom(0, 1, 460));
  if (c) created++;
  title(b, 'A11Y/title', 24, 'Accessibility floor (non-negotiable)');
  const L = [
    '• Every pressable: accessibilityRole="button" + translated label; selected controls expose accessibilityState.selected.',
    '• Touch targets ≥ 44×44 (size or hitSlop; default hitSlop 8).',
    '• Contrast: fg.muted ≥ 4.5:1 body text on bg.base; fg.subtle ≥ 3:1 for placeholders; white-on-error.base ≥ 4.5:1.',
    '• Web keyboard focus ring: 2px inner ring (bg color) + 4px accent outer ring, adapts to color scheme.',
    '• Modals trap focus and close on Escape (web).',
    '• All text must survive user text-scale 0.82×–1.35× (× 1.2 web boost; × OS scale on native) without breaking layout.',
    '• 15 shipped languages (en + 14): fixed-width labels must be verified against de/ru expansion; see 09 Patterns → i18n resilience.',
  ];
  let y = 64;
  for (let i = 0; i < L.length; i++) { para(b, 'A11Y/l' + i, y, L[i], { size: 11, color: '#6E6B62' }); y += 52; }
}

// Board 3: resolved conflicts vs legacy DESIGN_SYSTEM.md (inv:01 §22)
{
  const { board: b, created: c } = await lib.upsertBoard(PAGE, 'D/design-language/conflicts', lib.docGeom(1240, 0, 700));
  if (c) created++;
  title(b, 'CONF/title', 24, 'Resolved conflicts — this file overrides DESIGN_SYSTEM.md');
  sub(b, 'CONF/sub', 58, 'Where legacy guidance disagrees with shipped code + confirmed language, the value below is normative.');
  const ROWS = [
    'fg.muted / fg.subtle (light) = #6E6B62 / #8C887E (WCAG fix) — not #7A776E / #B0ADA5',
    'font.display = Plus Jakarta Sans 700 everywhere — not SF Rounded/System',
    'font.sans = Plus Jakarta Sans 400 — not "System" (theme.ts export named `inter` IS Plus Jakarta Sans)',
    'Text scale = 6 levels 0.82–1.35 (+ web ×1.2 boost) — not 0.85–1.28',
    'Bottom bar = WaveDock 86px + inset (system tab bar hidden) — not iOS 60 / Android 56',
    'Section-header letterSpacing = 0.6 (SectionLabel) — not 0.8–1.2',
    'error.base = #C62828 light / #F87171 dark — not #EF4444-era values',
    'Card-heavy guidance is OVERRIDDEN by de-containering (principle 1)',
    'Secondary button border = 1.5px border.strong — not 1px',
    'Text-scale default = standard on BOTH platforms (text-scale.ts header comment is stale)',
    'Bundled Inter TTFs in app.json are unused legacy — runtime loads Plus Jakarta from @expo-google-fonts',
    'SegmentedToggle active chip = raised + border.strong + shadow.sm (WCAG 1.4.1 fix) — not soft sunken borderless',
  ];
  let y = 92;
  for (let i = 0; i < ROWS.length; i++) { para(b, 'CONF/r' + String(i).padStart(2, '0'), y, '• ' + ROWS[i], { size: 11, color: '#6E6B62' }); y += 46; }
}

return lib.done('23-design-language', { created });
