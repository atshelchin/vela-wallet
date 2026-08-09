/**
 * useDisplayCurrency — WEB, driven by the portable Rust state machine
 * (spec 016, `rust/crates/vela-core/src/app/display_currency.rs`).
 *
 * This file owns no rules. One module-level session is shared by every mount
 * — the same sharing today's module-level `_committed` pair provided — so all
 * money-showing surfaces render the same atomically-committed {code, rate}
 * pair, and the first-launch seed runs once, not once per screen. The public
 * shape is identical to the native hook.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { currencyMeta, formatFiat } from '@/services/currency';
import { createDisplayCurrencySession } from '@/services/wallet-state-core/session';
import type { CurrencyView } from '@/services/wallet-state-core/generated/CurrencyView';

export interface DisplayCurrency {
  code: string;
  symbol: string;
  /** USD → display-currency multiplier. */
  rate: number;
  /** Format a USD value into the selected currency, e.g. 1.0 → "¥155". */
  fmt: (usd: number) => string;
}

type Pair = { code: string; rate: number };

// The machine's own initial view is USD/1 — mirrored here only until the
// session's first committed view arrives.
let current: Pair = { code: 'USD', rate: 1 };
const listeners = new Set<(pair: Pair) => void>();
let session: ReturnType<typeof createDisplayCurrencySession> | null = null;

function ensureSession() {
  if (!session) {
    session = createDisplayCurrencySession({
      onView: (view: CurrencyView) => {
        current = { code: view.code, rate: view.rate };
        listeners.forEach((listener) => listener(current));
      },
      onError: (error) => console.error('[display-currency] core fault:', error),
    });
    session.start({ type: 'refresh' });
  } else {
    // Focus refresh: the core coalesces these while a read is in flight.
    session.dispatch({ type: 'refresh' });
  }
  return session;
}

export function useDisplayCurrency(): DisplayCurrency {
  const [pair, setPair] = useState<Pair>(() => current);

  useFocusEffect(
    useCallback(() => {
      listeners.add(setPair);
      ensureSession();
      setPair(current);
      return () => {
        listeners.delete(setPair);
      };
    }, []),
  );

  const { code, rate } = pair;
  const meta = currencyMeta(code);
  return {
    code,
    symbol: meta.symbol,
    rate,
    fmt: (usd: number) => formatFiat(usd * rate, code, meta.symbol),
  };
}
