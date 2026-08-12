/**
 * Ratchet — on web the first-launch region seed runs in exactly ONE place.
 *
 * `loadCurrency()` (currency.ts:154) runs `seedFromDeviceLocale()`
 * (currency.ts:128-152) when no preference is stored: read the device region,
 * price the candidate, and persist it only if a real rate resolved. The
 * `display_currency` core implements that same rule for web — and
 * `SettingsScreen.tsx:1135` still called `loadCurrency()` from a screen with no
 * `.web` fork, so on web BOTH ran, both writing `vela.displayCurrency`, with the
 * outcome decided by whichever rate landed last.
 *
 * The row now reads `useSettingsCurrency`, whose web half talks to the core. The
 * assertions below are what keeps a direct call from creeping back in: every
 * module that still reaches into `services/currency`'s preference API must be a
 * native-only file (a `.ts` with a `.web.ts` twin).
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '../..');
const read = (relative: string) => readFileSync(join(SRC, relative), 'utf8');

function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every module that calls the preference API, found by import, not by memory. */
const PREFERENCE_CALLERS = [
  'hooks/use-display-currency.ts',
  'hooks/use-settings-currency.ts',
];

describe('one first-launch currency seed per platform', () => {
  test('the Settings screen no longer loads or writes the preference itself', () => {
    const screen = code(read('screens/settings/SettingsScreen.tsx'));
    expect(screen).not.toMatch(/\bloadCurrency\b/);
    expect(screen).not.toMatch(/\bsetCurrency\b/);
    expect(screen).not.toMatch(/\bgetCurrencyCode\b/);
    expect(screen).toMatch(/useSettingsCurrency/);
  });

  test('every remaining caller is native-only — it has a web twin', () => {
    for (const file of PREFERENCE_CALLERS) {
      expect(code(read(file))).toMatch(/loadCurrency|setCurrency/);
      expect(existsSync(join(SRC, file.replace(/\.ts$/, '.web.ts')))).toBe(true);
    }
  });

  test('the web controller reaches the core, not the TypeScript preference', () => {
    const web = code(read('hooks/use-settings-currency.web.ts'));
    expect(web).toMatch(/display-currency-resident\.web/);
    expect(web).not.toMatch(/loadCurrency|setCurrency|getCurrencyCode/);
  });

  test('web has one resident display-currency session, shared by both surfaces', () => {
    for (const file of ['hooks/use-display-currency.web.ts', 'hooks/use-settings-currency.web.ts']) {
      const web = code(read(file));
      expect(web).toMatch(/display-currency-resident\.web/);
      // A second `createDisplayCurrencySession` would give the row its own
      // ledger — and its own seed.
      expect(web).not.toMatch(/createDisplayCurrencySession/);
    }
  });
});
