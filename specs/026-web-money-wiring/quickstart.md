# Quickstart — 026 Web Money Wiring

## Gates (unchanged order)
`pnpm check` → `pnpm lint` → `pnpm test:unit -- --run` → `pnpm build` →
`pnpm test:e2e` (all hermetic; stub-chain harness + relay stubs) + repo-root
`gen-core-types --check`. Corpus changes (if any) follow the 5-step process.

## Hermetic scenarios (CI)
1. **Send lands (SC-201)** — parallel space entered; stubbed chain answers
   balances/allowance/receipts, stubbed relay answers quote/estimate/submit/
   receipt; form → quote → slide → fixture sign → submit → pending record →
   confirmed receipt → feed row → balance refresh. Persistence steps ×3
   engines.
2. **Reopen while pending (SC-204)** — submit, close the tab before the
   receipt, reopen: the row is pending, then settles.
3. **Signing scenarios (SC-203)** — the requester posts each fixture
   scenario; the sheet renders the core's view; the unlimited approval
   defaults to exact; approve submits through the same spine; reject
   answers the requester.
4. **Batch (US3)** — paste three rows; preview at the resolved rate (or the
   refusal when none); one operation; a receipt with three transfers.
5. **Relay faults (SC-205)** — treasury empty / uncovered network / quote
   failure / submit rejection / receipt silence via the fault console; each
   presentation asserted; no raw relay text.

## Live sweep (before results.md closes)
- Enter the parallel space with the fixture keyset; the golden Safe
  `0x88cCA0…6894` (Gnosis, ~0.77 xDAI) sends a dust transfer to a fixture
  address through the real relay; compare amount and fee with the explorer;
  the receipt appears in the feed and the balance drops. Record hashes in
  results.md.
- Optional: a real passkey sign-in on a device and one real send — the
  founder's pass, the one thing a script cannot do.

## Galleries
All fixture states pixel-unchanged (fixtures untouched; builders are
siblings; SlideToConfirm's gallery card keeps rendering the drawn states).
