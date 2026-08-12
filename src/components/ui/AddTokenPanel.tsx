/**
 * AddTokenPanel — the reusable body of the "Add Token" flow (no screen chrome).
 *
 * Two tabs: import an ERC-20 by contract address (auto-detected across every
 * known network via Multicall3), or add a whole custom network. Rendered both
 * as a full screen (AddTokenScreen) and inside a bottom sheet (AddTokenSheet),
 * so it owns the form + logic but NOT the title bar — the host supplies that.
 *
 * `onAdded` fires after a token or network is successfully saved, letting hosts
 * refresh their lists.
 *
 * Neither tab owns rules any more. The ERC-20 tab's state lives in
 * `useManageTokens` (spec 017 `manage_tokens`) and the custom-network tab's in
 * `useAddNetworkTab` (spec 017 `network_admin`) — a Rust machine on web, the
 * same TypeScript as before on native. The panel used to call
 * `checkNetworkCompatibility` and `saveCustomNetwork` itself, which made it a
 * second add-network wizard running beside the core on web; the file below is
 * now rendering only.
 */
import { QRScanner } from '@/components/QRScanner';
import { VelaButton } from '@/components/ui/VelaButton';
import { VelaCard } from '@/components/ui/VelaCard';
import { fadeInDown } from '@/constants/entering';
import { color, createStyles, font, inter, radius, shadow, space, text } from '@/constants/theme';
import { useAddNetworkTab } from '@/hooks/use-add-network-tab';
import type { AddNetworkTabError } from '@/hooks/add-network-tab-types';
import { useManageTokens } from '@/hooks/use-manage-tokens';
import { extractAddress } from '@/models/types';
import { openBrowser } from '@/services/platform';
import { Check, Globe, ScanLine, Trash2, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

type Tab = 'erc20' | 'network';

export function AddTokenPanel({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('erc20');

  // ERC-20 tab — every piece of its state, and the save/delete pipelines.
  const erc20 = useManageTokens(onChanged);
  const [showScanner, setShowScanner] = useState(false);

  // Custom-network tab — likewise. The panel words the failures; the controller
  // only says which one happened, so the copy cannot drift between platforms.
  const net = useAddNetworkTab(onChanged);
  const netChainInfo = net.chainInfo;
  const netCompat = net.compat;
  const wordNetError = (error: AddNetworkTabError): string => {
    switch (error.kind) {
      case 'already_added': return t('addToken.errorAlreadyAdded');
      case 'chain_not_found': return t('addToken.errorChainNotFound');
      case 'not_compatible': return error.detail ?? t('addToken.errorNotCompatible');
      case 'message': return error.text;
    }
  };
  // `null`, never `''` — the JSX below guards on it, and an empty string in a
  // View is a raw text child on native.
  const netError = net.error === null ? null : wordNetError(net.error);

  return (
    <>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Tab switcher */}
        <View style={styles.tabRow}>
          <Pressable style={[styles.tab, tab === 'erc20' && styles.tabActive]} onPress={() => setTab('erc20')}>
            <Text style={[styles.tabText, tab === 'erc20' && styles.tabTextActive]}>{t('addToken.tabErc20')}</Text>
          </Pressable>
          <Pressable style={[styles.tab, tab === 'network' && styles.tabActive]} onPress={() => setTab('network')}>
            <Globe size={14} color={tab === 'network' ? color.accent.base : color.fg.subtle} strokeWidth={2} />
            <Text style={[styles.tabText, tab === 'network' && styles.tabTextActive]}>{t('addToken.tabNative')}</Text>
          </Pressable>
        </View>

        {tab === 'network' ? (
          <>
            <Text style={styles.fieldLabel}>{t('addToken.netSearchLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('addToken.netSearchPlaceholder')}
              placeholderTextColor={color.fg.subtle}
              value={net.query}
              onChangeText={net.search}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {net.searching && <Text style={styles.searchHint}>{t('addToken.netSearching')}</Text>}

            {net.suggestions.length > 0 && (
              <VelaCard style={styles.suggestionsCard}>
                {net.suggestions.map((s, i) => (
                  <React.Fragment key={s.chainId}>
                    {i > 0 && <View style={styles.separator} />}
                    <Pressable style={styles.suggestionRow} onPress={() => net.select(s.chainId)}>
                      <Text style={styles.suggestionName}>{s.name}</Text>
                      <Text style={styles.suggestionChainId}>{t('addToken.chainId', { chainId: s.chainId })}</Text>
                    </Pressable>
                  </React.Fragment>
                ))}
              </VelaCard>
            )}

            {/* Chain info card — shown as soon as chain data is fetched */}
            {netChainInfo && !net.added && (
              <Animated.View entering={fadeInDown(0, 300)}>
                <VelaCard style={styles.resultCard}>
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>{t('addToken.labelName')}</Text>
                    <Text style={styles.resultValue}>{netChainInfo.name}</Text>
                  </View>
                  <View style={styles.separator} />
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>{t('addToken.labelChainId')}</Text>
                    <Text style={styles.resultValue}>{netChainInfo.chainId}</Text>
                  </View>
                  <View style={styles.separator} />
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>{t('addToken.labelNativeToken')}</Text>
                    <Text style={styles.resultValue}>{netChainInfo.nativeSymbol}</Text>
                  </View>
                  <View style={styles.separator} />
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>{t('addToken.labelDecimals')}</Text>
                    <Text style={styles.resultValue}>{netChainInfo.nativeDecimals}</Text>
                  </View>
                  {netChainInfo.explorerURL ? (
                    <>
                      <View style={styles.separator} />
                      <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>{t('addToken.labelExplorer')}</Text>
                        <Pressable onPress={() => openBrowser(netChainInfo.explorerURL)}>
                          <Text style={[styles.resultValue, { color: color.accent.base }]}>{t('addToken.labelExplorerLink')}</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : null}
                  {/* Editable RPC URL */}
                  <View style={styles.separator} />
                  <Text style={[styles.fieldLabel, { marginTop: space.lg }]}>{t('addToken.labelRpcUrl')}</Text>
                  <TextInput
                    style={styles.input}
                    value={netChainInfo.rpcURL}
                    onChangeText={net.setRpcURL}
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://..."
                    placeholderTextColor={color.fg.subtle}
                  />
                </VelaCard>
              </Animated.View>
            )}

            {net.loading && <Text style={styles.searchHint}>{t('addToken.checkingCompat')}</Text>}
            {netError && netCompat && !netCompat.compatible && (
              <Animated.View entering={fadeInDown(0, 300)}>
                <VelaCard elevated style={styles.compatCard}>
                  <Text style={styles.compatTitle}>{t('addToken.compatTitle')}</Text>

                  {/* Contract checklist */}
                  {netCompat.contracts.map((c) => (
                    <View key={c.address} style={styles.compatRow}>
                      {c.deployed ? (
                        <Check size={14} color={color.success.base} strokeWidth={2.5} />
                      ) : (
                        <X size={14} color={color.fg.subtle} strokeWidth={2} />
                      )}
                      <Text style={[styles.compatName, c.deployed && styles.compatNameOk]}>
                        {c.name}
                      </Text>
                    </View>
                  ))}

                  {/* P256 status */}
                  <View style={styles.compatRow}>
                    {netCompat.p256Available ? (
                      <Check size={14} color={color.success.base} strokeWidth={2.5} />
                    ) : (
                      <X size={14} color={color.fg.subtle} strokeWidth={2} />
                    )}
                    <Text style={[styles.compatName, netCompat.p256Available && styles.compatNameOk]}>
                      P256 Precompile (RIP-7212)
                    </Text>
                  </View>

                  {/* Deploy link */}
                  {netChainInfo && (
                    <Pressable
                      style={styles.compatAction}
                      onPress={() => openBrowser(`https://biubiu.tools/apps/vela-wallet-chain-setup?chainId=${netChainInfo.chainId}`)}
                    >
                      <Text style={styles.compatActionText}>{t('addToken.deployContracts')}</Text>
                    </Pressable>
                  )}
                </VelaCard>
              </Animated.View>
            )}
            {netError && !netCompat && <Text style={styles.errorText}>{netError}</Text>}

            {netChainInfo && netCompat?.compatible && (
              <Animated.View entering={fadeInDown(0, 300)}>
                <VelaCard elevated style={styles.resultCard}>
                  <View style={styles.resultHeader}>
                    <Check size={20} color={color.success.base} strokeWidth={2.5} />
                    <Text style={styles.resultTitle}>{t('addToken.compatible')}</Text>
                  </View>
                  {net.added ? (
                    <View style={styles.addedRow}>
                      <Check size={16} color={color.success.base} strokeWidth={2.5} />
                      <Text style={styles.addedText}>{t('addToken.networkAdded')}</Text>
                    </View>
                  ) : (
                    <VelaButton
                      title={t('addToken.addNetworkBtn')}
                      onPress={net.add}
                      variant="accent"
                      loading={net.saving}
                      style={styles.saveBtn}
                    />
                  )}
                </VelaCard>
              </Animated.View>
            )}
          </>
        ) : (
          <>
        {/* ERC-20 tab content — just contract address, auto-detect networks */}
        <Text style={styles.fieldLabel}>{t('addToken.tokenAddressLabel')}</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.inputWithIcon}
            placeholder="0x..."
            placeholderTextColor={color.fg.subtle}
            value={erc20.address}
            onChangeText={erc20.setAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={() => setShowScanner(true)} hitSlop={6} style={styles.scanBtn}>
            <ScanLine size={20} color={color.fg.subtle} strokeWidth={2} />
          </Pressable>
        </View>

        {/* Fetch button */}
        <VelaButton
          title={erc20.detecting ? t('addToken.searchingNetworks') : t('addToken.searchTokenBtn')}
          onPress={erc20.detect}
          disabled={!erc20.addressValid || erc20.detecting}
          loading={erc20.detecting}
          variant="secondary"
          style={styles.fetchBtn}
        />

        {/* Results — one card per network where the token was found */}
        {erc20.found.map((token) => (
          <Animated.View key={token.chainId} entering={fadeInDown(0, 300)}>
            <VelaCard style={styles.resultCard}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('addToken.labelName')}</Text>
                <Text style={styles.resultValue}>{token.name}</Text>
              </View>
              <View style={styles.separator} />
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('addToken.labelSymbol')}</Text>
                <Text style={styles.resultValue}>{token.symbol}</Text>
              </View>
              <View style={styles.separator} />
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('addToken.labelDecimals')}</Text>
                <Text style={styles.resultValue}>{token.decimals}</Text>
              </View>
              <View style={styles.separator} />
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>{t('addToken.labelNetwork')}</Text>
                <Text style={styles.resultValue}>{token.networkName}</Text>
              </View>

              {token.added ? (
                <View style={styles.addedRow}>
                  <Check size={16} color={color.success.base} strokeWidth={2.5} />
                  <Text style={styles.addedText}>{t('addToken.tokenAdded')}</Text>
                </View>
              ) : (
                <VelaButton
                  title={t('addToken.addToWalletBtn')}
                  onPress={() => erc20.save(token.chainId)}
                  variant="accent"
                  loading={erc20.saving}
                  style={styles.saveBtn}
                />
              )}
            </VelaCard>
          </Animated.View>
        ))}

        {/* Already-added custom tokens — manage / remove */}
        {erc20.customTokens.length > 0 && (
          <View style={styles.customSection}>
            <Text style={styles.fieldLabel}>{t('addToken.addedTokensLabel')}</Text>
            {erc20.customTokens.map((ct) => (
              <View key={ct.id} style={styles.customRow}>
                <View style={styles.customInfo}>
                  <Text style={styles.customSymbol} numberOfLines={1}>{ct.symbol}</Text>
                  <Text style={styles.customMeta} numberOfLines={1}>{ct.name} · {ct.networkName}</Text>
                </View>
                <Pressable onPress={() => erc20.remove(ct.id)} hitSlop={8} style={styles.deleteBtn}>
                  <Trash2 size={18} color={color.error.base} strokeWidth={2} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
          </>
        )}
      </ScrollView>

      {showScanner && (
        <QRScanner
          visible={showScanner}
          onScan={(data) => {
            setShowScanner(false);
            // Extract 0x address from QR data (may include ethereum: prefix or extra params)
            const addr = extractAddress(data);
            if (addr) {
              erc20.setAddress(addr);
            }
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}

const styles = createStyles(() => ({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 100,
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    backgroundColor: color.bg.sunken,
    borderRadius: radius.lg,
    padding: 3,
    marginBottom: space.xl,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.md,
  },
  tabActive: {
    backgroundColor: color.bg.raised,
    ...shadow.sm,
  },
  tabText: {
    fontSize: text.sm,
    ...inter.semibold,
    color: color.fg.subtle,
  },
  tabTextActive: {
    color: color.accent.base,
  },

  // Network search
  searchHint: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.subtle,
    marginTop: space.md,
  },
  errorText: {
    fontSize: text.sm,
    ...inter.medium,
    color: color.error.base,
    marginTop: space.md,
  },
  compatCard: {
    padding: space.xl,
    marginTop: space.xl,
  },
  compatTitle: {
    fontSize: text.sm,
    ...inter.semibold,
    color: color.fg.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.8,
    marginBottom: space.lg,
  },
  compatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  compatName: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.subtle,
  },
  compatNameOk: {
    color: color.fg.base,
  },
  compatAction: {
    marginTop: space.xl,
    paddingVertical: space.lg,
    backgroundColor: color.accent.soft,
    borderRadius: radius.lg,
    alignItems: 'center',
  },
  compatActionText: {
    fontSize: text.sm,
    ...inter.semibold,
    color: color.accent.base,
  },
  suggestionsCard: {
    marginTop: space.md,
    overflow: 'hidden' as const,
  },
  suggestionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xl,
    paddingVertical: space.lg,
  },
  suggestionName: {
    fontSize: text.base,
    ...inter.medium,
    color: color.fg.base,
  },
  suggestionChainId: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.subtle,
  },

  fieldLabel: {
    fontSize: text.sm,
    ...inter.semibold,
    color: color.fg.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: space.md,
    marginTop: space['2xl'],
  },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.bg.sunken,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border.base,
  },
  inputWithIcon: {
    flex: 1,
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    fontSize: text.base,
    ...inter.medium,
    fontFamily: font.mono,
    color: color.fg.base,
  },
  scanBtn: {
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
  },
  input: {
    backgroundColor: color.bg.sunken,
    borderRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingVertical: space.xl,
    fontSize: text.base,
    ...inter.medium,
    fontFamily: font.mono,
    color: color.fg.base,
    borderWidth: 1,
    borderColor: color.border.base,
  },
  fetchBtn: {
    marginTop: space.xl,
  },
  resultCard: {
    padding: space['2xl'],
    marginTop: space['3xl'],
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.xl,
  },
  resultTitle: {
    fontSize: text.lg,
    ...inter.bold,
    color: color.success.base,
  },
  resultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space.lg,
  },
  resultLabel: {
    fontSize: text.base,
    ...inter.regular,
    color: color.fg.muted,
  },
  resultValue: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.fg.base,
  },
  separator: {
    height: 1,
    backgroundColor: color.border.base,
  },
  saveBtn: {
    marginTop: space['2xl'],
  },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space['2xl'],
    paddingVertical: space.lg,
  },
  addedText: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.success.base,
  },

  // Manage added custom tokens
  customSection: {
    marginTop: space['3xl'],
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: color.bg.raised,
    borderWidth: 1,
    borderColor: color.border.base,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.lg,
    marginBottom: space.md,
  },
  customInfo: {
    flex: 1,
    gap: 2,
  },
  customSymbol: {
    fontSize: text.base,
    ...inter.semibold,
    color: color.fg.base,
  },
  customMeta: {
    fontSize: text.sm,
    ...inter.regular,
    color: color.fg.muted,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.error.soft,
  },
}));
