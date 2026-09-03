/**
 * Token-layer gates (research.md D6):
 *  1. Drift gate — committed tokens.css/tokens.ts byte-equal a fresh
 *     regeneration from docs/design-tokens.json.
 *  2. Literal audit — no hard-coded visual values outside the token layer
 *     (design-system.md rule 1), with the documented whitelist.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateCss, generateTs } from '../../../scripts/gen-tokens.mjs';
import { BREAKPOINT_CONTACTS_OVERLAY, BREAKPOINT_DESKTOP } from './tokens';

const APP_ROOT = join(import.meta.dirname, '..', '..', '..');

describe('drift gate', () => {
	it('tokens.css matches a fresh regeneration', () => {
		const committed = readFileSync(join(APP_ROOT, 'src/lib/tokens/tokens.css'), 'utf8');
		expect(committed).toBe(generateCss());
	});

	it('tokens.ts matches a fresh regeneration', () => {
		const committed = readFileSync(join(APP_ROOT, 'src/lib/tokens/tokens.ts'), 'utf8');
		expect(committed).toBe(generateTs());
	});

	it('light and dark define the same color paths (generator asserts, we re-check the emission)', () => {
		const css = generateCss();
		const darkVars = [...css.matchAll(/^\t(--color-[\w-]+):/gm)].map((m) => m[1]);
		const lightBlock = css.split('@media (prefers-color-scheme: light)')[1] ?? '';
		// Web additions declared once in :root, mode-independent by construction:
		// onAccent is a constant, the rail pair are color-mix over tokens that
		// already flip per mode.
		const MODE_INDEPENDENT = new Set([
			'--color-onAccent',
			'--color-rail-ordinal',
			'--color-rail-ordinalSoft'
		]);
		for (const name of darkVars) {
			if (MODE_INDEPENDENT.has(name)) continue;
			expect(lightBlock, name).toContain(`${name}:`);
		}
	});
});

describe('literal audit — product UI references tokens, never raw values', () => {
	/**
	 * BrandMark carries asset colors verbatim from the design SVGs. DemoPage is
	 * the other kind of exception: it draws a STAND-IN WEB PAGE inside the
	 * explore browser (spec 022), and a website's palette and type scale are
	 * not ours to express in our tokens — the day it becomes a real WebView,
	 * those values leave with it.
	 */
	const LITERAL_WHITELIST = new Set(['BrandMark.svelte', 'DemoPage.svelte']);

	const collect = (dir: string): string[] =>
		readdirSync(dir).flatMap((name) => {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) return collect(path);
			return name.endsWith('.svelte') || name.endsWith('.css') || name.endsWith('.ts')
				? [path]
				: [];
		});

	const sources = [
		...collect(join(APP_ROOT, 'src/lib/ui')),
		// spec 018 T018: the contacts feature layer is audited too.
		...collect(join(APP_ROOT, 'src/lib/contacts')),
		// spec 021: and the wallet-flow layer, on the same terms.
		...collect(join(APP_ROOT, 'src/lib/flows')),
		// spec 022: so are explore and signing. Their `fixtures.ts` is exempt for
		// the same reason the wallet's is — a site's brand colour and a token's
		// chain colour are CONTENT, and a design token cannot name them.
		...collect(join(APP_ROOT, 'src/lib/explore')),
		...collect(join(APP_ROOT, 'src/lib/signing')),
		// spec 024 T010: the live-wiring layers. `core` and `services` hold no
		// visuals at all, which is exactly why they are audited — a colour
		// appearing there would be a category error, not a taste question.
		// settings and session were an unlisted gap since 023/019.
		...collect(join(APP_ROOT, 'src/lib/core')),
		...collect(join(APP_ROOT, 'src/lib/services')),
		...collect(join(APP_ROOT, 'src/lib/settings')),
		...collect(join(APP_ROOT, 'src/lib/session')),
		...collect(join(APP_ROOT, 'src/routes')),
		join(APP_ROOT, 'src/app.css')
	].filter(
		(path) =>
			!path.includes('/tokens/') && !path.endsWith('.test.ts') && !path.endsWith('/fixtures.ts')
	);

	it('audits a non-trivial file set', () => {
		expect(sources.length).toBeGreaterThanOrEqual(10);
	});

	it('no hex colors outside the whitelist', () => {
		for (const path of sources) {
			if (LITERAL_WHITELIST.has(path.split('/').at(-1)!)) continue;
			const text = readFileSync(path, 'utf8');
			expect(text.match(/#[0-9a-fA-F]{3,8}\b/g), relative(APP_ROOT, path)).toBeNull();
		}
	});

	/**
	 * The only px literals allowed anywhere in product UI are the two responsive
	 * breakpoints, and only inside `@media` — a media query cannot read a custom
	 * property, so the value has to be spelled out. Both are generated tokens
	 * (`--breakpoint-desktop`, `--breakpoint-contactsOverlay`) and this gate
	 * pins the literals to those exports so the two can never drift apart.
	 */
	const BREAKPOINT_LITERALS = [`${BREAKPOINT_DESKTOP}px`, `${BREAKPOINT_CONTACTS_OVERLAY}px`];

	it('the only px literals are the breakpoints, and they equal the token exports', () => {
		for (const path of sources) {
			if (LITERAL_WHITELIST.has(path.split('/').at(-1)!)) continue;
			const text = readFileSync(path, 'utf8');
			const pxLiterals = text.match(/\b\d+(?:\.\d+)?px\b/g) ?? [];
			const offenders = pxLiterals.filter((v) => !BREAKPOINT_LITERALS.includes(v));
			expect(offenders, relative(APP_ROOT, path)).toEqual([]);
			// outside comments, breakpoint literals may appear only in media queries
			for (const line of text.split('\n')) {
				const hit = BREAKPOINT_LITERALS.some((v) => line.includes(v));
				if (hit && !/\/\*|\*\//.test(line)) {
					expect(line, relative(APP_ROOT, path)).toMatch(/@media/);
				}
			}
		}
	});

	it('no box-shadow or font-family literals (vars only)', () => {
		for (const path of sources) {
			// examine whole declarations — they may span lines (prettier wraps values)
			const declarations = readFileSync(path, 'utf8').split(';');
			for (const decl of declarations) {
				if (/box-shadow:/.test(decl)) expect(decl, path).toMatch(/var\(--/);
				if (/font-family:/.test(decl)) expect(decl, path).toMatch(/var\(--font/);
			}
		}
	});
});
