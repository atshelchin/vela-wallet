/**
 * Deposit detection — WEB, driven by the portable Rust state machine
 * (spec 016, `rust/crates/vela-core/src/app/receive_watch.rs`).
 *
 * This file owns no rules. It builds one core session per account, renders
 * the entries the core projects, and formats them — amounts, USD, the local
 * time — because formatting is the shell's job. The cadence, the baseline
 * diff and the false-positive guards are decided (and tested) in Rust.
 */
import { useEffect, useState } from 'react';

import { chainName } from '@/models/network';
import { formatBalance } from '@/models/types';
import { createReceiveWatchSession } from '@/services/wallet-state-core/session';
import type { ReceiveWatchView } from '@/services/wallet-state-core/generated/ReceiveWatchView';

import type { DepositEntryView, ReceiveWatch } from './receive-controller-types';

const EMPTY: ReceiveWatchView = { detected: false, deposits: [] };

function toEntryView(view: ReceiveWatchView): DepositEntryView[] {
  return view.deposits.map((entry) => ({
    // Same rendering as the native controller produces today.
    time: new Date(entry.at_epoch_ms).toLocaleTimeString('en-US', { hour12: false }),
    items: entry.items.map((item) => ({
      symbol: item.symbol,
      amount: formatBalance(item.amount),
      network: chainName(item.chain_id),
      usd: item.usd != null ? `$${item.usd.toFixed(2)}` : null,
    })),
  }));
}

export function useReceiveWatch(address: string | undefined): ReceiveWatch {
  const [view, setView] = useState<ReceiveWatchView>(EMPTY);

  useEffect(() => {
    if (!address) return;
    setView(EMPTY);
    const loop = createReceiveWatchSession({
      address,
      onView: setView,
      onError: (error) => console.error('[receive-watch] core fault:', error),
    });
    loop.start({ type: 'start' });
    // Also covers React 19 StrictMode's development double-mount: the first
    // core is freed before the second is built.
    return () => loop.dispose();
  }, [address]);

  return { detected: view.detected, deposits: toEntryView(view) };
}
