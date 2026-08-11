/**
 * All Send-flow state, refs, effects and handlers — WEB, driven by the portable
 * Rust state machine that owns this screen (spec 017, group G12:
 * `rust/crates/vela-core/src/app/send.rs`).
 *
 * `useSendController.ts` is the native counterpart and is untouched apart from
 * the semantic handlers this contract added (FR-202: native behaviour is
 * byte-identical — every one of them inlines exactly what the view used to do).
 *
 * This twin owns no product rules. Everything that decides *whether money may
 * move* is the core's: the three modes, the step machine, EIP-681 locked-request
 * resolution, the live amount validation, the string-exact Max math, the
 * same-asset fee ceiling, the 15 s estimate ∥ treasury pre-check, the single
 * -flight re-entry lock with its generation tokens, the pre-sign cancel
 * checkpoints, and the Submitted → ClearTokenCache → PersistTxRecords →
 * TrackSubmitted ordering. What is left here is rendering and wording.
 *
 * ### Two rules this file exists to obey
 *
 * - **Nothing reads a module-level mutable during render.** The view is
 *   projected ONCE per commit (in `onView`) and pushed into a single state cell
 *   together with everything derived from it — the `wallet-state.web.ts`
 *   discipline, learned from an account-less wallet that still showed an address
 *   because React Compiler cached a render-time read of a module variable.
 * - **One writer per fact.** The screen and both step components name intents
 *   only; there is no second copy of `txStatus`, the fee quote or the re-entry
 *   lock to drift from the core's.
 *
 * ### Deliberate, visible differences from the native controller
 *
 * - **"Select all valuable" stays scoped to what the picker is showing.** The
 *   core's `ToggleAllMultiTokens` selects every valuable token on the filtered
 *   CHAIN; `TokenSelector` hands its own search/category-filtered list to
 *   `onToggleAll`. Sweeping tokens the user cannot see is a fund-safety
 *   regression, so the shell reproduces `use-token-multi-select.ts` exactly by
 *   toggling each visible row through the core's own per-token event. The
 *   core's aggregate event is therefore unused on web.
 * - **A scanned EIP-681 request re-locks the flow in place, not through the
 *   router.** The core's `ScanResolved` re-runs `Open` itself, so there is no
 *   `router.replace` and the address bar keeps the URL the screen was opened
 *   with (a hard refresh then loses the lock, exactly as an unscanned visit
 *   would).
 * - **Tapping the token hero keeps the recipient.** `Back` from enter-details
 *   clears it; the hero row never did. The shell re-asserts the recipient it had
 *   so the two agree, which costs one extra identity resolution.
 */
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { TextInput } from 'react-native';

import { type RecipientDraft } from '@/components/send/MultiRecipientEditor';
import { type ReceiptTransfer } from '@/components/ui/TransactionReceipt';
import { useDisplayCurrency } from '@/hooks/use-display-currency';
import { useSafeRouter } from '@/hooks/use-safe-router';
import { chainName } from '@/models/network';
import { tokenId, type APIToken } from '@/models/types';
import { useWallet } from '@/models/wallet-state';
import { selectAllValuable, type MultiTokenSpec } from '@/services/batch-send';
import { type TreasuryStatus } from '@/services/bundler-service';
import { saveContactThroughCore } from '@/hooks/use-contacts-book.web';
import { ZERO_DECIMAL_CODES } from '@/services/currency';
import { parseEIP681 } from '@/services/eip681';
import { useLocalePrefs } from '@/services/locale-format';
import { showAlert } from '@/services/platform';
import { prefetchForSend, type TransactionFeeEstimate } from '@/services/safe-transaction';
import { deserializeAssetSim, type AssetSimResult } from '@/services/tx-simulation';
import { setSendTrackerSink } from '@/services/wallet-state-core/send-executor.web';
import { trackSubmitted } from '@/services/wallet-state-core/tx-tracker-resident.web';
import { createSendSession, type SendSession } from '@/services/wallet-state-core/send-session';
import {
  indexTokens,
  rememberFee,
  resolveFee,
  sendTokenId,
  synthApiToken,
} from '@/services/wallet-state-core/send-types';
import type { SendAlertKind } from '@/services/wallet-state-core/generated/SendAlertKind';
import type { SendAmountWarning } from '@/services/wallet-state-core/generated/SendAmountWarning';
import type { SendEvent } from '@/services/wallet-state-core/generated/SendEvent';
import type { SendRecipientDraft } from '@/services/wallet-state-core/generated/SendRecipientDraft';
import type { SendToken } from '@/services/wallet-state-core/generated/SendToken';
import type { SendView } from '@/services/wallet-state-core/generated/SendView';

