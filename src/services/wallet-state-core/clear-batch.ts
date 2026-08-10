/**
 * The signing sheet's EIP-5792 batch derivations — pure, platform-neutral, and
 * deliberately free of React so they can be tested without rendering.
 *
 * Two jobs, both of which used to be ad-hoc state inside `SigningSheet.tsx`:
 *
 * 1. **"is the per-leg descriptor pass still running?"** — expressed as a
 *    comparison between the pass's INPUT and the pass's stored OUTPUT rather
 *    than as a boolean flag. A boolean needs a reset, a reset needs a place to
 *    live, and the place it lived (a cancellable `.finally`) could be skipped —
 *    which latched the sheet into a permanent loading state that the user could
 *    only escape by closing the sheet, i.e. by rejecting a request they never
 *    saw. `pending` here is a function of two values that are both present on
 *    every render, so there is nothing to leave un-reset.
 *
 * 2. **"is this token symbol showable?"** — both approval-guard controllers
 *    hand back a placeholder symbol while the metadata read is in flight AND
 *    when it failed outright, so the placeholder is a spinner, not a symbol,
 *    and a compact row must not print it as one.
 */

import type { ApprovalTokenMeta } from '@/hooks/approval-guard-controller-types';

// ---------------------------------------------------------------------------
// Batch descriptor pass
// ---------------------------------------------------------------------------

/**
 * One completed per-leg descriptor pass, tagged with the key of the input it
 * answers. `items === null` is a pass that FAILED (the sheet falls back exactly
 * as it always has); it is still a completed pass, which is why it carries a key
 * instead of being conflated with "not run yet".
 */
export interface BatchPass<Item> {
  readonly key: string;
  readonly items: Item[] | null;
}

const part = (value: unknown): string =>
  value == null ? '' : typeof value === 'string' ? value : String(value);

/**
 * Identity of one descriptor pass, by VALUE — the request it belongs to, the
 * chain it is graded on, and the legs themselves.
 *
 * By value and not by object identity on purpose: a re-created input object
 * (a dropped `useMemo` cache, a re-mount) must not read as a new pass and throw
 * the resolved rows away. Nothing here is parsed; the legs are only stringified,
 * so untrusted dApp params cannot make this throw.
 */
export function batchPassKey(
  requestId: string,
  chainId: number,
  calls: readonly unknown[],
): string {
  // Separators that no hex field, address or request id can contain, so two
  // different bundles cannot serialise to the same key by concatenation.
  const FIELD = '\u0001';
  const LEG = '\u0002';
  const leg = (c: unknown): string => {
    const call = (c ?? {}) as { to?: unknown; data?: unknown; value?: unknown };
    return [part(call.to), part(call.data), part(call.value)].join(FIELD);
  };
  return [requestId, String(chainId), String(calls.length), ...calls.map(leg)].join(LEG);
}

/**
 * The rows to render: the stored pass's items, but ONLY when that pass answers
 * the key currently being shown. A pass belonging to a superseded request is
 * not "slightly stale data" on a signing surface — it is one request's decoded
 * amounts paired with another request's approval verdicts — so it reads as
 * absent.
 */
export function batchItemsFor<Item>(
  key: string | null,
  pass: BatchPass<Item> | null,
): Item[] | null {
  return key !== null && pass !== null && pass.key === key ? pass.items : null;
}

/**
 * The loading verdict, DERIVED: there are legs to resolve and what we hold is
 * not their answer. It cannot latch — no key means `false` unconditionally, and
 * a matching pass (successful or failed) means `false` unconditionally — so
 * neither a cancelled continuation nor an early-returned effect can leave the
 * sheet stuck.
 */
export function batchPassPending<Item>(
  key: string | null,
  pass: BatchPass<Item> | null,
): boolean {
  return key !== null && (pass === null || pass.key !== key);
}

/**
 * Do the descriptor rows and the guard's per-leg verdicts describe the same
 * bundle? Both are projections of the same `params[0].calls`, so this is true by
 * construction; the sheet checks it anyway because the two arrive from two
 * different machines and are paired BY INDEX, and a mis-pair on this surface
 * shows one leg's amount above another leg's spender.
 */
export function batchRowsAligned<Item>(
  items: Item[] | null,
  legCount: number | null,
): items is Item[] {
  return items !== null && legCount !== null && items.length === legCount;
}

// ---------------------------------------------------------------------------
// Token metadata
// ---------------------------------------------------------------------------

/**
 * The placeholder both guard controllers use for "no symbol (yet)" — the web
 * core's `GuardTokenMetaView` default and native's `IDLE_META` agree on it.
 */
export const TOKEN_SYMBOL_PLACEHOLDER = '…';

/**
 * The symbol as a printable suffix, or `''` when there is nothing to print.
 *
 * A compact row reads `Spending cap · 500 USDC` when the symbol is known and
 * `Spending cap · 500` when it is not — never `Spending cap · 500 …`, which
 * says the amount is elided when it is exact. `.trim()` cannot do this: the
 * placeholder is an ellipsis, not whitespace.
 */
export function displayTokenSymbol(meta: ApprovalTokenMeta | null | undefined): string {
  const symbol = meta?.symbol ?? '';
  return symbol === TOKEN_SYMBOL_PLACEHOLDER ? '' : symbol;
}
