#!/usr/bin/env node
/**
 * Design-token pipeline (spec 006-web-onboarding, contracts/tokens.md).
 *
 * Source  <-  docs/design-tokens.json        Penpot DTCG export, THE value authority
 * Output  ->  src/lib/tokens/tokens.css      :root dark base + light overrides
 * Output  ->  src/lib/tokens/tokens.ts       constants components/tests need in JS
 *
 * Both outputs are COMMITTED; `--check` fails when they drift from the export,
 * and the vitest drift gate re-runs the pure generators for the same guarantee.
 *
 * Web additions (tokens the export lacks) live in WEB_ADDITIONS below with the
 * design-system.md rule that licenses each; nothing else may invent a value.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(APP_ROOT, '..', '..', 'docs', 'design-tokens.json');
const OUT_CSS = join(APP_ROOT, 'src', 'lib', 'tokens', 'tokens.css');
const OUT_TS = join(APP_ROOT, 'src', 'lib', 'tokens', 'tokens.ts');

/** design-system.md §Layout names these; the DTCG export does not carry them. */
const WEB_ADDITIONS = [
	['size-control-sm', '36px', 'sizing.control.sm per design-system.md'],
	['size-control-md', '44px', 'sizing.control.md per design-system.md'],
	['size-control-lg', '52px', 'sizing.control.lg per design-system.md'],
	['breakpoint-desktop', '1280px', 'feature 006 responsive contract'],
	[
		'breakpoint-contactsOverlay',
		'1120px',
		'spec 018 desktop SPEC sheet: below this width the third column overlays instead of squeezing the list'
	],
	['motion-panel-in', '240ms', 'spec 018 FR-011: third-column open'],
	['motion-panel-out', '200ms', 'spec 018 FR-011: third-column close'],
	['motion-crossfade', '150ms', 'spec 018 FR-011: content swap + reduced-motion degrade'],
	['motion-hover', '120ms', 'spec 018 FR-011: desktop row hover raise'],
	['motion-bubble-in', '120ms', 'spec 018 FR-011: index-rail letter bubble fade-in'],
	['motion-bubble-out', '80ms', 'spec 018 FR-011: index-rail letter bubble fade-out'],
	[
		'size-identiconHero',
		'64px',
		'spec 018: contact-detail hero avatar, measured 64 in C2 (mobile)'
	],
	['size-identiconDetail', '48px', 'spec 018: contact-detail avatar, measured 48 in DC2 (desktop)'],
	[
		'text-hero',
		'46px',
		'spec 019: the v2 Welcome headline. The DTCG type scale tops out at 40px (text-5xl), and the onboarding design specifies 46/38 — declared once here rather than sprinkled as literals'
	],
	['text-heroCompact', '38px', 'spec 019: the v2 Welcome headline below the desktop breakpoint'],
	[
		'layout-flowColumn',
		'440px',
		'spec 019: the v2 onboarding flow column. The design centres every step in one column of this width at every viewport; the Welcome hero is the only wider one'
	],
	[
		'layout-welcomeColumn',
		'620px',
		'spec 019: the v2 Welcome column, wider than the flow it starts'
	],
	['layout-contactsRailW', '216px', 'spec 018 research D9: desktop group-rail width (DC1)'],
	['layout-contactsMenuW', '216px', 'spec 018 research D9: dropdown/context menu width (M1/M2)'],
	[
		'color-onAccent',
		'#FFFFFF',
		'CTA label on accent.base, white in BOTH modes per mocks (fg.inverse flips)'
	],
	['opacity-hover', '0.92', 'pointer hover feedback; no export token exists for hover']
];

/** Composite stacks: export families + design-system.md CJK/system fallbacks. */
const FONT_UI = "'Plus Jakarta Sans', 'Noto Sans SC', system-ui, sans-serif";
const FONT_MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, monospace";

export const BREAKPOINT_DESKTOP = 1280;

/** Spec 018: the desktop third column overlays the list below this width. */
export const BREAKPOINT_CONTACTS_OVERLAY = 1120;

// px-typed DTCG categories; everything else resolves via path rules below.
const PX_TYPES = new Set([
	'spacing',
	'sizing',
	'borderRadius',
	'fontSizes',
	'borderWidth',
	'letterSpacing'
]);

/** `number`-typed tokens that are durations and therefore emit as ms. */
const MS_PREFIXES = ['motion.duration.', 'motion.sheet.', 'motion.entrance.'];

function flatten(setObj, prefix = '') {
	const out = [];
	for (const [key, value] of Object.entries(setObj)) {
		if (key.startsWith('$')) continue;
		const path = prefix ? `${prefix}.${key}` : key;
		if (value && typeof value === 'object' && '$value' in value) {
			out.push({ path, type: value.$type, value: value.$value });
		} else if (value && typeof value === 'object') {
			out.push(...flatten(value, path));
		}
	}
	return out;
}

