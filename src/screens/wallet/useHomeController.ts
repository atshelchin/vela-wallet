/**
 * All HomeScreen state, refs, effects and handlers — WEB, driven by the two
 * portable Rust state machines that own this screen (spec 017, group G10:
 * `rust/crates/vela-core/src/app/balance_dashboard.rs` and
 * `.../activity_feed.rs`).
 *
 * This controller owns no product rules. Everything that decides *what number the hero
 * may show* — the streamed per-chain merge, `max(live, cached)`, the
 * complete-results-only cache write, the three silent force-retries before the
 * "still updating" notice, the rate-limited exclusion from the fix-your-RPC
 * banner, the privacy hydrate race — is `balance_dashboard`'s. Everything that
 * decides *which rows the feed shows* — the id dedupe, the batch fold, the
 * tombstones, the celebration gate, the alias memo, the day grouping — is
 * `activity_feed`'s. What is left here is rendering: formatting, navigation, the
 * QR/paste connect paths, the Connections panel (whose events are dApp records,
 * not value transfers, and belong to no machine in this wave) and the two
 * polling cadences the cores document as shell-owned.
 *
 * Deliberate, visible differences from the native controller — each one is a
 * consequence of the contract change the inventory approved (structured feed
 * values instead of pre-formatted strings):
 *
 * - **A locale/number-format change no longer re-reads storage.** The native
 *   controller re-runs the whole feed adapter on `localePrefs`
 *   (`useHomeController.ts:194-197`) because amounts were formatted at load
 *   time; here they are formatted at render, so it is a pure re-derive.
 * - **The celebration toast no longer reverse-parses its own amount string.**
 *   `FeedToast` carries `value` + `symbol`, so a symbol containing a space can
 *   no longer split in the wrong place (`useHomeController.ts:225-227`).
 * - **The `velaSimulateReceipt` dev console hook is not ported** — the core
 *   documents it as out of scope, and there is no event that injects a fake row.
 * - **The network chip filter is applied here, not through the core's
 *   `ChainFilterChanged`.** The core's filtered projection is exactly
 *   reproducible by dropping non-matching items and eliding the headers left
 *   empty (items are newest-first, so a day's rows are contiguous), and keeping
 *   the unfiltered list is what lets the network sheet still count every chain's
 *   events the way `useHomeController.ts:323` does. "Exactly reproducible" is
 *   not taken on trust: the rule lives in `feed-chain-filter.ts` and
 *   `core-projection-parity.test.ts` replays it against the real core.
 */
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DOCK_BAR_HEIGHT } from '@/components/ui/WaveDock';
import { space } from '@/constants/theme';
import { useAllNetworks } from '@/hooks/use-networks';
import { useDisplayCurrency } from '@/hooks/use-display-currency';
import { useDAppConnection } from '@/models/dapp-connection';
import { type Network } from '@/models/network';
import { isAddress } from '@/models/types';
import { useWallet, shortAddress } from '@/models/wallet-state';
import {
  dayGroupLabel, loadConnectionEvents, relativeTime,
  type ActivityItem, type ActivityBatch, type ConnectionEvent,
} from '@/services/activity';
import { currencyMeta } from '@/services/currency';
import { classifyConnectEntry } from '@/services/connect-entry';
import { parseEIP681 } from '@/services/eip681';
import { formatTokenAmount, useLocalePrefs } from '@/services/locale-format';
import { copyToClipboard, hapticLight, isAppActive, showAlert } from '@/services/platform';
import { deleteConnectionEvents, deleteTransaction, type LocalTransaction } from '@/services/storage';
import {
  balanceSwitcherBalances,
  balanceTokens,
  balanceUnpricedTokens,
  balanceView,
  dispatchBalance,
  ensureBalanceDashboard,
  subscribeBalanceDashboard,
} from '@/services/wallet-state-core/balance-resident';
import {
  activityFeedRows,
  activityFeedTx,
  activityFeedView,
  dispatchActivityFeed,
  ensureActivityFeed,
  setActivityFeedAccount,
  subscribeActivityFeed,
} from '@/services/wallet-state-core/feed-resident';
import { dispatchTxTracker } from '@/services/wallet-state-core/tx-tracker-resident';
import type { BalanceView } from '@/services/wallet-state-core/generated/BalanceView';
import type { FeedBatch } from '@/services/wallet-state-core/generated/FeedBatch';
import type { FeedItem } from '@/services/wallet-state-core/generated/FeedItem';
import type { FeedView } from '@/services/wallet-state-core/generated/FeedView';

