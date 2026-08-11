import { fromHex, toHex } from '@/services/vela-core';
import { makeRecipientId, recipientsAreValid, type RecipientDraft } from '@/components/send/MultiRecipientEditor';
import { type ReceiptTransfer } from '@/components/ui/TransactionReceipt';
import { amountToWeiHex, balanceToWei, canCoverNativeTransfer, encErc20Transfer, isValidAddress, synthErc20Token, synthNativeToken } from './send-utils';
import { useDisplayCurrency } from '@/hooks/use-display-currency';
import { useSafeRouter } from '@/hooks/use-safe-router';
import { useTokenMultiSelect } from '@/hooks/use-token-multi-select';
import { chainName, nativeSymbol, networkForChainId } from '@/models/network';
import { isNativeToken, tokenBalanceDouble, tokenChainId, tokenId, tokenLogoURLs, tokenUsdValue, type APIToken } from '@/models/types';
import { useWallet } from '@/models/wallet-state';
import * as Passkey from '@/modules/passkey';
import { addCustomNetworkByChainId } from '@/services/add-network';
import { buildMultiTokenCalls, buildSplitCalls, maxNativeSendable, reserveFeeToken, reserveNativeGas, sumSplitBaseUnits, toMultiTokenSpecs } from '@/services/batch-send';
import { probeTreasury, parseBundlerUnderfunded, type TreasuryStatus } from '@/services/bundler-service';
import { saveContact } from '@/services/contacts';
import { ZERO_DECIMAL_CODES } from '@/services/currency';
import { fromBaseUnits, parseEIP681, toBaseUnits } from '@/services/eip681';
import { DenominatedAmount, TokenPrice, TOKEN_DENOM, fiatDenom, type Denom } from '@/services/fiat-convert';
import { useLocalePrefs } from '@/services/locale-format';
import { hapticError, hapticSuccess, showAlert } from '@/services/platform';
import { resolveRecipientIdentity, type RecipientIdentity } from '@/services/recipient-identity';
import { resolveRecipientRisk, type RecipientRisk } from '@/services/recipient-risk';
import { createReentryLock } from '@/services/reentry-lock';
import {
  estimateTransactionFee,
  prefetchForSend,
  sameAssetFeeLimit,
  sendBatchCalls,
  sendERC20,
  sendNative,
  UserOpFeeHoldError,
  UserOpRejectedError,
  type TransactionFeeEstimate,
} from '@/services/safe-transaction';
import { findAccountByCredentialId, saveTransactions, updateTransactions } from '@/services/storage';
import { resolveTokenMetadata } from '@/services/token-metadata';
import { simulateAssetChanges, type AssetSimResult } from '@/services/tx-simulation';
import { clearTokenCache, fetchTokens } from '@/services/wallet-api';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput } from 'react-native';
import type { ExtendsSendController } from './send-controller-types';

type Step = 'select-token' | 'enter-details' | 'confirm';
type TxStatus = 'idle' | 'preparing' | 'signing' | 'submitting' | 'confirming' | 'confirmed' | 'error';

/**
 * All Send-flow state, refs, effects, and handlers. Extracted verbatim from
 * SendScreen so the screen file holds only view wiring. Returns everything the
 * step views and the screen shell consume.
 */
