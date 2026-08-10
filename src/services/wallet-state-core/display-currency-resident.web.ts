/**
 * The ONE resident `display_currency` session — WEB.
 *
 * Extracted verbatim out of `hooks/use-display-currency.web.ts`, which owned it
 * privately, because a second surface now needs the same session: the Settings
 * currency row. That row used to call `loadCurrency()` / `setCurrency()`
 * directly (SettingsScreen.tsx:1135-1139), which on web meant the TypeScript
 * first-launch seed in `services/currency.ts:128-152` ran BESIDE the core's own
 * seed — two writers of `vela.displayCurrency`, racing, with different rules
 * (spec 017). Everything that reads or writes the preference on web now goes
 * through here.
 *
 * The sharing itself is not new: it is the same module-level `_committed` pair
 * the TypeScript hook always had, so every money-showing surface renders the
 * same atomically-committed {code, rate}.
 */
import { createDisplayCurrencySession } from '@/services/wallet-state-core/session';
import type { CurrencyEvent } from '@/services/wallet-state-core/generated/CurrencyEvent';
import type { CurrencyView } from '@/services/wallet-state-core/generated/CurrencyView';

export type DisplayCurrencyPair = { code: string; rate: number };

// The machine's own initial view is USD/1 — mirrored here only until the
// session's first committed view arrives.
let current: DisplayCurrencyPair = { code: 'USD', rate: 1 };
const listeners = new Set<(pair: DisplayCurrencyPair) => void>();
let session: ReturnType<typeof createDisplayCurrencySession> | null = null;

/**
 * Build the session on first use, or ask an existing one to re-read. The core
 * coalesces refreshes while a read is in flight, so calling this on every focus
 * is free.
 */
export function ensureDisplayCurrency(): void {
  if (!session) {
    session = createDisplayCurrencySession({
      onView: (view: CurrencyView) => {
        current = { code: view.code, rate: view.rate };
        listeners.forEach((listener) => listener(current));
      },
      onError: (error) => console.error('[display-currency] core fault:', error),
    });
    session.start({ type: 'refresh' });
    return;
  }
  session.dispatch({ type: 'refresh' });
}

/** The last committed pair. Never read this during render — subscribe. */
export function displayCurrencyPair(): DisplayCurrencyPair {
  return current;
}

export function subscribeDisplayCurrency(
  listener: (pair: DisplayCurrencyPair) => void,
): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Forward an event (the user's explicit pick) to the resident session. It does
 * NOT refresh first: a refresh in flight is superseded by the pick anyway (the
 * core drops results from a superseded attempt — that IS the "user choice wins"
 * rule), and asking for one would only spend a read.
 */
export function dispatchDisplayCurrency(event: CurrencyEvent): void {
  if (!session) ensureDisplayCurrency();
  session?.dispatch(event);
}