import { filterFeedRowsByChain } from './feed-chain-filter';
import { detailCounterpartyAlias } from './home-detail-alias';
import { styles } from './HomeScreen.styles';
import type { FeedRow, HomeController, Tab } from './home-controller-types';

export type { FeedRow, Tab } from './home-controller-types';

/**
 * Aggregate poll cadence and the Activity-tab live poll. Shell-owned by
 * contract: `balance_dashboard.rs` declares both constants and says the shell
 * feeds `RefreshRequested`, and `activity_feed.rs` says which tab is visible is
 * render-domain state the core never sees.
 */
const AUTO_REFRESH_MS = 10 * 60 * 1000;
const LIVE_POLL_MS = 10 * 1000;
/**
 * Minimum pull-spinner hold. Also shell-owned by contract — the core's
 * `refreshing` only tracks the fetch, and a pull that resolves from cache would
 * otherwise flash.
 */
const PULL_MIN_MS = 650;

/**
 * The alias overlay `HomeScreen` merges over each row — empty here, and shared
 * so the reference never changes. See the `aliasMap` field at the bottom of the
 * controller for why web hands the screen nothing to merge.
 */
const EMPTY_ALIAS_MAP: Map<string, string> = new Map<string, string>();

// ---------------------------------------------------------------------------
// Formatting — everything the contract change moved out of the store
// ---------------------------------------------------------------------------

/**
 * `compactAmount` (`activity.ts:104-106`): large balances abbreviate
 * (12,345,678 → "12.3M") and the fraction is capped at 4 digits.
 */
function compactAmount(n: number): string {
  return formatTokenAmount(n, { compact: true });
}

