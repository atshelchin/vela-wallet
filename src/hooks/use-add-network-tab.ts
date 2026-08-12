/**
 * The "Add network" tab of `AddTokenPanel` — NATIVE controller.
 *
 * Today's logic, moved verbatim out of `components/ui/AddTokenPanel.tsx`
 * (spec 017), exactly as `use-manage-tokens.ts` was: Hermes has no WebAssembly,
 * so iOS/Android keep the TypeScript implementation. Every rule below is
 * unchanged — the 2-character search floor, the `slice(0, 8)` suggestion cap,
 * the `DEFAULT_NETWORKS` + stored-custom dedup, the compatibility gate and the
 * save pipeline.
 *
 * The web variant (`use-add-network-tab.web.ts`) is driven by the portable Rust
 * machine (`rust/crates/vela-core/src/app/network_admin.rs`), which is the point
 * of this file existing: the panel used to call `checkNetworkCompatibility` and
 * `saveCustomNetwork` directly, so on web it was a SECOND add-network wizard
 * running beside the `network_admin` core — a chain could enter the wallet
 * without passing the core's gates.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DEFAULT_NETWORKS, refreshCustomNetworks } from '@/models/network';
import type { CompatibilityResult } from '@/models/types';
import { chainInfoToCustomNetwork } from '@/services/add-network';
import { fetchChainInfo, searchChains, type ChainInfo, type ChainSearchResult } from '@/services/chain-registry';
import { checkNetworkCompatibility } from '@/services/network-checker';
import { hapticSuccess, showAlert } from '@/services/platform';
import { loadCustomNetworks, saveCustomNetwork } from '@/services/storage';

import type { AddNetworkTabController, AddNetworkTabError } from './add-network-tab-types';

export function useAddNetworkTab(onChanged?: () => void): AddNetworkTabController {
  const { t } = useTranslation();

  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ChainSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [chainInfo, setChainInfo] = useState<ChainInfo | null>(null);
  const [compat, setCompat] = useState<CompatibilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<AddNetworkTabError | null>(null);
  const [added, setAdded] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    setChainInfo(null);
    setCompat(null);
    setError(null);
    setAdded(false);
    if (q.trim().length < 2) { setSuggestions([]); return; }
    setSearching(true);
    try {
      const results = await searchChains(q.trim());
      setSuggestions(results.slice(0, 8));
    } catch { setSuggestions([]); }
    setSearching(false);
  };

  const select = async (chainId: number) => {
    // The suggestion row put the chain's name in the box before dispatching.
    const picked = suggestions.find((s) => s.chainId === chainId);
    if (picked) setQuery(picked.name);
    setSuggestions([]);
    setLoading(true);
    setError(null);
    setAdded(false);
    try {
      const existing = DEFAULT_NETWORKS.find(n => n.chainId === chainId);
      const custom = await loadCustomNetworks();
      if (existing || custom.find(n => n.chainId === chainId)) {
        setError({ kind: 'already_added' });
        setLoading(false);
        return;
      }
      const info = await fetchChainInfo(chainId);
      if (!info) { setError({ kind: 'chain_not_found' }); setLoading(false); return; }
      setChainInfo(info);
      const result = await checkNetworkCompatibility(info.rpcUrls, chainId);
      setCompat(result);
      if (!result.compatible) {
        setError({ kind: 'not_compatible', detail: result.error });
      }
    } catch (err) {
      setError({ kind: 'message', text: err instanceof Error ? err.message : 'Failed to fetch chain info' });
    }
    setLoading(false);
  };

  const setRpcURL = (value: string) => {
    setChainInfo((prev) => (prev ? { ...prev, rpcUrl: value, rpcUrls: [value] } : prev));
  };

  const add = async () => {
    if (!chainInfo || !compat?.compatible) return;
    setSaving(true);
    try {
      const network = chainInfoToCustomNetwork(chainInfo, compat.bestRpcUrl);
      await saveCustomNetwork(network);
      await refreshCustomNetworks();
      hapticSuccess();
      setError(null);
      setAdded(true);
      onChanged?.();
    } catch {
      showAlert(t('addToken.errorTitle'), t('addToken.errorAddNetwork'));
    }
    setSaving(false);
  };

  return {
    query,
    suggestions: suggestions.map((s) => ({ chainId: s.chainId, name: s.name })),
    searching,
    loading,
    saving,
    error,
    chainInfo: chainInfo
      ? {
          chainId: chainInfo.chainId,
          name: chainInfo.name,
          nativeSymbol: chainInfo.nativeCurrency?.symbol,
          nativeDecimals: chainInfo.nativeCurrency?.decimals,
          explorerURL: chainInfo.explorerUrl,
          rpcURL: chainInfo.rpcUrl,
        }
      : null,
    compat,
    added,
    search,
    select,
    setRpcURL,
    add,
  };
}
