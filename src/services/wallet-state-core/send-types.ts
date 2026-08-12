/**
 * Platform-neutral types and pure wire codecs for the `send` core (spec 017,
 * group G12 — `rust/crates/vela-core/src/app/send.rs`).
 *
 * Standalone for the reason `sign-types.ts` states: the native stub
 * (`send-session.ts`) needs these declarations, and importing them from a
 * `.web` module would drag the web-only service graph into the native bundle.
 *
 * The codecs live here rather than in the executor because BOTH sides need
 * them: the executor puts an estimate on the wire, and the controller takes one
 * off it (and puts one back when `GasFeeCard` re-quotes). Every one of them is a
 * fund-safety codec — a truncated `total_wei` prices the confirm screen wrong,
 * and a decimal amount handed to `buildExecuteCallData` (which reads HEX) would
 * move a completely different number.
 */

import { chainName } from '@/models/network';
import { tokenChainId, tokenId, tokenLogoURLs, type APIToken } from '@/models/types';
import type { TransactionFeeEstimate } from '@/services/safe-transaction';

import type { FeeAssetView } from './generated/FeeAssetView';
import type { FeeCall } from './generated/FeeCall';
import type { FeeEstimateView } from './generated/FeeEstimateView';
import type { SendAlertKind } from './generated/SendAlertKind';
import type { SendFeeOutcome } from './generated/SendFeeOutcome';
import type { SendOperation } from './generated/SendOperation';
import type { SendReceiptOutcome } from './generated/SendReceiptOutcome';
import type { SendToken } from './generated/SendToken';
import type { SendView } from './generated/SendView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type SendEffect = { id: number; operation: SendOperation };

/**
 * The re-entry points and shell-owned surfaces the core deliberately never
 * holds. Everything here is either a mid-flight dispatch (a fact the core must
 * hear BEFORE the operation it belongs to resolves) or a surface that needs the
 * React tree — `t` for the alert wording, the router for `Close`.
 */
export interface SendShellPorts {
  /** `fetchTokens`'s `onProgress` — a progressive chain chunk, display only. */
  tokensPartial(tokens: SendToken[]): void;
  /**
   * The FULL `APIToken` rows behind a chunk/answer. The core carries the slice
   * it needs; the shell keeps the originals so `TokenSelector` still renders the
   * name/logo the API gave, with a stable object identity per row.
   */
  tokensFetched(tokens: APIToken[]): void;
  /**
   * The passkey credential that may sign for this Safe address, or `null`.
   *
   * `SubmitUserOp` carries the account ADDRESS and its public key — never the
   * credential id, which is a shell fact (`activeAccount.id`). Resolving it here
   * lets the port fail closed when the active account has moved on: the wallet
   * must never sign with a credential that does not belong to the account the
   * core built the batch for.
   */
  credentialId(address: string): string | null;
  /**
   * The stored public key `LoadAccountCredential` just read.
   *
   * The core keeps its own copy (it is the estimate's `public_key_hex`), but the
   * confirm screen's embedded fee card re-quotes on its own and needs it to
   * build a real initCode for an undeployed Safe — which is exactly what
   * `prefetchedAccount.current?.publicKeyHex` was for. A mirror, never a second
   * writer: nothing decides on it here.
   */
  credentialLoaded(publicKeyHex: string | null): void;
  /** The passkey sheet opened inside `SubmitUserOp` → `Event::SigningStarted`. */
  signingStarted(): void;
  /** Receipt convergence from the tracker seam → `Event::ReceiptUpdate`. */
  receiptUpdate(userOpHash: string, outcome: SendReceiptOutcome): void;
  /** `showAlert` — the core owns the site, the shell owns the words. */
  alert(kind: SendAlertKind): void;
  /** `router.back()` out of the Send flow. */
  close(): void;
  /**
   * Price an operation, and answer with the settled quote.
   *
   * `EstimateFee` used to be one call to `estimateTransactionFee` here, while
   * the confirm screen's fee card ran its own quote and its own per-asset math
   * on top. Two writers of one number — the shape four attempts at this
   * integration foundered on. The operation is now asked of the SAME live
   * `fee_policy` session the card renders, so the quote the core pre-checks
   * against, the quote on screen and the quote that is signed are one object
   * with one owner.
   *
   * A port rather than a service import because that session belongs to the
   * React tree: it is created by the screen, disposed with it, and must not be
   * reachable from a module.
   */
  feeQuote(request: SendFeeQuoteRequest): Promise<SendFeeOutcome>;
}

