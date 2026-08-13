/**
 * SigningSheet — the single presentational signing surface (ERC-7730 Clear
 * Signing UI).
 *
 * The ONE rendering path for signing (a security UI must not be duplicated). The
 * production modal and the Clear-Signing test harness both render this with the
 * same data; only the action callbacks + signing-state differ. It owns the
 * read-only data fetching (descriptor resolution, gas estimate, token metadata,
 * approval detection) and all presentation; it never touches the dApp transport.
 */
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, ActivityIndicator,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { VelaButton } from '@/components/ui/VelaButton';
import { SlideToConfirmButton } from '@/components/ui/SlideToConfirmButton';
import { type BLEIncomingRequest } from '@/models/types';
import { nativeSymbol } from '@/models/network';
import { hapticLight, hapticSuccess, hapticError, hapticWarning, showAlert } from '@/services/platform';
import { type ClearSignResult } from '@/services/clear-signing';
import { useClearSigning } from '@/hooks/use-clear-signing';
import { color } from '@/constants/theme';
import { GasFeeCard } from '@/components/ui/GasFeeCard';
import { useApprovalGuard } from '@/hooks/use-approval-guard';
import { useSigningFee } from '@/hooks/use-signing-fee';
import { fetchChainlinkPrices, resolveChainlinkPrice } from '@/services/price-service';
import { findAccountByCredentialId } from '@/services/storage';
import { simulateAssetChanges, type AssetSimResult } from '@/services/tx-simulation';
import { BalanceChangePreview } from './BalanceChangePreview';
import { rawBundlerGasCost } from '@/services/safe-transaction';
import { Shield, AlertTriangle, Pen } from 'lucide-react-native';
import { styles, localizeIntent, SigningChainContext } from './signing-core';
import { DAppBanner, SigningAccountRow } from './DAppBanner';
import { AdvancedPanel } from './AdvancedPanel';
import { WarningBanner } from './WarningBanner';
import { ClearSignView } from './views/ClearSignView';
import { ApprovalView } from './views/ApprovalView';
import { PermitSignView } from './views/PermitSignView';
import { MessageSignView } from './views/MessageSignView';
import { EthSignDangerView } from './views/EthSignDangerView';
import { BlindTypedDataView } from './views/BlindTypedDataView';
import { BlindTransactionView } from './views/BlindTransactionView';
import { BatchCallsView, type BatchItem } from './views/BatchCallsView';
import {
  batchItemsFor, batchPassKey, batchPassPending, batchRowsAligned, type BatchPass,
} from '@/services/wallet-state-core/clear-batch';

export interface SigningSheetProps {
  request: BLEIncomingRequest;
  chainId: number;
  account: { id?: string; address?: string; name?: string } | null;
  dappInfo: { name?: string; url?: string; icon?: string } | null;
  isSigning: boolean;
  signError: string | null;
  pendingOpHash: string | null;
  onApprove: (opts?: { maxFeePerGas?: bigint; bundlerCostWei?: bigint; gasFeeToken?: string | null; quotedFee?: { amount: bigint; recipient: string }; paramsOverride?: any[]; assetSim?: AssetSimResult | null; intent?: string }) => void;
  onReject: () => void;
  onDismiss: () => void;
  /**
   * Read-only replay: re-render a PAST signature exactly as it was shown, with no
   * approve/reject and no live-only work (gas estimate, simulation, funding). Used
   * by the Connections panel to "look back at what I signed" (and to re-open an
   * in-flight op's status after the sheet was closed). Defaults to false.
   */
  readOnly?: boolean;
  /**
   * Persisted sign-time simulation for a read-only replay — the "what moved"
   * preview captured when the request was approved. Live mode recomputes its own
   * `sim`; replay can't (state has moved on), so the host passes the stored one.
   */
  replaySim?: AssetSimResult | null;
  /**
   * TEST-HARNESS ONLY: simulate the transaction from this address instead of the
   * signer. The clear-signing demo signs with an empty parallel-space passkey, so
   * a real mainnet sim would revert on balance ("expected to fail"); pointing the
   * sim at a funded address lets the benign scenarios preview green as intended.
   * Never set in production — the sim must reflect the real signer's balances.
   */
  simFromOverride?: string;
  /**
   * TEST-HARNESS ONLY: use this pre-baked simulation result instead of running a
   * live sim — lets a scenario demo a state the mainnet sim can't produce on
   * demand (e.g. a scam's undeclared outflow). Never set in production.
   */
  simOverride?: AssetSimResult | null;
  /**
   * The `sign_request` machine's own approval gate (`SignView.confirm_gate_open`):
   * a reviewable request, the granted account reconciled, nothing in flight. Its
   * doc requires the shell to AND it with the approval guard's `confirm_allowed`
   * — this prop is that AND's other operand. Defaults to open for the surfaces
   * that have no signing machine behind them (the harness, the replay sheet).
   */
  confirmGateOpen?: boolean;
}