import type {
  SameAssetFeeIssue,
  SendController,
  SendLockError,
  SendStep,
  SendTokenMultiSelect,
} from './send-controller-types';

// ---------------------------------------------------------------------------
// The projection pushed with every committed view
// ---------------------------------------------------------------------------

interface SendSnapshot {
  view: SendView;
  tokens: APIToken[];
  selectedToken: APIToken | null;
  pickedTokens: APIToken[];
  recipients: RecipientDraft[];
  multiSpecs: MultiTokenSpec[];
  fee: TransactionFeeEstimate | null;
  sim: AssetSimResult | null;
  sameAssetFeeIssue: SameAssetFeeIssue | null;
  receiptTransfers: ReceiptTransfer[] | null;
  treasuryBootstrap: TreasuryStatus | null;
}

/** The core's own pristine projection — the frame before the first commit. */
const INITIAL_VIEW: SendView = {
  stage: 'select_token',
  loading: true,
  locked: false,
  amount_locked: false,
  lock_error: null,
  resolving_lock: false,
  adding_network: false,
  add_network_msg: null,
  tokens: [],
  selected_token: null,
  recipient: '',
  amount: '',
  amount_fiat_code: null,
  denom_toggle_shown: false,
  denom_toggle_enabled: false,
  denom_toggle_reason: null,
  confirm_amount_issue: null,
  token_amount: '',
  split_mode: false,
  recipients: [],
  split_over_balance: false,
  picker_target: null,
  multi_select_mode: false,
  multi_selected_ids: [],
  multi_chain_id: null,
  multi_specs: [],
  show_scanner: false,
  show_contact_picker: false,
  show_batch_import: false,
  estimating_gas: false,
  fee_busy: false,
  fee: null,
  gas_fee_token: null,
  amount_warning: null,
  same_asset_fee_issue: null,
  can_continue: false,
  can_confirm: false,
  sending: false,
  tx_status: 'idle',
  tx_error: null,
  tx_hash: null,
  user_op_hash: null,
  receipt: null,
  treasury_bootstrap: null,
  recipient_identity: null,
  recipient_risk: null,
  sim_json: null,
};

const EMPTY_SNAPSHOT: SendSnapshot = {
  view: INITIAL_VIEW,
  tokens: [],
  selectedToken: null,
  pickedTokens: [],
  recipients: [],
  multiSpecs: [],
  fee: null,
  sim: null,
  sameAssetFeeIssue: null,
  receiptTransfers: null,
  treasuryBootstrap: null,
};

/**
 * The nav bar is the only thing that still reads `step` once a lock surface is
 * up, and a locked request always carries a prefilled recipient — so the TS
 * controller's `hasPreselection` had already put it on `enter-details` (a back
 * arrow, not a close ✕) before either lock surface rendered.
 */
const STEP_OF: Record<SendView['stage'], SendStep> = {
  lock_error: 'enter-details',
  lock_resolving: 'enter-details',
  receipt: 'confirm',
  select_token: 'select-token',
  enter_details: 'enter-details',
  confirm: 'confirm',
};

/**
 * The per-view projector. Everything it caches is keyed on the STRUCTURE of the
 * slice it came from, so an unrelated view change (a fee re-quote, a spinner)
 * hands back the same array identity — `TokenSelector` and
 * `MultiRecipientEditor` both key their rows off it.
 */
interface Projector {
  session: SendSession | null;
  started: boolean;
  openKey: string | null;
  /** The FULL `APIToken` rows the API returned, by `tokenId()`. */
  index: Map<string, APIToken>;
  /** Placeholders the core minted itself (locked requests), by wire identity. */
  synth: Map<string, APIToken>;
  viewKey: string;
  tokensKey: string;
  tokens: APIToken[];
  selectedKey: string;
  selectedToken: APIToken | null;
  pickedKey: string;
  pickedTokens: APIToken[];
  recipientsKey: string;
  recipients: RecipientDraft[];
  specsKey: string;
  multiSpecs: MultiTokenSpec[];
  transfersKey: string;
  receiptTransfers: ReceiptTransfer[] | null;
  treasuryKey: string;
  treasuryBootstrap: TreasuryStatus | null;
  simKey: string;
  sim: AssetSimResult | null;
}