/** What `EstimateFee` asks for, in the shell's own vocabulary. */
export interface SendFeeQuoteRequest {
  chainId: number;
  account: string;
  /** The real calls, WITHOUT the fee leg — `fee_policy` appends its own. */
  calls: FeeCall[];
  /** `null` = native. A quote parameter: it changes the operation being priced. */
  feeToken: string | null;
  /**
   * The passkey public key `LoadAccountCredential` read for THIS account, so the
   * initCode the simulation builds is the one the submitted op will carry.
   * Carried on the request rather than mirrored on the session: one fact, one
   * copy, and it cannot go stale across an account switch.
   */
  publicKeyHex: string | undefined;
}

export type SendSessionOptions = SessionOptions<SendView> & {
  ports: SendShellPorts;
};

// ---------------------------------------------------------------------------
// Token codec
// ---------------------------------------------------------------------------

/** The slice of `APIToken` the core needs, `chain_id` pre-resolved. */
export function toSendToken(token: APIToken): SendToken {
  return {
    network: token.network,
    chain_id: tokenChainId(token),
    symbol: token.symbol,
    balance: token.balance,
    decimals: token.decimals,
    token_address: token.tokenAddress,
    price_usd: token.priceUsd,
    logo_urls: tokenLogoURLs(token),
    spam: token.spam,
  };
}

/** `tokenId()` for a wire token — the key the shell's originals are held under. */
export function sendTokenId(wire: SendToken): string {
  return `${wire.network}_${wire.token_address ?? 'native'}_${wire.symbol}`;
}

/**
 * A wire token with no original behind it: the locked-request placeholders
 * (`synthNativeToken` / `synthErc20Token`), which the core mints itself. Named
 * after the symbol exactly as those helpers did.
 */
export function synthApiToken(wire: SendToken): APIToken {
  return {
    network: wire.network,
    chainName: chainName(wire.chain_id),
    symbol: wire.symbol,
    balance: wire.balance,
    decimals: wire.decimals,
    logo: wire.logo_urls[0] ?? null,
    name: wire.symbol,
    tokenAddress: wire.token_address,
    priceUsd: wire.price_usd,
    spam: wire.spam,
  };
}

/** Index a token list by `tokenId()` so a view's wire rows resolve to originals. */
export function indexTokens(tokens: APIToken[]): Map<string, APIToken> {
  const index = new Map<string, APIToken>();
  for (const token of tokens) index.set(tokenId(token), token);
  return index;
}

// ---------------------------------------------------------------------------
// Call codec
// ---------------------------------------------------------------------------

/**
 * The core states amounts in base units as DECIMAL strings; every consumer in
 * `safe-transaction.ts` (`buildExecuteCallData`, `buildMultiSendExecuteCallData`,
 * `estimateTransactionFee`) reads `value` as HEX. Getting this wrong does not
 * fail loudly — it signs a different number.
 */
export function toShellCall(call: FeeCall): { to: string; value: string; data: string } {
  return { to: call.to, value: decimalToHex(call.value), data: call.data };
}

/** A decimal base-unit string as `0x…`. An unparsable value is `0x0`, never NaN. */
export function decimalToHex(value: string): string {
  try {
    return `0x${BigInt(value.trim() || '0').toString(16)}`;
  } catch {
    return '0x0';
  }
}

/** A decimal wire amount back to a bigint; a malformed one reads as `0n`. */
export function fromWireAmount(value: string): bigint {
  try {
    return BigInt(value.trim() || '0');
  } catch {
    return 0n;
  }
}

// ---------------------------------------------------------------------------
// Fee codec
// ---------------------------------------------------------------------------

function toFeeAssetWire(fee: TransactionFeeEstimate): FeeAssetView {
  const asset = fee.feeAsset;
  if (!asset || asset.kind === 'native') return { type: 'native' };
  return {
    type: 'erc20',
    token: asset.token,
    decimals: asset.decimals,
    amount: asset.amount.toString(),
    symbol: asset.symbol ?? null,
  };
}

