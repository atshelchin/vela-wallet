/**
 * ReceiveRequestControls — the form for building an EIP-681 payment request.
 *
 * The user picks an asset (which fixes the network + token) and optionally an
 * amount. The asset picker reuses the same TokenSelector as the Send flow, fed
 * with every token — including zero-balance, user-added (custom), and built-in
 * ones (via fetchTokens' includeZeroBalance) — so you can request a token you
 * don't hold yet.
 *
 * Rendering only (spec 016): amount sanitation and request building are the
 * controller's (`use-receive-request`) — Rust-driven on web, TypeScript on
 * native. This component owns the picker UI: the token catalog, the modal,
 * and the APIToken it renders logos from.
 */
import { AppModal } from '@/components/ui/AppModal';
import { Divider } from '@/components/ui/DetailRow';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { TokenLogo } from '@/components/TokenLogo';
import { TokenSelector } from '@/components/ui/TokenSelector';
import { color, createStyles, inter, radius, space, text } from '@/constants/theme';
import { chainName, networkForChainId, tokenBadgeNetwork } from '@/models/network';
import { tokenChainId, tokenLogoURLs, type APIToken } from '@/models/types';
import type { ReceiveRequestController } from '@/hooks/receive-controller-types';
import { useLocalePrefs, numberSeparators, parseLocaleNumber } from '@/services/locale-format';
import { hapticLight } from '@/services/platform';
import { clearTokenCache, fetchTokens } from '@/services/wallet-api';
import { ChevronDown } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, TextInput, View } from 'react-native';

interface Props {
  /** The gate + builder controller owned by the Receive screen. */
  controller: ReceiveRequestController;
}

/** Default asset shown before anything is picked / loaded: native ETH on Ethereum. */
function defaultAsset(): APIToken {
  return { network: 'eth-mainnet', chainName: 'Ethereum', symbol: 'ETH', balance: '0', decimals: 18, logo: null, name: 'Ethereum', tokenAddress: null, priceUsd: null, spam: false };
}

export function ReceiveRequestControls({ controller }: Props) {
  const { t } = useTranslation();
  useLocalePrefs(); // re-render on number-format change

  const [asset, setAsset] = useState<APIToken>(defaultAsset);
  const [allTokens, setAllTokens] = useState<APIToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(true);
  const [showPicker, setShowPicker] = useState(false);

  const chainId = tokenChainId(asset);
  const networkName = useMemo(
    () => networkForChainId(chainId)?.displayName ?? chainName(chainId),
    [chainId],
  );

  // Load every token (incl. zero-balance / custom / built-in) for the picker.
  const address = controller.recipient;
  const loadTokens = (forceRefresh = false) => {
    if (!address) return;
    setLoadingTokens(true);
    if (forceRefresh) clearTokenCache(address);
    fetchTokens(address, { includeZeroBalance: true })
      .then((list) => setAllTokens(list))
      .catch(() => {})
      .finally(() => setLoadingTokens(false));
  };
  useEffect(() => { loadTokens(); }, [address]);

  const pickAsset = (tok: APIToken) => {
    hapticLight();
    setAsset(tok);
    const tokChainId = tokenChainId(tok);
    controller.pickAsset({
      chainId: tokChainId,
      tokenAddress: tok.tokenAddress ?? null,
      symbol: tok.symbol,
      decimals: tok.decimals,
      networkName: networkForChainId(tokChainId)?.displayName ?? chainName(tokChainId),
    });
    setShowPicker(false);
  };

  return (
    <View style={styles.wrap}>
      {/* Asset (network + token in one) — open row, hairline-separated */}
      <SectionLabel>{t('receive.request.token')}</SectionLabel>
      <Pressable
        style={styles.selectRow}
        onPress={() => setShowPicker(true)}
        accessibilityRole="button"
        accessibilityLabel={t('receive.request.selectToken')}
      >
        <TokenLogo symbol={asset.symbol} logoUrls={tokenLogoURLs(asset)} chain={tokenBadgeNetwork(asset)} size={32} />
        <View style={styles.selectInfo}>
          <Text style={styles.selectValue} numberOfLines={1}>{asset.symbol}</Text>
          <Text style={styles.selectSub} numberOfLines={1}>{networkName}</Text>
        </View>
        <ChevronDown size={18} color={color.fg.muted} strokeWidth={2.2} />
      </Pressable>
      <Divider />

      {/* Amount */}
      <SectionLabel>{t('receive.request.amount')}</SectionLabel>
      <View style={styles.amountRow}>
        <TextInput
          style={styles.amountInput}
          value={controller.amount.replace('.', numberSeparators().decimal)}
          onChangeText={(txt) => controller.setAmountText(parseLocaleNumber(txt))}
          placeholder={t('receive.request.amountPlaceholder')}
          placeholderTextColor={color.fg.subtle}
          keyboardType="decimal-pad"
          inputMode="decimal"
        />
        <Text style={styles.amountSymbol}>{asset.symbol}</Text>
      </View>
      <Text style={styles.amountHint}>{t('receive.request.amountHint')}</Text>

      {/* Asset picker — reuses the Send token selector */}
      <AppModal visible={showPicker} onClose={() => setShowPicker(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{t('receive.request.selectToken')}</Text>
          <TokenSelector
            tokens={allTokens}
            loading={loadingTokens}
            onSelect={pickAsset}
            onAddChanged={() => loadTokens(true)}
            hideTotals
          />
        </View>
      </AppModal>
    </View>
  );
}

const styles = createStyles(() => ({
  wrap: { gap: space.sm },
  // Asset picker — an open de-boxed row (no fill/border), a hairline sits below.
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
  },
  selectInfo: { flex: 1 },
  selectValue: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.fg.base,
  },
  selectSub: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.muted,
  },
  // Amount — a functional input kept as a soft, light chip (no heavy box/border).
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.bg.sunken,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
  },
  amountInput: {
    flex: 1,
    fontSize: text.lg,
    ...inter.semibold,
    color: color.fg.base,
    paddingVertical: space.md,
    outlineStyle: 'none',
  } as any,
  amountSymbol: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.fg.muted,
  },
  amountHint: {
    fontSize: text.xs,
    ...inter.regular,
    color: color.fg.subtle,
    marginTop: space.xs,
  },
  sheet: {
    flex: 1,
    backgroundColor: color.bg.base,
    paddingHorizontal: space['2xl'],
    paddingTop: space.md,
  },
  sheetTitle: {
    fontSize: text.xl,
    ...inter.bold,
    color: color.fg.base,
    textAlign: 'center',
    marginBottom: space.lg,
  },
}));
