/**
 * Receive-screen request controller (acknowledge gate + EIP-681 builder) —
 * NATIVE.
 *
 * Today's logic, moved verbatim from `ReceiveScreen.tsx` (the per-account
 * warning gate) and `ReceiveRequestControls.tsx` (amount sanitation + request
 * building) for spec 016. Hermes has no WebAssembly, so iOS/Android keep this
 * TypeScript implementation; the web variant is driven by the portable Rust
 * machine (`rust/crates/vela-core/src/app/payment_request.rs`), where every
 * rule is documented and tested.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildEIP681, buildPayLink } from '@/services/eip681';

import { DEFAULT_ASSET_FACTS, type ReceiveRequestController, type RequestAssetFacts } from './receive-controller-types';

// The warning gate shows once per account, then decays to a one-line reminder.
const warnedStorageKey = (address: string) => `vela.receiveWarned.${address}`;

export function sanitizeAmount(text: string, maxDecimals: number): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  if ((cleaned.match(/\./g) || []).length > 1) return text.slice(0, -1);
  const [i, f] = cleaned.split('.');
  if (f != null && f.length > maxDecimals) return `${i}.${f.slice(0, maxDecimals)}`;
  return cleaned;
}

export function useReceiveRequest(address: string | undefined): ReceiveRequestController {
  // Per-account acknowledge flag.
  const [warned, setWarned] = useState<boolean | null>(null);
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setWarned(null);
    AsyncStorage.getItem(warnedStorageKey(address))
      .then((v) => { if (!cancelled) setWarned(v === '1'); })
      .catch(() => { if (!cancelled) setWarned(false); });
    return () => { cancelled = true; };
  }, [address]);
  const acknowledge = useCallback(() => {
    setWarned(true);
    if (address) AsyncStorage.setItem(warnedStorageKey(address), '1').catch(() => {});
  }, [address]);

  // Builder state.
  const [asset, setAsset] = useState<RequestAssetFacts>(DEFAULT_ASSET_FACTS);
  const [amount, setAmount] = useState('');

  const pickAsset = useCallback((facts: RequestAssetFacts) => {
    setAsset(facts);
    setAmount((a) => sanitizeAmount(a, facts.decimals)); // re-clamp precision
  }, []);

  const setAmountText = useCallback(
    (text: string) => setAmount(sanitizeAmount(text, asset.decimals)),
    [asset.decimals],
  );

  const { qrValue, payLink, hasAmount } = useMemo(() => {
    if (!address) return { qrValue: '', payLink: '', hasAmount: false };
    return {
      qrValue: buildEIP681({
        recipient: address,
        chainId: asset.chainId,
        tokenAddress: asset.tokenAddress,
        decimals: asset.decimals,
        amount,
      }),
      payLink: buildPayLink({
        recipient: address,
        chainId: asset.chainId,
        tokenAddress: asset.tokenAddress,
        amount,
        symbol: asset.symbol,
        decimals: asset.decimals,
        networkName: asset.networkName,
      }),
      hasAmount: !!amount && parseFloat(amount) > 0,
    };
  }, [address, asset, amount]);

  return {
    recipient: address ?? '',
    warned,
    acknowledge,
    asset,
    pickAsset,
    amount,
    setAmountText,
    qrValue,
    payLink,
    hasAmount,
  };
}