/** A live estimate onto the wire. Every bigint crosses as a decimal string. */
export function toFeeWire(fee: TransactionFeeEstimate): FeeEstimateView {
  return {
    chain_id: fee.chainId,
    total_wei: fee.totalWei.toString(),
    max_fee_per_gas: fee.maxFeePerGas.toString(),
    network_fee_per_gas: fee.networkFeePerGas.toString(),
    relayer_fee_per_gas: fee.relayerFeePerGas.toString(),
    bundler_gas_price: fee.bundlerGasPrice.toString(),
    total_gas: fee.totalGas.toString(),
    deployed: fee.deployed,
    tier: fee.tier,
    quoted: fee.quoted,
    fee_asset: toFeeAssetWire(fee),
    fee_recipient: fee.feeRecipient ?? null,
  };
}

/**
 * The wire estimate back into the shape `GasFeeCard` renders.
 *
 * `inBand` has no core field — the machine derives the signed quote from
 * `fee_recipient` alone (`send.rs:2847`), which is the only decision it makes on
 * it. The display flag is therefore reconstructed from the same fact, and
 * `rememberFee` below hands back the ORIGINAL object whenever the shell still
 * has it, so a Tempo estimate keeps its own `inBand` verbatim.
 */
export function fromFeeWire(view: FeeEstimateView): TransactionFeeEstimate {
  const asset = view.fee_asset;
  return {
    chainId: view.chain_id,
    totalWei: fromWireAmount(view.total_wei),
    maxFeePerGas: fromWireAmount(view.max_fee_per_gas),
    networkFeePerGas: fromWireAmount(view.network_fee_per_gas),
    relayerFeePerGas: fromWireAmount(view.relayer_fee_per_gas),
    bundlerGasPrice: fromWireAmount(view.bundler_gas_price),
    totalGas: fromWireAmount(view.total_gas),
    deployed: view.deployed,
    tier: view.tier,
    quoted: view.quoted,
    inBand: view.fee_recipient != null,
    feeAsset:
      asset.type === 'native'
        ? { kind: 'native' }
        : {
            kind: 'erc20',
            token: asset.token,
            decimals: asset.decimals,
            amount: fromWireAmount(asset.amount),
            ...(asset.symbol != null ? { symbol: asset.symbol } : {}),
          },
    ...(view.fee_recipient != null ? { feeRecipient: view.fee_recipient } : {}),
  };
}

/** Structural key of a wire estimate — the registry's identity. */
export function feeKey(view: FeeEstimateView): string {
  return JSON.stringify(view);
}

/**
 * The estimates this process actually produced, by structural key.
 *
 * The shell is the ONLY producer of a `FeeEstimateView` (the executor's
 * `EstimateFee`, and `GasFeeCard`'s re-quote), so a view coming back out of the
 * core is nearly always one of ours. Handing the ORIGINAL object back keeps two
 * things a round trip would otherwise cost: the fields the wire does not carry
 * (`inBand` on a Tempo quote whose relay named no recipient), and reference
 * stability for `GasFeeCard`, which keys its own work off the estimate it is
 * given.
 *
 * Bounded and content-addressed: an entry is only ever re-read by a view that is
 * byte-identical to the one it was stored for, so a stale entry is impossible —
 * only forgettable.
 */
const MAX_REMEMBERED_FEES = 16;
const rememberedFees = new Map<string, TransactionFeeEstimate>();

export function rememberFee(fee: TransactionFeeEstimate): FeeEstimateView {
  const view = toFeeWire(fee);
  const key = feeKey(view);
  rememberedFees.delete(key);
  if (rememberedFees.size >= MAX_REMEMBERED_FEES) {
    const oldest = rememberedFees.keys().next().value;
    if (oldest !== undefined) rememberedFees.delete(oldest);
  }
  rememberedFees.set(key, fee);
  return view;
}

/** The original estimate behind a wire view, or a faithful reconstruction. */
export function resolveFee(view: FeeEstimateView | null): TransactionFeeEstimate | null {
  if (!view) return null;
  return rememberedFees.get(feeKey(view)) ?? fromFeeWire(view);
}

/** Test seam: forget every remembered estimate. */
export function _resetFeeRegistry(): void {
  rememberedFees.clear();
}