function cssValue({ path, type, value }) {
	if (type === 'color') return String(value);
	if (type === 'fontFamilies')
		return Array.isArray(value) ? `'${value.join("', '")}'` : `'${value}'`;
	if (type === 'shadow') {
		// "0 1 3 0 rgba(...)" -> "0 1px 3px 0 rgba(...)"
		const m = String(value).match(/^(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (.+)$/);
		if (!m) throw new Error(`unparseable shadow: ${path} = ${value}`);
		const px = (n) => (Number(n) === 0 ? '0' : `${n}px`);
		return `${px(m[1])} ${px(m[2])} ${px(m[3])} ${px(m[4])} ${m[5]}`;
	}
	if (PX_TYPES.has(type)) return Number(value) === 0 ? '0' : `${value}px`;
	if (type === 'number' && MS_PREFIXES.some((p) => path.startsWith(p))) return `${value}ms`;
	return String(value); // fontWeights, opacity, remaining numbers
}

const varName = (path) => `--${path.replaceAll('.', '-')}`;

function loadTokens(sourcePath = SOURCE) {
	const doc = JSON.parse(readFileSync(sourcePath, 'utf8'));
	for (const set of ['core', 'color-light', 'color-dark']) {
		if (!doc[set]) throw new Error(`token source missing set "${set}"`);
	}
	const core = flatten(doc.core);
	const light = flatten(doc['color-light']);
	const dark = flatten(doc['color-dark']);
	const lightPaths = light.map((t) => t.path).join('\n');
	const darkPaths = dark.map((t) => t.path).join('\n');
	if (lightPaths !== darkPaths) {
		throw new Error('color-light and color-dark define different token paths');
	}
	return { core, light, dark };
}

const HEADER = `/* GENERATED by scripts/gen-tokens.mjs — do not edit. Source: docs/design-tokens.json */`;

export function generateCss(tokens = loadTokens()) {
	const { core, light, dark } = tokens;
	const decl = (t) => `\t${varName(t.path)}: ${cssValue(t)};`;
	const declsFor = (list) => list.map(decl).join('\n');
	const additions = WEB_ADDITIONS.map(
		([name, value, why]) => `\t--${name}: ${value}; /* web addition: ${why} */`
	).join('\n');

	return `${HEADER}

/* core set (mode-independent) + dark mode as base: the "default" design (W1)
   is dark, and browsers without prefers-color-scheme support get dark. */
:root {
${declsFor(core)}
\t--font-ui: ${FONT_UI}; /* web addition: design-system.md CJK fallback */
\t--font-mono: ${FONT_MONO}; /* web addition: mono fallbacks */
${additions}
${declsFor(dark)}
}

/* mode-light via system preference; a future in-app theme setting flips
   data-theme instead and must win over the media query. */
@media (prefers-color-scheme: light) {
\t:root:not([data-theme='dark']) {
${declsFor(light).replaceAll('\t', '\t\t')}
\t}
}

:root[data-theme='light'] {
${declsFor(light)}
}

:root[data-theme='dark'] {
${declsFor(dark)}
}
`;
}

export function generateTs(tokens = loadTokens()) {
	const { light, dark } = tokens;
	const table = (list) => list.map((t) => `\t'${t.path}': '${String(t.value)}'`).join(',\n');
	return `${HEADER.replace('/*', '//').replace(' */', '')}

export const BREAKPOINT_DESKTOP = ${BREAKPOINT_DESKTOP};

/** Spec 018: below this width the desktop third column overlays the list. */
export const BREAKPOINT_CONTACTS_OVERLAY = ${BREAKPOINT_CONTACTS_OVERLAY};

export const CONTROL = { sm: 36, md: 44, lg: 52 } as const;

export const FONT_UI = ${JSON.stringify(FONT_UI)};

export const FONT_MONO = ${JSON.stringify(FONT_MONO)};

export const MOTION = { fast: 150, base: 250, slow: 400 } as const;

/** Web addition: CTA label color on accent surfaces, both modes (see tokens.css). */
export const ON_ACCENT = '#FFFFFF';

/** Raw per-mode color tables (path -> value) for the contrast gate. */
export const COLORS = {
\tlight: {
${table(light).replaceAll('\t', '\t\t')}
\t},
\tdark: {
${table(dark).replaceAll('\t', '\t\t')}
\t}
} as const;
`;
}

function main() {
	const check = process.argv.includes('--check');
	const css = generateCss();
	const ts = generateTs();
	if (check) {
		const readOr = (p) => {
			try {
				return readFileSync(p, 'utf8');
			} catch {
				return '';
			}
		};
		const drift = [readOr(OUT_CSS) !== css && OUT_CSS, readOr(OUT_TS) !== ts && OUT_TS].filter(
			Boolean
		);
		if (drift.length) {
			console.error(
				`tokens drift from docs/design-tokens.json — run \`pnpm gen:tokens\`:\n  ${drift.join('\n  ')}`
			);
			process.exit(1);
		}
		console.log('tokens in sync');
		return;
	}
	mkdirSync(dirname(OUT_CSS), { recursive: true });
	writeFileSync(OUT_CSS, css);
	writeFileSync(OUT_TS, ts);
	console.log(`wrote ${OUT_CSS}\nwrote ${OUT_TS}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	main();
}
