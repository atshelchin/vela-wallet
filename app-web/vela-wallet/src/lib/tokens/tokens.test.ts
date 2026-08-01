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
import { BREAKPOINT_DESKTOP } from './tokens';

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
		for (const name of darkVars) {
			if (name === '--color-onAccent') continue; // web addition, mode-independent
			expect(lightBlock, name).toContain(`${name}:`);
		}
	});
});

describe('literal audit — product UI references tokens, never raw values', () => {
	/** BrandMark carries asset colors verbatim from the design SVGs. */
	const HEX_WHITELIST = new Set(['BrandMark.svelte']);

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
		...collect(join(APP_ROOT, 'src/routes')),
		join(APP_ROOT, 'src/app.css')
	].filter((path) => !path.includes('/tokens/') && !path.endsWith('.test.ts'));

	it('audits a non-trivial file set', () => {
		expect(sources.length).toBeGreaterThanOrEqual(10);
	});

	it('no hex colors outside the whitelist', () => {
		for (const path of sources) {
			if (HEX_WHITELIST.has(path.split('/').at(-1)!)) continue;
			const text = readFileSync(path, 'utf8');
			expect(text.match(/#[0-9a-fA-F]{3,8}\b/g), relative(APP_ROOT, path)).toBeNull();
		}
	});

	it('the only px literal is the desktop breakpoint, and it equals BREAKPOINT_DESKTOP', () => {
		for (const path of sources) {
			const text = readFileSync(path, 'utf8');
			const pxLiterals = text.match(/\b\d+(?:\.\d+)?px\b/g) ?? [];
			const offenders = pxLiterals.filter((v) => v !== `${BREAKPOINT_DESKTOP}px`);
			expect(offenders, relative(APP_ROOT, path)).toEqual([]);
			// outside comments, breakpoint literals may appear only in media queries
			for (const line of text.split('\n')) {
				if (line.includes(`${BREAKPOINT_DESKTOP}px`) && !/\/\*|\*\//.test(line)) {
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
