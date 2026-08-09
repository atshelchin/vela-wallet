/**
 * Design gallery (dev-only) — every shared component, in every meaningful state,
 * on one scrollable page.
 *
 * Purpose: ground truth for the design-system rebuild. Each instance sits in a
 * labelled cell whose `testID` / web `nativeID` is a stable slug
 * (`gallery-<component>-<state>`), so a screenshot tool can locate and crop each
 * one individually; every SECTION carries `gallery-section-<name>` so a group can
 * be shot at once.
 *
 * Route gate: `__DEV__` OR the hidden `dev_unlocked` flag — the same gate as
 * /clear-signing-test and /receipt-harness, so it also works in a production
 * web/native build once developer mode is unlocked.
 *
 * Rules followed here:
 *   - every component is driven by REAL props read from its source (no faked
 *     internals). Components that cannot render standalone (live signing request,
 *     camera, live pairing, virtualized list-in-list) are NOT faked — they are
 *     listed in NOTES.md under "not gallery-able" with the reason.
 *   - overlays (modals / sheets) can't sit inline, so they get a launcher cell
 *     each; tapping one presents the real overlay full-screen.
 *   - `createStyles()` (never StyleSheet.create), theme tokens only, Pressable,
 *     lucide icons — the repo's own conventions.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

// --- ui/ ---------------------------------------------------------------------
import { AccountSwitcherModal } from '@/components/ui/AccountSwitcherModal';
import { ActivityRow } from '@/components/ui/ActivityRow';
import { AddTokenSheet } from '@/components/ui/AddTokenSheet';
import { AmountText } from '@/components/ui/AmountText';
import { useAppAlert } from '@/components/ui/AppAlert';
import { AppModal } from '@/components/ui/AppModal';
import { AutoGrowTextInput } from '@/components/ui/AutoGrowTextInput';
import { BalanceDetailSheet } from '@/components/ui/BalanceDetailSheet';
import { BrowserHistorySheet } from '@/components/ui/BrowserHistorySheet';
import { BugReportModal } from '@/components/ui/BugReportModal';
import { ConnectionEventDetailSheet } from '@/components/ui/ConnectionEventDetailSheet';
import { CurrencySheet } from '@/components/ui/CurrencySheet';
import { DetailRow, Divider } from '@/components/ui/DetailRow';
import { FeeTokenSelector } from '@/components/ui/FeeTokenSelector';
import { GasFeeCard } from '@/components/ui/GasFeeCard';
import { Identicon } from '@/components/ui/Identicon';
import { IdenticonViewerSheet } from '@/components/ui/IdenticonViewerSheet';
import { NetworkFilterButton, NetworkFilterSheet } from '@/components/ui/NetworkFilterSheet';
import { RpcFixModal, RpcTroubleBanner } from '@/components/ui/RpcTroubleBanner';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import { SlideToConfirmButton } from '@/components/ui/SlideToConfirmButton';
import { TokenRow } from '@/components/ui/TokenRow';
import { TokenSelector } from '@/components/ui/TokenSelector';
import { TransactionDetailSheet } from '@/components/ui/TransactionDetailSheet';
import { TransactionReceipt, type ReceiptTransfer } from '@/components/ui/TransactionReceipt';
import { TreasuryBootstrapSheet } from '@/components/ui/TreasuryBootstrapSheet';
import { TxStatusBadge } from '@/components/ui/TxStatusBadge';
import { VelaButton } from '@/components/ui/VelaButton';
import { VelaCard } from '@/components/ui/VelaCard';
import { WalletAvatar } from '@/components/ui/WalletAvatar';
import { WaveDock } from '@/components/ui/WaveDock';
import { Collapsible } from '@/components/ui/collapsible';

// --- domain ------------------------------------------------------------------
import { ChainLogo } from '@/components/ChainLogo';
import { QRCode } from '@/components/QRCode';
import { ReceiveRequestControls } from '@/components/ReceiveRequestControls';
import { ReceiveShareCard } from '@/components/ReceiveShareCard';
import { TokenLogo } from '@/components/TokenLogo';
import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { ContactPicker } from '@/components/contacts/ContactPicker';
import { ContactsManager } from '@/components/contacts/ContactsManager';
import { GroupEditor } from '@/components/contacts/GroupEditor';
import { RecipientName } from '@/components/contacts/RecipientName';
import { RecipientTrust } from '@/components/contacts/RecipientTrust';
import { RecipientTypeBadge } from '@/components/contacts/RecipientTypeBadge';

import { BatchImportSheet } from '@/components/send/BatchImportSheet';
import { ConfirmAssets } from '@/components/send/ConfirmAssets';
import { FlowArrow as SendFlowArrow } from '@/components/send/FlowArrow';
import { MultiRecipientEditor } from '@/components/send/MultiRecipientEditor';

import { AdvancedPanel } from '@/components/signing/AdvancedPanel';
import { BalanceChangePreview } from '@/components/signing/BalanceChangePreview';
import { ContractBar } from '@/components/signing/ContractBar';
import { DAppBanner, SigningAccountRow } from '@/components/signing/DAppBanner';
import { EditableApproveCard } from '@/components/signing/EditableApproveCard';
import { IntentHeader } from '@/components/signing/IntentHeader';
import { SummaryLine } from '@/components/signing/SummaryLine';
import { FlowArrow as SigningFlowArrow, TokenCard } from '@/components/signing/TokenCard';
import { GenericFieldRow, WarningBanner } from '@/components/signing/WarningBanner';
import { SigningChainContext, intentColor } from '@/components/signing/signing-core';
import { ApprovalView } from '@/components/signing/views/ApprovalView';
import { BatchCallsView, type BatchItem } from '@/components/signing/views/BatchCallsView';
import { BlindTransactionView } from '@/components/signing/views/BlindTransactionView';
import { BlindTypedDataView } from '@/components/signing/views/BlindTypedDataView';
import { ClearSignView } from '@/components/signing/views/ClearSignView';
import { EthSignDangerView } from '@/components/signing/views/EthSignDangerView';
import { MessageSignView } from '@/components/signing/views/MessageSignView';
import { PermitSignView } from '@/components/signing/views/PermitSignView';

// --- models / services (fixture types only) ----------------------------------
import { color, createStyles, font, inter, radius, space, text } from '@/constants/theme';
import { chainName, nativeCoinLogoURL, networkForChainId, networkId, type Network } from '@/models/network';
import { tokenLogoURLsByAddress, type APIToken } from '@/models/types';
import type { ActivityBatch } from '@/services/activity';
import type { ApprovalChoice, DetectedApproval } from '@/services/approval-guard';
import type { TreasuryStatus } from '@/services/bundler-service';
import type { ClearSignField, ClearSignResult } from '@/services/clear-signing';
import type { Currency } from '@/services/currency';
import type { AssetSimResult } from '@/services/tx-simulation';
import type { FeeTokenOption } from '@/hooks/use-inband-fee-tokens';
import type { LocalTransaction } from '@/services/storage';

// =============================================================================
// Fixtures — realistic Vela content (real chains, plausible balances, real
// contract addresses). Nothing here talks to the network unless the component
// itself does.
// =============================================================================

const ME = '0x14fB1f3d2b7c9a1E5f4c0a8B2d6E9f0a1D1eA5c0';
const FRIEND = '0x600746aC1234567890abcDef1234567890f495f4';
const VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
/** PancakeSwap V3 SmartRouter (BNB Chain) — a real, verifiable contract. */
const ROUTER = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4';
const USDC_BSC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const TX_HASH = '0xd41d8cd98f00b204e9800998ecf8427e1234567890abcdef1234567890a01243';
const UOP_HASH = '0xa11ce0000000000000000000000000000000000000000000000000000000dead';
const RELAY = '0x2f5a1B0000000000000000000000000000000042';

const ETH = networkForChainId(1) as Network;
const BNB = networkForChainId(56) as Network;
const GNOSIS = networkForChainId(100) as Network;
const BASE = networkForChainId(8453) as Network;
const ARBITRUM = networkForChainId(42161) as Network;
const TEMPO = networkForChainId(4217) as Network;

const USD: Currency = { code: 'USD', symbol: '$', name: 'US Dollar' };
const usdcLogos = tokenLogoURLsByAddress(56, USDC_BSC);
const usdtLogos = tokenLogoURLsByAddress(56, USDT_BSC);
const NOW = Math.floor(Date.now() / 1000);