function newProjector(): Projector {
  return {
    session: null,
    started: false,
    openKey: null,
    index: new Map(),
    synth: new Map(),
    viewKey: '',
    tokensKey: '',
    tokens: [],
    selectedKey: '',
    selectedToken: null,
    pickedKey: '',
    pickedTokens: [],
    recipientsKey: '',
    recipients: [],
    specsKey: '',
    multiSpecs: [],
    transfersKey: '',
    receiptTransfers: null,
    treasuryKey: '',
    treasuryBootstrap: null,
    simKey: '',
    sim: null,
  };
}

function toDraft(row: SendRecipientDraft): RecipientDraft {
  return {
    id: row.id,
    address: row.address,
    amount: row.amount,
    ...(row.name != null ? { name: row.name } : {}),
  };
}

function toWireDraft(row: RecipientDraft): SendRecipientDraft {
  return {
    id: row.id,
    address: row.address,
    amount: row.amount,
    name: row.name ?? null,
  };
}

function toSpec(spec: SendView['multi_specs'][number]): MultiTokenSpec {
  return { tokenAddress: spec.token_address, decimals: spec.decimals, amount: spec.amount };
}

/**
 * The core reports a semantic warning and a symbol; the words are the shell's,
 * and every one of them is the string `useSendController.ts:326-398` produced
 * for the same situation — including the `'gas token'` fallback.
 */
