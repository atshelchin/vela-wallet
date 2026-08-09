/**
 * Send high-risk confirmation E2E (US 3.7) — the "mock the chain" journey test.
 *
 * A send to a never-before-seen CONTRACT address must, at the confirm step,
 * surface the unknown-contract recipient marker and gate submission behind a
 * deliberate slide-to-confirm (a stray tap can't fire a payment).
 *
 * Product drift this spec tracks (all deliberate, post-dating the 2026-07-01 spec):
 *   - 12c87d8 (From→To confirm redesign): the textual "First time" / "Contract"
 *     tags are GONE. Recipient risk is now encoded by <RecipientTypeBadge> —
 *     for an unsaved contract recipient: HelpCircle ("unknown") + FileText
 *     ("contract") icons beside the To row. The "first time" tag was dropped on
 *     purpose (this device can't see sends made from the user's other devices —
 *     see ConfirmStep.tsx comment). The slide track itself stays quiet
 *     (SlideToConfirmButton.tsx: "Never a red track"); the deliberate slide is
 *     the uniform gate for every send.
 *   - bb5e6be/a6ec834/2626474 (in-band gas settlement): the pre-confirm gate
 *     now HARD-REQUIRES (a) a stored account with publicKeyHex ("account
 *     context and estimate are mandatory") and (b) a successful
 *     vela_getInBandGasQuote from the bundler — so the seed includes a
 *     publicKeyHex and the mock answers the in-band quote.
 *
 * NOTE on the seeded address: WalletProvider self-heals a stored account whose
 * address doesn't match computeAddress(publicKeyHex) (70138dc), so once the seed
 * carries a publicKeyHex the ACTIVE address is the derived Safe address, not the
 * seeded one. The mocks are therefore matched on SELECTORS, never on the address:
 *   1. Multicall3 aggregate3 (0x82ad56cb) eth_call → a single non-zero balance
 *      entry, so the token picker has a spendable coin on every chain (fixture
 *      layout verified against the app's real decAggregate3 decoder).
 *   2. EntryPoint getNonce (0x35567e1a) eth_call → uint256 0 (the mandatory
 *      estimate reads the nonce; an aborted read would alert and block confirm).
 *   3. eth_getCode → non-empty bytecode. Serves double duty: the recipient probe
 *      (resolveRecipientRisk → contract) AND isDeployed(wallet) → deployed, so
 *      the estimate never needs to build initCode.
 *   4. vela_getInBandGasQuote → one native fee asset (mandatory since bb5e6be;
 *      a missing quote throws "Could not load the in-band gas quote" and blocks
 *      the confirm step).
 *   Everything else (bundler estimate, gas price, treasury probe, price feeds)
 *   is aborted and degrades along the production fallbacks: static gas, 5 gwei,
 *   treasury null ("can't reach — let it proceed").
 *
 * Run: npx playwright test e2e/send-high-risk.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

const ME = '0x742d35cc6634c0532925a3b844bc454e4438f44e'; // seed only — self-healed to computeAddress(PUBKEY)
const CONTRACT_RECIPIENT = '0x1111111111111111111111111111111111111111';
/** Uncompressed P256 pubkey (04||x||y) — shape-valid filler. The wallet is mocked
 *  as DEPLOYED so no initCode is ever built from it; it only has to be present
 *  (the pre-confirm gate rejects an account without publicKeyHex — 2626474). */
const PUBKEY = '04' + '11'.repeat(64);

/** aggregate3 result = [(success:true, returnData: uint256(1e18))]. */
const BALANCE_HEX =
  '0x' + [32n, 1n, 32n, 1n, 64n, 32n, 10n ** 18n]
    .map((n) => n.toString(16).padStart(64, '0'))
    .join('');

/** vela_getInBandGasQuote → the native fee-asset row (bundler-service.ts shape). */
const INBAND_NATIVE_QUOTE = {
  recipient: '0x2222222222222222222222222222222222222222',
  asset: 'native',
  feeToken: null,
  balance: '0xde0b6b3a7640000', // 1e18 — plenty for the reimbursement pre-checks
  decimals: 18,
  symbol: 'BNB',
  usdBalance: '600',
  usdPrice: '600',
};