/** ASCII string → 0x-hex (personal_sign payloads). */
function hexOf(s: string): string {
  return '0x' + Array.from(s).map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

const tokUSDC: APIToken = {
  network: networkId(56), chainName: chainName(56), symbol: 'USDC', balance: '1240.00',
  decimals: 18, logo: null, name: 'USD Coin', tokenAddress: USDC_BSC, priceUsd: 1, spam: false,
};
const tokUSDT: APIToken = {
  network: networkId(56), chainName: chainName(56), symbol: 'USDT', balance: '318.4029',
  decimals: 18, logo: null, name: 'Tether USD', tokenAddress: USDT_BSC, priceUsd: 1, spam: false,
};
const tokBNB: APIToken = {
  network: networkId(56), chainName: chainName(56), symbol: 'BNB', balance: '0.0038',
  decimals: 18, logo: null, name: 'BNB', tokenAddress: null, priceUsd: 612.4, spam: false,
};
const tokXDAI: APIToken = {
  network: networkId(100), chainName: chainName(100), symbol: 'XDAI', balance: '0.996',
  decimals: 18, logo: null, name: 'xDAI', tokenAddress: null, priceUsd: 1, spam: false,
};
const tokUnpriced: APIToken = {
  network: networkId(42161), chainName: chainName(42161), symbol: 'ARB', balance: '52.0',
  decimals: 18, logo: null, name: 'Arbitrum', tokenAddress: '0x912CE59144191C1204E64559FE8253a0e49E6548',
  priceUsd: null, spam: false,
};
const GALLERY_TOKENS: APIToken[] = [tokUSDC, tokUSDT, tokBNB, tokXDAI, tokUnpriced];

const feeOptNative: FeeTokenOption = {
  asset: 'native', symbol: 'BNB', contract: null, balance: 0n, decimals: 18,
  recipient: RELAY, usdBalance: '0', usdPrice: '612.40', logoUrls: [nativeCoinLogoURL(56)],
};
const feeOptUSDC: FeeTokenOption = {
  asset: 'erc20', symbol: 'USDC', contract: USDC_BSC, balance: 1_240_000000000000000000n, decimals: 18,
  recipient: RELAY, usdBalance: '1240.00', usdPrice: '1', logoUrls: usdcLogos,
};
const feeOptUSDT: FeeTokenOption = {
  asset: 'erc20', symbol: 'USDT', contract: USDT_BSC, balance: 318_402900000000000000n, decimals: 18,
  recipient: RELAY, usdBalance: '318.40', usdPrice: '1', logoUrls: usdtLogos,
};
const FEE_OPTIONS = [feeOptNative, feeOptUSDC, feeOptUSDT];
/** Fixed per-asset cost for this "transaction" — native 0.00048 BNB, stables ≈ $0.48. */
const feeAmountFor = (o: FeeTokenOption): bigint | null =>
  o.asset === 'native' ? 480000000000000n : 480000000000000000n;

const txSend: LocalTransaction = {
  id: 'gallery-send-1', userOpHash: UOP_HASH, txHash: TX_HASH, from: ME, to: FRIEND,
  toName: 'Samuel', value: '0.0038', symbol: 'BNB', decimals: 18, logoUrls: [nativeCoinLogoURL(56)],
  chainId: 56, timestamp: NOW - 640, status: 'confirmed', type: 'send', usd: '$2.33',
};
const txSignature: LocalTransaction = {
  id: 'gallery-sig-1', userOpHash: '', txHash: '', from: ME, to: '', value: '0', symbol: '',
  decimals: 18, chainId: 1, timestamp: NOW - 3600, status: 'confirmed', type: 'sign_message',
  dappOrigin: 'app.uniswap.org',
  signedContent: 'app.uniswap.org wants you to sign in with your Ethereum account.',
};
const batchSplit: ActivityBatch = {
  kind: 'split', count: 3, totalUsd: 30, from: ME, chainId: 56, timestamp: NOW - 900,
  status: 'confirmed', txHash: TX_HASH, userOpHash: UOP_HASH, symbol: 'USDC', logoUrls: usdcLogos,
  ids: ['a', 'b', 'c'],
  transfers: [
    { to: '0xAAaA000000000000000000000000000000000001', toName: 'Alice', value: '10', symbol: 'USDC', decimals: 18, usdValue: 10, logoUrls: usdcLogos },
    { to: '0xBBbB000000000000000000000000000000000002', toName: 'Bob', value: '10', symbol: 'USDC', decimals: 18, usdValue: 10, logoUrls: usdcLogos },
    { to: FRIEND, toName: 'Samuel', value: '10', symbol: 'USDC', decimals: 18, usdValue: 10, logoUrls: usdcLogos },
  ],
};
const receiptTransfers: ReceiptTransfer[] = [
  { to: FRIEND, toName: 'Samuel', amount: '6', symbol: 'USDC', logoUrls: usdcLogos, usdValue: 6 },
  { to: FRIEND, toName: 'Samuel', amount: '5.7249', symbol: 'USDT', logoUrls: usdtLogos, usdValue: 5.72 },
];

const treasuryLow: TreasuryStatus = {
  chainId: 100, address: RELAY, asset: 'native', balance: 2_000000000000000n,
  floor: 50_000000000000000n, bootstrapNeeded: true,
};

// --- simulation results ------------------------------------------------------
const simSwap: AssetSimResult = {
  ok: true, engine: 'rpc',
  changes: [
    { kind: 'erc20', token: USDC_BSC.toLowerCase(), delta: -1000_000000000000000000n, symbol: 'USDC', decimals: 18 },
    { kind: 'native', delta: 310000000000000000n, symbol: 'BNB', decimals: 18 },
  ],
};
const simRevert: AssetSimResult = {
  ok: false, engine: 'rpc', changes: null, revertReason: 'ERC20: transfer amount exceeds balance',
};
const simNoChange: AssetSimResult = { ok: true, engine: 'rpc', changes: [] };
const simDegraded: AssetSimResult = { ok: true, engine: 'none', changes: null };
const simUnverified: AssetSimResult = {
  ok: true, engine: 'rpc',
  changes: [{ kind: 'erc20', token: '0xdead00000000000000000000000000000000beef', delta: 1n, symbol: 'ETHG', unverified: true }],
};
const simUnderfunded: AssetSimResult = {
  ok: true, engine: 'rpc', underfundedNative: true,
  changes: [{ kind: 'native', delta: -5_000000000000000000n, symbol: 'BNB', decimals: 18 }],
};

// --- clear-signing fields ----------------------------------------------------
const fieldSend: ClearSignField = {
  label: 'Amount', value: '1,000 USDC', format: 'tokenAmount', tokenAddress: USDC_BSC,
  role: 'send-amount', usdValue: 1000,
};
const fieldReceive: ClearSignField = {
  label: 'Minimum received', value: '0.31 BNB', format: 'amount', role: 'receive-amount', usdValue: 189.84,
};
const fieldDanger: ClearSignField = {
  label: 'Approve amount', value: 'Unlimited USDC', format: 'tokenAmount', tokenAddress: USDC_BSC,
  warning: true, role: 'spender',
};
const fieldGeneric: ClearSignField = { label: 'Slippage', value: '0.5%', format: 'raw' };
const fieldExpired: ClearSignField = { label: 'Deadline', value: '12 Jul 2026, 09:41', format: 'date', expired: true, warning: true };

const csSwap: ClearSignResult = {
  intent: 'Swap', contractName: 'PancakeSwap V3 SmartRouter', owner: 'PancakeSwap',
  contractAddress: ROUTER, verified: true, type: 'transaction', risk: 'normal',
  fields: [fieldSend, fieldReceive, fieldGeneric],
};
const csBestEffort: ClearSignResult = {
  intent: 'Deposit', contractAddress: ROUTER, verified: false, type: 'transaction', risk: 'caution',
  bestEffort: true, fields: [fieldSend, fieldGeneric],
};

// --- approvals ---------------------------------------------------------------
const approvalUnlimited: DetectedApproval = {
  kind: 'erc20-approve', tokenAddress: USDC_BSC, spender: ROUTER,
  amountRaw: (1n << 256n) - 1n, amountBits: 256, isUnbounded: true, isBooleanGrant: false,
  isReducing: false, editable: true, locus: { type: 'calldata-word', wordIndex: 1 },
};
const approvalFinite: DetectedApproval = {
  kind: 'erc20-approve', tokenAddress: USDC_BSC, spender: ROUTER,
  amountRaw: 500_000000000000000000n, amountBits: 256, isUnbounded: false, isBooleanGrant: false,
  isReducing: false, editable: true, locus: { type: 'calldata-word', wordIndex: 1 },
};
const approvalNft: DetectedApproval = {
  kind: 'setApprovalForAll', tokenAddress: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D', spender: ROUTER,
  isUnbounded: true, isBooleanGrant: true, isReducing: false, editable: true,
  locus: { type: 'calldata-word', wordIndex: 1 },
};
const approvalPermit: DetectedApproval = {
  kind: 'erc2612-permit', tokenAddress: USDT_BSC, spender: ROUTER,
  amountRaw: 250_000000000000000000n, amountBits: 256, isUnbounded: false, isBooleanGrant: false,
  isReducing: false, editable: false, blockReason: 'signature-bound',
  deadline: BigInt(NOW + 3600), locus: { type: 'typed-path', path: 'message.value' },
};
const approvalLocked: DetectedApproval = {
  kind: 'erc20-approve', tokenAddress: USDT_BSC, spender: ROUTER,
  amountRaw: (1n << 256n) - 1n, amountBits: 256, isUnbounded: true, isBooleanGrant: false,
  isReducing: false, editable: false, blockReason: 'unrecognized-encoding',
  locus: { type: 'calldata-word', wordIndex: 1 },
};
const tokenMeta = { symbol: 'USDC', decimals: 18, verified: true };
const batchItems: BatchItem[] = [
  { to: USDC_BSC, clearSign: null, approval: approvalUnlimited },
  { to: ROUTER, clearSign: csSwap, approval: null },
];

const SIWE = [
  'app.uniswap.org wants you to sign in with your Ethereum account:',
  ME,
  '',
  'Sign in to Uniswap. This request will not trigger a blockchain transaction.',
  '',
  'URI: https://app.uniswap.org',
  'Version: 1',
  'Chain ID: 1',
  'Nonce: 8f2a41cd',
].join('\n');

const TYPED_DATA = JSON.stringify({
  domain: { name: 'Permit2', chainId: 56, verifyingContract: ROUTER },
  primaryType: 'PermitSingle',
  message: { details: { token: USDC_BSC, amount: '1000000000', expiration: 1799999999 }, spender: ROUTER },
});

// =============================================================================
// Cell / Section scaffolding
// =============================================================================

type CellProps = {
  /** Stable slug — also the testID and the web DOM id. */
  id: string;
  /** `<ComponentName> · <state description>` */
  label: string;
  children: React.ReactNode;
  /** Fixed height for full-surface components that expect a screen (flex: 1). */
  height?: number;
  /** Block touches — used for surfaces that contain their own scroller. */
  inert?: boolean;
  /** Paint the cell on `bg.raised` (for components designed to sit on a card). */
  raised?: boolean;
};

function Cell({ id, label, children, height, inert, raised }: CellProps) {
  return (
    <View style={styles.cell} testID={id} nativeID={id}>
      <Text style={styles.cellLabel}>{label}</Text>
      <View
        style={[styles.cellBody, raised && styles.cellBodyRaised, height ? { height } : null]}
        pointerEvents={inert ? 'none' : 'auto'}
      >
        {children}
      </View>
    </View>
  );
}

function Section({ id, title, subtitle, onMeasure, children }: {
  id: string;
  title: string;
  subtitle?: string;
  onMeasure: (id: string, y: number) => void;
  children: React.ReactNode;
}) {
  return (
    <View
      style={styles.section}
      testID={`gallery-section-${id}`}
      nativeID={`gallery-section-${id}`}
      onLayout={(e) => onMeasure(id, e.nativeEvent.layout.y)}
    >
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

/** Launcher for an overlay that cannot render inline. */
function Launcher({ id, label, onPress }: { id: string; label: string; onPress: () => void }) {
  return (
    <Cell id={id} label={label}>
      <Pressable style={styles.launcher} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
        <Text style={styles.launcherText}>Open ▸</Text>
      </Pressable>
    </Cell>
  );
}

const SECTIONS: { id: string; title: string }[] = [
  { id: 'buttons', title: 'Buttons & commit controls' },
  { id: 'typography', title: 'Typography & status' },
  { id: 'rows', title: 'Cards, rows & list items' },
  { id: 'identity', title: 'Identity, logos & codes' },
  { id: 'controls', title: 'Controls & inputs' },
  { id: 'feedback', title: 'Banners, warnings & simulation' },
  { id: 'fees', title: 'Fees' },
  { id: 'send', title: 'Send flow' },
  { id: 'signing', title: 'Signing surface' },
  { id: 'surfaces', title: 'Full surfaces' },
  { id: 'overlays', title: 'Overlays (modals & sheets)' },
];

type OverlayKey =
  | 'appmodal' | 'appmodal-fit' | 'currency' | 'network' | 'txdetail' | 'txdetail-batch'
  | 'connevent' | 'balance' | 'identicon' | 'history' | 'bug' | 'addtoken' | 'treasury'
  | 'rpcfix' | 'contactpicker' | 'contacts' | 'batchimport' | 'accounts';

// =============================================================================
// Screen
// =============================================================================

function DesignGalleryScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const measure = (id: string, y: number) => { offsets.current[id] = y; };
  const jump = (id: string) => scrollRef.current?.scrollTo({ y: Math.max(0, (offsets.current[id] ?? 0) - 8), animated: true });

  const showAlert = useAppAlert();
  const [overlay, setOverlay] = useState<OverlayKey | null>(null);
  const close = () => setOverlay(null);

  // Live-state demos (a gallery still has to drive controlled components).
  const [tab, setTab] = useState<'activity' | 'assets' | 'connections'>('activity');
  const [autoGrow, setAutoGrow] = useState('0x600746aC1234567890abcDef1234567890f495f4');
  const [feeSel, setFeeSel] = useState<string | null>(USDC_BSC);
  const [approveChoice, setApproveChoice] = useState<ApprovalChoice | null>(null);
  const [batchChoices, setBatchChoices] = useState<Record<number, ApprovalChoice | null>>({});
  const [recipients, setRecipients] = useState<React.ComponentProps<typeof MultiRecipientEditor>['recipients']>([
    { id: 'r1', address: VITALIK, amount: '25' },
    { id: 'r2', address: FRIEND, amount: '25' },
    { id: 'r3', address: '0xnot-an-address', amount: '' },
  ]);
  const [sweepSel, setSweepSel] = useState<Set<string>>(new Set());

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Index / legend                                                    */}
        {/* ---------------------------------------------------------------- */}
        <View style={styles.legend} testID="gallery-index" nativeID="gallery-index">
          <Text style={styles.legendTitle}>Vela design gallery</Text>
          <Text style={styles.legendSub}>
            Every shared component in every meaningful state. Cell slug = testID = web id.
          </Text>
          <View style={styles.legendChips}>
            {SECTIONS.map((s) => (
              <Pressable key={s.id} style={styles.legendChip} onPress={() => jump(s.id)} accessibilityRole="button">
                <Text style={styles.legendChipText}>{s.title}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ================================================================ */}
        <Section id="buttons" title="Buttons & commit controls" onMeasure={measure}>
          <Cell id="gallery-velabutton-primary-default" label="VelaButton · variant=primary size=default state=default">
            <VelaButton title="Continue" onPress={() => {}} />
          </Cell>
          <Cell id="gallery-velabutton-primary-disabled" label="VelaButton · variant=primary size=default state=disabled">
            <VelaButton title="Continue" onPress={() => {}} disabled />
          </Cell>
          <Cell id="gallery-velabutton-primary-loading" label="VelaButton · variant=primary size=default state=loading">
            <VelaButton title="Continue" onPress={() => {}} loading />
          </Cell>
          <Cell id="gallery-velabutton-accent-default" label="VelaButton · variant=accent size=default state=default">
            <VelaButton title="Confirm & Send" onPress={() => {}} variant="accent" />
          </Cell>
          <Cell id="gallery-velabutton-accent-disabled" label="VelaButton · variant=accent size=default state=disabled">
            <VelaButton title="Confirm & Send" onPress={() => {}} variant="accent" disabled />
          </Cell>
          <Cell id="gallery-velabutton-accent-loading" label="VelaButton · variant=accent size=default state=loading">
            <VelaButton title="Confirm & Send" onPress={() => {}} variant="accent" loading />
          </Cell>
          <Cell id="gallery-velabutton-secondary-default" label="VelaButton · variant=secondary size=default state=default">
            <VelaButton title="Cancel" onPress={() => {}} variant="secondary" />
          </Cell>
          <Cell id="gallery-velabutton-secondary-disabled" label="VelaButton · variant=secondary size=default state=disabled">
            <VelaButton title="Cancel" onPress={() => {}} variant="secondary" disabled />
          </Cell>
          <Cell id="gallery-velabutton-secondary-loading" label="VelaButton · variant=secondary size=default state=loading">
            <VelaButton title="Cancel" onPress={() => {}} variant="secondary" loading />
          </Cell>
          <Cell id="gallery-velabutton-primary-compact" label="VelaButton · variant=primary size=compact">
            <VelaButton title="Scan again" onPress={() => {}} compact style={{ alignSelf: 'flex-start' }} />
          </Cell>
          <Cell id="gallery-velabutton-accent-compact" label="VelaButton · variant=accent size=compact">
            <VelaButton title="Retry" onPress={() => {}} variant="accent" compact style={{ alignSelf: 'flex-start' }} />
          </Cell>
          <Cell id="gallery-velabutton-secondary-compact" label="VelaButton · variant=secondary size=compact">
            <VelaButton title="Not now" onPress={() => {}} variant="secondary" compact style={{ alignSelf: 'flex-start' }} />
          </Cell>

          <Cell id="gallery-slidetoconfirm-idle" label="SlideToConfirmButton · state=idle">
            <SlideToConfirmButton title="Confirm & Send" hint="Slide to confirm" onConfirm={() => {}} />
          </Cell>
          <Cell id="gallery-slidetoconfirm-disabled" label="SlideToConfirmButton · state=disabled">
            <SlideToConfirmButton title="Confirm & Send" hint="Slide to confirm" onConfirm={() => {}} disabled />
          </Cell>
          <Cell id="gallery-slidetoconfirm-loading" label="SlideToConfirmButton · state=loading (knob parked at end)">
            <SlideToConfirmButton title="Sending…" hint="Slide to confirm" onConfirm={() => {}} loading />
          </Cell>
        </Section>

        {/* ================================================================ */}
        <Section id="typography" title="Typography & status" onMeasure={measure}>
          <Cell id="gallery-sectionlabel-default" label="SectionLabel · default">
            <SectionLabel>Account</SectionLabel>
          </Cell>

          <Cell id="gallery-amounttext-value-hero" label="AmountText · value mode size=40 showDecimals">
            <AmountText value={1240.5} symbol="$" size={40} style={styles.amountInk} />
          </Cell>
          <Cell id="gallery-amounttext-value-symbolscale" label="AmountText · value mode symbolScale=0.5 (subordinated $)">
            <AmountText value={1240.5} symbol="$" symbolScale={0.5} size={40} style={styles.amountInk} />
          </Cell>
          <Cell id="gallery-amounttext-value-nodecimals" label="AmountText · value mode showDecimals=false">
            <AmountText value={1240.5} symbol="$" size={40} showDecimals={false} style={styles.amountInk} />
          </Cell>
          <Cell id="gallery-amounttext-value-compactfloor" label="AmountText · value mode compact fallback (12,400,500.89 in a narrow box)">
            <View style={{ width: 140 }}>
              <AmountText value={12400500.89} symbol="$" size={40} style={styles.amountInk} />
            </View>
          </Cell>
          <Cell id="gallery-amounttext-value-negative" label="AmountText · value mode negative">
            <AmountText value={-38.4} symbol="$" size={32} style={styles.amountInk} />
          </Cell>
          <Cell id="gallery-amounttext-text-unit" label="AmountText · text mode + unit (pre-formatted crypto)">
            <AmountText text="0.996" unit="XDAI" size={32} style={styles.amountInk} />
          </Cell>
          <Cell id="gallery-amounttext-text-multiline" label="AmountText · text mode maxLines=2">
            <View style={{ width: 160 }}>
              <AmountText text="1,240.0000384" unit="USDC" size={28} maxLines={2} style={styles.amountInk} />
            </View>
          </Cell>

          <Cell id="gallery-txstatusbadge-pending" label="TxStatusBadge · status=pending">
            <TxStatusBadge status="pending" />
          </Cell>
          <Cell id="gallery-txstatusbadge-confirmed" label="TxStatusBadge · status=confirmed">
            <TxStatusBadge status="confirmed" />
          </Cell>
          <Cell id="gallery-txstatusbadge-failed" label="TxStatusBadge · status=failed">
            <TxStatusBadge status="failed" />
          </Cell>

          <Cell id="gallery-themedtext-default" label="ThemedText · type=default">
            <ThemedText>Send 1,240.00 USDC to Samuel</ThemedText>
          </Cell>
          <Cell id="gallery-themedtext-title" label="ThemedText · type=title">
            <ThemedText type="title">Vela Wallet</ThemedText>
          </Cell>
          <Cell id="gallery-themedtext-subtitle" label="ThemedText · type=subtitle">
            <ThemedText type="subtitle">Networks</ThemedText>
          </Cell>
          <Cell id="gallery-themedtext-small" label="ThemedText · type=small">
            <ThemedText type="small">Updated 2m ago</ThemedText>
          </Cell>
          <Cell id="gallery-themedtext-smallbold" label="ThemedText · type=smallBold">
            <ThemedText type="smallBold">0.0038 BNB</ThemedText>
          </Cell>
          <Cell id="gallery-themedtext-link" label="ThemedText · type=link">
            <ThemedText type="link">View on explorer</ThemedText>
          </Cell>
          <Cell id="gallery-themedtext-linkprimary" label="ThemedText · type=linkPrimary">
            <ThemedText type="linkPrimary">Open getvela.app</ThemedText>
          </Cell>
          <Cell id="gallery-themedtext-code" label="ThemedText · type=code">
            <ThemedText type="code">{ME}</ThemedText>
          </Cell>
        </Section>

        {/* ================================================================ */}
        <Section id="rows" title="Cards, rows & list items" onMeasure={measure}>
          <Cell id="gallery-velacard-default" label="VelaCard · default (bordered)">
            <VelaCard style={{ padding: space.xl }}>
              <Text style={styles.filler}>Gas is paid in the stablecoin you already hold.</Text>
            </VelaCard>
          </Cell>
          <Cell id="gallery-velacard-elevated" label="VelaCard · elevated">
            <VelaCard elevated style={{ padding: space.xl }}>
              <Text style={styles.filler}>Gas is paid in the stablecoin you already hold.</Text>
            </VelaCard>
          </Cell>

          <Cell id="gallery-detailrow-plain" label="DetailRow · plain value">
            <DetailRow label="Network" value="BNB Chain" />
          </Cell>
          <Cell id="gallery-detailrow-mono" label="DetailRow · mono value">
            <DetailRow label="To" value="0x6007…95f4" mono />
          </Cell>
          <Cell id="gallery-detailrow-copy-idle" label="DetailRow · onCopy state=idle">
            <DetailRow label="Address" value="0x14fB…A5c0" mono onCopy={() => {}} actionHint="Copy address" />
          </Cell>
          <Cell id="gallery-detailrow-copy-copied" label="DetailRow · onCopy state=copied">
            <DetailRow label="Address" value="0x14fB…A5c0" mono onCopy={() => {}} copied actionHint="Copy address" />
          </Cell>
          <Cell id="gallery-detailrow-open" label="DetailRow · onOpen (explorer)">
            <DetailRow label="Transaction" value="0xd41d…1243" mono onOpen={() => {}} actionHint="Open in explorer" />
          </Cell>
          <Cell id="gallery-detailrow-custom" label="DetailRow · custom value node">
            <DetailRow label="Status" custom={<TxStatusBadge status="confirmed" />} />
          </Cell>
          <Cell id="gallery-divider-default" label="Divider · default (1px hairline)">
            <Divider />
          </Cell>

          <Cell id="gallery-tokenrow-default" label="TokenRow · default (balance + fiat)">
            <TokenRow symbol="USDC" chainLabel="BNB Chain" logoUrls={usdcLogos} chain={BNB} balance="1,240.00" usdValue="$1,240.00" onPress={() => {}} />
          </Cell>
          <Cell id="gallery-tokenrow-native" label="TokenRow · native coin (no contract row)">
            <TokenRow symbol="XDAI" chainLabel="Gnosis" chain={GNOSIS} balance="0.996" usdValue="$1.00" onPress={() => {}} />
          </Cell>
          <Cell id="gallery-tokenrow-contract" label="TokenRow · contractAddress (copy chip)">
            <TokenRow symbol="USDT" chainLabel="BNB Chain" logoUrls={usdtLogos} chain={BNB} contractAddress={USDT_BSC} balance="318.4029" usdValue="$318.40" onPress={() => {}} />
          </Cell>
          <Cell id="gallery-tokenrow-masked" label="TokenRow · masked=true (privacy dots)">
            <TokenRow symbol="USDC" chainLabel="BNB Chain" logoUrls={usdcLogos} chain={BNB} balance="1,240.00" masked onPress={() => {}} />
          </Cell>
          <Cell id="gallery-tokenrow-nofiat" label="TokenRow · no usdValue (unpriced token)">
            <TokenRow symbol="ARB" chainLabel="Arbitrum" chain={ARBITRUM} balance="52.0" onPress={() => {}} />
          </Cell>
          <Cell id="gallery-tokenrow-selected-off" label="TokenRow · selected=false (checkbox off)">
            <TokenRow symbol="USDC" chainLabel="BNB Chain" logoUrls={usdcLogos} chain={BNB} balance="1,240.00" usdValue="$1,240.00" selected={false} onPress={() => {}} />
          </Cell>
          <Cell id="gallery-tokenrow-selected-on" label="TokenRow · selected=true (checkbox on)">
            <TokenRow symbol="USDC" chainLabel="BNB Chain" logoUrls={usdcLogos} chain={BNB} balance="1,240.00" usdValue="$1,240.00" selected onPress={() => {}} />
          </Cell>

          <Cell id="gallery-activityrow-out" label="ActivityRow · direction=out">
            <ActivityRow direction="out" title="Sent" subtitle="0x6007…95f4" amount="−0.0038 BNB" fiat="$2.33" time="2h ago" chain={BNB} onPress={() => {}} />
          </Cell>
          <Cell id="gallery-activityrow-in" label="ActivityRow · direction=in">
            <ActivityRow direction="in" title="Received" subtitle="0xd8dA…6045" amount="+1,240.00 USDC" fiat="$1,240.00" time="Yesterday" chain={GNOSIS} onPress={() => {}} />
          </Cell>
          <Cell id="gallery-activityrow-in-new" label="ActivityRow · direction=in isNew (arrival glow)">
            <ActivityRow direction="in" title="Received" subtitle="0xd8dA…6045" amount="+12.50 XDAI" fiat="$12.50" time="Just now" chain={GNOSIS} isNew onPress={() => {}} />
          </Cell>
          <Cell id="gallery-activityrow-masked" label="ActivityRow · masked=true">
            <ActivityRow direction="out" title="Sent" subtitle="0x6007…95f4" amount="−0.0038 BNB" masked time="2h ago" chain={BNB} onPress={() => {}} />
          </Cell>
          <Cell id="gallery-activityrow-nochain-notime" label="ActivityRow · no chain badge, no time (date-grouped feed)">
            <ActivityRow direction="out" title="Swapped" subtitle="PancakeSwap" amount="−1,000 USDC" fiat="$1,000.00" />
          </Cell>
          <Cell id="gallery-activityrow-static" label="ActivityRow · no onPress (non-interactive)">
            <ActivityRow direction="in" title="Received" subtitle="0xd8dA…6045" amount="+0.31 BNB" fiat="$189.84" time="3d ago" chain={BNB} />
          </Cell>
        </Section>

        {/* ================================================================ */}
        <Section id="identity" title="Identity, logos & codes" onMeasure={measure}>
          <Cell id="gallery-identicon-40" label="Identicon · size=40">
            <Identicon seed={ME} size={40} />
          </Cell>
          <Cell id="gallery-identicon-88" label="Identicon · size=88">
            <Identicon seed={ME} size={88} />
          </Cell>
          <Cell id="gallery-identicon-seeds" label="Identicon · size=44 three different seeds">
            <View style={styles.rowWrap}>
              <Identicon seed={ME} size={44} />
              <Identicon seed={FRIEND} size={44} />
              <Identicon seed={VITALIK} size={44} />
            </View>
          </Cell>

          <Cell id="gallery-walletavatar-40" label="WalletAvatar · size=40 (avatar-style pref decides letter vs identicon)">
            <WalletAvatar name="Main account" address={ME} size={40} />
          </Cell>
          <Cell id="gallery-walletavatar-64-enlargeable" label="WalletAvatar · size=64 enlargeable">
            <WalletAvatar name="Main account" address={ME} size={64} enlargeable />
          </Cell>
          <Cell id="gallery-walletavatar-noaddress" label="WalletAvatar · no address (letter fallback)">
            <WalletAvatar name="Vela" size={40} />
          </Cell>

          <Cell id="gallery-contactavatar-person" label="ContactAvatar · kind=undefined (person)">
            <ContactAvatar name="Samuel" address={FRIEND} size={40} />
          </Cell>
          <Cell id="gallery-contactavatar-account" label="ContactAvatar · kind=account (wallet badge)">
            <ContactAvatar name="My other wallet" address={ME} kind="account" size={40} />
          </Cell>
          <Cell id="gallery-contactavatar-sizes" label="ContactAvatar · sizes 18 / 28 / 36 / 56">
            <View style={styles.rowWrap}>
              <ContactAvatar name="Alice" address={VITALIK} size={18} />
              <ContactAvatar name="Alice" address={VITALIK} size={28} />
              <ContactAvatar name="Alice" address={VITALIK} size={36} />
              <ContactAvatar name="Alice" address={VITALIK} size={56} />
            </View>
          </Cell>
          <Cell id="gallery-contactavatar-partial" label="ContactAvatar · partial address (tinted initial, no identicon)">
            <ContactAvatar name="Bob" address="0x600" size={40} />
          </Cell>

          <Cell id="gallery-chainlogo-remote" label="ChainLogo · logoURL set size=32 (Ethereum / BNB / Gnosis / Base / Arbitrum / Tempo)">
            <View style={styles.rowWrap}>
              {[ETH, BNB, GNOSIS, BASE, ARBITRUM, TEMPO].map((n) => (
                <ChainLogo key={n.chainId} label={n.iconLabel} color={n.iconColor} bgColor={n.iconBg} logoURL={n.logoURL} size={32} />
              ))}
            </View>
          </Cell>
          <Cell id="gallery-chainlogo-fallback" label="ChainLogo · no logoURL (label fallback) size=32">
            <View style={styles.rowWrap}>
              {[ETH, BNB, GNOSIS, TEMPO].map((n) => (
                <ChainLogo key={n.chainId} label={n.iconLabel} color={n.iconColor} bgColor={n.iconBg} size={32} />
              ))}
            </View>
          </Cell>
          <Cell id="gallery-chainlogo-sizes" label="ChainLogo · sizes 16 / 20 / 32 / 40">
            <View style={styles.rowWrap}>
              {[16, 20, 32, 40].map((s) => (
                <ChainLogo key={s} label={GNOSIS.iconLabel} color={GNOSIS.iconColor} bgColor={GNOSIS.iconBg} logoURL={GNOSIS.logoURL} size={s} />
              ))}
            </View>
          </Cell>

          <Cell id="gallery-tokenlogo-remote" label="TokenLogo · logoUrls resolved size=40">
            <TokenLogo symbol="USDC" logoUrls={usdcLogos} size={40} />
          </Cell>
          <Cell id="gallery-tokenlogo-badged" label="TokenLogo · with chain badge size=40">
            <TokenLogo symbol="USDT" logoUrls={usdtLogos} chain={BNB} size={40} />
          </Cell>
          <Cell id="gallery-tokenlogo-letter" label="TokenLogo · no url (letter fallback) size=40">
            <TokenLogo symbol="PEPE" size={40} />
          </Cell>
          <Cell id="gallery-tokenlogo-letter-badged" label="TokenLogo · letter fallback + chain badge">
            <TokenLogo symbol="ARB" chain={ARBITRUM} size={40} />
          </Cell>
          <Cell id="gallery-tokenlogo-sizes" label="TokenLogo · sizes 20 / 24 / 28 / 36 / 44">
            <View style={styles.rowWrap}>
              {[20, 24, 28, 36, 44].map((s) => (
                <TokenLogo key={s} symbol="USDC" logoUrls={usdcLogos} size={s} />
              ))}
            </View>
          </Cell>

          <Cell id="gallery-qrcode-address" label="QRCode · address size=160">
            <QRCode value={ME} size={160} />
          </Cell>
          <Cell id="gallery-qrcode-eip681" label="QRCode · EIP-681 request size=160">
            <QRCode value={`ethereum:${USDC_BSC}@56/transfer?address=${FRIEND}&uint256=1.24e21`} size={160} />
          </Cell>
          <Cell id="gallery-qrcode-tinted" label="QRCode · custom color + background size=120">
            <QRCode value={ME} size={120} color={color.accent.base} backgroundColor={color.bg.sunken} />
          </Cell>

          <Cell id="gallery-recipientname-address" label="RecipientName · plain address (short-address fallback)">
            <RecipientName address={VITALIK} style={styles.filler} />
          </Cell>
          <Cell id="gallery-recipientname-stored" label="RecipientName · storedName fallback">
            <RecipientName address={FRIEND} storedName="Samuel" style={styles.filler} />
          </Cell>
          <Cell id="gallery-recipienttypebadge-address" label="RecipientTypeBadge · address only (resolves live)">
            <RecipientTypeBadge address={FRIEND} />
          </Cell>
          <Cell id="gallery-recipienttypebadge-vela" label="RecipientTypeBadge · identity source=passkey (Vela user)">
            <RecipientTypeBadge address={ME} identity={{ name: 'Main account', source: 'passkey' }} />
          </Cell>
          <Cell id="gallery-recipienttypebadge-named" label="RecipientTypeBadge · identity source=ens (named)">
            <RecipientTypeBadge address={VITALIK} identity={{ name: 'vitalik.eth', source: 'ens' }} />
          </Cell>
          <Cell id="gallery-recipienttypebadge-contract" label="RecipientTypeBadge · isContract=true (unknown contract)">
            <RecipientTypeBadge address={ROUTER} isContract />
          </Cell>
          <Cell id="gallery-recipienttrust-default" label="RecipientTrust · default (name + source tag)">
            <RecipientTrust address={VITALIK} identity={{ name: 'vitalik.eth', source: 'ens' }} />
          </Cell>
          <Cell id="gallery-recipienttrust-compact" label="RecipientTrust · compact (pill)">
            <RecipientTrust address={VITALIK} identity={{ name: 'vitalik.eth', source: 'ens' }} compact />
          </Cell>
          <Cell id="gallery-recipienttrust-prominent" label="RecipientTrust · prominent">
            <RecipientTrust address={VITALIK} identity={{ name: 'vitalik.eth', source: 'ens' }} prominent />
          </Cell>
          <Cell id="gallery-recipienttrust-nameonly" label="RecipientTrust · prominent nameOnly">
            <RecipientTrust address={VITALIK} identity={{ name: 'vitalik.eth', source: 'ens' }} prominent nameOnly />
          </Cell>
        </Section>

        {/* ================================================================ */}
        <Section id="controls" title="Controls & inputs" onMeasure={measure}>
          <Cell id="gallery-segmentedtoggle-three" label="SegmentedToggle · 3 options, first selected">
            <SegmentedToggle
              options={[
                { key: 'activity', label: 'Activity' },
                { key: 'assets', label: 'Assets' },
                { key: 'connections', label: 'Connections' },
              ]}
              value={tab}
              onChange={setTab}
            />
          </Cell>
          <Cell id="gallery-segmentedtoggle-badge" label="SegmentedToggle · badge on a segment">
            <SegmentedToggle
              options={[
                { key: 'all', label: 'All' },
                { key: 'pending', label: 'Pending', badge: 3 },
              ]}
              value="pending"
              onChange={() => {}}
            />
          </Cell>
          <Cell id="gallery-segmentedtoggle-long" label="SegmentedToggle · long labels (scrolls, never truncates)">
            <SegmentedToggle
              options={[
                { key: 'a', label: 'Zahlungsverlauf' },
                { key: 'b', label: 'Vermögenswerte' },
                { key: 'c', label: 'Verbindungen' },
              ]}
              value="b"
              onChange={() => {}}
            />
          </Cell>

          <Cell id="gallery-autogrowtextinput-empty" label="AutoGrowTextInput · empty (minHeight)">
            <AutoGrowTextInput
              style={styles.input}
              placeholder="Paste an address or ENS name"
              placeholderTextColor={color.fg.subtle}
              value=""
              onChangeText={() => {}}
            />
          </Cell>
          <Cell id="gallery-autogrowtextinput-filled" label="AutoGrowTextInput · filled (grown to content)">
            <AutoGrowTextInput
              style={styles.input}
              value={autoGrow}
              onChangeText={setAutoGrow}
              placeholderTextColor={color.fg.subtle}
            />
          </Cell>
          <Cell id="gallery-autogrowtextinput-capped" label="AutoGrowTextInput · maxHeight=88 (scrolls past cap)">
            <AutoGrowTextInput
              style={styles.input}
              maxHeight={88}
              value={`${VITALIK}\n${FRIEND}\n${ME}\n${ROUTER}`}
              onChangeText={() => {}}
            />
          </Cell>

          <Cell id="gallery-networkfilterbutton-all" label="NetworkFilterButton · selected=null (All, stacked logos)">
            <NetworkFilterButton networks={[ETH, BNB, GNOSIS, BASE]} selected={null} onPress={() => {}} onClear={() => {}} />
          </Cell>
          <Cell id="gallery-networkfilterbutton-selected" label="NetworkFilterButton · selected=Gnosis (clear control)">
            <NetworkFilterButton networks={[ETH, BNB, GNOSIS, BASE]} selected={GNOSIS} onPress={() => {}} onClear={() => {}} />
          </Cell>

          <Cell id="gallery-collapsible-closed" label="Collapsible · default (closed)">
            <Collapsible title="Advanced">
              <Text style={styles.filler}>Raw calldata, gas parameters and the signing payload.</Text>
            </Collapsible>
          </Cell>

          <Cell id="gallery-externallink-default" label="ExternalLink · default">
            <ExternalLink href="https://getvela.app">
              <Text style={styles.link}>getvela.app</Text>
            </ExternalLink>
          </Cell>

          <Cell id="gallery-themedview-background" label="ThemedView · type=background">
            <ThemedView style={styles.themedBox} />
          </Cell>
          <Cell id="gallery-themedview-element" label="ThemedView · type=backgroundElement">
            <ThemedView type="backgroundElement" style={styles.themedBox} />
          </Cell>
          <Cell id="gallery-themedview-selected" label="ThemedView · type=backgroundSelected">
            <ThemedView type="backgroundSelected" style={styles.themedBox} />
          </Cell>
        </Section>

        {/* ================================================================ */}
        <Section id="feedback" title="Banners, warnings & simulation" onMeasure={measure}>
          <Cell id="gallery-rpctroublebanner-single" label="RpcTroubleBanner · one failing chain">
            <RpcTroubleBanner chainIds={[100]} onFix={() => {}} />
          </Cell>
          <Cell id="gallery-rpctroublebanner-multi" label="RpcTroubleBanner · three failing chains">
            <RpcTroubleBanner chainIds={[1, 56, 100]} onFix={() => {}} />
          </Cell>

          <Cell id="gallery-warningbanner-caution" label="WarningBanner · severity=caution">
            <WarningBanner severity="caution" text="This contract has no verified descriptor — check the details below." />
          </Cell>
          <Cell id="gallery-warningbanner-danger" label="WarningBanner · severity=danger">
            <WarningBanner severity="danger" text="This grants unlimited spending of your USDC." />
          </Cell>
          <Cell id="gallery-genericfieldrow-plain" label="GenericFieldRow · plain field">
            <GenericFieldRow field={fieldGeneric} />
          </Cell>
          <Cell id="gallery-genericfieldrow-warning" label="GenericFieldRow · warning + expired tag">
            <GenericFieldRow field={fieldExpired} />
          </Cell>

          <Cell id="gallery-balancechangepreview-changes" label="BalanceChangePreview · net changes (−USDC / +BNB)">
            <BalanceChangePreview result={simSwap} chainId={56} />
          </Cell>
          <Cell id="gallery-balancechangepreview-revert" label="BalanceChangePreview · expected to revert (with reason)">
            <BalanceChangePreview result={simRevert} chainId={56} />
          </Cell>
          <Cell id="gallery-balancechangepreview-nochange" label="BalanceChangePreview · ran, nothing moved">
            <BalanceChangePreview result={simNoChange} chainId={56} />
          </Cell>
          <Cell id="gallery-balancechangepreview-selftransfer" label="BalanceChangePreview · selfTransfer=true">
            <BalanceChangePreview result={simNoChange} chainId={56} selfTransfer />
          </Cell>
          <Cell id="gallery-balancechangepreview-degraded" label="BalanceChangePreview · degraded (changes=null)">
            <BalanceChangePreview result={simDegraded} chainId={56} />
          </Cell>
          <Cell id="gallery-balancechangepreview-unverified" label="BalanceChangePreview · unverified token (no amount shown)">
            <BalanceChangePreview result={simUnverified} chainId={56} />
          </Cell>
          <Cell id="gallery-balancechangepreview-underfunded" label="BalanceChangePreview · underfundedNative">
            <BalanceChangePreview result={simUnderfunded} chainId={56} />
          </Cell>
          <Cell id="gallery-balancechangepreview-corroborated" label="BalanceChangePreview · corroborated by heroFlows (quiet ✓)">
            <BalanceChangePreview
              result={simSwap}
              chainId={56}
              heroFlows={[{ token: USDC_BSC.toLowerCase(), dir: 'out' }, { dir: 'in' }]}
            />
          </Cell>
          <Cell id="gallery-balancechangepreview-hidereassurance" label="BalanceChangePreview · hideReassurance=true (renders nothing when calm)">
            <BalanceChangePreview result={simNoChange} chainId={56} hideReassurance />
          </Cell>
        </Section>

        {/* ================================================================ */}
        <Section
          id="fees"
          title="Fees"
          subtitle="GasFeeCard owns a live bundler quote; only its estimating / failed states are reproducible offline."
          onMeasure={measure}
        >
          <Cell id="gallery-feetokenselector-default" label="FeeTokenSelector · USDC selected, native insufficient (0 BNB)">
            <FeeTokenSelector options={FEE_OPTIONS} selected={feeSel} onSelect={setFeeSel} feeAmountFor={feeAmountFor} />
          </Cell>
          <Cell id="gallery-feetokenselector-native" label="FeeTokenSelector · native selected">
            <FeeTokenSelector
              options={[{ ...feeOptNative, balance: 40_000000000000000n, usdBalance: '24.50' }, feeOptUSDC]}
              selected={null}
              onSelect={() => {}}
              feeAmountFor={feeAmountFor}
            />
          </Cell>
          <Cell id="gallery-feetokenselector-busy" label="FeeTokenSelector · busy=true (rows dim, taps blocked)">
            <FeeTokenSelector options={FEE_OPTIONS} selected={USDC_BSC} onSelect={() => {}} feeAmountFor={feeAmountFor} busy />
          </Cell>
          <Cell id="gallery-feetokenselector-noquote" label="FeeTokenSelector · feeAmountFor returns null (— cost, all insufficient)">
            <FeeTokenSelector options={FEE_OPTIONS} selected={USDC_BSC} onSelect={() => {}} feeAmountFor={() => null} />
          </Cell>

          <Cell id="gallery-gasfeecard-estimating" label="GasFeeCard · estimating=true feeEstimate=null">
            <GasFeeCard
              feeEstimate={null}
              estimating
              nativeSymbol="BNB"
              nativeUsdPrice={612.4}
              safeAddress={ME}
              chainId={56}
              onFeeUpdate={() => {}}
            />
          </Cell>
          <Cell id="gallery-gasfeecard-failed" label="GasFeeCard · estimation failed (tap to retry)">
            <GasFeeCard
              feeEstimate={null}
              estimating={false}
              nativeSymbol="BNB"
              nativeUsdPrice={612.4}
              safeAddress={ME}
              chainId={56}
              onFeeUpdate={() => {}}
            />
          </Cell>
        </Section>

        {/* ================================================================ */}
        <Section id="send" title="Send flow" onMeasure={measure}>
          <Cell id="gallery-flowarrow-send" label="FlowArrow (send) · default connector">
            <SendFlowArrow />
          </Cell>
          <Cell id="gallery-confirmassets-single" label="ConfirmAssets · single asset (identity pill)">
            <ConfirmAssets rows={[{ key: 'usdc', symbol: 'USDC', logoUrls: usdcLogos, chain: BNB, networkText: 'BNB Chain' }]} />
          </Cell>
          <Cell id="gallery-confirmassets-multi" label="ConfirmAssets · 5 assets collapsed (cluster + count + total)">
            <ConfirmAssets
              countLabel="5 tokens"
              totalLabel="≈ $1,562.14"
              rows={[
                { key: 'usdc', symbol: 'USDC', logoUrls: usdcLogos, chain: BNB, networkText: 'BNB Chain', amountText: '1,240.00', usdText: '$1,240.00' },
                { key: 'usdt', symbol: 'USDT', logoUrls: usdtLogos, chain: BNB, networkText: 'BNB Chain', amountText: '318.4029', usdText: '$318.40' },
                { key: 'bnb', symbol: 'BNB', chain: null, networkText: 'BNB Chain · gas reserved', amountText: '0.0038', usdText: '$2.33' },
                { key: 'xdai', symbol: 'XDAI', chain: GNOSIS, networkText: 'Gnosis', amountText: '0.996', usdText: '$1.00' },
                { key: 'arb', symbol: 'ARB', chain: ARBITRUM, networkText: 'Arbitrum', amountText: '52.0' },
              ]}
            />
          </Cell>

          <Cell id="gallery-multirecipienteditor-mixed" label="MultiRecipientEditor · valid + invalid row, over-balance total">
            <MultiRecipientEditor
              recipients={recipients}
              onChange={setRecipients}
              tokenSymbol="USDC"
              decimals={18}
              priceUsd={1}
              balance="40"
              formatUsd={(n) => `$${n.toFixed(2)}`}
              onPickContact={() => {}}
              onImport={() => setOverlay('batchimport')}
            />
          </Cell>
        </Section>

        {/* ================================================================ */}
        <SigningChainContext.Provider value={56}>
          <Section
            id="signing"
            title="Signing surface"
            subtitle="Rendered inside SigningChainContext = BNB Chain (56)."
            onMeasure={measure}
          >
            <Cell id="gallery-intentheader-hero-normal" label="IntentHeader · variant=hero color=fg.base">
              <IntentHeader intent="Swap" color={intentColor('normal')} />
            </Cell>
            <Cell id="gallery-intentheader-hero-danger" label="IntentHeader · variant=hero color=danger">
              <IntentHeader intent="Approve" color={intentColor('danger')} />
            </Cell>
            <Cell id="gallery-intentheader-eyebrow" label="IntentHeader · variant=eyebrow (neutral)">
              <IntentHeader intent="Sending" color={intentColor('safe')} variant="eyebrow" />
            </Cell>
            <Cell id="gallery-intentheader-eyebrow-colored" label="IntentHeader · variant=eyebrow colorEyebrow=true">
              <IntentHeader intent="Approve" color={intentColor('danger')} variant="eyebrow" colorEyebrow />
            </Cell>

            <Cell id="gallery-summaryline-neutral" label="SummaryLine · tone=neutral with emphasis">
              <SummaryLine
                text="You're sending 1,000 USDC to vitalik.eth."
                emphasize={['1,000 USDC', 'vitalik.eth']}
              />
            </Cell>
            <Cell id="gallery-summaryline-caution" label="SummaryLine · tone=caution">
              <SummaryLine text="This site is asking to spend tokens on your behalf." tone="caution" />
            </Cell>
            <Cell id="gallery-summaryline-danger" label="SummaryLine · tone=danger">
              <SummaryLine
                text="You're letting PancakeSwap spend unlimited USDC. Nothing leaves your wallet now."
                tone="danger"
                emphasize={['unlimited USDC']}
              />
            </Cell>

            <Cell id="gallery-dappbanner-favicon" label="DAppBanner · domain (derives its own favicon)">
              <DAppBanner name="PancakeSwap" domain="pancakeswap.finance" chainId={56} />
            </Cell>
            <Cell id="gallery-dappbanner-monogram" label="DAppBanner · non-registrable host (letter monogram)">
              <DAppBanner name="Clear signing test" domain="localhost" chainId={1} />
            </Cell>
            <Cell id="gallery-signingaccountrow-default" label="SigningAccountRow · collapsed">
              <SigningAccountRow accountName="Main account" accountAddress={ME} />
            </Cell>

            <Cell id="gallery-contractbar-contract-verified" label="ContractBar · identity=contract verified=true">
              <ContractBar label="SPENDER" name="PancakeSwap V3 SmartRouter" address={ROUTER} verified identity="contract" />
            </Cell>
            <Cell id="gallery-contractbar-contract-unverified" label="ContractBar · identity=contract verified=false">
              <ContractBar label="CONTRACT" address={ROUTER} verified={false} identity="contract" />
            </Cell>
            <Cell id="gallery-contractbar-contract-warning" label="ContractBar · warning=true (danger row)">
              <ContractBar label="RECIPIENT" name="USDC token contract" address={USDC_BSC} verified={false} identity="contract" warning />
            </Cell>
            <Cell id="gallery-contractbar-auto" label="ContractBar · identity=auto (recipient, live wallet/contract probe)">
              <ContractBar label="RECIPIENT" address={VITALIK} verified={false} identity="auto" />
            </Cell>
            <Cell id="gallery-contractbar-auto-inflow" label="ContractBar · identity=auto inflow=true">
              <ContractBar label="RECEIVER" address={FRIEND} verified={false} identity="auto" inflow />
            </Cell>
            <Cell id="gallery-contractbar-asset" label="ContractBar · identity=asset (no identity chip)">
              <ContractBar label="TOKEN" name="USD Coin" address={USDC_BSC} verified identity="asset" />
            </Cell>

            <Cell id="gallery-tokencard-send" label="TokenCard · variant=send (card row)">
              <TokenCard field={fieldSend} variant="send" />
            </Cell>
            <Cell id="gallery-tokencard-receive" label="TokenCard · variant=receive (+ green)">
              <TokenCard field={fieldReceive} variant="receive" />
            </Cell>
            <Cell id="gallery-tokencard-caution" label="TokenCard · variant=caution (tinted card)">
              <TokenCard field={{ ...fieldSend, label: 'Unverified amount', unverified: true }} variant="caution" />
            </Cell>
            <Cell id="gallery-tokencard-danger" label="TokenCard · variant=danger (tinted card + warning)">
              <TokenCard field={fieldDanger} variant="danger" />
            </Cell>
            <Cell id="gallery-tokencard-hero" label="TokenCard · hero=true hideSign=true (logo-less amount hero)">
              <TokenCard field={fieldSend} variant="send" hero hideSign />
            </Cell>
            <Cell id="gallery-tokencard-hero-label" label="TokenCard · hero=true heroLabel=true (swap leg)">
              <TokenCard field={fieldReceive} variant="receive" hero heroLabel />
            </Cell>
            <Cell id="gallery-flowarrow-signing" label="FlowArrow (signing) · default">
              <SigningFlowArrow />
            </Cell>
            <Cell id="gallery-flowarrow-signing-danger" label="FlowArrow (signing) · danger=true">
              <SigningFlowArrow danger />
            </Cell>

            <Cell id="gallery-editableapprovecard-unlimited" label="EditableApproveCard · unlimited grant, editable, no choice yet">
              <EditableApproveCard
                approval={approvalUnlimited}
                symbol="USDC"
                decimals={18}
                decimalsVerified
                logoUrls={usdcLogos}
                spenderLabel="PancakeSwap V3 SmartRouter"
                usdPrice={1}
                balanceRaw={1_240_000000000000000000n}
                choice={approveChoice}
                onChange={setApproveChoice}
              />
            </Cell>
            <Cell id="gallery-editableapprovecard-finite" label="EditableApproveCard · finite requested amount">
              <EditableApproveCard
                approval={approvalFinite}
                symbol="USDC"
                decimals={18}
                decimalsVerified
                logoUrls={usdcLogos}
                spenderLabel="PancakeSwap V3 SmartRouter"
                usdPrice={1}
                balanceRaw={1_240_000000000000000000n}
                choice={null}
                onChange={() => {}}
              />
            </Cell>
            <Cell id="gallery-editableapprovecard-capped" label="EditableApproveCard · choice=amount (capped to balance)">
              <EditableApproveCard
                approval={approvalUnlimited}
                symbol="USDC"
                decimals={18}
                decimalsVerified
                logoUrls={usdcLogos}
                spenderLabel="PancakeSwap V3 SmartRouter"
                usdPrice={1}
                balanceRaw={1_240_000000000000000000n}
                choice={{ type: 'amount', amountRaw: 1_240_000000000000000000n }}
                onChange={() => {}}
              />
            </Cell>
            <Cell id="gallery-editableapprovecard-revoke" label="EditableApproveCard · choice=revoke">
              <EditableApproveCard
                approval={approvalFinite}
                symbol="USDC"
                decimals={18}
                decimalsVerified
                logoUrls={usdcLogos}
                spenderLabel="PancakeSwap V3 SmartRouter"
                choice={{ type: 'revoke' }}
                onChange={() => {}}
              />
            </Cell>
            <Cell id="gallery-editableapprovecard-locked" label="EditableApproveCard · editable=false (blockReason)">
              <EditableApproveCard
                approval={approvalLocked}
                symbol="USDT"
                decimals={18}
                decimalsVerified={false}
                logoUrls={usdtLogos}
                spenderLabel="0x13f4…8Dd4"
                choice={null}
                onChange={() => {}}
              />
            </Cell>
            <Cell id="gallery-editableapprovecard-boolean" label="EditableApproveCard · setApprovalForAll (boolean grant)">
              <EditableApproveCard
                approval={approvalNft}
                symbol="BAYC"
                decimals={0}
                decimalsVerified
                spenderLabel="OpenSea Seaport"
                choice={null}
                onChange={() => {}}
              />
            </Cell>

            <Cell id="gallery-advancedpanel-tx" label="AdvancedPanel · eth_sendTransaction, no descriptor">
              <AdvancedPanel
                method="eth_sendTransaction"
                params={[{ from: ME, to: ROUTER, value: '0x0', data: '0x38ed1739000000000000000000000000000000000000000000000003635c9adc5dea00000' }]}
                clearSign={null}
              />
            </Cell>
            <Cell id="gallery-advancedpanel-clearsign-sim" label="AdvancedPanel · descriptor + simulation row">
              <AdvancedPanel
                method="eth_sendTransaction"
                params={[{ from: ME, to: ROUTER, value: '0x0', data: '0x38ed1739' }]}
                clearSign={csSwap}
                simResult={simSwap}
                heroFlows={[{ token: USDC_BSC.toLowerCase(), dir: 'out' }]}
              />
            </Cell>
            <Cell id="gallery-advancedpanel-typed" label="AdvancedPanel · eth_signTypedData_v4">
              <AdvancedPanel method="eth_signTypedData_v4" params={[ME, TYPED_DATA]} clearSign={null} />
            </Cell>

            <Cell id="gallery-messagesignview-siwe" label="MessageSignView · SIWE message, origin matches">
              <MessageSignView hexMsg={hexOf(SIWE)} requestOrigin="https://app.uniswap.org" />
            </Cell>
            <Cell id="gallery-messagesignview-mismatch" label="MessageSignView · SIWE domain ≠ request origin (phishing)">
              <MessageSignView hexMsg={hexOf(SIWE)} requestOrigin="https://uniswap-airdrop.xyz" />
            </Cell>
            <Cell id="gallery-messagesignview-plain" label="MessageSignView · plain text message">
              <MessageSignView hexMsg={hexOf('Confirm you own this wallet — nonce 8f2a41cd')} requestOrigin="https://getvela.app" />
            </Cell>
            <Cell id="gallery-messagesignview-nonprintable" label="MessageSignView · non-printable hex (disguised hash)">
              <MessageSignView hexMsg="0xa9059cbb00000000000000000000000000000000000000000000000000000000deadbeef" requestOrigin="https://getvela.app" />
            </Cell>
            <Cell id="gallery-blindtypeddataview-permit2" label="BlindTypedDataView · Permit2 typed data">
              <BlindTypedDataView params={[ME, TYPED_DATA]} />
            </Cell>
            <Cell id="gallery-ethsigndangerview-default" label="EthSignDangerView · raw eth_sign digest">
              <EthSignDangerView dataHex="0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658" />
            </Cell>
            <Cell id="gallery-blindtransactionview-nativesend" label="BlindTransactionView · plain native send (no calldata)">
              <BlindTransactionView tx={{ from: ME, to: FRIEND, value: '0xd7a3b0c8a8000' }} chainId={56} nativeUsdPrice={612.4} />
            </Cell>
            <Cell id="gallery-blindtransactionview-blind" label="BlindTransactionView · unknown calldata, not simulated">
              <BlindTransactionView tx={{ from: ME, to: ROUTER, value: '0x0', data: '0x38ed1739000000000000000000000000000000000000000000000003635c9adc5dea0000' }} chainId={56} />
            </Cell>
            <Cell id="gallery-blindtransactionview-calm" label="BlindTransactionView · simConfident=true (calm contract call)">
              <BlindTransactionView tx={{ from: ME, to: ROUTER, value: '0x0', data: '0x38ed1739000000000000000000000000000000000000000000000003635c9adc5dea0000' }} chainId={56} simConfident />
            </Cell>
            <Cell id="gallery-clearsignview-verified" label="ClearSignView · verified descriptor (Swap)">
              <ClearSignView cs={csSwap} walletAddress={ME} />
            </Cell>
            <Cell id="gallery-clearsignview-besteffort" label="ClearSignView · bestEffort=true (4byte decode)">
              <ClearSignView cs={csBestEffort} walletAddress={ME} />
            </Cell>
            <Cell id="gallery-clearsignview-partial" label="ClearSignView · partial=true (incomplete decode)">
              <ClearSignView cs={{ ...csSwap, partial: true, risk: 'caution', verified: false }} walletAddress={ME} />
            </Cell>
            <Cell id="gallery-approvalview-unlimited" label="ApprovalView · unlimited erc20-approve, no choice">
              <ApprovalView
                approval={approvalUnlimited}
                meta={tokenMeta}
                choice={null}
                onChange={() => {}}
                chainId={56}
                walletAddress={ME}
                clearSign={null}
                requestId="gallery-approval-1"
              />
            </Cell>
            <Cell id="gallery-approvalview-nft" label="ApprovalView · setApprovalForAll (NFT collection)">
              <ApprovalView
                approval={approvalNft}
                meta={null}
                choice={null}
                onChange={() => {}}
                chainId={56}
                walletAddress={ME}
                clearSign={null}
                requestId="gallery-approval-2"
              />
            </Cell>
            <Cell id="gallery-permitsignview-finite" label="PermitSignView · ERC-2612 permit with deadline">
              <PermitSignView approval={approvalPermit} meta={{ symbol: 'USDT', decimals: 18, verified: true }} clearSign={null} />
            </Cell>
            <Cell id="gallery-permitsignview-unlimited" label="PermitSignView · unlimited permit (danger)">
              <PermitSignView
                approval={{ ...approvalPermit, amountRaw: (1n << 256n) - 1n, isUnbounded: true }}
                meta={{ symbol: 'USDT', decimals: 18, verified: true }}
                clearSign={null}
              />
            </Cell>
            <Cell id="gallery-batchcallsview-editable" label="BatchCallsView · 2 legs (approve + swap), editable">
              <BatchCallsView
                items={batchItems}
                choices={batchChoices}
                onChoiceChange={(i, c) => setBatchChoices((p) => ({ ...p, [i]: c }))}
                metaByToken={new Map([[USDC_BSC.toLowerCase(), tokenMeta]])}
                editable
                requestId="gallery-batch-1"
              />
            </Cell>
            <Cell id="gallery-batchcallsview-readonly" label="BatchCallsView · editable=false (replay)">
              <BatchCallsView
                items={batchItems}
                choices={{}}
                onChoiceChange={() => {}}
                metaByToken={new Map([[USDC_BSC.toLowerCase(), tokenMeta]])}
                editable={false}
                requestId="gallery-batch-2"
              />
            </Cell>
          </Section>
        </SigningChainContext.Provider>

        {/* ================================================================ */}
        <Section
          id="surfaces"
          title="Full surfaces"
          subtitle="Screen-sized components, height-boxed and touch-inert so their inner scrollers don't fight the gallery."
          onMeasure={measure}
        >
          <Cell id="gallery-tokenselector-list" label="TokenSelector · loaded list" height={460} inert>
            <TokenSelector tokens={GALLERY_TOKENS} onSelect={() => {}} />
          </Cell>
          <Cell id="gallery-tokenselector-loading" label="TokenSelector · loading=true" height={300} inert>
            <TokenSelector tokens={[]} loading onSelect={() => {}} />
          </Cell>
          <Cell id="gallery-tokenselector-empty" label="TokenSelector · empty (no tokens)" height={300} inert>
            <TokenSelector tokens={[]} onSelect={() => {}} />
          </Cell>
          <Cell id="gallery-tokenselector-hidetotals" label="TokenSelector · hideTotals=true" height={460} inert>
            <TokenSelector tokens={GALLERY_TOKENS} hideTotals onSelect={() => {}} />
          </Cell>
          <Cell id="gallery-tokenselector-multiselect" label="TokenSelector · multiSelect (sweep mode)" height={520}>
            <TokenSelector
              tokens={GALLERY_TOKENS}
              onSelect={() => {}}
              multiSelect={{
                selectedIds: sweepSel,
                onToggle: (tk) => setSweepSel((prev) => {
                  const next = new Set(prev);
                  const key = `${tk.network}_${tk.tokenAddress ?? 'native'}_${tk.symbol}`;
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                }),
                onToggleAll: () => setSweepSel(new Set()),
                isAllSelected: (visible) => visible.length > 0 && visible.every((tk) => sweepSel.has(`${tk.network}_${tk.tokenAddress ?? 'native'}_${tk.symbol}`)),
                onNetworkChange: () => setSweepSel(new Set()),
                onConfirm: () => {},
                confirmLabel: 'Sweep 2 tokens',
                selectAllLabel: 'Select all valuable',
              }}
            />
          </Cell>

          <Cell id="gallery-transactionreceipt-confirmed" label="TransactionReceipt · status=confirmed single send" height={720} inert>
            <TransactionReceipt
              from={ME} fromName="Main account" to={FRIEND} toName="Samuel"
              amount="5.7249" symbol="USDT" chainId={56} txHash={TX_HASH} logoUrls={usdtLogos}
              usdValue={5.72} rate={1} currencyCode="USD" currencySymbol="$"
              timestamp={new Date(NOW * 1000)} status="confirmed" onDone={() => {}}
            />
          </Cell>
          <Cell id="gallery-transactionreceipt-submitted" label="TransactionReceipt · status=submitted (no txHash)" height={720} inert>
            <TransactionReceipt
              from={ME} fromName="Main account" to={FRIEND} toName="Samuel"
              amount="5.7249" symbol="USDT" chainId={56} txHash="" logoUrls={usdtLogos}
              usdValue={5.72} rate={1} currencyCode="USD" currencySymbol="$"
              timestamp={new Date(NOW * 1000)} status="submitted" onDone={() => {}}
            />
          </Cell>
          <Cell id="gallery-transactionreceipt-failed" label="TransactionReceipt · status=failed" height={720} inert>
            <TransactionReceipt
              from={ME} fromName="Main account" to={FRIEND} toName="Samuel"
              amount="5.7249" symbol="USDT" chainId={56} txHash="" logoUrls={usdtLogos}
              usdValue={5.72} rate={1} currencyCode="USD" currencySymbol="$"
              timestamp={new Date(NOW * 1000)} status="failed" onDone={() => {}}
            />
          </Cell>
          <Cell id="gallery-transactionreceipt-batch-multiselect" label="TransactionReceipt · batchKind=multiSelect (N tokens → 1 person)" height={760} inert>
            <TransactionReceipt
              from={ME} fromName="Main account" to={FRIEND} toName="Samuel"
              amount="5.7249" symbol="USDT" chainId={56} txHash={TX_HASH} logoUrls={usdtLogos}
              usdValue={11.72} rate={1} currencyCode="USD" currencySymbol="$"
              timestamp={new Date(NOW * 1000)} transfers={receiptTransfers} batchKind="multiSelect"
              status="confirmed" onDone={() => {}}
            />
          </Cell>
          <Cell id="gallery-transactionreceipt-savecontact" label="TransactionReceipt · onSaveContact offered" height={720} inert>
            <TransactionReceipt
              from={ME} fromName="Main account" to={VITALIK} toName={null}
              amount="0.996" symbol="XDAI" chainId={100} txHash={TX_HASH} logoUrls={[nativeCoinLogoURL(100)]}
              usdValue={1} rate={1} currencyCode="USD" currencySymbol="$"
              timestamp={new Date(NOW * 1000)} status="confirmed" onDone={() => {}} onSaveContact={() => {}}
            />
          </Cell>

          <Cell id="gallery-receivesharecard-address" label="ReceiveShareCard · variant=address" inert>
            <ReceiveShareCard
              model={{
                variant: 'address',
                name: 'Main account',
                qrValue: ME,
                address: ME,
                networks: [ETH, BNB, GNOSIS, BASE, ARBITRUM, TEMPO].map((n) => ({
                  label: n.iconLabel, name: n.displayName, color: n.iconColor, bg: n.iconBg, logoURL: n.logoURL,
                })),
              }}
            />
          </Cell>
          <Cell id="gallery-receivesharecard-request" label="ReceiveShareCard · variant=request" inert>
            <ReceiveShareCard
              model={{
                variant: 'request',
                name: 'Main account',
                qrValue: `ethereum:${USDC_BSC}@56/transfer?address=${ME}&uint256=1.24e21`,
                address: ME,
                summary: 'Request 1,240.00 USDC · BNB Chain',
              }}
            />
          </Cell>

          <Cell id="gallery-receiverequestcontrols-default" label="ReceiveRequestControls · default (native ETH, empty amount)">
            <ReceiveRequestControls
              controller={{
                recipient: ME,
                warned: true,
                acknowledge: () => {},
                asset: { chainId: 1, tokenAddress: null, symbol: 'ETH', decimals: 18, networkName: 'Ethereum' },
                pickAsset: () => {},
                amount: '',
                setAmountText: () => {},
                qrValue: '',
                payLink: '',
                hasAmount: false,
              }}
            />
          </Cell>

          <Cell id="gallery-groupeditor-new" label="GroupEditor · editing=null (new group)" height={520}>
            <GroupEditor editing={null} onBack={() => {}} onSaved={() => {}} />
          </Cell>

          <Cell id="gallery-wavedock-default" label="WaveDock · default (Receive · Scan FAB · Send)" height={150} inert>
            <WaveDock onReceive={() => {}} onScan={() => {}} onSend={() => {}} />
          </Cell>
        </Section>

        {/* ================================================================ */}
        <Section
          id="overlays"
          title="Overlays (modals & sheets)"
          subtitle="These present full-screen; tap a launcher, screenshot, then dismiss."
          onMeasure={measure}
        >
          <Launcher id="gallery-open-appmodal-default" label="AppModal · default (page sheet)" onPress={() => setOverlay('appmodal')} />
          <Launcher id="gallery-open-appmodal-fit" label="AppModal · fit=true (content-height sheet)" onPress={() => setOverlay('appmodal-fit')} />
          <Launcher id="gallery-open-currencysheet" label="CurrencySheet · selected=USD" onPress={() => setOverlay('currency')} />
          <Launcher id="gallery-open-networkfiltersheet" label="NetworkFilterSheet · selectedChainId=100" onPress={() => setOverlay('network')} />
          <Launcher id="gallery-open-transactiondetailsheet-single" label="TransactionDetailSheet · single confirmed send" onPress={() => setOverlay('txdetail')} />
          <Launcher id="gallery-open-transactiondetailsheet-batch" label="TransactionDetailSheet · batch=split (3 recipients)" onPress={() => setOverlay('txdetail-batch')} />
          <Launcher id="gallery-open-connectioneventdetailsheet" label="ConnectionEventDetailSheet · sign_message event" onPress={() => setOverlay('connevent')} />
          <Launcher id="gallery-open-balancedetailsheet" label="BalanceDetailSheet · 1 failed + 1 rate-limited chain + unpriced token" onPress={() => setOverlay('balance')} />
          <Launcher id="gallery-open-identiconviewersheet" label="IdenticonViewerSheet · account identicon" onPress={() => setOverlay('identicon')} />
          <Launcher id="gallery-open-browserhistorysheet" label="BrowserHistorySheet · reads stored history (empty state when none)" onPress={() => setOverlay('history')} />
          <Launcher id="gallery-open-bugreportmodal" label="BugReportModal · area=design-gallery" onPress={() => setOverlay('bug')} />
          <Launcher id="gallery-open-addtokensheet" label="AddTokenSheet · wraps AddTokenPanel" onPress={() => setOverlay('addtoken')} />
          <Launcher id="gallery-open-treasurybootstrapsheet" label="TreasuryBootstrapSheet · status=bootstrapNeeded (Gnosis)" onPress={() => setOverlay('treasury')} />
          <Launcher id="gallery-open-rpcfixmodal" label="RpcFixModal · chainId=100 (autofocuses its input)" onPress={() => setOverlay('rpcfix')} />
          <Launcher id="gallery-open-contactpicker" label="ContactPicker · reads saved contacts" onPress={() => setOverlay('contactpicker')} />
          <Launcher id="gallery-open-contactsmanager" label="ContactsManager · reads saved contacts + groups" onPress={() => setOverlay('contacts')} />
          <Launcher id="gallery-open-batchimportsheet" label="BatchImportSheet · token=USDC currency=USD" onPress={() => setOverlay('batchimport')} />
          <Launcher id="gallery-open-accountswitchermodal" label="AccountSwitcherModal · reads the signed-in wallet" onPress={() => setOverlay('accounts')} />

          <Launcher
            id="gallery-open-appalert-single"
            label="AppAlert · single OK button (web renders the styled dialog; native uses the OS alert)"
            onPress={() => showAlert('Transaction submitted', 'It usually lands within a few seconds.')}
          />
          <Launcher
            id="gallery-open-appalert-two"
            label="AppAlert · cancel + primary"
            onPress={() => showAlert('Replace this RPC?', 'The saved endpoint for Gnosis will be overwritten.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Replace' },
            ])}
          />
          <Launcher
            id="gallery-open-appalert-destructive"
            label="AppAlert · destructive"
            onPress={() => showAlert('Remove this account?', 'The passkey stays on your device — you can sign back in any time.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive' },
            ])}
          />
        </Section>

        <View style={styles.tail} />
      </ScrollView>

      {/* ------------------------------------------------------------------ */}
      {/* Overlay instances                                                   */}
      {/* ------------------------------------------------------------------ */}
      <AppModal visible={overlay === 'appmodal'} onClose={close}>
        <View style={styles.modalDemo}>
          <Text style={styles.modalDemoTitle}>AppModal — default</Text>
          <Text style={styles.filler}>
            Page sheet on iOS, drag-dismiss sheet on Android, portal + slide-up on web.
          </Text>
          <VelaButton title="Close" onPress={close} variant="secondary" />
        </View>
      </AppModal>
      <AppModal visible={overlay === 'appmodal-fit'} onClose={close} fit>
        <View style={styles.modalDemo}>
          <Text style={styles.modalDemoTitle}>AppModal — fit</Text>
          <Text style={styles.filler}>Content-height bottom sheet, for short prompts.</Text>
          <VelaButton title="Close" onPress={close} variant="accent" />
        </View>
      </AppModal>
      <CurrencySheet visible={overlay === 'currency'} selected="USD" onSelect={() => {}} onClose={close} />
      <NetworkFilterSheet
        visible={overlay === 'network'}
        networks={[ETH, BNB, GNOSIS, BASE, ARBITRUM, TEMPO]}
        selectedChainId={100}
        onSelect={() => {}}
        onClose={close}
        subtitleForChain={(n) => (n.chainId === 100 ? '$1.00 · 4 events' : undefined)}
      />
      <TransactionDetailSheet visible={overlay === 'txdetail'} tx={txSend} alias="Samuel" rate={1} currency={USD} onClose={close} />
      <TransactionDetailSheet visible={overlay === 'txdetail-batch'} tx={null} batch={batchSplit} rate={1} currency={USD} onClose={close} />
      <ConnectionEventDetailSheet visible={overlay === 'connevent'} tx={txSignature} onClose={close} />
      <BalanceDetailSheet
        visible={overlay === 'balance'}
        onClose={close}
        failedChainIds={[1, 56]}
        rateLimitedChainIds={[56]}
        unpricedTokens={[tokUnpriced]}
        onFixResolved={() => {}}
        onRetry={() => {}}
        onTokenPress={() => {}}
      />
      <IdenticonViewerSheet visible={overlay === 'identicon'} onClose={close} name="Main account" address={ME} />
      <BrowserHistorySheet visible={overlay === 'history'} onClose={close} onOpen={() => {}} />
      <BugReportModal visible={overlay === 'bug'} language="en" area="design-gallery" onClose={close} />
      <AddTokenSheet visible={overlay === 'addtoken'} onClose={close} />
      <TreasuryBootstrapSheet visible={overlay === 'treasury'} status={treasuryLow} onClose={close} onRetry={() => {}} />
      <RpcFixModal chainId={overlay === 'rpcfix' ? 100 : null} onClose={close} />
      <ContactPicker
        visible={overlay === 'contactpicker'}
        onClose={close}
        onSelect={() => {}}
        onScan={() => {}}
        onAddContact={() => {}}
        myAddress={ME}
      />
      <ContactsManager visible={overlay === 'contacts'} onClose={close} />
      <BatchImportSheet
        visible={overlay === 'batchimport'}
        onClose={close}
        token={tokUSDC}
        currencyCode="USD"
        currencySymbol="$"
        onApply={(next) => { setRecipients(next); close(); }}
        maxRecipients={20}
      />
      <AccountSwitcherModal
        visible={overlay === 'accounts'}
        onClose={close}
        title="Switch account"
        formatSubtitle={(amount, count) => `${amount} across ${count} accounts`}
      />
    </View>
  );
}