export function SigningSheet({
  request: incomingRequest,
  chainId,
  account: activeAccount,
  dappInfo,
  isSigning,
  signError,
  pendingOpHash,
  onApprove,
  onReject,
  onDismiss,
  readOnly = false,
  replaySim = null,
  simFromOverride,
  simOverride,
  confirmGateOpen = true,
}: SigningSheetProps) {
  const { t } = useTranslation();

  // The fee half lives in `useSigningFee` — one hook, two implementations. On
  // web it is a live `fee_policy` session that owns the quote, the fee-asset
  // options, the selection, the TTL and the confirm gate; on native it is the
  // TypeScript estimate this sheet used to run inline, moved verbatim. Speed
  // tiers are gone — every estimate/submit runs at 'fast'.
  //
  // An undeployed Safe's estimate must use the initCode from its persisted
  // passkey, exactly as the operation we later sign does.
  const [publicKeyHex, setPublicKeyHex] = useState<string | undefined>();
  const [publicKeyLoaded, setPublicKeyLoaded] = useState(!activeAccount?.id);
  useEffect(() => {
    let cancelled = false;
    const accountId = activeAccount?.id;
    if (!accountId) {
      setPublicKeyHex(undefined);
      setPublicKeyLoaded(true);
      return;
    }
    setPublicKeyHex(undefined);
    setPublicKeyLoaded(false);
    findAccountByCredentialId(accountId)
      .then((account) => {
        if (cancelled) return;
        setPublicKeyHex(account?.publicKeyHex);
        setPublicKeyLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPublicKeyHex(undefined);
        setPublicKeyLoaded(true);
      });
    return () => { cancelled = true; };
  }, [activeAccount?.id]);

  // Native-token USD price (Chainlink, cached 3min) → fiat line on the gas card.
  const [nativeUsdPrice, setNativeUsdPrice] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetchChainlinkPrices()
      .then((prices) => { if (!cancelled) setNativeUsdPrice(resolveChainlinkPrice(nativeSymbol(chainId), prices) ?? 0); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [chainId]);

  // --- Editable approval (the never-unlimited mandate) ---
  // Detection, the metadata / allowance / balance reads, the spending-cap
  // editor's choice derivation, the per-leg batch gating and the confirm-time
  // re-encode all belong to the approval guard. This sheet renders its verdicts
  // and forwards taps; it decides none of them.
  const guard = useApprovalGuard({
    request: incomingRequest ?? null,
    chainId,
    walletAddress: activeAccount?.address,
    readOnly,
  });
  const approval = guard.approval;

  // --- Clear signing (the parse pipeline + message adjudication) ---
  // Descriptor resolution, the risk grade, the SIWE domain binding, the
  // hex-vs-text split, which surface to render and what the confirm button
  // MEANS are all this controller's verdicts (the `clear_signing` core on web,
  // the TypeScript services on native). This sheet renders them.
  const clearRequest = useMemo(
    () => (incomingRequest
      ? {
          method: incomingRequest.method,
          params: incomingRequest.params,
          // F3: the dApp's own identity when we have it, the transport origin otherwise.
          requestOrigin: dappInfo?.url ?? incomingRequest.origin,
        }
      : null),
    [incomingRequest, dappInfo?.url],
  );
  const clear = useClearSigning(clearRequest, chainId);
  const clearSign: ClearSignResult | null = clear.clearSign;
  const resolveCall = clear.resolveCall;

  // --- Branded haptic feedback (no-op on web) ---
  // A danger sheet (opaque eth_sign, a phishing SIWE prompt, or an unbounded
  // approval) buzzes on open — a physical "pay attention" that lands before the
  // eye reaches the warning. Two machines answer, one each; ORing their verdicts
  // is not a third opinion. In particular the SIWE binding is adjudicated ONCE,
  // by the same verdict that paints the red banner, so the buzz and the banner
  // can never disagree.
  useEffect(() => {
    if (readOnly) return;
    if (clear.dangerHaptic || (!!approval?.isUnbounded && !approval.isReducing)) hapticWarning();
  }, [clear.dangerHaptic, approval, readOnly]);
  // Physical confirmation of the outcome — success buzz when the signature lands,
  // error buzz when it's rejected or fails.
  useEffect(() => { if (pendingOpHash) hapticSuccess(); }, [pendingOpHash]);
  useEffect(() => { if (signError) hapticError(); }, [signError]);

  // Client-side simulation: revert pre-check + net balance changes (null = unknown / not run).
  const [sim, setSim] = useState<AssetSimResult | null>(null);

  // EIP-5792 batch (wallet_sendCalls): each leg's DESCRIPTOR resolution, so the
  // user sees a per-call breakdown instead of blind-signing the whole bundle.
  // The approval half of each leg (detection, metadata, the cap editor, the
  // gating) is the guard's — see `guard.batch`.
  //
  // Modelled as INPUT (what needs resolving) + PASS (what we resolved, tagged
  // with the input it answers), never as an items array plus a `resolving`
  // boolean. A boolean needs a reset; this sheet is not unmounted between
  // requests (the cores overwrite `pending` in place), so a second
  // `wallet_sendCalls` arriving mid-flight cancelled the only continuation that
  // could have performed that reset — and the sheet stayed on the loading
  // placeholder with confirm permanently disabled, leaving "close the sheet" as
  // the user's only move. Closing IS the reject path, so the dApp collected a
  // 4001 the user never gave. Both derivations below are total functions of
  // values present on every render, so there is no reset to skip.
  const batchInput = useMemo(() => {
    if (incomingRequest?.method !== 'wallet_sendCalls') return null;
    const calls = incomingRequest.params?.[0]?.calls;
    if (!Array.isArray(calls) || calls.length === 0) return null;
    return { key: batchPassKey(incomingRequest.id, chainId, calls), calls: calls as any[], chainId };
  }, [incomingRequest, chainId]);
  const batchKey = batchInput?.key ?? null;
  const [batchPass, setBatchPass] = useState<BatchPass<BatchItem> | null>(null);
  const batch = batchItemsFor(batchKey, batchPass);
  // Separate from the controller's `resolving` (which tracks the single
  // presented request) but ORed with it below: both hold the loading surface
  // and both gate confirm.
  const resolving = clear.resolving || batchPassPending(batchKey, batchPass);

  // Simulate the inner Safe→target call when a new request comes in: revert
  // pre-check + net balance changes. Descriptor resolution is the controller's,
  // and the gas quote is `useSigningFee`'s — this effect owns only the
  // simulation now, which is why it no longer touches any fee state.
  useEffect(() => {
    if (!incomingRequest) {
      setSim(null);
      return;
    }

    const { method, params } = incomingRequest;
    // Guard the async simulation so a slower previous request can't overwrite
    // the current one's state after it's been replaced.
    let cancelled = false;
    setSim(null);

    if (method === 'eth_sendTransaction' && params?.[0]) {
      // Skipped in read-only replay: a historical signature isn't about to be sent.
      // simFromOverride is a test-harness stand-in only; production uses the signer.
      if (activeAccount?.address && !readOnly && publicKeyLoaded) {
        simulateAssetChanges(
          simFromOverride ?? activeAccount.address,
          [{ to: params[0].to, data: params[0].data, value: params[0].value }],
          chainId,
        )
          .then((r) => { if (!cancelled) setSim(r); })
          .catch(() => { if (!cancelled) setSim(null); });
      }
    }
    return () => { cancelled = true; };
  }, [
    incomingRequest, chainId, activeAccount?.address, publicKeyHex, publicKeyLoaded, readOnly,
    simFromOverride,
  ]);

  // Real tx for accurate gas estimation in the fee card (re-runs on tier change/refresh).
  const txForEstimate = useMemo(() => {
    const p = incomingRequest?.method === 'eth_sendTransaction' ? incomingRequest.params?.[0] : undefined;
    return p ? { to: p.to, value: p.value, data: p.data } : undefined;
  }, [incomingRequest]);
  const batchCallsForEstimate = useMemo(() => {
    if (incomingRequest?.method !== 'wallet_sendCalls') return null;
    const calls = incomingRequest.params?.[0]?.calls;
    if (!Array.isArray(calls) || calls.length === 0) return null;
    return calls.map((c: any) => ({ to: c.to, value: c.value, data: c.data }));
  }, [incomingRequest]);

  // --- The fee (the quote, the asset picker, and the confirm gate) ---
  // One hook, two implementations: a live `fee_policy` session on web, the
  // TypeScript estimate this sheet used to run inline on native. Either way the
  // sheet reads a settled quote and a single "may this arm" boolean; it decides
  // neither.
  const fee = useSigningFee({
    tx: txForEstimate ?? null,
    batchCalls: batchCallsForEstimate,
    chainId,
    account: activeAccount?.address,
    publicKeyHex,
    publicKeyLoaded,
    readOnly,
    // The identity of what is being PRICED — the calls included, not just the
    // id. `incomingRequest` is already content-addressed upstream
    // (`sign-resident.ts` only replaces it when `JSON.stringify(view.request)`
    // changes), so keying on the id and method alone would be strictly weaker
    // than the object identity this replaced: two requests that reuse an id
    // with different params would reuse the first one's quote, and the sheet
    // would sign one operation's fee for another.
    requestKey: incomingRequest
      ? `${incomingRequest.id}:${chainId}:${incomingRequest.method}:${
          JSON.stringify(batchCallsForEstimate ?? txForEstimate ?? null)}`
      : null,
  });
  const feeEstimate = fee.estimate;
  const gasEstimateFailed = fee.failed;

  // Resolve each leg of an EIP-5792 batch (intent per call).
  //
  // Deliberately NOT the same effect as the bundle's simulation + gas estimate
  // below: descriptor resolution has nothing to do with the signer or its
  // passkey, and sharing an effect with them re-ran the WHOLE pass the moment
  // `publicKeyHex`/`publicKeyLoaded` landed. Every leg resolves on its own core
  // session (the machine supersedes anything in flight, so N legs cannot share
  // one), and a session's descriptor / ERC-165 / decimals caches die with it —
  // so that second pass was a full cold start whose ERC-165 race and decimals
  // warm ran again, and it was the second pass's answer that reached the screen.
  // Two runs of one leg could therefore disagree. Keyed on the request and the
  // chain alone, the pass runs once and there is no second answer to disagree
  // with. (`resolveCall` is a stable `useCallback` in both controllers; the
  // executor coalesces the identical lookups sibling legs issue in the same
  // tick, so they also cannot disagree with each other.)
  useEffect(() => {
    if (!batchInput) return;
    const { key, calls, chainId: legChainId } = batchInput;
    let cancelled = false;
    // Each leg through the SAME pipeline the single request uses — one leg must
    // never be graded by different rules than the transaction it is part of.
    Promise.all(calls.map(async (c: any): Promise<BatchItem> => ({
      to: c.to ?? '',
      clearSign: await resolveCall({ to: c.to, data: c.data, value: c.value }, legChainId),
    })))
      .then((items) => { if (!cancelled) setBatchPass({ key, items }); })
      .catch(() => { if (!cancelled) setBatchPass({ key, items: null }); });
    // `cancelled` only stops a superseded pass from overwriting a NEWER answer;
    // it can no longer strand the loading state, because the loading state is
    // derived from `key` and this pass's answer carries the key it belongs to.
    return () => { cancelled = true; };
  }, [batchInput, resolveCall]);

  // The bundle's live-only work: net balance changes. The bundle's gas quote is
  // `useSigningFee`'s, against the same MultiSend of every call that
  // `sendBatchCalls` submits.
  useEffect(() => {
    if (incomingRequest?.method !== 'wallet_sendCalls') return;
    const calls = incomingRequest.params?.[0]?.calls;
    if (!Array.isArray(calls) || calls.length === 0) return;
    let cancelled = false;

    // Net balance changes across all legs (executed sequentially, shared state —
    // e.g. approve + swap nets to −USDC / +WETH), plus the revert + underfunded
    // pre-checks. The engine already accepts the full calls array. Skipped in
    // read-only replay (a historical batch isn't being simulated for submission).
    if (activeAccount?.address && !readOnly && publicKeyLoaded) {
      const simCalls = calls.map((c: any) => ({ to: c.to, data: c.data, value: c.value }));
      simulateAssetChanges(simFromOverride ?? activeAccount.address, simCalls, chainId)
        .then((r) => { if (!cancelled) setSim(r); })
        .catch(() => { if (!cancelled) setSim(null); });
    }
    return () => { cancelled = true; };
  }, [
    incomingRequest, chainId, activeAccount?.address, publicKeyHex, publicKeyLoaded, readOnly,
    simFromOverride,
  ]);

  // Hand the guard the RECIPIENTS the descriptor pipeline resolved per leg —
  // raw data, not a verdict. It decides whether any leg sends a token to the
  // token's own contract (a burn), the same way the single-send path does.
  const reportBatchRecipients = guard.reportBatchRecipients;
  useEffect(() => {
    if (!batch) return;
    reportBatchRecipients(
      batch.map((it) => (it.clearSign?.fields ?? [])
        .filter((f) => f.role === 'recipient' && !!f.address)
        .map((f) => f.address as string)),
    );
  }, [batch, reportBatchRecipients]);

  if (!incomingRequest) return null;

  const { method, params } = incomingRequest;
  const isTx = method === 'eth_sendTransaction';
  const isBatch = method === 'wallet_sendCalls';

  // Derive display info
  const displayOrigin = dappInfo?.name ?? incomingRequest.origin ?? 'dApp';
  const displayDomain = dappInfo?.url
    ? (() => { try { return new URL(dappInfo.url).host; } catch { return dappInfo.url; } })()
    : undefined;

  const addr = activeAccount?.address;

  // THE simulation this sheet is showing, chosen once (it was derived twice,
  // and two copies of "which sim" is one bug away from a screen that previews
  // one transaction and confirms another).
  //
  // A read-only replay uses the simulation PERSISTED at signature time: state
  // has moved on, so re-simulating a past signature would preview a different
  // world than the one the user consented to. The test harness's override wins
  // over both. Ownership note: this branch, and the asymmetric trust below,
  // belong to the simulation service and the replay record — the clear-signing
  // core deliberately carries no simulation state and takes `simConfident` as
  // an input to nothing; it is the SHELL that hands it to the surfaces.
  const simResult = simOverride ?? (readOnly ? replaySim : sim);
  // Engine-verified confidence: the tx was simulated and is NOT expected to
  // revert. A sim's SENT side can't be understated (the real token emits its own
  // transfer log), so this is a trustworthy "here's what actually leaves your
  // wallet" signal that stands independent of any ERC-7730 descriptor. When
  // present, the sheet leads with the outcome and calms the descriptor-absence
  // alarms; RECEIVED amounts still read as 'unverified' (spoofable) per the
  // asymmetric model in tx-simulation.
  const simConfident = !!simResult && simResult.ok === true;

  // Choose which view to render. The order is the two machines' verdicts
  // interleaved — the approval guard's surface outranks everything (detection is
  // instant and needs no descriptor), then `clear.surface`, with the batch list
  // slotted where it has always sat: after the clear-sign surface, before the
  // method-specific blind ones. Nothing here re-decides either verdict.
  const renderContent = () => {
    // Off-chain permit signature (Permit2 / ERC-2612 / DAI). The dApp redeems its
    // OWN struct on-chain, so we can't cap it — capping the signed amount only
    // desyncs the signature and reverts the dApp's tx. Surface the real risk and
    // sign verbatim under deliberate consent, never the cap editor.
    if (guard.surface === 'permit-sign' && approval) {
      return (
        <PermitSignView
          approval={approval}
          meta={guard.meta}
          expired={guard.expired}
          decimalsUnverified={guard.decimalsUnverified}
          clearSign={clearSign}
        />
      );
    }
    // Editable approval takes precedence — detection is instant (no descriptor),
    // and the spending-cap editor is the primary content for these requests.
    if (guard.surface === 'approval-editor' && approval?.editable) {
      return (
        <ApprovalView
          approval={approval}
          meta={guard.meta}
          editor={guard.editor}
          increaseTotal={guard.increaseTotal}
          expired={guard.expired}
          chainId={chainId}
          clearSign={clearSign}
          requestId={incomingRequest.id}
          onPreset={guard.selectPreset}
          onCustomText={guard.setCustomText}
          onGrant={guard.chooseGrant}
          onRevoke={guard.chooseRevoke}
        />
      );
    }
    // While a descriptor resolves, hold the loading state — a blind view must
    // never flash before the clear one.
    if (resolving) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>{t('componentsUi.signing.loading')}</Text>
        </View>
      );
    }
    if (clear.surface === 'clear_sign' && clearSign) {
      return <ClearSignView cs={clearSign} simConfident={simConfident} walletAddress={addr} />;
    }
    // EIP-5792 batch — list each call, with an editable spending cap on every
    // approval leg (so an unlimited approve can be capped instead of only rejected).
    //
    // `BatchCallsView` pairs the two machines' per-leg output BY INDEX, and they
    // reach this sheet at different speeds (the guard's legs are in place before
    // paint; the descriptor rows are async). Rendering only when both describe
    // the same number of legs is what keeps that pairing honest: `batch` is
    // already null for any request the stored pass doesn't answer, so a
    // superseded bundle's decoded amounts can never sit above the current
    // bundle's spenders — this check covers the remaining, by-construction
    // impossible case rather than trusting it.
    if (isBatch && batchRowsAligned(batch, guard.batch?.legs.length ?? null) && guard.batch) {
      return (
        <BatchCallsView
          items={batch}
          batch={guard.batch}
          requestId={incomingRequest.id}
          onLegPreset={guard.selectLegPreset}
          onLegCustomText={guard.setLegCustomText}
          onLegGrant={guard.chooseLegGrant}
          onLegRevoke={guard.chooseLegRevoke}
        />
      );
    }
    // eth_sign signs an OPAQUE 32-byte hash — the classic blind-sign trap. It gets
    // its own hard-warning surface, never the calm personal_sign message view.
    // Which param holds that hash is the controller's ruling, not this sheet's.
    if (clear.surface === 'eth_sign' && clear.message) {
      return <EthSignDangerView dataHex={clear.message.payload} />;
    }
    if (clear.surface === 'message_sign' && clear.message) {
      return (
        <MessageSignView
          view={clear.message}
          requestOrigin={dappInfo?.url ?? incomingRequest.origin}
        />
      );
    }
    if (clear.surface === 'blind_typed_data' && clear.blindTyped) {
      return <BlindTypedDataView view={clear.blindTyped} />;
    }
    if (clear.surface === 'blind_transaction' && params?.[0]) {
      return <BlindTransactionView tx={params[0]} chainId={chainId} simConfident={simConfident} nativeUsdPrice={nativeUsdPrice} />;
    }
    return (
      <View style={styles.fallback}>
        <Shield size={28} color={color.fg.muted} strokeWidth={2} />
        <Text style={styles.fallbackText}>{t('componentsUi.signing.signatureRequest')}</Text>
      </View>
    );
  };

  // Button config — keep label short (max ~15 chars). The SEMANTICS come from
  // the two machines (`guard.editor.choice`, `clear.confirm`); only the words
  // and the "does the localized intent still fit?" measurement live here — the
  // 14+ translation catalogues never enter wasm.
  const buttonLabel = (): string => {
    if (isSigning) return t('componentsUi.signing.signing');
    if (approval?.editable) {
      return guard.editor?.choice?.type === 'revoke'
        ? t('componentsUi.signingApprove.verbRevoke')
        : t('componentsUi.signingApprove.verbApprove');
    }
    // A batch is the approval guard's surface; its confirm reads neutrally.
    if (isBatch) return t('componentsUi.signing.confirmLabel');
    if (clear.confirm.type === 'sign') return t('componentsUi.signing.signLabel');
    if (clear.confirm.type === 'confirm_intent') {
      // Localize the descriptor intent so the button reads "确认兑换", never
      // "确认Swap"/"确认Send". Long or unrecognized intents → neutral "确认".
      const li = localizeIntent(clear.confirm.intent);
      if (!li || li.length > 12) return t('componentsUi.signing.confirmLabel');
      return t('componentsUi.signing.confirmIntentLabel', { intent: li });
    }
    // Catch-all (blind contract call, eth_sign): a neutral "确认", never "授权" —
    // that verb belongs only to an actual token approval.
    return t('componentsUi.signing.confirmLabel');
  };

  // The footer is a single uniform slide-to-confirm for EVERY request (the deliberate
  // slide is the friction; closing the sheet rejects) — danger no longer branches the
  // footer. Phishing/eth_sign still buzz a warning haptic on open (see the effect
  // above) and flag in-body via MessageSignView / EthSignDangerView.

  const confirm = () => {
    hapticLight(); // tactile acknowledgement the moment the user commits to signing
    // For an edited approval the guard already re-encoded the request to the
    // chosen finite amount (single tx AND every batch leg); a rewrite failure
    // yields no override, so the untouched params still hit the independent
    // submit guard and fail closed (never unbounded).
    const paramsOverride: any[] | undefined = guard.rewrittenParams ?? undefined;
    onApprove({
      maxFeePerGas: feeEstimate?.maxFeePerGas,
      // Raw bundler cost (tier markup removed) drives the funding pre-check.
      bundlerCostWei: feeEstimate ? rawBundlerGasCost(feeEstimate) : undefined,
      // The fee asset the user picked in the gas card (null = native) — routed
      // through to the in-band send path so gas is settled in that token. It
      // comes from the same source as `feeEstimate`, so the asset and the
      // amount cannot be one quote apart.
      gasFeeToken: fee.feeToken,
      // In-band: sign EXACTLY the displayed fee (amount + recipient) — displayed = signed.
      quotedFee: feeEstimate?.inBand && feeEstimate.feeRecipient
        ? {
            amount: feeEstimate.feeAsset?.kind === 'erc20' ? feeEstimate.feeAsset.amount : feeEstimate.totalWei,
            recipient: feeEstimate.feeRecipient,
          }
        : undefined,
      paramsOverride,
      // The "what moved" preview the user just saw — persisted with the record so
      // the Connections-panel replay can show it without re-simulating stale state.
      assetSim: sim,
      // The resolved clear-signing intent (e.g. "Swap", "Approve") — persisted so
      // the Connections list/detail label the op meaningfully, not "Contract
      // interaction". Undefined for plain signatures / blind txs (label falls back).
      intent: clearSign?.intent,
    });
  };

  // Two gates, ANDed exactly as `SignView.confirm_gate_open` documents:
  // the signing machine's own (a reviewable request, the granted account
  // reconciled, nothing in flight) and the approval guard's (no editable
  // approval left un-chosen, no batch leg left unsettled).
  const confirmDisabled =
    resolving
    // The fee's own gate. On native this is the same three-flag expression that
    // sat here; on web it is `fee_policy`'s `confirm_fee_ready`, the single
    // boolean the machine publishes for exactly this AND.
    || fee.blocksConfirm
    || !guard.confirmAllowed
    || !confirmGateOpen;

  // The decoded hero's asset flows — paired with `simResult` above by the loud
  // BalanceChangePreview (unexpected changes / reverts) and the quiet factual
  // "模拟结果" row now shown inside 技术细节 instead of a green promise up top.
  const heroFlows: { token?: string; dir: 'out' | 'in' }[] =
    (approval || isBatch)
      ? []
      : clearSign
        ? (clearSign.fields
            .filter(f => f.role === 'send-amount' || f.role === 'receive-amount')
            .map(f => ({ token: f.tokenAddress?.toLowerCase(), dir: (f.role === 'send-amount' ? 'out' : 'in') as 'out' | 'in' }))
            ?? [])
        : (isTx && params?.[0]?.value && params[0].value !== '0x0' && (!params[0].data || params[0].data === '0x'))
          ? [{ token: undefined, dir: 'out' as const }]
          : [];

  return (
      <SigningChainContext.Provider value={chainId}>
      <View style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* dApp banner — always shown */}
          <DAppBanner
            name={displayOrigin}
            domain={displayDomain}
            icon={dappInfo?.icon}
            chainId={chainId}
          />

          {/* Read-only replay banner — "you're looking back at a past signature". */}
          {readOnly && !pendingOpHash && (
            <View style={styles.historyNote}>
              <Pen size={15} color={color.fg.muted} strokeWidth={2} />
              <Text style={styles.historyNoteText}>{t('componentsUi.signing.historicalNote')}</Text>
            </View>
          )}

          {renderContent()}

          {/* Simulation summary — revert pre-check + net balance changes, one
              render path shared with Send's confirm step. Live mode shows the fresh
              sim; a read-only replay shows the one persisted at sign time (state has
              moved on, so it can't be recomputed) — same component either way.
              Kept ABOVE the raw-data escape hatch: the "what actually changes" is the
              outcome that matters (especially when the contract couldn't be decoded),
              not something to bury under an Advanced toggle. */}
          {/* The loud states only — an expected-to-fail revert, an underfunded
              send, or UNEXPECTED balance changes the hero didn't declare. The
              quiet "everything matched / nothing else moved" case no longer shows
              a green promise here; it's a factual "模拟结果" row in 技术细节 below. */}
          {(isTx || isBatch) && (
            <BalanceChangePreview result={simResult} chainId={chainId} heroFlows={heroFlows} hideReassurance />
          )}

          {/* Advanced — full untruncated payload, resolved addresses, and the
              factual simulation result (net balance changes). */}
          <AdvancedPanel
            method={method}
            params={params}
            clearSign={clearSign}
            simResult={(isTx || isBatch) ? simResult : null}
            heroFlows={heroFlows}
          />

          {/* Gas fee card — for an on-chain tx OR a batch (both cost gas), live
              only. The prop bag is the fee controller's, so which twin of the
              card is mounted and which half of its props it reads are one
              decision, made once, in one place. */}
          {(isTx || isBatch) && activeAccount?.address && !readOnly && publicKeyLoaded && (
            <GasFeeCard
              {...fee.cardProps}
              nativeSymbol={nativeSymbol(chainId)}
              nativeUsdPrice={nativeUsdPrice}
            />
          )}

          {/* Gas estimation failed — block the blind submit that would otherwise
              hang for 2 min on the bundler. Retry lives in the gas card above. */}
          {gasEstimateFailed && !isSigning && !readOnly && (
            <WarningBanner
              severity="caution"
              text={t('componentsUi.signing.gasEstimateFailed')}
            />
          )}

          {/* Signing account — the wallet you're signing FROM. A quiet row right
              above the confirm action (below the fee): collapsed to identicon + name,
              tap to reveal the 0x. Shown for every signature type, not just txs. */}
          {!readOnly && (
            <SigningAccountRow
              accountName={activeAccount?.name}
              accountAddress={addr}
            />
          )}

          {/* Submitted — show the hash + "waiting" instead of a silent spinner.
              Also shown on replay of an op still awaiting its on-chain receipt. */}
          {pendingOpHash && (isSigning || readOnly) && (
            <View style={styles.pendingCard}>
              <ActivityIndicator size="small" color={color.info.base} />
              <Text style={styles.pendingText}>
                {t('componentsUi.signing.submitted')} · {pendingOpHash.slice(0, 10)}…{pendingOpHash.slice(-6)}
              </Text>
            </View>
          )}

          {/* Error */}
          {signError && (
            <View style={styles.errorCard}>
              <AlertTriangle size={16} color={color.error.base} strokeWidth={2} />
              <Text style={styles.errorText}>{signError}</Text>
            </View>
          )}
        </ScrollView>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          {readOnly ? (
            <VelaButton
              title={t('componentsUi.signing.close')}
              onPress={onDismiss}
              variant="secondary"
              style={styles.buttonFlex}
            />
          ) : signError ? (
            <VelaButton
              title={t('componentsUi.signing.dismiss')}
              onPress={onDismiss}
              variant="secondary"
              style={styles.buttonFlex}
            />
          ) : (
            // Unified: ONE slide-to-confirm for every request, benign or dangerous.
            // There is no Reject button — dismissing the sheet (swipe down / tap
            // outside) already rejects the request (AppModal onClose → rejectRequest),
            // so a deliberate slide is the only way to APPROVE and closing is the easy,
            // safe default. requiresHold/recommendReject no longer branch the footer;
            // the slide itself is the friction, uniformly.
            <SlideToConfirmButton
              title={buttonLabel()}
              hint={t('componentsUi.signing.slideToConfirm', { defaultValue: 'Slide to confirm' })}
              onConfirm={confirm}
              loading={isSigning || resolving}
              disabled={confirmDisabled}
              style={styles.buttonFlex}
            />
          )}
        </View>
      </View>
      </SigningChainContext.Provider>
  );
}