/** `formatUsd` (`activity.ts:147-150`) — "$1.00"; "$0.00" for unknown/zero. */
function formatUsd(n: number): string {
  if (!isFinite(n) || n <= 0) return '$0.00';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** `buildBatchView`'s output shape, from the core's structured one. */
function toActivityBatch(batch: FeedBatch): ActivityBatch {
  return {
    kind: batch.kind === 'split' ? 'split' : 'multiSelect',
    count: batch.count,
    totalUsd: batch.total_usd,
    transfers: batch.transfers.map((transfer) => ({
      to: transfer.to,
      toName: transfer.to_name ?? undefined,
      value: transfer.value,
      symbol: transfer.symbol,
      decimals: transfer.decimals,
      usdValue: transfer.usd_value,
      logoUrls: transfer.logo_urls ?? undefined,
    })),
    ids: batch.ids,
    from: batch.from,
    chainId: batch.chain_id,
    timestamp: batch.timestamp,
    status: batch.status,
    txHash: batch.tx_hash,
    userOpHash: batch.user_op_hash,
    symbol: batch.symbol ?? undefined,
    logoUrls: batch.logo_urls ?? undefined,
    to: batch.to ?? undefined,
    toName: batch.to_name ?? undefined,
  };
}

/**
 * The two count-bearing strings a folded batch row needs, passed in already
 * bound to their keys.
 *
 * `t` itself is not handed to the helper on purpose: i18next's `TFunction` is a
 * deeply generic overload set keyed by the literal key union, so threading it
 * through a plain parameter both loses key checking and blows the
 * instantiation-depth limit. Binding at the call site keeps the keys literal —
 * and therefore checked against the corpus — where they belong.
 */
interface BatchLabels {
  /** `componentsTx.receipt.assetsCount` — the multi_select figure. */
  assets: (n: number) => string;
  /** `componentsTx.receipt.recipientsCount` — the split subtitle. */
  recipients: (n: number) => string;
}

/**
 * One core row rendered into the `ActivityItem` the row component takes. The
 * sign comes from `direction`, the figure from `value`/`symbol`, and the
 * "N assets" / "N recipients" lines from the batch count — the exact strings
 * `sendTxToActivity` / `receiveRecordToActivity` / `batchSendToActivity` built,
 * now built at render so a locale change is a re-render.
 */
function toActivityItem(item: FeedItem, labels: BatchLabels): ActivityItem {
  const batch = item.batch ? toActivityBatch(item.batch) : undefined;
  const out = item.direction === 'out';
  const amount = item.value == null
    // multi_select can't sum mixed tokens, so the figure is the asset count and
    // the fiat total leads instead.
    ? labels.assets(batch?.count ?? 0)
    : `${out ? '-' : '+'}${compactAmount(parseFloat(item.value || '0'))} ${item.symbol}`;
  const subtitle = batch
    // Used by the home row only when there's no single recipient (split).
    ? labels.recipients(batch.count)
    : item.counterparty
      ? `${out ? 'to' : 'from'} ${shortAddress(item.counterparty)}`
      : '';
  return {
    id: item.id,
    direction: item.direction,
    title: out ? 'Sent' : 'Received',
    subtitle,
    amount,
    usd: formatUsd(item.usd_value),
    usdValue: item.usd_value,
    token: item.symbol,
    chainId: item.chain_id,
    timestamp: item.timestamp,
    txHash: item.tx_hash ?? undefined,
    address: item.counterparty ?? undefined,
    // Already the resolved overlay (`alias_map[addr] ?? stored`) — the core owns
    // that precedence now.
    alias: item.alias ?? undefined,
    batch,
  };
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export function useHomeController(): HomeController {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeAccount, state } = useWallet();
  const conn = useDAppConnection();
  const { connectToWalletPair, connectToBridge } = conn;

  const address = activeAccount?.address ?? state.address;
  const accountName = activeAccount?.name ?? 'Wallet';

  // Render-domain state the cores deliberately do not see.
  const [tab, setTab] = useState<Tab>('activity');
  const [selectedChainId, setSelectedChainId] = useState<number | null>(null);
  const [showNetSheet, setShowNetSheet] = useState(false);
  const [showBalanceDetail, setShowBalanceDetail] = useState(false);
  const [fixChainId, setFixChainId] = useState<number | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [connEvents, setConnEvents] = useState<ConnectionEvent[]>([]);
  const [detailTx, setDetailTx] = useState<LocalTransaction | null>(null);
  const [detailBatch, setDetailBatch] = useState<ActivityBatch | null>(null);
  const [eventTx, setEventTx] = useState<LocalTransaction | null>(null);
  /** The 650ms floor under the pull spinner (see `PULL_MIN_MS`). */
  const [pullHold, setPullHold] = useState(false);

  // The two cores, mirrored. Both are app-resident singletons, so the initial
  // state is whatever they have already committed — never a second boot.
  const [balance, setBalance] = useState<BalanceView>(balanceView);
  const [feed, setFeed] = useState<FeedView>(activityFeedView);

  useEffect(() => {
    const unsubscribeBalance = subscribeBalanceDashboard(setBalance);
    const unsubscribeFeed = subscribeActivityFeed(setFeed);
    ensureBalanceDashboard();
    ensureActivityFeed();
    // Catch up on anything committed between the initial render and here.
    setBalance(balanceView());
    setFeed(activityFeedView());
    return () => {
      unsubscribeBalance();
      unsubscribeFeed();
    };
  }, []);

  // Tracks the live address for the one loader still in TypeScript (connection
  // events); both cores drop a stale account's answers by construction.
  const addressRef = useRef(address);
  useEffect(() => { addressRef.current = address; }, [address]);

  // The account hand-off. `AccountChanged` is a no-op for the same address, and
  // `setActivityFeedAccount` guards the same way, so this is idempotent — it is
  // the `[address]` reset effect (`useHomeController.ts:399-416`), whose whole
  // body is now the core's.
  useEffect(() => {
    if (!address) return;
    dispatchBalance({ type: 'account_changed', address });
    setActivityFeedAccount(address);
  }, [address]);

  // Privacy is the balance machine's; the feed needs it only to withhold the
  // toast (the row glow and the haptic still happen — invariant ④).
  useEffect(() => {
    dispatchActivityFeed({ type: 'privacy_changed', hidden: balance.hidden });
  }, [balance.hidden]);

  const insets = useSafeAreaInsets();
  // Dock clearance depends on the device's bottom inset — static padding either
  // clips the last row (inset > 0) or wastes space (inset = 0).
  const listContentStyle = useMemo(
    () => [styles.listContent, { paddingBottom: DOCK_BAR_HEIGHT + insets.bottom + space['2xl'] }],
    [insets.bottom],
  );

  // Entrance animations must play ONCE, on first mount.
  const hasEntered = useRef(false);
  useEffect(() => { hasEntered.current = true; }, []);

  // Balance "money in" pulse (cross-platform via shared value).
  const balancePulse = useSharedValue(0);
  const balanceScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + balancePulse.value * 0.03 }] }));

  const networks = useAllNetworks();
  const selectedNetwork = selectedChainId != null ? networks.find((n) => n.chainId === selectedChainId) ?? null : null;
  const connected = conn.status === 'connected' || conn.status === 'reconnecting';
  const dc = useDisplayCurrency();
  // `dc.shown.code`: the currency the fiat figures are ACTUALLY rendered in.
  // It is the chosen one whenever it can be priced, and USD when it cannot —
  // taken together with `dc.shown.rate`, never paired by hand.
  const currency = currencyMeta(dc.shown.code);
  const localePrefs = useLocalePrefs();

  // --- connection activity (dApp records — no machine owns them in this wave) ---
  // Swipe-to-delete tombstone: a per-row delete removes the event from state
  // instantly but writes to storage asynchronously; a background reload that
  // read storage BEFORE that write lands would otherwise repaint it.
  const pendingDeleteConnIds = useRef<Set<string>>(new Set());
  const loadConn = useCallback(async (addr: string) => {
    if (!addr) return;
    try {
      const events = await loadConnectionEvents(addr);
      if (addressRef.current !== addr) return; // account switched mid-load
      const pend = pendingDeleteConnIds.current;
      setConnEvents(pend.size ? events.filter((e) => !pend.has(e.id)) : events);
    } catch { /* ignore — keep the last-known list */ }
  }, []);

  // --- the tick: one place all three machines are poked ---
  // `HomeFocused` is where `reconcileFeedPending` stood: `tx_tracker` owns the
  // pending sweep now (12s-throttled and single-flight inside the core), and it
  // is what tells the feed to re-read through `ReconcileCompleted`.
  const tick = useCallback((force: boolean) => {
    dispatchBalance({ type: 'refresh_requested', force, pull: false });
    dispatchActivityFeed({ type: 'focus_tick' });
    dispatchTxTracker({ type: 'home_focused' });
    void loadConn(addressRef.current);
  }, [loadConn]);

  const loadData = useCallback((forceRefresh = false) => { tick(forceRefresh); }, [tick]);

  useFocusEffect(useCallback(() => {
    // `AppFocused` IS the focus-effect reload (it clears the backgrounded flag
    // and starts a non-forced fetch); the feed's own tick rides alongside.
    dispatchBalance({ type: 'app_focused' });
    dispatchActivityFeed({ type: 'focus_tick' });
    dispatchTxTracker({ type: 'home_focused' });
    void loadConn(addressRef.current);
    const timer = setInterval(() => { if (isAppActive()) tick(false); }, AUTO_REFRESH_MS);
    return () => {
      clearInterval(timer);
      // Blur is this screen's "backgrounded": the polls are gone with the
      // interval, and the core drops any non-forced tick that still arrives.
      dispatchBalance({ type: 'app_backgrounded' });
    };
  }, [tick, loadConn]));

  // Near-real-time payment monitoring while viewing Activity (incremental scans
  // are cheap — they only fetch logs since the last checkpoint).
  useEffect(() => {
    if (tab !== 'activity') return;
    const timer = setInterval(() => {
      if (!isAppActive()) return;
      dispatchBalance({ type: 'refresh_requested', force: false, pull: false });
      dispatchActivityFeed({ type: 'live_tick' });
      dispatchTxTracker({ type: 'home_focused' });
      void loadConn(addressRef.current);
    }, LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [tab, loadConn]);

  // Refresh connection activity the moment a request is handled (approve/reject
  // both clear incomingRequest). The provider awaits the history write before
  // clearing, so storage is already up to date when this fires.
  const hadRequest = useRef(false);
  useEffect(() => {
    const has = conn.incomingRequest !== null;
    if (hadRequest.current && !has) tick(false);
    hadRequest.current = has;
  }, [conn.incomingRequest, tick]);

  // --- pull to refresh ---
  const pullTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (pullTimer.current) clearTimeout(pullTimer.current); }, []);

  const onRefresh = useCallback(() => {
    setPullHold(true);
    // A user pull MUST re-hit RPC (invariant ⑨) — `force` bypasses the shell's
    // 5-minute token cache, and `pull` is what raises the core's spinner.
    dispatchBalance({ type: 'refresh_requested', force: true, pull: true });
    dispatchActivityFeed({ type: 'focus_tick' });
    dispatchTxTracker({ type: 'home_focused' });
    void loadConn(addressRef.current);
    if (pullTimer.current) clearTimeout(pullTimer.current);
    pullTimer.current = setTimeout(() => { setPullHold(false); }, PULL_MIN_MS);
  }, [loadConn]);

  // --- the "money in" pulse ---
  // Keyed on the glowing row, not on the toast: the toast is withheld while
  // privacy is on, but the pulse (like the glow and the haptic) still plays.
  const celebrated = useRef<string | null>(null);
  useEffect(() => {
    const id = feed.new_item_id;
    if (!id) { celebrated.current = null; return; }
    if (id === celebrated.current) return;
    celebrated.current = id;
    balancePulse.value = withSequence(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 1000 }),
    );
  }, [feed.new_item_id, balancePulse]);

  // --- feed projection ---
  const rows = activityFeedRows();
  const projected = useMemo(() => {
    const labels: BatchLabels = {
      assets: (n) => t('componentsTx.receipt.assetsCount', { n }),
      recipients: (n) => t('componentsTx.receipt.recipientsCount', { n }),
    };
    const items: ActivityItem[] = [];
    const uiRows: FeedRow[] = [];
    const aliasById = new Map<string, string>();
    for (const row of rows) {
      if (row.type === 'header') {
        uiRows.push({ kind: 'header', id: row.id, label: dayGroupLabel(row.timestamp) });
        continue;
      }
      const item = toActivityItem(row.item, labels);
      // Keyed by ROW, not by counterparty. The core already answered "what is
      // this row's counterparty called" (`alias_map[addr] ?? stored`); a
      // by-address overlay would re-run that precedence in the screen AND
      // cross-pollinate, handing a stored send-name to a *receive* row from the
      // same address that the core deliberately left unnamed.
      if (item.alias) aliasById.set(item.id, item.alias);
      items.push(item);
      uiRows.push({ kind: 'item', item });
    }
    return { items, uiRows, aliasById };
    // `localePrefs` is a dep so amounts + date headers re-derive when the
    // number/date preset changes — a pure re-render now, never a re-read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, localePrefs, t]);

  // The network chip filter. Items are newest-first so a day's rows are
  // contiguous; keeping a header only when a matching item follows reproduces
  // the core's own filtered grouping exactly, while `projected.items` stays the
  // unfiltered list the network sheet counts from.
  const activityFeed = useMemo<FeedRow[]>(
    () => filterFeedRowsByChain(projected.uiRows, selectedChainId),
    [projected.uiRows, selectedChainId],
  );

  // --- receipt toast ---
  // Already withheld by the core while privacy hides amounts (`FeedView::toast`
  // is `None` then), so nothing here — and nothing in `HomeScreen` — repeats
  // that test.
  const receipt = useMemo(() => {
    const toast = feed.toast;
    if (!toast) return null;
    // Structured now: no stripping the symbol back off a formatted string.
    return { amount: compactAmount(parseFloat(toast.value || '0')), token: toast.symbol };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.toast, localePrefs]);

  // --- account switcher ---
  const openSwitcher = useCallback(() => {
    // The ≤1-account branch stays here: it is a clipboard write, not a decision.
    if (state.accounts.length <= 1) { if (address) void copyToClipboard(address); return; }
    // Cache first, refresh after (invariant ⑩): the core opens the modal the
    // moment the cached rows answer, then re-fetches every account.
    dispatchBalance({ type: 'switcher_opened', addresses: state.accounts.map((a) => a.address) });
  }, [address, state.accounts]);

  const setShowSwitcher = useCallback((open: boolean) => {
    if (!open) dispatchBalance({ type: 'switcher_closed' });
  }, []);

  const toggleHidden = useCallback(() => {
    dispatchBalance({ type: 'privacy_toggled' });
  }, []);

  /**
   * Both fix surfaces (the banner chip and the balance-detail sheet) call this
   * to drop a repaired chain. The updater is applied to the core's own list and
   * each removed id becomes a `FixChainResolved`, which is what actually clears
   * it — and reloads, exactly as `HomeScreen.tsx:337-340` does.
   */
  const setFailedChainIds = useCallback((updater: (prev: number[]) => number[]) => {
    const before = balanceView().failed_chain_ids;
    const after = updater(before);
    for (const chainId of before) {
      if (!after.includes(chainId)) dispatchBalance({ type: 'fix_chain_resolved', chain_id: chainId });
    }
  }, []);

  // --- connect (shared by scanner + pasted URI) ---
  // Returns true if `data` was a recognized pairing link and a connection was
  // kicked off.
  // The five-way decision is the CORE's (invariant ⑨) — `classifyConnectEntry`
  // asks `dapp_session`'s own `classify_connect_input` rather than re-deciding
  // here and letting the core decide the same thing again over the string this
  // hook hands the resident. What stays local is only the side effect each
  // verdict names: which tab to show, where to navigate, what to answer.
  const connectFromUri = useCallback((data: string): boolean => {
    const entry = classifyConnectEntry(data);
    switch (entry.kind) {
      case 'walletpair':
        connectToWalletPair(entry.uri);
        setTab('connections');
        return true;
      case 'remote-inject':
        connectToBridge(entry.session);
        setTab('connections');
        return true;
      case 'browser':
        // Any remaining web address (full URL or bare host) → the in-app browser.
        router.push({ pathname: '/browser', params: { url: entry.url } });
        return true;
      case 'invalid':
        return false;
    }
  }, [connectToWalletPair, connectToBridge, router]);

  const onScan = useCallback((data: string) => {
    setShowScanner(false);

    // EIP-681 payment request → open Send pre-filled and locked. We need a chain
    // to lock onto; a chainless request degrades to a plain recipient prefill.
    const req = parseEIP681(data);
    if (req && req.chainId != null) {
      const params: Record<string, string> = {
        prefilledRecipient: req.recipient,
        prefilledChainId: String(req.chainId),
        locked: '1',
      };
      if (req.tokenAddress) params.prefilledTokenAddress = req.tokenAddress;
      if (req.amountBaseUnits != null) params.prefilledAmountBase = req.amountBaseUnits.toString();
      router.push({ pathname: '/send', params });
      return;
    }

    const addr = req?.recipient ?? data;
    if (isAddress(addr)) {
      router.push(`/send?prefilledRecipient=${addr}`);
      return;
    }
    if (!connectFromUri(data)) {
      showAlert(t('home.invalidQrTitle'), t('home.invalidQrBody'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, connectFromUri]);

  const onPasteConnect = useCallback((uri: string) => {
    if (!connectFromUri(uri)) {
      showAlert(t('connect.list.invalidLinkTitle'), t('connect.list.invalidLinkBody'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectFromUri]);

  const chainFor = (chainId: number): Network | null => networks.find((n) => n.chainId === chainId) ?? null;

  const openDetail = (item: ActivityItem) => {
    // A grouped batch row carries its own breakdown; a normal row resolves to a
    // single stored record by id.
    if (item.batch) { setDetailTx(null); setDetailBatch(item.batch); return; }
    const tx = activityFeedTx(item.id);
    if (tx) { setDetailBatch(null); setDetailTx(tx); }
  };

  // Connection-activity clear (whole list) + per-row delete. Both prune the
  // underlying records; on-chain transactions are untouched.
  const clearConnEvents = useCallback(() => {
    if (!address) return;
    showAlert(t('home.connClearTitle'), t('home.connClearBody'), [
      { text: t('home.cancel'), style: 'cancel' },
      {
        text: t('home.connClearConfirm'),
        style: 'destructive',
        onPress: () => { deleteConnectionEvents(address); setConnEvents([]); },
      },
    ]);
  }, [address, t]);

  // Disconnect is irreversible, so gate it behind a confirm — a bare tap
  // shouldn't silently drop a live connection.
  const confirmDisconnect = useCallback(() => {
    hapticLight();
    showAlert(t('connect.browser.disconnectTitle'), t('connect.browser.disconnectBody'), [
      { text: t('home.cancel'), style: 'cancel' },
      { text: t('home.connDisconnect'), style: 'destructive', onPress: conn.disconnectBridge },
    ]);
  }, [t, conn.disconnectBridge]);

  const deleteConnEvent = useCallback((id: string) => {
    // Optimistic remove + tombstone until the async storage write commits.
    pendingDeleteConnIds.current.add(id);
    setConnEvents((prev) => prev.filter((e) => e.id !== id));
    deleteTransaction(id)
      .catch((e) => console.warn('[Home] connection-event delete failed', e))
      .finally(() => { pendingDeleteConnIds.current.delete(id); });
  }, []);

  // What the detail sheet calls the open tx's counterparty. The core already
  // answered that question for THIS row (`aliasById` holds its
  // `alias_map[addr] ?? stored` verdict, which is what the list renders), so
  // the sheet reads the core's answer first and the stored name only as the
  // fallback for a row outside the committed view. Reading them the other way
  // round — which this did — let one transaction carry two different names on
  // two surfaces. See `home-detail-alias.ts`.
  const detailAlias = detailTx
    ? detailCounterpartyAlias(detailTx.toName, projected.aliasById.get(detailTx.id))
    : undefined;

  const refreshStatus = balance.last_refreshed_at_ms != null
    ? t('home.lastUpdated', { ago: relativeTime(Math.floor(balance.last_refreshed_at_ms / 1000)) })
    : undefined;

  return {
    // identity / nav
    t, router, conn, state, address, accountName, insets,
    // tabs + network filter
    tab, setTab, networks, selectedNetwork, selectedChainId, setSelectedChainId,
    showNetSheet, setShowNetSheet, connected, activity: projected.items,
    // balance hero
    dc, currency,
    hidden: balance.hidden,
    toggleHidden,
    // `null` is the skeleton (and the masked) state; only the a11y label reads
    // the number then, and `dc.fmt(0)` is what it has always shown there.
    displayTotal: balance.display_total_usd ?? 0,
    balancePartial: balance.balance_partial,
    balanceUnknown: balance.balance_unknown,
    // `Some` only when partial AND the silent retries are exhausted, so the
    // screen's `balancePartial && notice` gate is unchanged. WHICH line to show
    // is the core's `BalanceNotice`, not a second `failedChainIds.length` test
    // in the screen.
    notice: balance.notice === null
      ? null
      : balance.notice === 'unpriced' ? 'unpriced' : 'still-updating',
    failedChainIds: balance.failed_chain_ids,
    rateLimitedChainIds: balance.rate_limited_chain_ids,
    // Failed minus rate-limited, straight from the core (invariant ⑦) — the
    // screen no longer re-derives the exclusion.
    bannerChainIds: balance.banner_chain_ids,
    unpricedTokens: balanceUnpricedTokens(),
    balanceScaleStyle, hasEntered,
    // balance-detail + rpc-fix
    showBalanceDetail, setShowBalanceDetail, fixChainId, setFixChainId, setFailedChainIds,
    // tokens / assets
    tokens: balanceTokens(),
    cachedTotal: balance.cached_total_usd,
    // The Assets-tab skeleton gate — the core's, not a second
    // `tokens.length === 0 && cachedTotal > 0` in the screen.
    holdingsLoading: balance.holdings_loading,
    // activity feed
    activityFeed,
    // Empty BY CONSTRUCTION. `aliasMap` is the native controller's ENS overlay,
    // which `HomeScreen` merges over each row's stored name; on web the core has
    // already applied exactly that precedence and stamped the answer on
    // `item.alias`, so handing the screen a second copy would re-decide a
    // settled question — and, because a shell-built map is keyed by address
    // rather than by row, would leak one row's name onto another's.
    aliasMap: EMPTY_ALIAS_MAP,
    newItemId: feed.new_item_id,
    chainFor, openDetail,
    // refresh
    refreshing: pullHold || balance.refreshing,
    onRefresh, refreshStatus, listContentStyle, loadData,
    // receipt toast
    receipt,
    // connections
    connEvents, confirmDisconnect, onPasteConnect, clearConnEvents, deleteConnEvent, eventTx, setEventTx,
    // scanner
    showScanner, setShowScanner, onScan,
    // account switcher
    openSwitcher,
    showSwitcher: balance.switcher.open,
    setShowSwitcher,
    cachedBalances: balanceSwitcherBalances(),
    switcherLoading: balance.switcher.loading,
    // tx detail
    detailTx, detailBatch, detailAlias, setDetailTx, setDetailBatch,
  };
}
