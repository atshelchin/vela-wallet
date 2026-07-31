#!/usr/bin/env node
// export-tokens-dtcg.mjs — emit docs/design-tokens.json (RESTRUCTURE-2026-07-30 §5, W3a).
//
// Why a repo file at all: a Penpot file is not consumable by a build, a linter or a coding agent
// that has no MCP access. The token layer is the one part of the design system that IS pure data,
// so it ships as data — Tokens-Studio/DTCG dialect ($type/$value, set-per-top-level-key), the same
// shape Penpot itself imports and exports, so it round-trips.
//
// The FLAT list below is transcribed from the live Penpot token sets (2026-07-30). Transcription is
// verified, not trusted: `26-tokens-dtcg-check.js` diffs this file against the live sets in both
// directions and fails on any drift. Run it after every token change.
//
// IMPORTANT: values are Penpot `token.value`, never `resolvedValue` — resolution runs against the
// ACTIVE sets, so an inactive set (color-dark) resolves to the other mode's colours. Reading
// resolvedValue here would have silently exported light values as dark ones.
//
// Usage: node specs/002-penpot-design-source/generator/export-tokens-dtcg.mjs
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');

// [set, name, penpotType, value]
const T = [
  ['core', 'space.0', 'spacing', '0'],
  ['core', 'space.xs', 'spacing', '2'],
  ['core', 'space.sm', 'spacing', '4'],
  ['core', 'space.md', 'spacing', '8'],
  ['core', 'space.lg', 'spacing', '12'],
  ['core', 'space.xl', 'spacing', '16'],
  ['core', 'space.2xl', 'spacing', '20'],
  ['core', 'space.3xl', 'spacing', '24'],
  ['core', 'space.4xl', 'spacing', '32'],
  ['core', 'space.5xl', 'spacing', '48'],
  ['core', 'layout.screenPaddingX', 'spacing', '24'],
  ['core', 'radius.none', 'borderRadius', '0'],
  ['core', 'radius.sm', 'borderRadius', '4'],
  ['core', 'radius.md', 'borderRadius', '8'],
  ['core', 'radius.lg', 'borderRadius', '12'],
  ['core', 'radius.xl', 'borderRadius', '16'],
  ['core', 'radius.2xl', 'borderRadius', '20'],
  ['core', 'radius.full', 'borderRadius', '9999'],
  ['core', 'border.hairline', 'borderWidth', '1'],
  ['core', 'border.emphasis', 'borderWidth', '1.5'],
  ['core', 'text.xs', 'fontSizes', '10'],
  ['core', 'text.sm', 'fontSizes', '11'],
  ['core', 'text.base', 'fontSizes', '13'],
  ['core', 'text.lg', 'fontSizes', '15'],
  ['core', 'text.xl', 'fontSizes', '17'],
  ['core', 'text.2xl', 'fontSizes', '20'],
  ['core', 'text.3xl', 'fontSizes', '26'],
  ['core', 'text.4xl', 'fontSizes', '32'],
  ['core', 'text.5xl', 'fontSizes', '40'],
  ['core', 'weight.regular', 'fontWeights', '400'],
  ['core', 'weight.medium', 'fontWeights', '500'],
  ['core', 'weight.semibold', 'fontWeights', '600'],
  ['core', 'weight.bold', 'fontWeights', '700'],
  ['core', 'font.sans', 'fontFamilies', ['Plus Jakarta Sans']],
  ['core', 'font.display', 'fontFamilies', ['Plus Jakarta Sans']],
  ['core', 'font.numeric', 'fontFamilies', ['Plus Jakarta Sans']],
  ['core', 'font.mono', 'fontFamilies', ['IBM Plex Mono']],
  ['core', 'letterSpacing.sectionLabel', 'letterSpacing', '0.6'],
  ['core', 'opacity.disabled', 'opacity', '0.45'],
  ['core', 'opacity.dim', 'opacity', '0.4'],
  ['core', 'opacity.backdrop', 'opacity', '0.35'],
  ['core', 'leading.none', 'number', '1'],
  ['core', 'leading.tight', 'number', '1.2'],
  ['core', 'leading.normal', 'number', '1.4'],
  ['core', 'leading.relaxed', 'number', '1.6'],
  ['core', 'leading.amountHero', 'number', '1.12'],
  ['core', 'motion.duration.fast', 'number', '150'],
  ['core', 'motion.duration.normal', 'number', '250'],
  ['core', 'motion.duration.slow', 'number', '400'],
  ['core', 'motion.sheet.in', 'number', '220'],
  ['core', 'motion.sheet.out', 'number', '180'],
  ['core', 'motion.sheet.drag', 'number', '200'],
  ['core', 'motion.press.button', 'number', '0.97'],
  ['core', 'motion.press.row', 'number', '0.98'],
  ['core', 'motion.press.fab', 'number', '0.92'],
  ['core', 'motion.spring.damping', 'number', '15'],
  ['core', 'motion.spring.stiffness', 'number', '150'],
  ['core', 'motion.spring.mass', 'number', '0.8'],
  ['core', 'motion.springGentle.damping', 'number', '20'],
  ['core', 'motion.springGentle.stiffness', 'number', '120'],
  ['core', 'motion.springGentle.mass', 'number', '1'],
  ['core', 'motion.entrance.fade', 'number', '300'],
  ['core', 'motion.entrance.fadeUp', 'number', '400'],
  ['core', 'motion.entrance.stagger', 'number', '50'],
  ['core', 'textScale.min', 'number', '0.82'],
  ['core', 'textScale.max', 'number', '1.35'],
  ['core', 'textScale.webBoost', 'number', '1.2'],
  ['core', 'amount.tailScale', 'number', '0.56'],
  ['core', 'amount.symbolScale', 'number', '0.58'],
  ['core', 'amount.minScale', 'number', '0.6'],
  ['core', 'icon.stroke.light', 'number', '1.5'],
  ['core', 'icon.stroke.base', 'number', '2'],
  ['core', 'icon.stroke.bold', 'number', '2.2'],
  ['core', 'icon.stroke.heavy', 'number', '3'],
  ['core', 'icon.xs', 'sizing', '12'],
  ['core', 'icon.sm', 'sizing', '14'],
  ['core', 'icon.base', 'sizing', '16'],
  ['core', 'icon.md', 'sizing', '18'],
  ['core', 'icon.lg', 'sizing', '20'],
  ['core', 'icon.xl', 'sizing', '26'],
  ['core', 'icon.2xl', 'sizing', '30'],
  ['core', 'icon.3xl', 'sizing', '36'],
  ['core', 'size.hitTarget', 'sizing', '44'],
  ['core', 'size.hitSlop', 'sizing', '8'],
  ['core', 'size.emptyStateCircle', 'sizing', '56'],
  ['core', 'layout.maxContentWidth', 'sizing', '800'],
  ['core', 'layout.dockBarHeight', 'sizing', '86'],
  ['core', 'layout.scanFabSize', 'sizing', '56'],
  ['core', 'layout.frameW', 'sizing', '390'],
  ['core', 'layout.frameH', 'sizing', '844'],
  ['core', 'shadow.sm', 'shadow', '0 1 3 0 rgba(26,26,24,0.04)'],
  ['core', 'shadow.md', 'shadow', '0 2 8 0 rgba(26,26,24,0.06)'],
  ['core', 'shadow.lg', 'shadow', '0 4 16 0 rgba(26,26,24,0.08)'],

  ['color-light', 'color.fg.base', 'color', '#1A1A18'],
  ['color-light', 'color.fg.muted', 'color', '#6E6B62'],
  ['color-light', 'color.fg.subtle', 'color', '#8C887E'],
  ['color-light', 'color.fg.inverse', 'color', '#FFFFFF'],
  ['color-light', 'color.bg.base', 'color', '#FAFAF8'],
  ['color-light', 'color.bg.raised', 'color', '#FFFFFF'],
  ['color-light', 'color.bg.sunken', 'color', '#F5F3EF'],
  ['color-light', 'color.accent.base', 'color', '#E8572A'],
  ['color-light', 'color.accent.soft', 'color', '#FFF0EB'],
  ['color-light', 'color.success.base', 'color', '#2D8E5F'],
  ['color-light', 'color.success.soft', 'color', '#EDFAF2'],
  ['color-light', 'color.warning.base', 'color', '#92600A'],
  ['color-light', 'color.warning.soft', 'color', '#FFF8F0'],
  ['color-light', 'color.warning.border', 'color', '#F0DCC8'],
  ['color-light', 'color.error.base', 'color', '#C62828'],
  ['color-light', 'color.error.soft', 'color', '#FEF2F2'],
  ['color-light', 'color.info.base', 'color', '#4267F4'],
  ['color-light', 'color.info.soft', 'color', '#EDF0FF'],
  ['color-light', 'color.border.base', 'color', '#ECEBE4'],
  ['color-light', 'color.border.strong', 'color', '#D8D6CE'],
  ['color-light', 'color.fixed.shadowInk', 'color', '#1A1A18'],
  ['color-light', 'color.fixed.backdrop', 'color', 'rgba(0,0,0,0.35)'],
  ['color-light', 'color.fixed.focusRingInner', 'color', '#FAFAF8'],
  ['color-light', 'color.fixed.focusRingOuter', 'color', '#E8572A'],
  ['color-light', 'color.fixed.desktopCanvas', 'color', '#E8E8E8'],
  ['color-light', 'color.fixed.splashBg', 'color', '#1A1A18'],
  ['color-light', 'color.fixed.androidAdaptiveIconBg', 'color', '#0A1929'],

  ['color-dark', 'color.fg.base', 'color', '#E8E6E1'],
  ['color-dark', 'color.fg.muted', 'color', '#9A9790'],
  ['color-dark', 'color.fg.subtle', 'color', '#85827A'],
  ['color-dark', 'color.fg.inverse', 'color', '#1A1A18'],
  ['color-dark', 'color.bg.base', 'color', '#141412'],
  ['color-dark', 'color.bg.raised', 'color', '#1E1E1B'],
  ['color-dark', 'color.bg.sunken', 'color', '#0F0F0D'],
  ['color-dark', 'color.accent.base', 'color', '#E8572A'],
  ['color-dark', 'color.accent.soft', 'color', '#2C1A12'],
  ['color-dark', 'color.success.base', 'color', '#3DA872'],
  ['color-dark', 'color.success.soft', 'color', '#132A1E'],
  ['color-dark', 'color.warning.base', 'color', '#D4A54A'],
  ['color-dark', 'color.warning.soft', 'color', '#2A2010'],
  ['color-dark', 'color.warning.border', 'color', '#3D3020'],
  ['color-dark', 'color.error.base', 'color', '#F87171'],
  ['color-dark', 'color.error.soft', 'color', '#2D1515'],
  ['color-dark', 'color.info.base', 'color', '#5A7CF6'],
  ['color-dark', 'color.info.soft', 'color', '#131B33'],
  ['color-dark', 'color.border.base', 'color', '#2C2C28'],
  ['color-dark', 'color.border.strong', 'color', '#3E3E38'],
  ['color-dark', 'color.fixed.shadowInk', 'color', '#1A1A18'],
  ['color-dark', 'color.fixed.backdrop', 'color', 'rgba(0,0,0,0.35)'],
  ['color-dark', 'color.fixed.focusRingInner', 'color', '#141412'],
  ['color-dark', 'color.fixed.focusRingOuter', 'color', '#E8572A'],
  ['color-dark', 'color.fixed.desktopCanvas', 'color', '#E8E8E8'],
  ['color-dark', 'color.fixed.splashBg', 'color', '#1A1A18'],
  ['color-dark', 'color.fixed.androidAdaptiveIconBg', 'color', '#0A1929'],
];