// =============================================================================
// Route — same gate as /clear-signing-test and /receipt-harness.
// =============================================================================

export default function DesignGalleryRoute() {
  // `__DEV__` is always allowed; otherwise wait for the async flag read so we
  // don't flash a redirect before we know whether dev mode is unlocked.
  const [access, setAccess] = useState<'checking' | 'allow' | 'deny'>(__DEV__ ? 'allow' : 'checking');

  useEffect(() => {
    if (access !== 'checking') return;
    AsyncStorage.getItem('dev_unlocked')
      .then((v) => setAccess(v === '1' ? 'allow' : 'deny'))
      .catch(() => setAccess('deny'));
  }, [access]);

  if (access === 'checking') return null;
  if (access === 'deny') return <Redirect href="/(tabs)/wallet" />;
  return <DesignGalleryScreen />;
}

// =============================================================================
// Styles
// =============================================================================

const styles = createStyles(() => ({
  root: { flex: 1, backgroundColor: color.bg.base },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: space['2xl'],
    paddingTop: Platform.OS === 'web' ? space['3xl'] : space['5xl'],
    paddingBottom: space['5xl'],
  },

  // Index / legend
  legend: {
    gap: space.md,
    paddingBottom: space['3xl'],
    borderBottomWidth: 1,
    borderBottomColor: color.border.base,
  },
  legendTitle: { fontSize: text['2xl'], ...inter.bold, color: color.fg.base },
  legendSub: { fontSize: text.sm, ...inter.regular, color: color.fg.muted },
  legendChips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  legendChip: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    backgroundColor: color.bg.sunken,
  },
  legendChipText: { fontSize: text.xs, ...inter.semibold, color: color.fg.muted },

  // Section
  section: { paddingTop: space['5xl'] },
  sectionTitle: { fontSize: text.xl, ...inter.bold, color: color.fg.base },
  sectionSub: { fontSize: text.xs, ...inter.regular, color: color.fg.subtle, marginTop: space.xs },

  // Cell — 24px of air between every instance, on the plain page background.
  cell: { marginTop: space['3xl'] },
  cellLabel: {
    fontSize: text.xs,
    fontFamily: font.mono,
    color: color.fg.subtle,
    marginBottom: space.md,
  },
  cellBody: { alignSelf: 'stretch' },
  cellBodyRaised: { backgroundColor: color.bg.raised, borderRadius: radius.lg, padding: space.lg },

  // Launcher
  launcher: {
    alignSelf: 'flex-start',
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: color.border.strong,
    backgroundColor: color.bg.raised,
  },
  launcherText: { fontSize: text.sm, ...inter.semibold, color: color.accent.base },

  // Shared demo bits
  amountInk: { ...inter.bold, color: color.fg.base },
  filler: { fontSize: text.base, ...inter.regular, color: color.fg.muted, lineHeight: 20 },
  link: { fontSize: text.base, ...inter.semibold, color: color.accent.base },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.lg },
  input: {
    fontSize: text.lg,
    ...inter.regular,
    color: color.fg.base,
    backgroundColor: color.bg.sunken,
    borderRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  themedBox: { height: 48, borderRadius: radius.lg, borderWidth: 1, borderColor: color.border.base },
  modalDemo: { padding: space['3xl'], gap: space.lg },
  modalDemoTitle: { fontSize: text.xl, ...inter.bold, color: color.fg.base },
  tail: { height: space['5xl'] },
}));
