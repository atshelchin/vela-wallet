/**
 * The Activity tab's network-chip filter, as a pure function.
 *
 * WHY IT LIVES HERE AND NOT IN THE CORE'S HANDS ON WEB: `activity_feed.rs` owns
 * the same rule (`Event::ChainFilterChanged` + the filtered projection in
 * `view`), but the network sheet counts every chain's events from the
 * *unfiltered* list, and the core's view only ever exposes one projection at a
 * time. So the web shell keeps the unfiltered rows and applies this — which is
 * a duplicated rule, and therefore pinned: `core-projection-parity.test.ts`
 * drives the REAL core with `chain_filter_changed` and asserts row-for-row that
 * this function reproduces it. If either side changes, that gate goes red.
 *
 * Items are newest-first, so one day's rows are contiguous: a header is kept
 * only when a matching item follows it, which elides the days that filtered
 * empty exactly as the core does.
 */

import type { FeedRow } from './home-controller-types';

export function filterFeedRowsByChain(rows: FeedRow[], chainId: number | null): FeedRow[] {
  if (chainId == null) return rows;
  const out: FeedRow[] = [];
  let pending: FeedRow | null = null;
  for (const row of rows) {
    if (row.kind === 'header') { pending = row; continue; }
    if (row.item.chainId !== chainId) continue;
    if (pending) { out.push(pending); pending = null; }
    out.push(row);
  }
  return out;
}