const SET_ORDER = ['core', 'color-light', 'color-dark'];

const out = {
  $description:
    'Vela Wallet design tokens, exported from the Penpot design source of truth ' +
    '(file "Vela Wallet — Design Source of Truth"). Tokens-Studio/DTCG dialect: one top-level key ' +
    'per token set, $type/$value per token. Modes are SET ACTIVATION, not theme objects: activate ' +
    'core + exactly one of color-light / color-dark. Regenerate with generator/export-tokens-dtcg.mjs; ' +
    'verify against the live file with generator/26-tokens-dtcg-check.js.',
};
for (const s of SET_ORDER) out[s] = {};
for (const [set, name, type, value] of T) {
  const parts = name.split('.');
  let node = out[set];
  for (const p of parts.slice(0, -1)) node = node[p] || (node[p] = {});
  const leaf = parts[parts.length - 1];
  if (node[leaf]) throw new Error('token name collision: ' + set + ' / ' + name);
  node[leaf] = { $type: type, $value: value };
}
out.$themes = [];
out.$metadata = {
  tokenSetOrder: SET_ORDER,
  modes: {
    light: { activeSets: ['core', 'color-light'] },
    dark: { activeSets: ['core', 'color-dark'] },
  },
  note:
    'TokenTheme.addSet() is a no-op on the Penpot deployment this file was built on, so $themes is ' +
    'empty by design and modes are expressed as set activation (see $metadata.modes).',
  tokenCount: T.length,
  exportedFrom: 'Penpot 2.16.2 + mcp:2.16',
};

const target = resolve(REPO, 'docs/design-tokens.json');
writeFileSync(target, JSON.stringify(out, null, 2) + '\n');
const perSet = Object.fromEntries(SET_ORDER.map((s) => [s, T.filter((t) => t[0] === s).length]));
console.log('wrote ' + target + ' — ' + T.length + ' tokens ' + JSON.stringify(perSet));
