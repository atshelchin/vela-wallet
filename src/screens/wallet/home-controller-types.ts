/**
 * The shape the Home controller returns.
 *
 * This module was split out to keep a platform PAIR
 * (`useHomeController.ts` / `.ts`) from importing its own base file, which
 * Metro resolves back to the `.ts` variant and recurses at module init.
 * That pair is gone — there is one controller now — but the split still earns
 * its keep for the second reason it always had: the explicit `HomeController`
 * annotation on the controller's return type is what stands between a forgotten
 * field and a silent `undefined` in `HomeScreen`.
 */

import type { TFunction } from 'i18next';
import type { StyleProp, ViewStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { useRouter } from 'expo-router';

import type { DisplayCurrency } from '@/hooks/use-display-currency';
import type { useDAppConnection } from '@/models/dapp-connection';
import type { Network } from '@/models/network';
import type { APIToken } from '@/models/types';
import type { WalletState } from '@/models/wallet-state-shape';
import type { currencyMeta } from '@/services/currency';
import type { ActivityBatch, ActivityItem, ConnectionEvent } from '@/services/activity';
import type { LocalTransaction } from '@/services/storage';

export type Tab = 'activity' | 'assets' | 'connections';

/**
 * Which hero notice is due once the silent retry budget is exhausted — the
 * decision `balance_dashboard.rs`'s `BalanceNotice` owns on web
 * (`StillUpdating` / `Unpriced`). It used to be re-derived inside `HomeScreen`
 * from `failedChainIds.length`, which meant the rule shipped twice on web; the
 * screen now only maps the answer to a copy key.
 *
 * `still-updating` is honest for a failed chain (a retry can fix it); a held
 * token with no price source will not resolve on its own, so promising an
 * update there would lie.
 */
export type BalanceNoticeKind = 'still-updating' | 'unpriced';

/**
 * Date-first feed: rows carry no per-row time; instead they're grouped under a
 * date header ("Today" / "Yesterday" / "04/07/2026").
 */
export type FeedRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'item'; item: ActivityItem };

export interface HomeController {
  // identity / nav
  /**
   * Deliberately the concrete `TFunction` — the same call `send-controller-types.ts`
   * documents. `ReturnType<typeof useTranslation>['t']` instantiates the generic
   * hook with its parameters unresolved, and calling that with a literal key
   * exceeds TypeScript's instantiation depth: `t('home.switchAccountTitle')` then
   * widens to a detailed-result union that is not assignable to a `string` prop.
   *
   * It only started mattering when the native twin of this controller was
   * deleted: that one had an INFERRED return type, so screens saw the concrete
   * `t` and never met the generic form.
   */
  t: TFunction;
  router: ReturnType<typeof useRouter>;
  conn: ReturnType<typeof useDAppConnection>;
  state: WalletState;
  address: string;
  accountName: string;
  insets: EdgeInsets;

  // tabs + network filter
  tab: Tab;
  setTab: (tab: Tab) => void;
  networks: Network[];
  selectedNetwork: Network | null;
  selectedChainId: number | null;
  setSelectedChainId: (chainId: number | null) => void;
  showNetSheet: boolean;
  setShowNetSheet: (open: boolean) => void;
  connected: boolean;
  /** Every feed item, unfiltered — the network sheet counts events per chain. */
  activity: ActivityItem[];

  // balance hero
  dc: DisplayCurrency;
  currency: ReturnType<typeof currencyMeta>;
  hidden: boolean;
  toggleHidden: () => void;
  /** USD. `0` stands in for "nothing known yet", which only the a11y label reads. */
  displayTotal: number;
  balancePartial: boolean;
  balanceUnknown: boolean;
  /** `null` while the silent force-retries still have budget left. */
  notice: BalanceNoticeKind | null;
  failedChainIds: number[];
  rateLimitedChainIds: number[];
  /**
   * The chains the "fix your RPC" banner may nag about: failed MINUS
   * rate-limited. A rate limit lifts on its own, so swapping RPC is the wrong
   * fix — the balance quietly stays on cache. Decided by the controller (on web
   * that is `balance_dashboard.rs`'s `banner_chain_ids`) so the exclusion is
   * not re-derived in the screen.
   */
  bannerChainIds: number[];
  unpricedTokens: APIToken[];
  balanceScaleStyle: StyleProp<ViewStyle>;
  hasEntered: React.MutableRefObject<boolean>;

  // balance-detail + rpc-fix
  showBalanceDetail: boolean;
  setShowBalanceDetail: (open: boolean) => void;
  fixChainId: number | null;
  setFixChainId: (chainId: number | null) => void;
  /** Only ever called to REMOVE a repaired chain, by both fix surfaces. */
  setFailedChainIds: (updater: (prev: number[]) => number[]) => void;

  // tokens / assets
  tokens: APIToken[];
  cachedTotal: number | null;
  /**
   * The Assets tab shows its skeleton while a cached total says there IS money
   * but no holding has streamed in yet. Decided by the controller (on web:
   * `balance_dashboard.rs`'s `holdings_loading`), never re-derived downstream.
   */
  holdingsLoading: boolean;

  // activity feed
  activityFeed: FeedRow[];
  aliasMap: Map<string, string>;
  newItemId: string | null;
  chainFor: (chainId: number) => Network | null;
  openDetail: (item: ActivityItem) => void;

  // refresh
  refreshing: boolean;
  onRefresh: () => void;
  refreshStatus: string | undefined;
  listContentStyle: StyleProp<ViewStyle>;
  loadData: (forceRefresh?: boolean) => void;

  // receipt toast
  /**
   * `null` whenever privacy hides amounts — the suppression is the controller's
   * (on web the core withholds the toast outright), so the screen renders
   * whatever it is handed. The row glow, the haptic and the balance pulse still
   * play while hidden; only the figure is withheld.
   */
  receipt: { amount: string; token: string } | null;

  // connections
  connEvents: ConnectionEvent[];
  confirmDisconnect: () => void;
  onPasteConnect: (uri: string) => void;
  clearConnEvents: () => void;
  deleteConnEvent: (id: string) => void;
  eventTx: LocalTransaction | null;
  setEventTx: (tx: LocalTransaction | null) => void;

  // scanner
  showScanner: boolean;
  setShowScanner: (open: boolean) => void;
  onScan: (data: string) => void;

  // account switcher
  openSwitcher: () => void;
  showSwitcher: boolean;
  setShowSwitcher: (open: boolean) => void;
  cachedBalances: Map<string, number>;
  switcherLoading: boolean;

  // tx detail
  detailTx: LocalTransaction | null;
  detailBatch: ActivityBatch | null;
  detailAlias: string | undefined;
  setDetailTx: (tx: LocalTransaction | null) => void;
  setDetailBatch: (batch: ActivityBatch | null) => void;
}