async function seedAndMock(page: Page) {
  await page.addInitScript(({ me, pk }) => {
    localStorage.setItem(
      'vela.accounts',
      JSON.stringify([{ id: 'e2e', name: 'E2E', address: me, publicKeyHex: pk, createdAt: '2026-01-01T00:00:00.000Z' }]),
    );
    localStorage.setItem('vela.activeAccountIndex', '0');
  }, { me: ME, pk: PUBKEY });

  await page.route('**/*', (route) => {
    const req = route.request();
    const host = new URL(req.url()).hostname;
    if (host === 'localhost' || host === '127.0.0.1') return route.continue(); // app bundle + routes
    const body = (req.postData() || '').toLowerCase();
    const id = Number(body.match(/"id"\s*:\s*(\d+)/)?.[1] ?? 1);
    // In-band gas quote (bundler JSON-RPC) → one native fee asset. Mandatory for
    // the pre-confirm estimate since bb5e6be — without it the flow alerts
    // "Could not load the in-band gas quote" and never reaches confirm.
    if (body.includes('"vela_getinbandgasquote"')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id, result: [INBAND_NATIVE_QUOTE] }) });
    }
    // EntryPoint getNonce(address,uint192) — selector 0x35567e1a → nonce 0.
    // Must be checked BEFORE the aggregate3 branch (both are eth_call).
    if (body.includes('"eth_call"') && body.includes('0x35567e1a')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id, result: '0x' + '0'.repeat(64) }) });
    }
    // Multicall3 aggregate3 — selector 0x82ad56cb → one successful 1e18 entry
    // (native balance per chain; address-agnostic — see the header note).
    if (body.includes('"eth_call"') && body.includes('0x82ad56cb')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id, result: BALANCE_HEX }) });
    }
    // Bytecode probes → contract. Covers the recipient risk probe AND
    // isDeployed(wallet) for the mandatory pre-confirm estimate.
    if (body.includes('"eth_getcode"')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id, result: '0x60006000fd' }) });
    }
    return route.abort(); // bundler estimate, price feeds, treasury, everything else offline
  });
}

test.describe('Send — high-risk recipient confirmation (US 3.7)', () => {
  test('first-time contract recipient → unknown-contract marker + deliberate slide-to-confirm', async ({ page }) => {
    await seedAndMock(page);
    await page.goto('/send');
    await page.waitForLoadState('networkidle');

    // Step 1 — pick a native coin (under the "Gas" category, hidden from the
    // default "Stablecoins" tab). BNB is unique to one chain, so it's unambiguous.
    await expect(page.locator('body')).toContainText('Select Token', { timeout: 40_000 });
    await page.getByText('Gas', { exact: true }).first().click();
    // Click the token ROW (its "BNB Chain" network subtitle is unique to the row;
    // the network-filter chips above only show bare symbols like "BNB").
    await page.getByText('BNB Chain', { exact: true }).click();

    // Step 2 — enter a fresh contract recipient + an amount within balance.
    await page.getByPlaceholder('0x... address').first().fill(CONTRACT_RECIPIENT);
    await page.locator('input[placeholder="0"]').first().fill('0.01');
    await page.getByText('Continue', { exact: true }).first().click();

    // Step 3 — confirm. The CTA is the deliberate slide-to-confirm ("Confirm &
    // Send"); Send's confirm is ALWAYS a SlideToConfirmButton (ConfirmStep.tsx)
    // — a stray tap can't fire a payment — so its track present at this step
    // evidences the slide gate. (Title reads "Checking gas..." while the fee
    // settles; the retrying assertion waits that out.)
    await expect(page.getByRole('button', { name: 'Confirm & Send' }))
      .toBeVisible({ timeout: 30_000 });

    // The To row shows the truncated recipient (shortAddr: 8 + … + 6).
    await expect(page.locator('body')).toContainText('0x111111...111111');

    // Recipient risk — textual "First time"/"Contract" tags were replaced by the
    // icons-only <RecipientTypeBadge> in 12c87d8: an unsaved contract renders
    // HelpCircle ("unknown") + FileText ("contract"). Assert both glyphs by their
    // lucide path data (pinned lucide-react-native 1.11.0), visible-filtered —
    // react-navigation can keep a hidden duplicate of the details step mounted.
    const helpCircle = page.locator('svg path[d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"]');
    const fileText = page.locator('svg path[d="M14 2v5a1 1 0 0 0 1 1h5"]');
    await expect(helpCircle.locator('visible=true').first()).toBeVisible({ timeout: 15_000 });
    await expect(fileText.locator('visible=true').first()).toBeVisible();

    await page.screenshot({ path: 'e2e/screenshots/send-high-risk-confirm.png', fullPage: true });
  });
});
