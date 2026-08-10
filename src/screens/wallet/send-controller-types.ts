/**
 * The shape the Send controller returns on every platform.
 *
 * A standalone module for the same reason `home-controller-types.ts` is one: a
 * platform pair (`useSendController.ts` / `.web.ts`) must never import its own
 * base file — on web Metro resolves that specifier back to the `.web.ts` variant
 * itself, and a self-referential re-export recurses at module init.
 *
 * `SendScreen`, `EnterDetailsStep` and `ConfirmStep` are typed against THIS
 * interface rather than against `ReturnType<typeof useSendController>`, which is
 * what makes the two controllers substitutable: `tsc` resolves the screen's
 * `./useSendController` import to the native variant and never compares the two,
 * so a field only the native controller happens to have would otherwise be a
 * silent `undefined` on web.
 *
 * `ExtendsSendController` is the other half of that guarantee — the native
 * controller re-exports its own return type through it, so dropping a field
 * there fails the build instead of the screen.
 *
 * ### The one rule this contract encodes
 *
 * Nothing here is a bare state setter for anything the `send` core owns. The
 * whole money pipeline — the step machine, the fee quote, the tx status, the
 * re-entry lock, the treasury sheet — is written by exactly one writer, and the
 * views only ever name an INTENT (`cancelSigning`, `retryAfterError`,
 * `onFeeUpdate`). `setRecipient` / `setAmount` survive because they are the
 * core's own `SetRecipient` / `SetAmount` events, not writes to a second copy.
 */

import type { TextInput } from 'react-native';
import type { TFunction } from 'i18next';

import type { RecipientDraft } from '@/components/send/MultiRecipientEditor';
import type { ReceiptTransfer } from '@/components/ui/TransactionReceipt';
import type { DisplayCurrency } from '@/hooks/use-display-currency';
import type { useSafeRouter } from '@/hooks/use-safe-router';
import type { Account, APIToken } from '@/models/types';
import type { WalletState } from '@/models/wallet-state-shape';
import type { MultiTokenSpec } from '@/services/batch-send';
import type { TreasuryStatus } from '@/services/bundler-service';
import type { RecipientIdentity } from '@/services/recipient-identity';
import type { RecipientRisk } from '@/services/recipient-risk';
import type { TransactionFeeEstimate } from '@/services/safe-transaction';
import type { AssetSimResult } from '@/services/tx-simulation';

export type SendStep = 'select-token' | 'enter-details' | 'confirm';

/**
 * `'confirming'` exists only in the native controller's vocabulary (nothing ever
 * sets it); the core's `SendTxStatus` is the same union without it.
 */
export type SendTxStatusName =
  | 'idle'
  | 'preparing'
  | 'signing'
  | 'submitting'
  | 'confirming'
  | 'confirmed'
  | 'error';

export type SendLockError =
  | { kind: 'network'; chainId: number }
  | { kind: 'token' }
  | null;

/**
 * The same-asset ceiling breach, in base units — `ConfirmStep` formats it
 * against the token's decimals.
 */
export interface SameAssetFeeIssue {
  symbol: string;
  transferAmount: bigint;
  balance: bigint;
  feeAmount: bigint;
  maxTransferAmount: bigint;
}

/** The multi-select wiring `TokenSelector` consumes. */
export interface SendTokenMultiSelect {
  selectedIds: Set<string>;
  onToggle: (token: APIToken) => void;
  onToggleAll: (visible: APIToken[]) => void;
  isAllSelected: (visible: APIToken[]) => boolean;
  onNetworkChange: (chainId: number | null) => void;
  onConfirm: () => void;
  confirmLabel: string;
  selectAllLabel: string;
}

export interface SendController {
  // ── context ───────────────────────────────────────────────────────────────
  /**
   * Deliberately the concrete `TFunction`, not `ReturnType<typeof
   * useTranslation>['t']`: the latter instantiates the generic hook with its
   * unresolved parameters and yields a `t` whose return type is not a
   * `ReactNode`, so every `<Text>{t(…)}</Text>` in a step component would fail.
   */
  t: TFunction;
  router: ReturnType<typeof useSafeRouter>;
  /** The EIP-681 lock: recipient + chain + token (+ maybe amount) are fixed. */
  locked: boolean;
  /** Fixed only when the request actually named an amount. */
  amountLocked: boolean;
  /** Present ⇒ the recipient field is read-only and the pickers are hidden. */
  prefilledRecipient?: string;
  activeAccount: Account | undefined;
  state: WalletState;
  address: string;
  dc: DisplayCurrency;
  formatUsd: (usd: number) => string;

  // ── stage ─────────────────────────────────────────────────────────────────
  step: SendStep;
  lockError: SendLockError;
  resolvingLock: boolean;
  addingNetwork: boolean;
  /** Already worded — the line under the "add this network" button. */
  addNetworkMsg: string | null;

