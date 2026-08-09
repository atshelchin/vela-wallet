/**
 * Manual custom-token management — NATIVE controller.
 *
 * Today's logic, moved verbatim out of `components/ui/AddTokenPanel.tsx`
 * (spec 017): Hermes has no WebAssembly, so iOS/Android keep the TypeScript
 * implementation. The web variant (`use-manage-tokens.web.ts`) is driven by
 * the portable Rust machine (`rust/crates/vela-core/src/app/manage_tokens.rs`);
 * the dedupe key, the admission gate and the cache-invalidation rule are
 * documented — and tested — there.
 *
 * Only the ERC-20 tab lives here. The custom-NETWORK tab is `network_admin`'s
 * and stays in the panel untouched.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getAllNetworksSync } from '@/models/network';
import { isAddress, type CustomToken } from '@/models/types';
import { fetchErc20Meta } from '@/services/erc20-meta';
import { hapticSuccess, showAlert } from '@/services/platform';
import { loadCustomTokens, removeCustomToken, saveCustomToken } from '@/services/storage';

import type { FoundTokenView, ManageTokensController } from './manage-tokens-controller-types';

/** A found card before the session's "added" flag is folded in. */
type FoundMeta = Omit<FoundTokenView, 'added'>;

export function useManageTokens(onChanged?: () => void): ManageTokensController {
  const { t } = useTranslation();

  const [contractAddress, setContractAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundTokens, setFoundTokens] = useState<FoundMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [addedTokenIds, setAddedTokenIds] = useState<Set<string>>(new Set());

  // Already-added custom tokens (manage + delete).
  const [customTokens, setCustomTokens] = useState<CustomToken[]>([]);
  const refreshCustom = () => { loadCustomTokens().then(setCustomTokens).catch(() => {}); };
  useEffect(() => { refreshCustom(); }, []);

  const handleDelete = async (id: string) => {
    await removeCustomToken(id);
    hapticSuccess();
    refreshCustom();
    onChanged?.();
  };

  const isValidAddress = isAddress(contractAddress);

  const fetchTokenMetadata = async () => {
    if (!isValidAddress) return;

    setLoading(true);
    setFoundTokens([]);

    // Query all networks in parallel
    const allNetworks = getAllNetworksSync();
    const results = await Promise.allSettled(
      allNetworks.map(async (network) => {
        const meta = await fetchErc20Meta(network.chainId, contractAddress);
        if (!meta) return null;
        return { chainId: network.chainId, networkName: network.displayName, ...meta };
      }),
    );

    const found: FoundMeta[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) found.push(r.value);
    }

    if (found.length === 0) {
      showAlert(t('addToken.notFoundTitle'), t('addToken.notFoundMessage'));
    }
    setFoundTokens(found);
    setLoading(false);
  };

  const handleSave = async (chainId: number) => {
    const token = foundTokens.find((f) => f.chainId === chainId);
    if (!token) return;
    const tokenId = `${token.chainId}_${contractAddress.toLowerCase()}`;

    // Check if already added
    if (addedTokenIds.has(tokenId)) return;
    const existing = await loadCustomTokens();
    if (existing.some(ct => ct.id === tokenId)) {
      setAddedTokenIds(prev => new Set(prev).add(tokenId));
      return;
    }

    setSaving(true);
    try {
      await saveCustomToken({
        id: tokenId,
        chainId: token.chainId,
        contractAddress: contractAddress.toLowerCase(),
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        networkName: token.networkName,
      });
      hapticSuccess();
      setAddedTokenIds(prev => new Set(prev).add(tokenId));
      refreshCustom();
      onChanged?.();
    } catch {
      showAlert(t('addToken.errorTitle'), t('addToken.errorSaveToken'));
    } finally {
      setSaving(false);
    }
  };

  const setAddress = (value: string) => {
    setContractAddress(value);
    setFoundTokens([]);
  };

  return {
    address: contractAddress,
    setAddress,
    addressValid: isValidAddress,
    detecting: loading,
    detect: fetchTokenMetadata,
    found: foundTokens.map((token) => ({
      ...token,
      added: addedTokenIds.has(`${token.chainId}_${contractAddress.toLowerCase()}`),
    })),
    saving,
    save: handleSave,
    customTokens,
    remove: handleDelete,
  };
}
