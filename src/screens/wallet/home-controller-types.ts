/**
 * The shape the Home controller returns on every platform.
 *
 * A standalone module for the same reason `browser-history-controller-types.ts`
 * is one: a platform pair (`useHomeController.ts` / `.web.ts`) must never import
 * its own base file — on web, Metro resolves that specifier back to the `.web.ts`
 * variant itself, and a self-referential re-export recurses at module init.
 *
 * The native controller keeps its own inline declarations (it is byte-frozen for
 * this wave — FR-202, native is untouched); this module carries the same shapes
 * plus the explicit `HomeController` contract, which the web twin declares as
 * its return type. That annotation is the only thing standing between a
 * forgotten field and a silent `undefined` in `HomeScreen`, since `tsc` resolves
 * the screen's import to the base variant and never compares the two.
 */

import type { StyleProp, ViewStyle } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { useTranslation } from 'react-i18next';
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
 * Date-first feed: rows carry no per-row time; instead they're grouped under a
 * date header ("Today" / "Yesterday" / "04/07/2026").
 */
export type FeedRow =
  | { kind: 'header'; id: string; label: string }
  | { kind: 'item'; item: ActivityItem };

export interface HomeController {
  // identity / nav
  t: ReturnType<typeof useTranslation>['t'];
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
  noticeAllowed: boolean;
  failedChainIds: number[];
  rateLimitedChainIds: number[];
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