  // ── token list & selection ────────────────────────────────────────────────
  tokens: APIToken[];
  loading: boolean;
  selectedToken: APIToken | null;
  pickedTokens: APIToken[];
  tokenMultiSelect: SendTokenMultiSelect;
  /** Seeds `TokenSelector`'s network filter when the picker re-opens. */
  multiSelectChainId: number | null;
  multiSelectMode: boolean;

  // ── the amount form ───────────────────────────────────────────────────────
  recipient: string;
  amount: string;
  inputInUsd: boolean;
  /**
   * `amount` with the fiat↔token conversion already applied — the ONLY number
   * the confirm page may put on screen, because on web it is produced by the
   * same core call the signed batch is built from ("displayed == signed"). The
   * shell must never re-derive it.
   */
  tokenAmount: string;
  splitMode: boolean;
  recipients: RecipientDraft[];
  /** Split mode: the rows' total exceeds the balance — the live hint under the
   *  editor's total, decided by whoever owns the `Continue` refusal. */
  splitOverBalance: boolean;
  pickerTarget: string | null;
  amountWarning: string | null;
  amountInputRef: { current: TextInput | null };
  copiedContract: boolean;
  setCopiedContract: (copied: boolean) => void;
  /** The Continue button's gate — `disabled` is its negation. */
  canContinue: boolean;
  /** The confirm slide's gate — `disabled` is its negation. Fee settled ∧
   *  nothing re-quoting ∧ no same-asset breach ∧ the send still idle. */
  canConfirm: boolean;

  // ── fee & confirm ─────────────────────────────────────────────────────────
  feeEstimate: TransactionFeeEstimate | null;
  estimatingGas: boolean;
  feeBusy: boolean;
  gasFeeToken: string | null;
  /** Lets `GasFeeCard` build a real initCode for an undeployed Safe. */
  publicKeyHex: string | undefined;
  sameAssetFeeIssue: SameAssetFeeIssue | null;
  multiTokenSpecs: (chainId: number) => MultiTokenSpec[];
  sending: boolean;
  txStatus: SendTxStatusName;
  /** Already worded, and only ever from the core's semantic key (invariant ⑮). */
  txError: string | null;
  recipientIdentity: RecipientIdentity | null;
  recipientRisk: RecipientRisk | null;
  sim: AssetSimResult | null;
  treasuryBootstrap: TreasuryStatus | null;

  // ── receipt ───────────────────────────────────────────────────────────────
  txHash: string | null;
  userOpHash: string | null;
  receiptTransfers: ReceiptTransfer[] | null;
  receiptKind: 'split' | 'multiSelect' | null;
  receiptFailed: boolean;
  feeHeld: boolean;
  feeRejected: boolean;
  /** The resolved token amount the receipt shows (fiat input already applied). */
  receiptAmount: string;
  receiptUsdValue: number;

  // ── sheets ────────────────────────────────────────────────────────────────
  showScanner: boolean;
  showContactPicker: boolean;
  showBatchImport: boolean;

  // ── intents ───────────────────────────────────────────────────────────────
  setRecipient: (recipient: string) => void;
  setAmount: (amount: string) => void;
  toggleFiatInput: () => void;
  handleMaxAmount: () => void;
  enterSplitMode: () => void;
  seedSplitRecipients: (rows: RecipientDraft[]) => void;
  handleRecipientsChange: (rows: RecipientDraft[]) => void;
  applyPickedAddress: (address: string) => void;
  handleSelectToken: (token: APIToken) => void;
  /** The token hero row — back to the picker, keeping the recipient. */
  changeToken: () => void;
  handleBack: () => void;
  handleContinue: () => void;
  handleEditAmount: () => void;
  handleConfirm: () => void;
  /** The ✕ during preparing/signing. Never offered once the op is en route. */
  cancelSigning: () => void;
  retryAfterError: () => void;
  handleAddNetwork: (chainId: number) => void;
  refreshTokens: () => void;
  openScanner: () => void;
  closeScanner: () => void;
  /** A raw scan payload — the shell parses EIP-681, the core routes it. */
  handleScan: (data: string) => void;
  openContactPicker: (target: string | null) => void;
  closeContactPicker: () => void;
  openBatchImport: () => void;
  closeBatchImport: () => void;
  onFeeTokenChange: (token: string | null) => void;
  onFeeUpdate: (fee: TransactionFeeEstimate) => void;
  onFeeBusyChange: (busy: boolean) => void;
  dismissTreasurySheet: () => void;
  /** After funding the relayer — re-runs the step-appropriate flow. */
  retryAfterBootstrap: () => void;
  /** Receipt "Done". */
  handleDone: () => void;
  /** Receipt "save contact" — routed through the contacts core on web. */
  saveReceiptContact: () => void;
}

/**
 * Identity constrained to the contract: `type X = ExtendsSendController<Y>` is
 * `Y`, and fails to compile when `Y` has drifted from `SendController`.
 */
export type ExtendsSendController<T extends SendController> = T;