function wordWarning(t: TFunction, warning: SendAmountWarning): string {
  switch (warning.type) {
    case 'not_enough_token':
      return t('send.warnNotEnoughToken', { symbol: warning.symbol });
    case 'insufficient_for_gas':
      return t('send.warnInsufficientForGas', { sym: warning.symbol ?? '' });
    case 'need_gas':
      return t('send.warnNeedGas', { sym: warning.symbol ?? 'gas token' });
    case 'cannot_convert':
      // The digits are fine; the FACTOR is missing. Names the way out, which
      // `denom_toggle_shown` guarantees is on screen.
      return t('send.warnCannotConvert', { code: warning.code, symbol: warning.symbol });
  }
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export function useSendController(): SendController {
  const { t } = useTranslation();
  useLocalePrefs(); // re-render when the number format changes
  const router = useSafeRouter();
  const params = useLocalSearchParams<{
    preselectedSymbol?: string;
    preselectedNetwork?: string;
    prefilledRecipient?: string;
    prefilledChainId?: string;
    prefilledTokenAddress?: string;
    prefilledAmountBase?: string;
    locked?: string;
    preselectedMulti?: string;
  }>();
  const { activeAccount, state } = useWallet();
  const address = activeAccount?.address ?? state.address;
  const dc = useDisplayCurrency();
  const fiatDecimals = ZERO_DECIMAL_CODES.has(dc.code) ? 0 : 2;

  const [snapshot, setSnapshot] = useState<SendSnapshot>(EMPTY_SNAPSHOT);
  // Pure local UI, owned by nothing else: the "copied" tick on the contract row.
  const [copiedContract, setCopiedContract] = useState(false);
  // The `prefetchedAccount.current?.publicKeyHex` mirror `GasFeeCard` reads —
  // pushed by the executor, never read from a module during render.
  const [publicKeyHex, setPublicKeyHex] = useState<string | undefined>(undefined);
  const amountInputRef = useRef<TextInput>(null);
  const projector = useRef<Projector>(newProjector());

  // The React-side facts the ports need, re-read (never captured) so the session
  // outlives every re-render without going stale.
  const live = useRef({ t, router, activeAccount });
  useEffect(() => {
    live.current = { t, router, activeAccount };
  });

  // ── wording (needs `t`, so it is derived at render, never stored) ─────────
  const alert = useCallback(
    (kind: SendAlertKind) => {
      // `live.current.t`, not the captured `t`: the ports close over this
      // callback once, and a language change after that must still word the
      // alert in the language the user is now reading.
      const tr = live.current.t;
      switch (kind.type) {
        case 'invalid_address':
          showAlert(tr('send.alertInvalidAddressTitle'), tr('send.alertInvalidAddressBody'));
          return;
        case 'invalid_amount':
          showAlert(tr('send.alertInvalidAmountTitle'), tr('send.alertInvalidAmountBody'));
          return;
        case 'insufficient_balance':
          showAlert(
            tr('send.alertInsufficientBalanceTitle'),
            kind.warning
              ? wordWarning(tr, kind.warning)
              : tr('send.alertInsufficientBalanceBody', {
                  defaultValue: 'The total exceeds your balance.',
                }),
          );
          return;
        case 'split_over_balance':
          showAlert(
            tr('send.alertInsufficientBalanceTitle'),
            tr('send.alertInsufficientBalanceBody', {
              defaultValue: 'The total exceeds your balance.',
            }),
          );
          return;
        case 'load_tokens_failed':
          showAlert(tr('common.error'), tr('send.alertLoadTokensError'));
          return;
        case 'estimate_failed':
          showAlert(
            tr('send.alertEstimateFailedTitle'),
            // The 15 s race's rejection message was never localized; every other
            // refusal used the generic body (the raw service message the core
            // deliberately no longer carries — invariant ⑮).
            kind.kind === 'timeout'
              ? 'Could not estimate gas in time. Please try again.'
              : tr('send.alertEstimateFailedBody'),
          );
          return;
        case 'account_unavailable':
          showAlert(tr('send.alertEstimateFailedTitle'), tr('send.alertAccountUnavailableBody'));
      }
    },
    [],
  );

  // ── the session ───────────────────────────────────────────────────────────
  const resolveToken = useCallback((wire: SendToken): APIToken => {
    const p = projector.current;
    const known = p.index.get(sendTokenId(wire));
    // The API row is authoritative for everything the core does not carry
    // (name, logo) — but only while it still describes the same holding.
    if (known && known.balance === wire.balance && known.decimals === wire.decimals) return known;
    const key = JSON.stringify(wire);
    const cached = p.synth.get(key);
    if (cached) return cached;
    const built = synthApiToken(wire);
    if (p.synth.size > 64) p.synth.clear();
    p.synth.set(key, built);
    return built;
  }, []);

  const commit = useCallback(
    (view: SendView) => {
      const p = projector.current;
      const viewKey = JSON.stringify(view);
      if (viewKey === p.viewKey) return; // an unchanged view never re-renders
      p.viewKey = viewKey;

      const tokensKey = JSON.stringify(view.tokens);
      if (tokensKey !== p.tokensKey) {
        p.tokensKey = tokensKey;
        p.tokens = view.tokens.map(resolveToken);
      }
      const selectedKey = JSON.stringify(view.selected_token);
      if (selectedKey !== p.selectedKey) {
        p.selectedKey = selectedKey;
        p.selectedToken = view.selected_token ? resolveToken(view.selected_token) : null;
      }
      const pickedKey = `${tokensKey}|${view.multi_selected_ids.join(',')}`;
      if (pickedKey !== p.pickedKey) {
        p.pickedKey = pickedKey;
        const wanted = new Set(view.multi_selected_ids);
        p.pickedTokens = p.tokens.filter((token) => wanted.has(tokenId(token)));
      }
      const recipientsKey = JSON.stringify(view.recipients);
      if (recipientsKey !== p.recipientsKey) {
        p.recipientsKey = recipientsKey;
        p.recipients = view.recipients.map(toDraft);
      }
      const specsKey = JSON.stringify(view.multi_specs);
      if (specsKey !== p.specsKey) {
        p.specsKey = specsKey;
        p.multiSpecs = view.multi_specs.map(toSpec);
      }
      const transfersKey = JSON.stringify(view.receipt);
      if (transfersKey !== p.transfersKey) {
        p.transfersKey = transfersKey;
        // A plain single send keeps the scalar amount/symbol props (null here);
        // only a batch renders the per-line breakdown.
        p.receiptTransfers =
          view.receipt && view.receipt.kind
            ? view.receipt.transfers.map((line) => ({
                to: line.to,
                toName: line.to_name,
                amount: line.amount,
                symbol: line.symbol,
                logoUrls: line.logo_urls,
                usdValue: line.usd_value,
              }))
            : null;
      }
      const treasuryKey = JSON.stringify(view.treasury_bootstrap);
      if (treasuryKey !== p.treasuryKey) {
        p.treasuryKey = treasuryKey;
        const status = view.treasury_bootstrap;
        p.treasuryBootstrap = status
          ? {
              chainId: status.chain_id,
              address: status.address,
              asset: status.asset === 'path_usd' ? 'pathUSD' : 'native',
              balance: BigInt(status.balance || '0'),
              floor: BigInt(status.floor || '0'),
              bootstrapNeeded: status.bootstrap_needed,
            }
          : null;
      }
      const simKey = view.sim_json ?? '';
      if (simKey !== p.simKey) {
        p.simKey = simKey;
        let sim: AssetSimResult | null = null;
        try {
          if (view.sim_json) sim = deserializeAssetSim(JSON.parse(view.sim_json));
        } catch {
          sim = null; // a corrupt blob renders nothing extra, never a crash
        }
        p.sim = sim;
      }

      const issue = view.same_asset_fee_issue;
      setSnapshot({
        view,
        tokens: p.tokens,
        selectedToken: p.selectedToken,
        pickedTokens: p.pickedTokens,
        recipients: p.recipients,
        multiSpecs: p.multiSpecs,
        fee: resolveFee(view.fee),
        sim: p.sim,
        sameAssetFeeIssue: issue
          ? {
              symbol: issue.symbol,
              transferAmount: BigInt(issue.transfer_amount || '0'),
              balance: BigInt(issue.balance || '0'),
              feeAmount: BigInt(issue.fee_amount || '0'),
              maxTransferAmount: BigInt(issue.max_transfer_amount || '0'),
            }
          : null,
        receiptTransfers: p.receiptTransfers,
        treasuryBootstrap: p.treasuryBootstrap,
      });
    },
    [resolveToken],
  );

  const ensure = useCallback((): SendSession => {
    const p = projector.current;
    if (p.session) return p.session;
    // The `tx_tracker` seam, installed here because this is where the receipt
    // outcome has somewhere to go. It REPLACES the executor's own
    // `waitForReceipt` fallback wholesale: the tracker owns the poll (sharing
    // the one 3s-throttled `eth_getUserOperationReceipt` per hash with every
    // other watcher), the record patch and the 24h abandon line, and hands back
    // only the three verdicts `ReceiptUpdate` accepts — never a timeout.
    // `handoff.submitted` is deliberately dropped: awaiting the bundler's own
    // promise here would be a second, unthrottled poller for the same hash.
    setSendTrackerSink((handoff) => {
      trackSubmitted(handoff.userOpHash, handoff.recordIds, handoff.chainId, (outcome) => {
        projector.current.session?.dispatch({
          type: 'receipt_update',
          user_op_hash: handoff.userOpHash,
          outcome,
        });
      });
    });
    p.session = createSendSession({
      onView: commit,
      onError: (error) => console.error('[send] core fault:', error),
      ports: {
        tokensFetched: (tokens) => {
          // Keep the originals so the picker renders the API's name/logo, and
          // so a row's object identity survives every unrelated view change.
          projector.current.index = indexTokens(tokens);
        },
        tokensPartial: (tokens) => {
          projector.current.session?.dispatch({ type: 'tokens_partial', tokens });
        },
        credentialId: (forAddress) => {
          const account = live.current.activeAccount;
          // Fail closed: never sign with a credential that belongs to another
          // account than the one the core built this batch for.
          if (!account || account.address.toLowerCase() !== forAddress.toLowerCase()) return null;
          return account.id;
        },
        credentialLoaded: (loaded) => {
          if (loaded) setPublicKeyHex(loaded);
        },
        signingStarted: () => {
          projector.current.session?.dispatch({ type: 'signing_started' });
        },
        receiptUpdate: (userOpHash, outcome) => {
          projector.current.session?.dispatch({
            type: 'receipt_update',
            user_op_hash: userOpHash,
            outcome,
          });
        },
        alert,
        close: () => live.current.router.back(),
      },
    });
    return p.session;
  }, [alert, commit]);

  const dispatch = useCallback(
    (event: SendEvent) => {
      ensure().dispatch(event);
    },
    [ensure],
  );

  // `Open` carries everything the controller used to read from its hooks. The
  // dependency list is `useSendController.ts:309`'s, plus the locked-request
  // params, which the TS effect re-read implicitly through `lockRetry`.
  const openKey = [
    address,
    params.preselectedSymbol ?? '',
    params.preselectedNetwork ?? '',
    params.preselectedMulti ?? '',
    params.prefilledRecipient ?? '',
    params.prefilledChainId ?? '',
    params.prefilledTokenAddress ?? '',
    params.prefilledAmountBase ?? '',
    params.locked ?? '',
    activeAccount?.id ?? '',
  ].join('|');

  useEffect(() => {
    const session = ensure();
    const p = projector.current;
    const account = live.current.activeAccount;
    const event: SendEvent = {
      type: 'open',
      account: account
        ? { id: account.id, address: account.address, name: account.name ?? null }
        : null,
      params: {
        preselected_symbol: params.preselectedSymbol ?? null,
        preselected_network: params.preselectedNetwork ?? null,
        prefilled_recipient: params.prefilledRecipient ?? null,
        prefilled_chain_id: params.prefilledChainId ?? null,
        prefilled_token_address: params.prefilledTokenAddress ?? null,
        prefilled_amount_base: params.prefilledAmountBase ?? null,
        locked: params.locked === '1',
        preselected_multi: params.preselectedMulti ?? null,
      },
      display: { code: dc.code, rate: dc.rate, fiat_decimals: fiatDecimals },
    };
    if (!p.started) {
      p.started = true;
      p.openKey = openKey;
      session.start(event);
    } else if (p.openKey !== openKey) {
      p.openKey = openKey;
      session.dispatch(event);
    }
    // `dc` is deliberately absent: a currency change is `DisplayChanged`, not a
    // remount — re-opening would throw away the amount the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey, ensure]);

  useEffect(
    () => () => {
      const p = projector.current;
      p.session?.dispose();
      p.session = null;
      p.started = false;
      p.openKey = null;
    },
    [],
  );

  useEffect(() => {
    const p = projector.current;
    if (!p.started) return;
    p.session?.dispatch({
      type: 'display_changed',
      display: { code: dc.code, rate: dc.rate, fiat_decimals: fiatDecimals },
    });
  }, [dc.code, dc.rate, fiatDecimals]);

  const view = snapshot.view;
  const selectedToken = snapshot.selectedToken;
  const selectedChainId = view.selected_token?.chain_id ?? null;

  // Cache warming is the shell's job (the core says so): the user spends
  // seconds on recipient + amount, which is plenty for these to land.
  useEffect(() => {
    if (!address || selectedChainId == null) return;
    prefetchForSend(address, selectedChainId);
  }, [address, selectedChainId]);

  // ── intents ───────────────────────────────────────────────────────────────
  const handleSelectToken = useCallback(
    (token: APIToken) => dispatch({ type: 'select_token', token_id: tokenId(token) }),
    [dispatch],
  );

  const changeToken = useCallback(() => {
    const keep = snapshot.view.recipient;
    dispatch({ type: 'back' });
    // `Back` clears the recipient; the hero row never did (see the header note).
    if (keep) dispatch({ type: 'set_recipient', recipient: keep });
  }, [dispatch, snapshot.view.recipient]);

  const handleEditAmount = useCallback(() => {
    dispatch({ type: 'edit_amount' });
    // The field is mounted only after the step update; the small defer is what
    // makes the recovery feel direct (`useSendController.ts:857`).
    setTimeout(() => amountInputRef.current?.focus(), 100);
  }, [dispatch]);

  const handleScan = useCallback(
    (data: string) => {
      const request = parseEIP681(data);
      dispatch({
        type: 'scan_resolved',
        scan: request
          ? {
              type: 'request',
              recipient: request.recipient,
              chain_id: request.chainId ?? null,
              token_address: request.tokenAddress ?? null,
              amount_base_units: request.amountBaseUnits?.toString() ?? null,
            }
          : { type: 'text', data },
      });
    },
    [dispatch],
  );

  const onFeeUpdate = useCallback(
    (fee: TransactionFeeEstimate) => dispatch({ type: 'fee_updated', estimate: rememberFee(fee) }),
    [dispatch],
  );

  const saveReceiptContact = useCallback(() => {
    const name = view.recipient_identity?.name ?? undefined;
    saveContactThroughCore({ address: view.recipient, name, resolvedName: name });
  }, [view.recipient, view.recipient_identity]);

  // ── multi-select wiring ───────────────────────────────────────────────────
  const selectedIds = useMemo(
    () => new Set(view.multi_selected_ids),
    [view.multi_selected_ids],
  );

  const tokenMultiSelect = useMemo<SendTokenMultiSelect>(
    () => ({
      selectedIds,
      onToggle: (token) => dispatch({ type: 'toggle_multi_token', token_id: tokenId(token) }),
      onToggleAll: (visible) => {
        // `use-token-multi-select.ts:41-46` verbatim, over the list the picker
        // is actually showing (see the header note on the core's own event).
        const valuable = selectAllValuable(visible);
        if (valuable.length === 0) return;
        const allOn = valuable.every((token) => selectedIds.has(tokenId(token)));
        for (const token of valuable) {
          const id = tokenId(token);
          if (selectedIds.has(id) === allOn) dispatch({ type: 'toggle_multi_token', token_id: id });
        }
      },
      isAllSelected: (visible) => {
        const valuable = selectAllValuable(visible);
        return valuable.length > 0 && valuable.every((token) => selectedIds.has(tokenId(token)));
      },
      onNetworkChange: (chainId) => dispatch({ type: 'set_multi_network', chain_id: chainId }),
      onConfirm: () => dispatch({ type: 'confirm_multi_selection' }),
      confirmLabel:
        selectedIds.size === 1
          ? t('send.continueBtn')
          : t('send.multiSendContinue', {
              n: selectedIds.size,
              chain: view.multi_chain_id != null ? chainName(view.multi_chain_id) : '',
            }),
      selectAllLabel: t('send.selectAllValuable', { defaultValue: 'Select all valuable' }),
    }),
    [dispatch, selectedIds, t, view.multi_chain_id],
  );

  // ── worded projections ────────────────────────────────────────────────────
  const amountWarning = useMemo(
    () => (view.amount_warning ? wordWarning(t, view.amount_warning) : null),
    [view.amount_warning, t],
  );

  const addNetworkMsg = useMemo(() => {
    const message = view.add_network_msg;
    if (!message) return null;
    if (message.type === 'net_not_found') return t('send.lock.netNotFound');
    if (message.type === 'net_not_compatible') {
      return message.detail || t('send.lock.netNotCompatible');
    }
    return t('send.lock.netAddError');
  }, [view.add_network_msg, t]);

  const txError = useMemo(() => {
    if (!view.tx_error) return null;
    return view.tx_error === 'bundler_fund'
      ? t('send.txErrorBundlerFund')
      : t('send.txErrorGeneric');
  }, [view.tx_error, t]);

  const lockError = useMemo<SendLockError>(() => {
    const error = view.lock_error;
    if (!error) return null;
    return error.type === 'network' ? { kind: 'network', chainId: error.chain_id } : { kind: 'token' };
  }, [view.lock_error]);

  const multiTokenSpecs = useCallback(() => snapshot.multiSpecs, [snapshot.multiSpecs]);

  return {
    t,
    router,
    locked: view.locked,
    amountLocked: view.amount_locked,
    prefilledRecipient: params.prefilledRecipient,
    activeAccount,
    state,
    address,
    dc,
    formatUsd: dc.fmt,

    step: STEP_OF[view.stage],
    lockError,
    resolvingLock: view.resolving_lock,
    addingNetwork: view.adding_network,
    addNetworkMsg,

    tokens: snapshot.tokens,
    loading: view.loading,
    selectedToken,
    pickedTokens: snapshot.pickedTokens,
    tokenMultiSelect,
    multiSelectChainId: view.multi_chain_id,
    multiSelectMode: view.multi_select_mode,

    recipient: view.recipient,
    amount: view.amount,
    inputInUsd: view.amount_fiat_code !== null,
    // The unit the core says the figure is counted in. The screen renders this
    // and never re-derives it from `dc.code`.
    amountFiatCode: view.amount_fiat_code,
    denomToggleShown: view.denom_toggle_shown,
    denomToggleEnabled: view.denom_toggle_enabled,
    // The core decides WHEN each refusal applies and names the pair; the shell
    // only owns the words. Twins of `useSendController.ts`.
    denomToggleReason: view.denom_toggle_reason
      ? t('send.denomToggleNoRate', {
          code: view.denom_toggle_reason.code,
          symbol: view.denom_toggle_reason.symbol,
        })
      : null,
    confirmAmountIssue: view.confirm_amount_issue
      ? t('send.warnCannotConvert', {
          code: view.confirm_amount_issue.code,
          symbol: view.confirm_amount_issue.symbol,
        })
      : null,
    // The core's own resolution — the confirm page shows the string the signed
    // batch is built from, never a second conversion of its own.
    tokenAmount: view.token_amount,
    splitMode: view.split_mode,
    recipients: snapshot.recipients,
    splitOverBalance: view.split_over_balance,
    pickerTarget: view.picker_target,
    amountWarning,
    amountInputRef,
    copiedContract,
    setCopiedContract,
    canContinue: view.can_continue,
    canConfirm: view.can_confirm,

    feeEstimate: snapshot.fee,
    estimatingGas: view.estimating_gas,
    feeBusy: view.fee_busy,
    gasFeeToken: view.gas_fee_token,
    publicKeyHex,
    sameAssetFeeIssue: snapshot.sameAssetFeeIssue,
    multiTokenSpecs,
    sending: view.sending,
    txStatus: view.tx_status,
    txError,
    recipientIdentity: view.recipient_identity?.name
      ? { name: view.recipient_identity.name, source: view.recipient_identity.source ?? '' }
      : null,
    recipientRisk: view.recipient_risk
      ? {
          isContract: view.recipient_risk.is_contract,
          firstInteraction: view.recipient_risk.first_time ?? false,
        }
      : null,
    sim: snapshot.sim,
    treasuryBootstrap: snapshot.treasuryBootstrap,

    txHash: view.tx_hash,
    userOpHash: view.user_op_hash,
    receiptTransfers: snapshot.receiptTransfers,
    receiptKind: view.receipt?.kind
      ? view.receipt.kind === 'multi_select'
        ? 'multiSelect'
        : 'split'
      : null,
    receiptFailed: view.receipt?.status === 'failed',
    feeHeld: view.receipt?.hold_reason === 'fee_hold',
    feeRejected: view.receipt?.hold_reason === 'fee_rejected',
    receiptAmount: view.receipt?.amount ?? '',
    receiptUsdValue: view.receipt?.usd_value ?? 0,

    showScanner: view.show_scanner,
    showContactPicker: view.show_contact_picker,
    showBatchImport: view.show_batch_import,

    setRecipient: (recipient) => dispatch({ type: 'set_recipient', recipient }),
    setAmount: (amount) => dispatch({ type: 'set_amount', amount }),
    toggleFiatInput: () => dispatch({ type: 'toggle_fiat_input' }),
    handleMaxAmount: () => dispatch({ type: 'tap_max' }),
    enterSplitMode: () => dispatch({ type: 'enter_split_mode' }),
    seedSplitRecipients: (rows) =>
      dispatch({ type: 'seed_split_recipients', recipients: rows.map(toWireDraft) }),
    handleRecipientsChange: (rows) =>
      dispatch({ type: 'recipients_changed', recipients: rows.map(toWireDraft) }),
    applyPickedAddress: (picked) => dispatch({ type: 'picked_address', address: picked }),
    handleSelectToken,
    changeToken,
    handleBack: () => dispatch({ type: 'back' }),
    handleContinue: () => dispatch({ type: 'continue' }),
    handleEditAmount,
    handleConfirm: () => dispatch({ type: 'slide_confirm' }),
    cancelSigning: () => dispatch({ type: 'cancel_signing' }),
    retryAfterError: () => dispatch({ type: 'retry_after_error' }),
    handleAddNetwork: (chainId) => dispatch({ type: 'add_network_tapped', chain_id: chainId }),
    refreshTokens: () => dispatch({ type: 'refresh_tokens' }),
    openScanner: () => dispatch({ type: 'open_scanner' }),
    closeScanner: () => dispatch({ type: 'close_scanner' }),
    handleScan,
    openContactPicker: (target) => dispatch({ type: 'open_contact_picker', target }),
    closeContactPicker: () => dispatch({ type: 'close_contact_picker' }),
    openBatchImport: () => dispatch({ type: 'open_batch_import' }),
    closeBatchImport: () => dispatch({ type: 'close_batch_import' }),
    onFeeTokenChange: (token) => dispatch({ type: 'choose_fee_token', token }),
    onFeeUpdate,
    onFeeBusyChange: (busy) => dispatch({ type: 'fee_busy_changed', busy }),
    dismissTreasurySheet: () => dispatch({ type: 'dismiss_treasury_sheet' }),
    retryAfterBootstrap: () => dispatch({ type: 'retry_after_bootstrap' }),
    handleDone: () => dispatch({ type: 'done' }),
    saveReceiptContact,
  };
}

export type { SendController } from './send-controller-types';