export function useSendController() {
  const { t } = useTranslation();
  useLocalePrefs(); // re-render when the number format changes
  const router = useSafeRouter();
  const params = useLocalSearchParams<{
    preselectedSymbol?: string;
    preselectedNetwork?: string;
    prefilledRecipient?: string;
    // EIP-681 scan: lock the whole request (recipient + chain + token + amount).
    prefilledChainId?: string;
    prefilledTokenAddress?: string;
    prefilledAmountBase?: string;
    locked?: string;
    // Multi-token hand-off: comma-joined tokenId()s land Send in multiSelect
    // mode. (No in-app producer since the Home assets sheet was retired; kept
    // as a param entry into the sweep flow.)
    preselectedMulti?: string;
  }>();
  const locked = params.locked === '1';
  // The amount is only fixed when the request actually specified one; an
  // "open" request (token but no amount) still lets the sender choose.
  const amountLocked = locked && !!params.prefilledAmountBase;
  const { activeAccount, state } = useWallet();
  const address = activeAccount?.address ?? state.address;
  const dc = useDisplayCurrency();
  const formatUsd = dc.fmt;

  const hasPreselection = !!(params.prefilledRecipient || params.preselectedMulti || (params.preselectedSymbol && params.preselectedNetwork));
  const [step, setStep] = useState<Step>(hasPreselection ? 'enter-details' : 'select-token');
  // Synchronous mirror of `step` for guards inside long-running async flows
  // (the Phase-2 sponsorship grant can take ~20s — the user may back out of
  // the confirm screen meanwhile, and a passkey prompt must NOT resurrect).
  const stepRef = useRef(step);
  useEffect(() => { stepRef.current = step; }, [step]);

  // EIP-681 locked-request resolution + the exceptions it can hit.
  type LockError =
    | { kind: 'network'; chainId: number }
    | { kind: 'token' }
    | null;
  const [lockError, setLockError] = useState<LockError>(null);
  const [lockRetry, setLockRetry] = useState(0);
  const [resolvingLock, setResolvingLock] = useState(locked);
  const [addingNetwork, setAddingNetwork] = useState(false);
  const [addNetworkMsg, setAddNetworkMsg] = useState<string | null>(null);
  const [tokens, setTokens] = useState<APIToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<APIToken | null>(null);
  const [recipient, setRecipient] = useState('');
  // The typed figure AND the unit it is counted in, as one value. They used to
  // be `amount: string` + `inputInUsd: boolean`, and that pair is exactly how
  // the last defect was written: flip the boolean, leave the digits, and a
  // figure typed in CNY became a figure of USDC without anything multiplying by
  // anything. `DenominatedAmount`'s unit is private, so from here it can only
  // change through `convert`, which restates the digits or refuses.
  // Twin of `send.rs`'s `Model.amount`.
  const [storedAmount, setTypedAmount] = useState<DenominatedAmount>(() => DenominatedAmount.token(''));
  /**
   * The figure as this render must read it — the stored one re-denominated
   * into the currency now on screen. Twin of
   * `send.rs::redenominate_to_display`.
   *
   * A display-currency commit can land under a screen that already has a
   * figure on it: the shell boots on a placeholder `{code:'USD', rate:1}` and
   * replaces it once AsyncStorage and the FX/Chainlink round trip answer. The
   * figure keeps its own code, which is what stops it being relabelled — but
   * left alone it also becomes permanently unresolvable, because
   * `toTokenUnits` refuses a price quoted in another currency AND `withValue`
   * preserves the stale unit, so **retyping could not fix it**. Continue stayed
   * lit on an amount that could only ever raise `alertInvalidAmount`.
   *
   * The digits cannot come across (this screen has no CNY↔USD cross rate, and
   * inventing one is the defect the whole area exists to forbid), so the FIGURE
   * is dropped and the CURRENCY is adopted. The MODE is untouched: typing in
   * tokens or in money is the user's choice, unmade only at ⇄.
   *
   * Derived during RENDER, not in an effect, so this controller and the core's
   * synchronous `display_changed` agree on every frame rather than on all but
   * one.
   */
  const typedAmount =
    storedAmount.fiatCode !== null && storedAmount.fiatCode !== dc.code
      ? DenominatedAmount.fiat('', dc.code)
      : storedAmount;
  const amount = typedAmount.value;
  /** The amount text field: retype the FIGURE, keep the unit. */
  const setAmount = useCallback(
    // `typedAmount`, never the stored figure: retyping must not inherit a
    // currency that is no longer on screen — that is what made the trap
    // unrecoverable.
    (next: string) => setTypedAmount(typedAmount.withValue(next)), [typedAmount]);
  /** Fill in token units — for callers that produce a token figure outright
   *  (Max, a split row, a locked request's base units, a reset). */
  const setTokenAmount = useCallback(
    (next: string) => setTypedAmount(DenominatedAmount.token(next)), []);
  // ① split mode (一币多人): one token → many recipients, each its own amount,
  // settled in one UserOp via sendBatchCalls. Off by default — single sends keep
  // their exact existing flow. `pickerTarget` = the row id the contact picker fills
  // (null ⇒ the single-mode recipient field).
  const [splitMode, setSplitMode] = useState(false);
  const [recipients, setRecipients] = useState<RecipientDraft[]>([]);
  const [pickerTarget, setPickerTarget] = useState<string | null>(null);
  // ② multiSelect (多币一人 / 清空): many tokens on ONE chain → one recipient, full
  // balance each, in a single MultiSend UserOp. Selection state lives in the
  // shared hook. `multiSelectMode` = we're in the
  // multiSelect enter-details/confirm flow (set when a multi-selection is confirmed).
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const multiSelect = useTokenMultiSelect();
  const [sending, setSending] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [copiedContract, setCopiedContract] = useState(false);
  const [feeEstimate, setFeeEstimate] = useState<TransactionFeeEstimate | null>(null);
  // A quote is valid only for the network on which it was calculated. This protects the
  // amount form while a user switches assets/networks or an earlier async quote resolves late.
  const selectedFeeEstimate = selectedToken && feeEstimate?.chainId === tokenChainId(selectedToken)
    ? feeEstimate
    : null;
  const [estimatingGas, setEstimatingGas] = useState(false);
  // Single-flight re-entry lock with a generation token. A cancelled send
  // releases it immediately (so a retry isn't a silent no-op) while the cancelled
  // promise's stale `end()` must not clear a newer send's lock (issue #91).
  const sendLock = useRef(createReentryLock()).current;
  // Set by the confirm screen's cancel button; checked after every pre-sign
  // await in executeTransaction (mirrors dapp-connection's signCancelledRef).
  const sendCancelledRef = useRef(false);
  // Guards UI state updates that run after an `await` in the submit flow, so a
  // user who navigates away mid-send doesn't trigger updates on an unmounted
  // screen. Persistence (DB writes) still runs regardless — only UI is gated.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  const [txStatus, setTxStatus] = useState<TxStatus>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  // The submitted UserOp hash — passed to the receipt so it can self-poll the
  // bundler and converge its status even if the parent's waitForTxHash times out.
  const [userOpHash, setUserOpHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  // Batch-send receipt: the per-line breakdown shown on the confirmed receipt for
  // split (1 token → N recipients) / multiSelect (N tokens → 1 recipient). null for
  // a plain single send (which uses the scalar amount/symbol props instead).
  const [receiptTransfers, setReceiptTransfers] = useState<ReceiptTransfer[] | null>(null);
  const [receiptKind, setReceiptKind] = useState<'split' | 'multiSelect' | null>(null);
  // Set when the background on-chain poll reports a definitive failure, so the
  // receipt shows a clear "Failed" stamp instead of staying "Submitted" forever.
  const [receiptFailed, setReceiptFailed] = useState(false);
  /**
   * The money that was SIGNED, captured the instant the bundler accepted it.
   *
   * The receipt used to read `tokenUnitsFor(selectedToken)`, which re-runs the
   * fiat↔token conversion against whatever display context is on screen NOW —
   * a live computation about a fact that stopped being live when the calldata
   * was signed. Change the display currency on a receipt and its token amount
   * changed with it (and read `0` once the rate went away), so the number on a
   * completed transfer could be one that was never in any signature. Something
   * already on-chain is not the currency picker's to rewrite. Twin of
   * `send.rs::receipt_signed`.
   */
  const [receiptSigned, setReceiptSigned] = useState<{ amount: string; priceUsd: number } | null>(null);
  // The relay parked the op because network fees moved above the reimbursement the
  // user signed. Not a failure: it stays queued and sends itself when fees settle.
  const [feeHeld, setFeeHeld] = useState(false);
  // The hold ran out of patience and the relay gave the op back. Nothing was sent.
  const [feeRejected, setFeeRejected] = useState(false);
  // Derived, never stored: the flag and the figure's unit are the same fact, so
  // they cannot drift apart.
  const inputInUsd = typedAmount.isFiat;
  /**
   * The unit the typed figure is counted in — `null` = the selected token's own
   * units, otherwise the fiat code it was TYPED in, which is not necessarily
   * `dc.code` (a display-currency commit can land under a screen that already
   * has a figure on it). The screen renders this; it must never re-derive the
   * unit from the display context. Twin of `SendView.amount_fiat_code`.
   */
  const amountFiatCode = typedAmount.fiatCode;
  /**
   * The token's unit price in the display currency, quoted in the currency it
   * is actually quoted in. `null` whenever either factor is missing — never a
   * defaulted 1 (see {@link TokenPrice.of}).
   */
  const displayPriceFor = useCallback(
    (token: Pick<APIToken, 'priceUsd'>) => TokenPrice.of(token.priceUsd, dc.rate, dc.code),
    [dc.rate, dc.code],
  );
  /**
   * The typed figure resolved into token units — the ONE number every gate,
   * every call builder and the confirm screen read.
   *
   * This is the whole of what the old free-function resolver did at nine
   * separate call sites, minus the `const ANY = ''` that stood in for the
   * currency at both ends and made the code comparison vacuous. Here
   * the figure names the currency it was typed in and the price names the
   * currency it is quoted in, so a figure that has outlived its rate resolves
   * to '0' instead of being converted at somebody else's rate.
   *
   * Twin of `send.rs::model_token_amount`.
   */
  const tokenUnitsFor = useCallback(
    (token: Pick<APIToken, 'priceUsd' | 'decimals'>) =>
      typedAmount.toTokenUnits(displayPriceFor(token), token.decimals),
    [typedAmount, displayPriceFor],
  );
  // Speed tiers are gone — every estimate/submit runs at 'fast'. What the user
  // CAN choose (when the relay publishes alternatives) is the fee ASSET: null = native,
  // else a whitelisted stablecoin contract. Options load when confirm opens; null means the
  // active relay has no alternative to present.
  const [gasFeeToken, setGasFeeToken] = useState<string | null>(null);
  // Treasury bootstrap sheet (relayer float depleted on this network) — shown
  // instead of the generic error/funding surface when the treasury reports
  // bootstrapNeeded. See maybeShowTreasuryBootstrap.
  const [treasuryBootstrap, setTreasuryBootstrap] = useState<TreasuryStatus | null>(null);
  // GasFeeCard fires this while it re-quotes internally (fee-asset switch / refresh),
  // so the confirm slide stays disabled until the displayed quote is settled.
  const [feeBusy, setFeeBusy] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [showBatchImport, setShowBatchImport] = useState(false);
  const [amountWarning, setAmountWarning] = useState<string | null>(null);
  // Every chain settles gas in-band (native coin or a whitelisted stablecoin selected on
  // the confirm screen), so the amount step must never require a separate native-gas balance.
  const [recipientIdentity, setRecipientIdentity] = useState<RecipientIdentity | null>(null);
  // Recipient-risk signals for the confirm step — "first time" (address-poisoning
  // defense) + contract-vs-EOA. Best-effort, never a false alarm. Same signals the
  // dApp signing sheet shows; plain transfers deserve the same protection.
  const [recipientRisk, setRecipientRisk] = useState<RecipientRisk | null>(null);
  // Balance-change simulation for the confirm step (null = unknown / not run).
  const [sim, setSim] = useState<AssetSimResult | null>(null);

  // Prefetch account credential + webauthn module while user reviews confirm screen
  const amountInputRef = useRef<TextInput>(null);
  const prefetchedAccount = useRef<{ publicKeyHex: string } | null>(null);
  const webauthnModuleRef = useRef<typeof import('@/services/vela-core') | null>(null);

  // Resolve a locked EIP-681 request against the loaded token list. Sets the
  // exact token (held, or a synthetic zero-balance placeholder), recipient and
  // amount — or surfaces an unsupported-network / unknown-token exception.
  const resolveLockedRequest = async (allTokens: APIToken[]) => {
    setResolvingLock(true);
    try {
      const chainId = parseInt(params.prefilledChainId ?? '', 10);
      if (!Number.isFinite(chainId)) { setLockError(null); return; }
      if (!networkForChainId(chainId)) { setLockError({ kind: 'network', chainId }); return; }

      const wantAddr = params.prefilledTokenAddress?.toLowerCase();
      let tok: APIToken | null = allTokens.find((tk) =>
        tokenChainId(tk) === chainId &&
        (wantAddr ? (!isNativeToken(tk) && tk.tokenAddress?.toLowerCase() === wantAddr) : isNativeToken(tk))
      ) ?? null;

      if (!tok) {
        if (!wantAddr) {
          tok = synthNativeToken(chainId);
        } else {
          const meta = await resolveTokenMetadata(chainId, [wantAddr]);
          const m = meta.get(wantAddr);
          if (!m) { setLockError({ kind: 'token' }); return; }
          tok = synthErc20Token(chainId, params.prefilledTokenAddress!, m.symbol, m.decimals);
        }
      }

      setLockError(null);
      setSelectedToken(tok);
      setRecipient(params.prefilledRecipient ?? '');
      if (params.prefilledAmountBase) {
        try { setTokenAmount(fromBaseUnits(BigInt(params.prefilledAmountBase), tok.decimals)); } catch {}
      }
      setStep('enter-details');
    } finally {
      setResolvingLock(false);
    }
  };

  // "Add this network" recovery when a scanned request names an unsupported chain.
  const handleAddNetwork = async (chainId: number) => {
    setAddingNetwork(true);
    setAddNetworkMsg(null);
    try {
      const result = await addCustomNetworkByChainId(chainId);
      if (result.ok) {
        setLockError(null);
        setLockRetry((n) => n + 1); // re-run resolution now that the chain exists
      } else {
        setAddNetworkMsg(result.reason === 'not-found' ? t('send.lock.netNotFound') : (result.error || t('send.lock.netNotCompatible')));
      }
    } catch {
      setAddNetworkMsg(t('send.lock.netAddError'));
    } finally {
      setAddingNetwork(false);
    }
  };

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    fetchTokens(address, {
      onProgress: (partial) => {
        const nonZero = partial.filter((t) => tokenBalanceDouble(t) > 0);
        nonZero.sort((a, b) => tokenUsdValue(b) - tokenUsdValue(a));
        setTokens(nonZero);
        setLoading(false); // Show tokens as soon as first chain responds
      },
    })
      .then((result) => {
        const nonZero = result.filter((t) => tokenBalanceDouble(t) > 0);
        nonZero.sort((a, b) => tokenUsdValue(b) - tokenUsdValue(a));
        setTokens(nonZero);

        if (locked) {
          // Match against the full list (incl. zero-balance known tokens) for
          // the exact requested token; fall back to a synthetic placeholder.
          resolveLockedRequest(result);
          return;
        }

        // Multi-token hand-off via params → land in multiSelect mode.
        if (params.preselectedMulti) {
          const wanted = new Set(params.preselectedMulti.split(','));
          const picked = nonZero.filter((tk) => wanted.has(tokenId(tk)));
          if (picked.length > 0) {
            multiSelect.selectTokens(picked);
            setMultiSelectMode(true);
            setSelectedToken(picked[0]);
            setStep('enter-details');
            if (activeAccount) {
              const chainId = tokenChainId(picked[0]);
              prefetchForSend(activeAccount.address, chainId);
              findAccountByCredentialId(activeAccount.id).then((s) => {
                prefetchedAccount.current = s ?? null;
                return estimateTransactionFee(
                  activeAccount.address, chainId, 'fast', undefined, undefined, gasFeeToken, s?.publicKeyHex,
                );
              })
                .then((f) => { if (mountedRef.current) setFeeEstimate(f); })
                .catch(() => {});
              import('@/services/vela-core').then((m) => { webauthnModuleRef.current = m; });
            }
          }
          return;
        }

        if (params.preselectedSymbol && params.preselectedNetwork) {
          const match = nonZero.find(
            (t) => t.symbol === params.preselectedSymbol && t.network === params.preselectedNetwork
          );
          if (match) {
            setSelectedToken(match);
            setStep('enter-details');
          }
        } else if (params.prefilledRecipient && nonZero.length > 0) {
          // Quick-send from scan: auto-select highest-value token, prefill recipient
          setSelectedToken(nonZero[0]);
          setRecipient(params.prefilledRecipient);
          setStep('enter-details');
        }
      })
      .catch(() => showAlert(t('common.error'), t('send.alertLoadTokensError')))
      .finally(() => setLoading(false));
  }, [address, params.preselectedSymbol, params.preselectedNetwork, params.preselectedMulti, lockRetry]);

  // Re-pull balances after the user adds/removes a custom token in the sheet,
  // so it shows up (or disappears) without a manual page refresh.
  const refreshTokens = () => {
    if (!address) return;
    clearTokenCache(address);
    fetchTokens(address)
      .then((result) => {
        const nonZero = result.filter((tk) => tokenBalanceDouble(tk) > 0);
        nonZero.sort((a, b) => tokenUsdValue(b) - tokenUsdValue(a));
        setTokens(nonZero);
      })
      .catch(() => {});
  };

  // Compute real-time amount warnings
  useEffect(() => {
    if (!selectedToken || !amount) {
      setAmountWarning(null);
      return;
    }

    const tokenAmount = tokenUnitsFor(selectedToken);
    const amountNum = parseFloat(tokenAmount || '0');
    if (isNaN(amountNum) || amountNum <= 0) {
      // Typed digits that resolve to nothing are not "no amount" — they are an
      // amount whose FACTOR is missing (no rate for the display currency, or no
      // price for the token). Continue refuses it either way; this is the
      // sentence that says so, and it names the way out (the ⇄ row, which
      // `denomToggleShown` keeps reachable for exactly this reason).
      // Twin of `send.rs`'s `SendAmountWarning::CannotConvert`.
      const code = typedAmount.fiatCode;
      setAmountWarning(
        code !== null && typedAmount.numeric > 0
          ? t('send.warnCannotConvert', { code, symbol: selectedToken.symbol })
          : null,
      );
      return;
    }

    const chainId = tokenChainId(selectedToken);
    const sym = nativeSymbol(chainId);

    if (isNativeToken(selectedToken)) {
      // Native token: check amount + gas > balance
      const balanceWei = balanceToWei(selectedToken.balance, selectedToken.decimals);
      const amountWei = BigInt('0x' + amountToWeiHex(tokenAmount, selectedToken.decimals));
      if (amountWei > balanceWei) {
        setAmountWarning(t('send.warnNotEnoughToken', { symbol: selectedToken.symbol }));
        return;
      }
      // Also check if gas can be covered (use cached estimate if available)
      if (selectedFeeEstimate) {
        // totalWei is already the fully marked-up, reviewed in-band reimbursement.
        // Reserving it once keeps this gate consistent with the amount signed at confirmation.
        const reserveWei = selectedFeeEstimate.totalWei;
        if (!canCoverNativeTransfer(amountWei, balanceWei, reserveWei)) {
          setAmountWarning(t('send.warnInsufficientForGas', { sym }));
          return;
        }
      }
    } else {
      // ERC-20: check token balance
      const tokenBal = tokenBalanceDouble(selectedToken);
      if (amountNum > tokenBal) {
        setAmountWarning(t('send.warnNotEnoughToken', { symbol: selectedToken.symbol }));
        return;
      }
      // An ERC-20 fee asset is handled exactly like any other token: when it is being sent,
      // reserve its fee; otherwise ensure the separate fee-token balance can cover it. This
      // applies to every in-band network, including Tempo, without naming a special token.
      const feeAsset = selectedFeeEstimate?.feeAsset;
      if (feeAsset?.kind === 'erc20') {
        const isFeeToken = selectedToken.tokenAddress?.toLowerCase() === feeAsset.token.toLowerCase();
        if (isFeeToken) {
          const balanceUnits = balanceToWei(selectedToken.balance, selectedToken.decimals);
          const sendUnits = BigInt('0x' + amountToWeiHex(tokenAmount, selectedToken.decimals));
          if (sendUnits + feeAsset.amount > balanceUnits) {
            setAmountWarning(t('send.warnInsufficientForGas', { sym: feeAsset.symbol ?? selectedToken.symbol }));
            return;
          }
        } else {
          const feeToken = tokens.find(
            tk => tk.tokenAddress?.toLowerCase() === feeAsset.token.toLowerCase() && tokenChainId(tk) === chainId,
          );
          const feeBalance = feeToken ? balanceToWei(feeToken.balance, feeToken.decimals) : 0n;
          if (feeBalance < feeAsset.amount) {
            setAmountWarning(t('send.warnNeedGas', { sym: feeAsset.symbol ?? feeToken?.symbol ?? 'gas token' }));
            return;
          }
        }
      }
      // The selected fee asset is rechecked against the final confirmation quote. Only the
      // transferred-token balance and an already-known ERC-20 fee balance gate this step.
      setAmountWarning(null);
      return;
    }

    setAmountWarning(null);
  }, [tokenUnitsFor, typedAmount, amount, selectedToken, tokens, selectedFeeEstimate, t]);

  // Resolve recipient identity (passkey index → ENS) when a valid address is entered
  useEffect(() => {
    setRecipientIdentity(null);
    if (!/^0x[0-9a-fA-F]{40}$/.test(recipient)) return;

    let cancelled = false;
    resolveRecipientIdentity(recipient)
      .then((id) => { if (!cancelled) setRecipientIdentity(id); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [recipient]);

  // Simulate the send (revert pre-check + net balance changes) once the user
  // reaches the confirm step — same surface the dApp signing sheet shows.
  // Best-effort: any failure leaves `sim` null and confirm shows nothing extra.
  useEffect(() => {
    const okSingle = !splitMode && !multiSelectMode && isValidAddress(recipient);
    const okSplit = splitMode && recipientsAreValid(recipients);
    const okMulti = multiSelectMode && isValidAddress(recipient) && pickedTokens.length > 0;
    if (step !== 'confirm' || !selectedToken || !activeAccount || (!okSingle && !okSplit && !okMulti)) {
      setSim(null);
      return;
    }
    let cancelled = false;
    setSim(null);
    try {
      const chainId = tokenChainId(selectedToken);
      // One call (single) or N calls (split/multiSelect) — the sim sums them into one
      // net-balance preview, the same surface a batch UserOp produces on-chain.
      let calls: { to: string; value?: string; data?: string }[];
      if (multiSelectMode) {
        calls = buildMultiTokenCalls(recipient.trim(), multiTokenSpecs(chainId));
      } else if (splitMode) {
        calls = buildSplitCalls(
          { tokenAddress: isNativeToken(selectedToken) ? null : selectedToken.tokenAddress, decimals: selectedToken.decimals },
          recipients.map((r) => ({ address: r.address.trim(), amount: r.amount })),
        );
      } else {
        const tokenAmount = tokenUnitsFor(selectedToken);
        const weiHex = amountToWeiHex(tokenAmount, selectedToken.decimals);
        calls = [isNativeToken(selectedToken)
          ? { to: recipient, value: '0x' + weiHex }
          : { to: selectedToken.tokenAddress!, data: encErc20Transfer(recipient, weiHex) }];
      }
      simulateAssetChanges(activeAccount.address, calls, chainId)
        .then((r) => { if (!cancelled) setSim(r); })
        .catch(() => { if (!cancelled) setSim(null); });
    } catch {
      /* malformed amount → no sim */
    }
    return () => { cancelled = true; };
  }, [step, selectedToken, recipient, tokenUnitsFor, activeAccount, splitMode, recipients, multiSelectMode, multiSelect.selectedIds, feeEstimate]);

  // Recipient-risk on the confirm step: "first time" (address-poisoning defense)
  // + contract-vs-EOA. Drives the first-time/contract tags by the To row and
  // whether the confirm CTA upgrades to a deliberate hold-to-confirm. Best-effort.
  useEffect(() => {
    setRecipientRisk(null);
    if (step !== 'confirm' || !selectedToken || !isValidAddress(recipient)) return;
    let cancelled = false;
    resolveRecipientRisk(tokenChainId(selectedToken), recipient)
      .then((r) => { if (!cancelled) setRecipientRisk(r); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [step, selectedToken, recipient]);

  // Leaving confirm resets the fee-asset choice (next entry re-quotes in native) and clears a
  // stale erc20 estimate (totalWei=0n) so the gas-reserve/warning math downstream never reads 0.
  useEffect(() => {
    if (step !== 'confirm') {
      setGasFeeToken(null);
      setFeeEstimate((fe) => (fe?.feeAsset?.kind === 'erc20' ? null : fe));
    }
  }, [step]);

  // Resolve the bootstrap state without changing the UI. The send preflight uses
  // this so the relayer-funding sheet is presented at the same "before sending"
  // point as the personal gas-account funding sheet — including on in-band
  // chains, which otherwise skip the latter gate entirely.
  const getTreasuryBootstrap = async (chainId: number): Promise<TreasuryStatus | null> => {
    try {
      if (!activeAccount) return null;
      // The bundler's treasury endpoint is the authority (works for ANY chain the bundler serves,
      // incl. custom / local nets — no isInBandChain gate that mislabels them). A low-float
      // treasury returns its status; a legacy/uncovered chain 404s (no relayer treasury) → fall
      // through so the normal self-fund deposit path is preserved. Transient errors never route.
      const probe = await probeTreasury(chainId);
      if (probe.kind === 'low-float') return probe.status;
    } catch { /* fall back to the caller's default surface */ }
    return null;
  };

  // Relayer float depleted → offer the community bootstrap sheet instead of a
  // dead-end error/funding surface. Returns true when the sheet was shown.
  const maybeShowTreasuryBootstrap = async (chainId: number): Promise<boolean> => {
    const status = await getTreasuryBootstrap(chainId);
    if (status && mountedRef.current) {
      setTreasuryBootstrap(status);
      return true;
    }
    return false;
  };

  // ── ① split-mode (一币多人) helpers ─────────────────────────────────────────
  // Enter split mode seeded with the current single recipient (amount in token
  // units) + one empty row; a converted amount keeps continuity from the hero.
  const enterSplitMode = () => {
    if (!selectedToken) return;
    const tokenAmt = tokenUnitsFor(selectedToken);
    const rowAmount = amount ? tokenAmt : '';
    setRecipients([
      { id: makeRecipientId(), address: recipient, amount: rowAmount },
      { id: makeRecipientId(), address: '', amount: '' },
    ]);
    // Split rows are token-denominated, so the single-send figure follows them
    // into token units — RESTATED through the same resolution the first row
    // got, not merely re-labelled.
    setTokenAmount(rowAmount);
    setSplitMode(true);
  };

  // A batch import (payroll table) or a whole-group pick seeds split mode directly
  // with the resolved recipient rows — same submission path as a hand-built split.
  const seedSplitRecipients = (rows: RecipientDraft[]) => {
    if (rows.length === 0) return;
    // The imported rows replace the single-send figure outright; nothing is left
    // to restate, so the field goes empty in token units.
    setTokenAmount('');
    setRecipients(rows);
    setSplitMode(true);
    setShowBatchImport(false);
    setShowContactPicker(false);
  };

  // Removing the last extra recipient drops back to the familiar single-send UI,
  // carrying the remaining row's address/amount with it.
  const handleRecipientsChange = (next: RecipientDraft[]) => {
    if (next.length <= 1) {
      setRecipient(next[0]?.address ?? '');
      // A split row's amount is token-denominated by construction.
      setTokenAmount(next[0]?.amount ?? '');
      setSplitMode(false);
      setRecipients([]);
      return;
    }
    setRecipients(next);
  };

  // Route a picked/scanned address to the split row that opened the picker, or to
  // the single-mode recipient field when none is targeted.
  const applyPickedAddress = (addr: string) => {
    if (pickerTarget) {
      setRecipients((prev) => prev.map((r) => (r.id === pickerTarget ? { ...r, address: addr } : r)));
    } else {
      setRecipient(addr);
    }
  };

  // ── ② multiSelect (多币一人 / 清空) ─────────────────────────────────────────────────
  // Selection logic lives in the shared `multiSelect` hook; here we just react to a
  // confirmed selection. Multi-select is gated on a chosen network (TokenSelector
  // only shows checkboxes once one is picked), so selection is always one chain.
  const pickedTokens = multiSelect.selectedTokens(tokens);

  // The exact per-token amounts a multiSelect submits. Reserve whichever asset pays the
  // displayed fee — native or ERC-20 — so the preview and signed MultiSend stay identical.
  const multiTokenSpecs = (chainId: number) => {
    const specs = toMultiTokenSpecs(pickedTokens);
    const chainFeeEstimate = feeEstimate?.chainId === chainId ? feeEstimate : null;
    if (chainFeeEstimate?.feeAsset?.kind === 'erc20') {
      // Reserve 2× because a sweep contains more sub-calls than its initial fee quote and can
      // also deploy the Safe. The final signed fee still uses the reviewed quote.
      return reserveFeeToken(specs, chainFeeEstimate.feeAsset.token, chainFeeEstimate.feeAsset.amount * 2n);
    }
    return reserveNativeGas(specs, chainFeeEstimate?.totalWei ?? 0n);
  };

  // The final fee is learned only after the user advances to confirmation. If that fee is paid
  // in the very token being sent, a previously valid amount can become unpayable. Surface a
  // precise, editable ceiling on the confirmation step instead of allowing a guaranteed failed
  // UserOperation to reach the passkey/relay.
  const sameAssetFeeIssue = (() => {
    if (!selectedToken || multiSelectMode || !selectedFeeEstimate) return null;
    try {
      const transferAmount = splitMode
        ? sumSplitBaseUnits(recipients, selectedToken.decimals)
        : toBaseUnits(tokenUnitsFor(selectedToken), selectedToken.decimals);
      const balance = balanceToWei(selectedToken.balance, selectedToken.decimals);
      const limit = sameAssetFeeLimit(
        selectedFeeEstimate,
        isNativeToken(selectedToken) ? null : selectedToken.tokenAddress ?? null,
        balance,
      );
      if (!limit || transferAmount <= limit.maxTransferAmount) return null;
      return {
        symbol: selectedToken.symbol,
        transferAmount,
        balance,
        feeAmount: limit.feeAmount,
        maxTransferAmount: limit.maxTransferAmount,
      };
    } catch {
      // Input validation owns malformed half-typed amounts; never turn a formatting issue into
      // a false financial warning on the confirmation page.
      return null;
    }
  })();

  // Confirmed selection → advance. ONE token is a normal amount-send (not a
  // full-balance multiSelect); TWO+ is a multiSelect. The first token carries chain/gas context.
  const confirmSelection = () => {
    const selected = multiSelect.selectedTokens(tokens);
    if (selected.length === 0) return;
    if (selected.length === 1) {
      handleSelectToken(selected[0]);
      return;
    }
    setMultiSelectMode(true);
    setSelectedToken(selected[0]);
    setStep('enter-details');
    if (activeAccount) {
      const chainId = tokenChainId(selected[0]);
      prefetchForSend(activeAccount.address, chainId);
      findAccountByCredentialId(activeAccount.id).then((s) => {
        prefetchedAccount.current = s ?? null;
        return estimateTransactionFee(
          activeAccount.address, chainId, 'fast', undefined, undefined, gasFeeToken, s?.publicKeyHex,
        );
      })
        .then((f) => { if (mountedRef.current) setFeeEstimate(f); })
        .catch(() => {});
      import('@/services/vela-core').then((m) => { webauthnModuleRef.current = m; });
      // Warm a gas estimate so the detail list can show the native line net of
      // its reserve right away (not just at confirm).
    }
  };


  const handleSelectToken = (token: APIToken) => {
    setMultiSelectMode(false); // single-token path — normal amount-send, not a multiSelect
    setFeeEstimate(null); // A prior network's quote must never gate this token's amount.
    setSelectedToken(token);
    setStep('enter-details');

    // Start prefetching RPC data + bundler info as soon as token is selected.
    // User will spend several seconds filling in recipient + amount — plenty of
    // time for these to complete and warm the caches.
    if (activeAccount) {
      const chainId = tokenChainId(token);
      prefetchForSend(activeAccount.address, chainId);
      findAccountByCredentialId(activeAccount.id).then(s => { prefetchedAccount.current = s ?? null; });
      import('@/services/vela-core').then(m => { webauthnModuleRef.current = m; });
    }
  };

  const handleContinue = async () => {
    if (multiSelectMode) {
      if (!isValidAddress(recipient)) {
        showAlert(t('send.alertInvalidAddressTitle'), t('send.alertInvalidAddressBody'));
        return;
      }
      if (pickedTokens.length === 0) return;
    } else if (splitMode) {
      if (!recipientsAreValid(recipients)) {
        showAlert(t('send.alertInvalidAddressTitle'), t('send.alertInvalidAddressBody'));
        return;
      }
      if (selectedToken) {
        const totalBase = sumSplitBaseUnits(recipients, selectedToken.decimals);
        const balBase = toBaseUnits(selectedToken.balance || '0', selectedToken.decimals);
        if (totalBase > balBase) {
          showAlert(t('send.alertInsufficientBalanceTitle'), t('send.alertInsufficientBalanceBody', { defaultValue: 'The total exceeds your balance.' }));
          return;
        }
      }
    } else {
      if (!isValidAddress(recipient)) {
        showAlert(t('send.alertInvalidAddressTitle'), t('send.alertInvalidAddressBody'));
        return;
      }
      const tokenAmount = tokenUnitsFor(selectedToken!);
      const amountNum = parseFloat(tokenAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        showAlert(t('send.alertInvalidAmountTitle'), t('send.alertInvalidAmountBody'));
        return;
      }
      if (amountWarning) {
        showAlert(t('send.alertInsufficientBalanceTitle'), amountWarning);
        return;
      }
    }

    // Jump to confirm screen immediately — load gas estimate in background
    if (selectedToken && activeAccount) {
      const chainId = tokenChainId(selectedToken);

      // Ensure prefetch is running (may already be cached from token selection)
      prefetchForSend(activeAccount.address, chainId);
      let storedForEstimate: { publicKeyHex: string } | null;
      try {
        storedForEstimate = prefetchedAccount.current
          ?? await findAccountByCredentialId(activeAccount.id)
          ?? null;
      } catch {
        showAlert(
          t('send.alertEstimateFailedTitle'),
          t('send.alertAccountUnavailableBody'),
        );
        return;
      }
      prefetchedAccount.current = storedForEstimate ?? null;
      if (!storedForEstimate?.publicKeyHex) {
        showAlert(
          t('send.alertEstimateFailedTitle'),
          t('send.alertAccountUnavailableBody'),
        );
        return;
      }
      if (!webauthnModuleRef.current) {
        import('@/services/vela-core').then(m => { webauthnModuleRef.current = m; });
      }

      // Estimate gas + check the relayer treasury BEFORE advancing to confirm.
      // A depleted relayer opens TreasuryBootstrapSheet here, replacing the
      // personal gas-account funding sheet entirely.
      setEstimatingGas(true);
      setFeeEstimate(null);

      try {
        // The account context and estimate are mandatory. A timeout is surfaced
        // as an error; never continue with a fabricated UserOperation preview.
        // The REAL call for the charge basis: in-band displayed = signed, so this
        // estimate must price the actual send, not the padded rough model (which
        // over-charged ~8× on Arbitrum). Build the ACTUAL send/batch shape so in-band pricing
        // (estimateInBandBasisGas) sees the real calldata; the fee-reserve amounts don't affect
        // the gas SHAPE, so batch modes use the raw transfer legs (no circular fee dependency).
        let estTx: { to: string; value?: string; data?: string } | undefined;
        let estBatch: { to: string; value?: string; data?: string }[] | undefined;
        try {
          if (multiSelectMode) {
            estBatch = buildMultiTokenCalls(recipient.trim(), toMultiTokenSpecs(pickedTokens));
          } else if (splitMode) {
            estBatch = buildSplitCalls(
              { tokenAddress: isNativeToken(selectedToken!) ? null : selectedToken!.tokenAddress, decimals: selectedToken!.decimals },
              recipients.map((r) => ({ address: r.address.trim(), amount: r.amount })),
            );
          } else if (selectedToken && amount && isValidAddress(recipient)) {
            const tokenAmt = tokenUnitsFor(selectedToken);
            const weiHex = amountToWeiHex(tokenAmt, selectedToken.decimals);
            estTx = isNativeToken(selectedToken)
              ? { to: recipient.trim(), value: weiHex }
              : { to: selectedToken.tokenAddress!, data: encErc20Transfer(recipient.trim(), weiHex) };
          }
        } catch {
          // A half-typed amount/recipient → fall back to the rough basis for this estimate.
          estTx = undefined;
          estBatch = undefined;
        }
        const preCheck = async (): Promise<TreasuryStatus | null> => {
          const [fee, bootstrapStatus] = await Promise.all([
            estimateTransactionFee(
              activeAccount!.address, chainId, 'fast', estTx, estBatch, gasFeeToken,
              storedForEstimate.publicKeyHex,
            ),
            // Do not inspect the user's personal gas account. The sole send
            // gate is the relayer treasury, and a low float replaces the old
            // "发送前，还差一步" sheet at this exact point in the flow.
            getTreasuryBootstrap(chainId),
          ]);
          setFeeEstimate(fee);
          return bootstrapStatus;
        };
        const timeout = new Promise<never>((_, reject) => setTimeout(
          () => reject(new Error('Could not estimate gas in time. Please try again.')), 15_000,
        ));
        const bootstrapStatus = await Promise.race([preCheck(), timeout]);
        if (bootstrapStatus && mountedRef.current) {
          setTreasuryBootstrap(bootstrapStatus);
          setEstimatingGas(false);
          return;
        }
      } catch (err) {
        setEstimatingGas(false);
        showAlert(
          t('send.alertEstimateFailedTitle'),
          err instanceof Error ? err.message : t('send.alertEstimateFailedBody'),
        );
        return;
      }

      setEstimatingGas(false);
      setStep('confirm');
    } else {
      setStep('confirm');
    }
  };

  const handleMaxAmount = async () => {
    if (!selectedToken) return;
    // Max always fills in token units. Every exit below writes a token figure;
    // the ones that await an estimate leave the field blank meanwhile rather
    // than letting the previous fiat digits sit under a token label.
    setTokenAmount('');

    // For native tokens (ETH, BNB, etc.), reserve gas for the EntryPoint prefund.
    // The Safe must hold: transferAmount + prefund, so max = balance - prefund.
    // The quote's in-band margin has already been included in totalWei.
    if (isNativeToken(selectedToken) && activeAccount) {
      try {
        const chainId = tokenChainId(selectedToken);
        const fee = selectedFeeEstimate ?? await estimateTransactionFee(
          activeAccount.address, chainId, 'fast', undefined, undefined, gasFeeToken,
          prefetchedAccount.current?.publicKeyHex,
        );
        // Use string-based conversion to avoid floating-point precision loss
        const balanceWei = balanceToWei(selectedToken.balance, selectedToken.decimals);
        // totalWei already includes the in-band gas margin shown to the user.
        const reserveWei = fee.totalWei;
        // String-exact `balance − reserve` (no float precision loss). Matches
        // reserveNativeGas in batch-send.ts, so
        // amountWei + reserveWei === balanceWei exactly and the "insufficient for
        // gas" pre-check no longer trips on its own Max fill. Returns '0' when the
        // balance can't cover the gas reserve.
        setTokenAmount(maxNativeSendable(balanceWei, reserveWei, selectedToken.decimals));
        return;
      } catch {
        // Estimation failed — fall through to full balance (tx may fail but user sees the error)
      }
    }

    // ERC-20 Max when the fee is paid in that SAME token: leave a reserve behind for the
    // in-band reimbursement. This is asset-based rather than network-based, so the rule is
    // identical for Tempo and ordinary EVM in-band sends.
    if (activeAccount && selectedToken.tokenAddress) {
      try {
        const chainId = tokenChainId(selectedToken);
        const fee = selectedFeeEstimate ?? await estimateTransactionFee(
          activeAccount.address, chainId, 'fast', undefined, undefined, gasFeeToken,
          prefetchedAccount.current?.publicKeyHex,
        );
        if (fee.feeAsset?.kind === 'erc20' && fee.feeAsset.token.toLowerCase() === selectedToken.tokenAddress.toLowerCase()) {
          // Reserve 1.5× the quoted fee (+50% for the send-time re-quote drift the 2× gate absorbs).
          const reserve = (fee.feeAsset.amount * 3n) / 2n;
          const balUnits = balanceToWei(selectedToken.balance, selectedToken.decimals);
          setTokenAmount(balUnits > reserve ? fromBaseUnits(balUnits - reserve, selectedToken.decimals) : '0');
          return;
        }
      } catch {
        // Estimation failed — fall through to full balance (the pre-check still warns).
      }
    }

    // Gas is paid in native or a separate ERC-20 fee asset, so the full balance is sendable.
    setTokenAmount(selectedToken.balance || '0');
  };

  /** Return from a blocked confirmation to the exact amount form, retaining every other choice. */
  const handleEditAmount = () => {
    setTxStatus('idle');
    setTxError(null);
    setStep('enter-details');
    // The amount field is mounted only after the step update. A small defer makes the recovery
    // action feel direct on mobile and web without changing the entered recipient/token.
    setTimeout(() => amountInputRef.current?.focus(), 100);
  };

  const handleConfirm = async () => {
    if (!selectedToken || !activeAccount) return;
    // A fee re-quote can turn a previously valid amount into an unpayable same-token send.
    // Never let the slide reach signing in that state; the confirmation UI gives the user the
    // actionable "Edit amount" recovery instead.
    if (sameAssetFeeIssue) {
      handleEditAmount();
      return;
    }
    // …and the same for a figure that stopped resolving: a display-currency
    // commit can empty the field while this page is open, and `toBaseUnits('0')`
    // is a perfectly valid 0n, so the submit path would have encoded a
    // zero-value transfer and asked for a passkey over it. `canConfirm` disables
    // the slider, but a disabled control is a suggestion — this is the refusal.
    // Twin of `send.rs::slide_confirm`.
    if (!confirmAmountOk) {
      handleEditAmount();
      return;
    }
    // Tap haptic fires on the one-tap VelaButton; the hold-to-confirm path
    // provides its own (Medium on press + Success on completion).

    // The relayer treasury was checked before entering the confirm screen.
    // Proceed directly to transaction execution.
    await executeTransaction();
  };

  const executeTransaction = async () => {
    if (!selectedToken || !activeAccount) return;
    // Synchronous re-entry lock: `sending` is async React state, so a rapid
    // second slide in the same tick would start a concurrent submit. The
    // Phase-2 grant await widens that window to ~20s — guard on a ref.
    const sendGen = sendLock.begin();
    if (sendGen === null) return; // a send is already in flight
    sendCancelledRef.current = false;
    setSending(true);
    setTxStatus('preparing');
    setTxHash(null);
    setUserOpHash(null);
    setTxError(null);
    setReceiptFailed(false);
    setReceiptSigned(null);
    setFeeHeld(false);
    setFeeRejected(false);
    try {
      const chainId = tokenChainId(selectedToken);

      // Use prefetched account if available, otherwise fetch now
      const stored = prefetchedAccount.current ?? await findAccountByCredentialId(activeAccount.id);
      if (!stored?.publicKeyHex) {
        throw new Error(t('send.txErrorPublicKey'));
      }

      const signFn = async (challenge: Uint8Array) => {
        setTxStatus('signing');
        const challengeHex = toHex(challenge);
        const assertion = await Passkey.sign(challengeHex, activeAccount.id);

        // Use prefetched module if available, otherwise dynamic import
        const webauthnMod = webauthnModuleRef.current ?? await import('@/services/vela-core');
        const compat = webauthnMod.verifySafeWebAuthn(assertion);
        if (!compat.ok) {
          throw new Error(
            'Your device\'s identity provider is not compatible with Vela Wallet. ' +
            'Please switch to Google Password Manager.\n\n' + compat.reason,
          );
        }

        return {
          signature: fromHex(assertion.signatureHex),
          authenticatorData: fromHex(assertion.authenticatorDataHex),
          clientDataJSON: fromHex(assertion.clientDataJSONHex),
        };
      };

      // Recheck immediately before signing to cover the rare race where the
      // relayer float falls below its floor after the send-page preflight.
      if (await maybeShowTreasuryBootstrap(chainId)) {
        setSending(false);
        setTxStatus('idle');
        return;
      }

      setTxStatus('submitting');
      const currentFeeEstimate = feeEstimate?.chainId === chainId ? feeEstimate : null;
      const maxFee = currentFeeEstimate?.maxFeePerGas;
      // In-band: sign EXACTLY the fee the confirm slide displayed (amount + recipient).
      // The bundler's 2×-real-cost gate rejects a stale quote loudly; we then re-quote
      // and the user re-confirms a NEW number — never a silent display/charge mismatch.
      const quotedFee = currentFeeEstimate?.inBand && currentFeeEstimate.feeRecipient
        ? {
            amount: currentFeeEstimate.feeAsset?.kind === 'erc20' ? currentFeeEstimate.feeAsset.amount : currentFeeEstimate.totalWei,
            recipient: currentFeeEstimate.feeRecipient,
          }
        : undefined;

      // One send line per output (single = 1, split = N recipients, multiSelect = N
      // tokens). split/multiSelect submit as a single Safe MultiSend UserOp — one
      // signature, one gas. Each line carries its own token so multiSelect's mixed-token
      // activity records (symbol/decimals/usd) are correct per line.
      let result;
      let lines: { to: string; toName?: string; amount: string; symbol: string; decimals: number; priceUsd: number; logoUrls?: string[] }[];
      if (multiSelectMode) {
        // Reserved specs = the exact amounts sent (native minus gas). Activity
        // lines are derived from them so each record shows what actually moved.
        const specs = multiTokenSpecs(chainId);
        if (specs.length === 0) {
          throw new Error(t('send.multiSendNoFundsAfterGas', { defaultValue: 'Not enough to cover gas after the reserve.' }));
        }
        const calls = buildMultiTokenCalls(recipient.trim(), specs);
        result = await sendBatchCalls(activeAccount.address, calls, chainId, stored.publicKeyHex, signFn, maxFee, gasFeeToken, quotedFee);
        lines = specs.map((spec) => {
          const tk = pickedTokens.find((t) => (isNativeToken(t) ? null : t.tokenAddress) === spec.tokenAddress)!;
          return { to: recipient.trim(), toName: recipientIdentity?.name, amount: spec.amount, symbol: tk.symbol, decimals: tk.decimals, priceUsd: tk.priceUsd ?? 0, logoUrls: tokenLogoURLs(tk) };
        });
      } else if (splitMode) {
        const calls = buildSplitCalls(
          { tokenAddress: isNativeToken(selectedToken) ? null : selectedToken.tokenAddress, decimals: selectedToken.decimals },
          recipients.map((r) => ({ address: r.address.trim(), amount: r.amount })),
        );
        result = await sendBatchCalls(activeAccount.address, calls, chainId, stored.publicKeyHex, signFn, maxFee, gasFeeToken, quotedFee);
        lines = recipients.map((r) => ({ to: r.address.trim(), toName: r.name?.trim() || undefined, amount: r.amount, symbol: selectedToken!.symbol, decimals: selectedToken!.decimals, priceUsd: selectedToken!.priceUsd ?? 0, logoUrls: tokenLogoURLs(selectedToken!) }));
      } else {
        const tokenAmount = tokenUnitsFor(selectedToken);
        const weiHex = amountToWeiHex(tokenAmount, selectedToken.decimals);
        if (isNativeToken(selectedToken)) {
          result = await sendNative(activeAccount.address, recipient, weiHex, chainId, stored.publicKeyHex, signFn, maxFee, gasFeeToken, quotedFee);
        } else {
          result = await sendERC20(activeAccount.address, selectedToken.tokenAddress!, recipient, weiHex, chainId, stored.publicKeyHex, signFn, maxFee, gasFeeToken, quotedFee);
        }
        lines = [{ to: recipient, toName: recipientIdentity?.name, amount: tokenAmount, symbol: selectedToken.symbol, decimals: selectedToken.decimals, priceUsd: selectedToken.priceUsd ?? 0, logoUrls: tokenLogoURLs(selectedToken) }];
      }

      // Feed the receipt the per-line breakdown for batch sends so it renders
      // "30 USDC → 3 recipients" / "3 assets → Bob" instead of a single (NaN) amount.
      // A plain single send stays null and uses the scalar amount/symbol props.
      if (multiSelectMode || splitMode) {
        setReceiptTransfers(lines.map((ln) => ({
          to: ln.to,
          toName: ln.toName,
          amount: ln.amount,
          symbol: ln.symbol,
          logoUrls: ln.logoUrls ?? [],
          usdValue: (parseFloat(ln.amount || '0') || 0) * ln.priceUsd,
        })));
        setReceiptKind(multiSelectMode ? 'multiSelect' : 'split');
      } else {
        setReceiptTransfers(null);
        setReceiptKind(null);
      }
      // The signature is now a fact. Freeze the money it moved (and the price it
      // moved at); the receipt reads THIS and never converts again.
      setReceiptSigned(lines[0] ? { amount: lines[0].amount, priceUsd: lines[0].priceUsd } : null);

      // Bundler accepted the UserOp — treat the payment as sent right now (we
      // have the userOpHash). The on-chain tx hash resolves in the background to
      // light up the explorer link; a slow/failed receipt poll must NOT turn a
      // submitted payment into an error.
      if (mountedRef.current) setUserOpHash(result.userOpHash);
      setTxStatus('confirmed');
      hapticSuccess(); // payment accepted by the bundler — distinct success buzz
      setSending(false);
      clearTokenCache(activeAccount.address);

      // One activity record per recipient. In a batch they share the userOpHash,
      // so each gets a distinct id (`<hash>-<i>`) to show as its own history line
      // and be patched independently when the on-chain hash lands. USD is captured
      // now so non-stablecoin sends (e.g. BNB) still render a fiat amount later.
      const ts = Math.floor(Date.now() / 1000);
      const records = lines.map((ln, i) => {
        const usd = parseFloat(ln.amount || '0') * ln.priceUsd;
        return {
          id: lines.length > 1 ? `${result.userOpHash}-${i}` : result.userOpHash,
          userOpHash: result.userOpHash,
          txHash: '',
          from: activeAccount!.address,
          to: ln.to,
          toName: ln.toName,
          value: ln.amount,
          symbol: ln.symbol,
          decimals: ln.decimals,
          logoUrls: ln.logoUrls,
          chainId,
          timestamp: ts,
          status: 'pending' as const,
          type: 'send' as const,
          usd: usd > 0 ? '$' + usd.toFixed(2) : undefined,
        };
      });
      // Persist ALL siblings in one atomic write. A per-record Promise.all would
      // race the read-modify-write and silently drop every sibling but one — which
      // collapsed a batch send to a single line in Activity.
      const recordIds = records.map((rec) => rec.id);
      const pendingWrites = saveTransactions(records).catch(() => {});

      // Resolve the on-chain hash in the background and flip every record to
      // 'confirmed' (awaiting the pending writes first so the patches find them).
      // A definitive drop/revert flips them to 'failed' so the receipt stamp and
      // the feed both show the real outcome; a transient/timeout stays 'pending'.
      result.waitForTxHash()
        .then(async (hash) => {
          if (mountedRef.current) setTxHash(hash);
          await pendingWrites;
          await updateTransactions(recordIds, { txHash: hash, status: 'confirmed' }).catch(() => {});
        })
        .catch(async (err) => {
          // The relay is holding the op until network fees fit what the user signed.
          // It is still queued and sends itself, so the record stays pending — only
          // the wording changes, from "confirming" to "waiting for fees".
          if (err instanceof UserOpFeeHoldError) {
            if (mountedRef.current) setFeeHeld(true);
            return;
          }
          // Definitive failure (relay refusal / op dropped / reverted) vs. a slow or
          // unreachable poll. Only the former is a real failure; the latter stays
          // pending (reconciled later).
          const rejected = err instanceof UserOpRejectedError;
          if (!rejected && !/dropped from the network|reverted|failed/i.test(err?.message ?? '')) return;
          if (mountedRef.current) {
            setReceiptFailed(true);
            if (rejected) setFeeRejected(true);
          }
          await pendingWrites;
          await updateTransactions(recordIds, { status: 'failed' }).catch(() => {});
        });

    } catch (error: any) {
      // Wording-tolerant detection — the bundler has reworded this error before
      // (legacy "...bundler EOA" → current "...bundler gas account ... Deposit to:").
      const underfunded = parseBundlerUnderfunded(error?.message);
      if (error?.code === 'PASSKEY_CANCELLED') {
        setTxStatus('idle');
      } else if (/gas relayer is unavailable/i.test(error?.message ?? '')
          && await maybeShowTreasuryBootstrap(tokenChainId(selectedToken!))) {
        // The in-band path found no usable relayer float AND the treasury says
        // it needs a bootstrap: the community bootstrap sheet is the honest ask —
        // a generic "try again" would loop forever. A transient relayer blip
        // (no bootstrapNeeded) falls through to the generic error below.
        setTxStatus('idle');
      } else if (underfunded) {
        // Never open the personal gas-account top-up sheet from a reactive
        // bundler error. Recheck only the relayer treasury: if it is depleted,
        // show the bootstrap sheet; otherwise leave the request as an ordinary
        // failed send rather than asking the user to fund their own gas bucket.
        const chainId = tokenChainId(selectedToken!);
        if (await maybeShowTreasuryBootstrap(chainId)) {
          setTxStatus('idle');
        } else {
          setTxError(t('send.txErrorBundlerFund'));
          setTxStatus('error'); hapticError();
        }
      } else {
        // Never surface a raw RPC/library exception on the money-flow confirm
        // screen — it's unlocalized and jargon-filled. Log it for diagnostics and
        // show a calm, actionable, localized message instead.
        console.warn('[send] unhandled tx error:', error?.message ?? String(error));
        setTxError(t('send.txErrorGeneric'));
        setTxStatus('error'); hapticError();
      }
    } finally {
      // Release only if this is still the current send. A cancelled send already
      // released the lock (and bumped the generation), so this stale finally must
      // not clear a newer in-flight send's lock or its spinner (issue #91).
      if (sendLock.end(sendGen)) setSending(false);
    }
  };

  const handleBack = () => {
    if (step === 'confirm') {
      // Don't go back while transaction is in progress
      if (txStatus !== 'idle' && txStatus !== 'confirmed' && txStatus !== 'error') return;
      setTxStatus('idle');
      setTxHash(null);
      setTxError(null);
      setStep('enter-details');
    } else if (step === 'enter-details') {
      if (multiSelectMode) {
        // Back to the multi-select picker, preserving the multiSelect selection.
        setStep('select-token');
      } else {
        setSelectedToken(null);
        setTokenAmount('');
        setRecipient('');
        setSplitMode(false);
        setRecipients([]);
        setStep('select-token');
      }
    } else {
      router.back();
    }
  };

  // ── Intents the views used to spell out inline ───────────────────────────
  // Every one of these is the exact statement list that lived in SendScreen /
  // EnterDetailsStep / ConfirmStep, moved here unchanged so both platforms name
  // an intent instead of writing this controller's state from outside (spec 017
  // G12; native behaviour is byte-identical).

  /**
   * The ⇄ conversion toggle (was EnterDetailsStep.tsx:165-176).
   *
   * The whole operation is one `DenominatedAmount.convert`, and it cannot be
   * written any other way from here: the figure's unit is private, so "flip the
   * label, keep the digits" — the defect this replaces — is not expressible.
   * What is left is deciding what an UNCONVERTIBLE figure should become, and
   * only two answers are honest:
   *
   * - Entering fiat mode commits the user to typing money in the display
   *   currency. With no price for that currency there is nothing to divide by,
   *   so the door stays shut and the typed token amount is left alone.
   * - Leaving is always allowed, because a currency can go unpriceable while a
   *   fiat figure is already typed and trapping someone in a mode whose amount
   *   can never resolve is its own bug. But the figure does NOT come along:
   *   5000 CNY is not 5000 USDC and there is no rate to say what it is, so the
   *   field is emptied. Empty is the one state that claims nothing —
   *   `canContinue` already refuses it and the ⇅ row already reads `0 SYM`.
   *
   * A blank or zero figure crosses units with no rate at all (zero is zero in
   * every unit), so an untouched screen is never stuck.
   *
   * Twin of `send.rs::toggle_fiat_input`.
   */
  const toggleFiatInput = () => {
    if (!selectedToken) return;
    const price = displayPriceFor(selectedToken);
    const target: Denom = typedAmount.isFiat ? TOKEN_DENOM : fiatDenom(dc.code);
    if (target.kind === 'fiat' && !price) return; // the door into fiat stays shut
    const fiatDecimals = ZERO_DECIMAL_CODES.has(dc.code) ? 0 : 2;
    const converted = typedAmount.convert(target, price, selectedToken.decimals, fiatDecimals);
    // Unconvertible on the way OUT of fiat: leave the mode, drop the figure.
    // Never carry the digits across the unit boundary.
    setTypedAmount(converted ?? DenominatedAmount.token(''));
  };

  /**
   * Whether the ⇄ row is offered, and whether pressing it would do anything.
   *
   * Decided here, in the same sentence as the refusal above, because they used
   * to be decided in two places: `toggleFiatInput` returned early with no price
   * for the display currency, while `EnterDetailsStep` rendered the row on
   * `priceUsd > 0` alone. The control looked live and swallowed the tap — no
   * mode change, no message, no disabled state. It is disabled now.
   *
   * `denomToggleShown` also keeps the row up whenever the figure is already
   * fiat, even for a token that has lost its price: leaving is the only way out
   * of a mode whose amount can no longer resolve, and the exit used to vanish
   * with the price. Twin of `send.rs::denom_toggle`.
   */
  const denomToggleShown = !!selectedToken
    && ((selectedToken.priceUsd != null && selectedToken.priceUsd > 0) || typedAmount.isFiat);
  const denomToggleEnabled = !!selectedToken
    && (typedAmount.isFiat || !!displayPriceFor(selectedToken));
  /**
   * And WHY it is inert. Dimming the row closed half the hole: the refusal
   * became visible, the reason did not — and this is the one branch
   * `warnCannotConvert` cannot cover. A priced token whose display currency has
   * no rate leaves the figure in TOKEN units, which resolves perfectly, so no
   * amount warning fires; the row simply sat there at 40% opacity saying
   * nothing. Twin of `send.rs::denom_toggle_reason`.
   */
  const denomToggleReason = denomToggleShown && !denomToggleEnabled && selectedToken
    ? t('send.denomToggleNoRate', { code: typedAmount.fiatCode ?? dc.code, symbol: selectedToken.symbol })
    : null;

  /** Tapping the token hero — back to the picker, KEEPING the recipient. */
  const changeToken = () => {
    setStep('select-token');
    setSelectedToken(null);
    setTokenAmount('');
    setSplitMode(false);
    setRecipients([]);
  };

  const openScanner = () => setShowScanner(true);
  const closeScanner = () => setShowScanner(false);
  const openContactPicker = (target: string | null) => {
    setPickerTarget(target);
    setShowContactPicker(true);
  };
  const closeContactPicker = () => setShowContactPicker(false);
  const openBatchImport = () => setShowBatchImport(true);
  const closeBatchImport = () => setShowBatchImport(false);

  /** A raw scan payload (was SendScreen.tsx:181-203). */
  const handleScan = (data: string) => {
    setShowScanner(false);
    const req = parseEIP681(data);
    // Per-row scan in split mode — just take the address; a full-request
    // re-lock would blow away the other recipients.
    if (pickerTarget) {
      applyPickedAddress(req?.recipient ?? data);
      return;
    }
    // A full EIP-681 request re-opens Send locked; otherwise just take the address.
    if (req && req.chainId != null) {
      const p: Record<string, string> = {
        prefilledRecipient: req.recipient,
        prefilledChainId: String(req.chainId),
        locked: '1',
      };
      if (req.tokenAddress) p.prefilledTokenAddress = req.tokenAddress;
      if (req.amountBaseUnits != null) p.prefilledAmountBase = req.amountBaseUnits.toString();
      router.replace({ pathname: '/send', params: p });
      return;
    }
    setRecipient(req?.recipient ?? data);
  };

  /** The confirm screen's ✕ during preparing/signing (was ConfirmStep.tsx:381-395). */
  const cancelSigning = () => {
    // Signal the in-flight executeTransaction too: during the Phase-2 grant
    // await there is no passkey prompt to abort yet — without the ref, the flow
    // would resurrect a passkey prompt (or a funding sheet) AFTER this cancel.
    sendCancelledRef.current = true;
    // Release the re-entry lock so a retry starts (instead of silently
    // no-op'ing until the cancelled promise settles); cancel() also invalidates
    // that promise's stale finally so it won't clear the retry's lock (#91).
    sendLock.cancel();
    Passkey.cancelSign();
    setTxStatus('idle');
    setSending(false);
  };

  const retryAfterError = () => {
    setTxStatus('idle');
    setTxError(null);
  };

  const onFeeTokenChange = (token: string | null) => setGasFeeToken(token);
  const onFeeUpdate = (fee: TransactionFeeEstimate) => {
    if (mountedRef.current) setFeeEstimate(fee);
  };
  const onFeeBusyChange = (busy: boolean) => setFeeBusy(busy);

  const dismissTreasurySheet = () => setTreasuryBootstrap(null);
  /** After funding the relayer, return through the step-appropriate flow. */
  const retryAfterBootstrap = () => {
    setTreasuryBootstrap(null);
    // This sheet can now open from the amount screen. After funding the relayer,
    // return through the normal pre-confirm flow rather than submitting directly
    // from enter-details.
    if (step === 'enter-details') {
      void handleContinue();
    } else {
      void handleConfirm();
    }
  };

  const handleDone = () => router.back();
  const saveReceiptContact = () => {
    void saveContact({
      address: recipient,
      name: recipientIdentity?.name,
      resolvedName: recipientIdentity?.name,
    });
  };

  /**
   * The resolved amount every confirm-page number is built from (was
   * ConfirmStep.tsx:80). Web gets this from the core instead, which is the
   * point: one resolution, shared by the display and the signature.
   */
  const tokenAmount = selectedToken ? tokenUnitsFor(selectedToken) : '';

  /**
   * The Continue button's gate (was EnterDetailsStep.tsx:372, negated), plus
   * the one condition it never had: the figure must actually RESOLVE.
   *
   * `!amount` alone lit the button on an amount that could never become base
   * units — a fiat figure with no rate resolves to '0', so Continue was armed
   * on a number `handleContinue` was guaranteed to reject with
   * `alertInvalidAmount`, again and again, with nothing on screen to explain
   * it. The gate now asks the very string the signature is built from, which
   * is also the string the ⇅ row prints. Twin of `send.rs`'s `can_continue`.
   */
  const canContinue = !(
    (splitMode
      ? !recipientsAreValid(recipients)
      : multiSelectMode
        ? !isValidAddress(recipient) || pickedTokens.length === 0
        : !recipient || !amount || !(parseFloat(tokenAmount || '0') > 0)) ||
    estimatingGas ||
    (locked && !!amountWarning)
  );

  /**
   * The confirm slide's gate (was ConfirmStep.tsx:357, negated) — plus the
   * amount question it never asked.
   *
   * Everything here was about the FEE and the pipeline; the money itself was
   * never re-examined after Continue. But the confirm page is a page someone
   * can sit on, and a display-currency commit landing underneath re-denominates
   * the field to empty (the `storedAmount.fiatCode !== dc.code` rule above),
   * leaving the slider armed over a figure that resolves to nothing — a
   * zero-value transfer, signable, with no warning anywhere. It now asks
   * exactly what `canContinue` asks. The batch modes carry their money in
   * `recipients`/`multiTokenSpecs`, not in the amount field, so they are exempt
   * for the same reason `canContinue` exempts them. Twin of
   * `send.rs::can_confirm`.
   */
  const confirmAmountOk = splitMode || multiSelectMode || parseFloat(tokenAmount || '0') > 0;
  const canConfirm = txStatus === 'idle' && !estimatingGas && !feeBusy && !sameAssetFeeIssue
    && confirmAmountOk;
  /** …and the refusal is not allowed to be silent. Confirm step only — the
   *  entry screen already has `amountWarning`. */
  const confirmAmountIssue = step === 'confirm' && !confirmAmountOk && selectedToken
    ? t('send.warnCannotConvert', { code: typedAmount.fiatCode ?? dc.code, symbol: selectedToken.symbol })
    : null;

  /**
   * The split editor's live over-balance hint (was MultiRecipientEditor.tsx:99-101,
   * inlined here unchanged — including the `toBaseUnits` throw on a malformed
   * row, which the editor would have raised from the same render).
   */
  const splitOverBalance = splitMode && !!selectedToken
    && sumSplitBaseUnits(recipients, selectedToken.decimals)
      > toBaseUnits(selectedToken.balance || '0', selectedToken.decimals);

  // The receipt's scalar amount + fiat line (was SendScreen.tsx:152/158).
  // READ, never re-derive: both come off the submit-time snapshot, which is the
  // same discipline `receiptTransfers` has always had.
  const receiptAmount = receiptSigned?.amount ?? '';
  const receiptUsdValue = receiptSigned
    ? Math.max(parseFloat(receiptSigned.amount) || 0, 0) * receiptSigned.priceUsd
    : 0;

  // Step 1: Select Token — delegated to the shared TokenSelector.
  // Multi-select is built-in now: filter to a specific network and the picker
  // shows checkboxes (one token = amount-send, two+ = multiSelect). No mode toggle.
  const tokenMultiSelect = {
    selectedIds: multiSelect.selectedIds,
    onToggle: multiSelect.toggle,
    onToggleAll: multiSelect.toggleAll,
    isAllSelected: multiSelect.isAllSelected,
    onNetworkChange: multiSelect.onNetworkChange,
    onConfirm: confirmSelection,
    confirmLabel: multiSelect.count === 1
      ? t('send.continueBtn')
      : t('send.multiSendContinue', { n: multiSelect.count, chain: multiSelect.chainId != null ? chainName(multiSelect.chainId) : '' }),
    selectAllLabel: t('send.selectAllValuable', { defaultValue: 'Select all valuable' }),
  };

  return {
    t,
    router,
    params,
    locked,
    amountLocked,
    activeAccount,
    state,
    address,
    dc,
    formatUsd,
    hasPreselection,
    step,
    setStep,
    stepRef,
    lockError,
    setLockError,
    lockRetry,
    setLockRetry,
    resolvingLock,
    setResolvingLock,
    addingNetwork,
    setAddingNetwork,
    addNetworkMsg,
    setAddNetworkMsg,
    tokens,
    setTokens,
    loading,
    setLoading,
    selectedToken,
    setSelectedToken,
    recipient,
    setRecipient,
    amount,
    setAmount,
    splitMode,
    setSplitMode,
    recipients,
    setRecipients,
    pickerTarget,
    setPickerTarget,
    multiSelectMode,
    setMultiSelectMode,
    multiSelect,
    sending,
    setSending,
    showScanner,
    setShowScanner,
    copiedContract,
    setCopiedContract,
    feeEstimate: selectedFeeEstimate,
    setFeeEstimate,
    estimatingGas,
    setEstimatingGas,
    sendLock,
    sendCancelledRef,
    mountedRef,
    txStatus,
    setTxStatus,
    txHash,
    setTxHash,
    userOpHash,
    setUserOpHash,
    txError,
    setTxError,
    receiptTransfers,
    setReceiptTransfers,
    receiptKind,
    setReceiptKind,
    receiptFailed,
    setReceiptFailed,
    feeHeld,
    feeRejected,
    inputInUsd,
    amountFiatCode,
    denomToggleShown,
    denomToggleEnabled,
    denomToggleReason,
    gasFeeToken,
    setGasFeeToken,
    treasuryBootstrap,
    setTreasuryBootstrap,
    feeBusy,
    setFeeBusy,
    showContactPicker,
    setShowContactPicker,
    showBatchImport,
    setShowBatchImport,
    amountWarning,
    setAmountWarning,
    recipientIdentity,
    setRecipientIdentity,
    recipientRisk,
    setRecipientRisk,
    sim,
    setSim,
    amountInputRef,
    prefetchedAccount,
    webauthnModuleRef,
    resolveLockedRequest,
    handleAddNetwork,
    refreshTokens,
    maybeShowTreasuryBootstrap,
    enterSplitMode,
    seedSplitRecipients,
    handleRecipientsChange,
    applyPickedAddress,
    pickedTokens,
    multiTokenSpecs,
    sameAssetFeeIssue,
    confirmSelection,
    handleSelectToken,
    handleContinue,
    handleMaxAmount,
    handleEditAmount,
    handleConfirm,
    executeTransaction,
    handleBack,
    tokenMultiSelect,
    // The shared controller contract (spec 017 G12) — see the block above.
    prefilledRecipient: params.prefilledRecipient,
    multiSelectChainId: multiSelect.chainId,
    publicKeyHex: prefetchedAccount.current?.publicKeyHex,
    canContinue,
    canConfirm,
    confirmAmountIssue,
    tokenAmount,
    splitOverBalance,
    receiptAmount,
    receiptUsdValue,
    toggleFiatInput,
    changeToken,
    openScanner,
    closeScanner,
    handleScan,
    openContactPicker,
    closeContactPicker,
    openBatchImport,
    closeBatchImport,
    cancelSigning,
    retryAfterError,
    onFeeTokenChange,
    onFeeUpdate,
    onFeeBusyChange,
    dismissTreasurySheet,
    retryAfterBootstrap,
    handleDone,
    saveReceiptContact,
  };
}

/**
 * The native controller's own return type, constrained to the shared contract:
 * dropping a field the screens read now fails THIS file's build instead of
 * silently handing `undefined` to a step component (spec 017 G12).
 */
export type SendController = ExtendsSendController<ReturnType<typeof useSendController>>;
