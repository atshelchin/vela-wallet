/**
 * Deposit detection while the Receive screen is open — NATIVE controller.
 *
 * Today's logic, moved verbatim from `ReceiveScreen.tsx` (spec 016): Hermes
 * has no WebAssembly, so iOS/Android keep the TypeScript implementation. The
 * web variant (`use-receive-watch.web.ts`) is driven by the portable Rust
 * machine (`rust/crates/vela-core/src/app/receive_watch.rs`); the polling
 * cadence and diff rules are documented — and tested — there.
 */
import { useEffect, useRef, useState } from 'react';

import { chainName } from '@/models/network';
import { formatBalance, tokenBalanceDouble, tokenChainId, tokenId, type APIToken } from '@/models/types';
import { hapticSuccess, isAppActive } from '@/services/platform';
import { fetchTokens } from '@/services/wallet-api';

import type { DepositItemView, DepositEntryView, ReceiveWatch } from './receive-controller-types';

// Aggressive polling: 3s for first 1 min, then 60s for next 4 min, then stop
const FAST_INTERVAL_MS = 3_000;
const SLOW_INTERVAL_MS = 60_000;
const FAST_PHASE_MS = 1 * 60_000;
const TOTAL_LISTEN_MS = 5 * 60_000;

export function useReceiveWatch(address: string | undefined): ReceiveWatch {
  const [detected, setDetected] = useState(false);
  const [deposits, setDeposits] = useState<DepositEntryView[]>([]);
  const previousTokens = useRef<APIToken[] | null>(null);

  // Deposit detection polling — quietly watches for incoming transfers while
  // this screen is open and surfaces them as they land (no persistent status).
  useEffect(() => {
    if (!address) return;
    setDetected(false);
    setDeposits([]);
    previousTokens.current = null;
    const startTime = Date.now();
    let timerId: ReturnType<typeof setTimeout>;

    const checkDeposit = async () => {
      if (!isAppActive()) return;
      try {
        const tokens = await fetchTokens(address, { forceRefresh: true });

        if (previousTokens.current !== null) {
          // Guard: a smaller token set than baseline means a chain likely
          // failed — skip comparison to avoid false positives.
          if (tokens.length < previousTokens.current.length) {
            scheduleNext();
            return;
          }

          // Diff: find tokens whose balance increased vs baseline.
          const prevMap = new Map(previousTokens.current.map(tk => [tokenId(tk), tokenBalanceDouble(tk)]));
          const changes: DepositItemView[] = [];
          for (const tk of tokens) {
            const prevBal = prevMap.get(tokenId(tk)) ?? 0;
            const curBal = tokenBalanceDouble(tk);
            if (curBal > prevBal) {
              const diff = curBal - prevBal;
              changes.push({
                symbol: tk.symbol,
                amount: formatBalance(diff),
                network: chainName(tokenChainId(tk)),
                usd: tk.priceUsd ? `$${(diff * tk.priceUsd).toFixed(2)}` : null,
              });
            }
          }

          if (changes.length > 0) {
            const time = new Date().toLocaleTimeString('en-US', { hour12: false });
            setDetected(true);
            setDeposits(prev => [{ time, items: changes }, ...prev]);
            hapticSuccess();
            previousTokens.current = tokens;
          }
        } else {
          // First fetch — record initial baseline.
          previousTokens.current = tokens;
        }
      } catch {}

      scheduleNext();
    };

    const scheduleNext = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= TOTAL_LISTEN_MS) return;
      const interval = elapsed < FAST_PHASE_MS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
      timerId = setTimeout(checkDeposit, interval);
    };

    checkDeposit();
    return () => { clearTimeout(timerId); };
  }, [address]);

  return { detected, deposits };
}
