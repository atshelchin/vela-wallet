/**
 * What the transaction-detail sheet calls the counterparty — WEB.
 *
 * The precedence is the CORE's, not a second opinion. `activity_feed.rs`
 * stamps every row's `alias` as `alias_map[counterparty] ?? stored to_name`
 * (`activity_feed.rs:568-573`) and `HomeScreen` renders that answer verbatim
 * in the list. The detail sheet is the same counterparty on the same
 * transaction, so it must read the same field first.
 *
 * It used to read `toName ?? resolvedAlias` — the reverse — and the two
 * surfaces could name one transaction two different things: the list row
 * showing the name the core resolved for that address, the sheet showing the
 * name captured at send time. That happens whenever the address is ALSO the
 * counterparty of a row with no stored name (a receive from the same person),
 * because that row is what makes the core ask, and the answer then applies to
 * every row for that address.
 *
 * `stored` stays as the fallback rather than being dropped: the core's answer
 * is only present for rows in the committed view, and a detail sheet opened
 * for a row the current chain filter excludes must still name its
 * counterparty rather than fall back to a bare address.
 *
 * Pinned against the real core by
 * `src/__tests__/screens/home-detail-alias-parity.test.ts`.
 */
export function detailCounterpartyAlias(
  stored: string | null | undefined,
  resolved: string | null | undefined,
): string | undefined {
  return resolved ?? stored ?? undefined;
}
