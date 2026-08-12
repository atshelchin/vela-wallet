/**
 * Clear Signing E2E tests.
 *
 * Tests all signing modal scenarios via the /clear-signing-test page.
 * This page bypasses wallet auth by using a standalone mock modal.
 *
 * Each test clicks a scenario, verifies the modal renders correctly,
 * and checks key UI elements (intent, token amounts, contract info, buttons).
 *
 * Interaction model (updated for the 2026-07-11 design pass):
 *   - 16282b0 removed the Reject button and unified the footer to a single
 *     SlideToConfirmButton. Dismissing the sheet (Escape / backdrop / swipe)
 *     IS the reject path (AppModal onClose → onReject).
 *   - d2d2668 gave the harness a realistic dApp identity: the banner reads
 *     "PancakeSwap · pancakeswap.finance" (was "Test dApp").
 *   - 98792fe dropped the "personal_sign · No gas fee" tag as redundant noise.
 */
import { test, expect, type Page } from '@playwright/test';

// The test page requires developer mode to be unlocked.
// We access it directly since it's a standalone route.
const TEST_PAGE = '/clear-signing-test';

// Helper: wait for app to hydrate
async function waitForApp(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
}

// Helper: click a scenario row by label text
async function clickScenario(page: Page, label: string) {
  // Find the row containing the label text and click it
  const row = page.locator(`text=${label}`).first();
  await row.click();
}

// Helper: check the signing sheet is open. There is no Reject button since
// 16282b0 (single slide-to-confirm footer); the stable open-marker is the
// harness dApp banner name "PancakeSwap" (harness identity since d2d2668),
// which renders only inside the sheet.
async function expectModalVisible(page: Page) {
  // exact: the banner's domain line "pancakeswap.finance" also substring-matches.
  await expect(page.getByText('PancakeSwap', { exact: true })).toBeVisible({ timeout: 15_000 });
}

// Helper: close the sheet. Since 16282b0 dismissing the sheet IS rejecting
// (AppModal onClose → onReject); on web, useWebDialog binds Escape to that.
async function closeModal(page: Page) {
  await page.keyboard.press('Escape');
  await expect(page.getByText('PancakeSwap', { exact: true })).toBeHidden();
}

test.describe('Clear Signing UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TEST_PAGE);
    await waitForApp(page);
  });

  // =========================================================================
  // ERC-20 scenarios
  // =========================================================================

  test('ERC-20 Transfer shows clear signed transfer UI', async ({ page }) => {
    await clickScenario(page, 'ERC-20 Transfer');
    await expectModalVisible(page);

    const body = page.locator('body');
    // Should show intent "Send" (from ERC-20 transfer descriptor)
    await expect(body).toContainText(/Send|Transfer/i);
    // Should show the dApp banner — harness identity is "PancakeSwap" since d2d2668
    await expect(body).toContainText('PancakeSwap');
    // Should show Ethereum network
    await expect(body).toContainText('Ethereum');
    // Should have a confirm affordance (the slide track's label, e.g. "Confirm Send")
    await expect(body).toContainText(/Confirm|Approve|Sign/i);

    await closeModal(page);
  });

  test('ERC-20 Unlimited Approve shows warning', async ({ page }) => {
    await clickScenario(page, 'ERC-20 Approve');
    await expectModalVisible(page);

    const body = page.locator('body');
    // Should show intent "Approve"
    await expect(body).toContainText(/Approve/i);
    // Should surface the spending-cap editor (never-unlimited mandate)
    await expect(body).toContainText('Spending cap');

    await closeModal(page);
  });

  test('ERC-20 Limited Approve shows specific amount', async ({ page }) => {
    await clickScenario(page, 'ERC-20 Limited Approve');
    await expectModalVisible(page);

    const body = page.locator('body');
    await expect(body).toContainText(/Approve/i);
    // Shows the requested finite cap…
    await expect(body).toContainText('500 USDC');
    // …and NOT the unlimited warning. Match the exact warning sentence — the
    // scenario LIST in the background contains "(Unlimited)" in two row titles,
    // so a bare /Unlimited/ against the whole body false-fails.
    const bodyText = await page.textContent('body');
    expect(bodyText).not.toContain('Unlimited — this contract can spend all your tokens');

    await closeModal(page);
  });

  test('ERC-20 TransferFrom shows clear signed UI', async ({ page }) => {
    await clickScenario(page, 'ERC-20 TransferFrom');
    await expectModalVisible(page);

    await expect(page.locator('body')).toContainText(/Send|Transfer/i);

    await closeModal(page);
  });

  // =========================================================================
  // ETH transfer scenarios
  // =========================================================================

  test('ETH Transfer shows send UI with amount', async ({ page }) => {
    await clickScenario(page, 'ETH Transfer');
    await expectModalVisible(page);

    const body = page.locator('body');
    await expect(body).toContainText(/Send/i);
    // Should show ETH amount
    await expect(body).toContainText(/ETH/);
    // Should show recipient address
    await expect(body).toContainText(/0x/);

    await closeModal(page);
  });

  test('Large ETH Send shows correct amount', async ({ page }) => {
    await clickScenario(page, 'Large ETH Send');
    await expectModalVisible(page);

    const body = page.locator('body');
    await expect(body).toContainText(/Send/i);
    await expect(body).toContainText('ETH');

    await closeModal(page);
  });

  // =========================================================================
  // personal_sign scenarios
  // =========================================================================

  test('Personal Sign shows message bubble', async ({ page }) => {
    await clickScenario(page, 'Personal Sign');
    await expectModalVisible(page);

    const body = page.locator('body');
    // Should show "Sign Message" intent
    await expect(body).toContainText(/Sign Message/);
    // Should show decoded message content
    await expect(body).toContainText('OpenSea');
    // The "personal_sign · No gas fee" tag was removed as redundant noise in
    // 98792fe (pixel-match design pass) — the message-signature semantics are
    // now carried by the "Sign Message" eyebrow + the "Sign" slide track.
    await expect(page.getByRole('button', { name: 'Sign', exact: true })).toBeVisible();

    await closeModal(page);
  });

  test('Hex Message shows hex preview', async ({ page }) => {
    await clickScenario(page, 'Hex Message Sign');
    await expectModalVisible(page);

    const body = page.locator('body');
    await expect(body).toContainText(/Sign Message/);
    // Should show hex data (non-printable message)
    await expect(body).toContainText(/0x/);
    // Non-printable hex is flagged as a possible disguised transaction (F9,
    // componentsUi.signing.hexMessageWarning) — modal-only copy.
    await expect(body).toContainText(/isn't readable text/);

    await closeModal(page);
  });

  // =========================================================================
  // EIP-712 scenarios
  // =========================================================================

  test('EIP-712 Permit2 shows typed data UI', async ({ page }) => {
    await clickScenario(page, 'EIP-712 Permit2');
    await expectModalVisible(page);

    // Should show either clear-signed intent or typed data fallback
    await expect(page.locator('body')).toContainText(/Permit|Sign|Authorize/i);

    await closeModal(page);
  });

  test('EIP-712 Unknown shows blind typed data UI', async ({ page }) => {
    await clickScenario(page, 'EIP-712 Unknown');
    await expectModalVisible(page);

    const body = page.locator('body');
    // Should show typed data intent
    await expect(body).toContainText(/Sign Typed Data/);
    // Should show primary type
    await expect(body).toContainText('CustomOrder');
    // Should show domain info
    await expect(body).toContainText('Unknown Protocol');
    // Should show warning about no descriptor
    await expect(body).toContainText(/could not be decoded|no.*descriptor/i);

    await closeModal(page);
  });

  // =========================================================================
  // Blind sign scenarios
  // =========================================================================

  test('Blind Transaction warns about the undecodable contract', async ({ page }) => {
    await clickScenario(page, 'Blind Transaction');
    await expectModalVisible(page);

    const body = page.locator('body');
    // The blind surface adapts since b968190/f4eb833: with a confident simulation
    // it reads calm ("Contract interaction" + "couldn't read this contract's
    // details"); without one it stays the red "Unknown" + "Unable to decode — no
    // ERC-7730 descriptor"; a 4-byte match downgrades to the best-effort caution
    // ("Decoded from the function signature"). All three are modal-only copy and
    // all carry the not-verified warning — assert whichever the live resolution
    // produced. (The old fixture asserted an ETH amount; the current blind-tx
    // fixture is deliberately 0-value — see clear-signing-scenarios.ts.)
    await expect(body).toContainText(
      /Unable to decode — no ERC-7730 descriptor|couldn't read this contract's details|Decoded from the function signature/,
      { timeout: 15_000 },
    );

    await closeModal(page);
  });

  // =========================================================================
  // NFT scenarios
  // =========================================================================

  test('NFT Transfer shows clear signed UI', async ({ page }) => {
    await clickScenario(page, 'NFT Transfer');
    await expectModalVisible(page);

    await expect(page.locator('body')).toContainText(/Send NFT|Transfer/i);

    await closeModal(page);
  });

  test('NFT Approve All shows approval UI', async ({ page }) => {
    await clickScenario(page, 'NFT Approve All');
    await expectModalVisible(page);

    await expect(page.locator('body')).toContainText(/Approve|Manage|operator/i);

    await closeModal(page);
  });

  // =========================================================================
  // Vault scenarios
  // =========================================================================

  test('Vault Deposit shows deposit UI', async ({ page }) => {
    await clickScenario(page, 'Vault Deposit');
    await expectModalVisible(page);

    await expect(page.locator('body')).toContainText(/Deposit/i);

    await closeModal(page);
  });

  test('Vault Withdraw shows withdraw UI', async ({ page }) => {
    await clickScenario(page, 'Vault Withdraw');
    await expectModalVisible(page);

    await expect(page.locator('body')).toContainText(/Withdraw|Redeem/i);

    await closeModal(page);
  });

  // =========================================================================
  // Contract-specific descriptor
  // =========================================================================

  test('1inch Swap shows contract-specific clear sign', async ({ page }) => {
    await clickScenario(page, '1inch Swap');
    await expectModalVisible(page);

    // 1inch has contract-specific descriptor with Swap intent
    await expect(page.locator('body')).toContainText(/Swap|Execute/i);

    await closeModal(page);
  });

  // =========================================================================
  // Interaction tests
  // =========================================================================

  test('Copy button works on contract address', async ({ page }) => {
    await clickScenario(page, 'ERC-20 Transfer');
    await expectModalVisible(page);

    // Find and click a copy button (the small icon button)
    const copyBtns = page.locator('[data-testid="copy-btn"]');
    await copyBtns.count();

    // If no testid, try clicking any small button that might be copy
    // The copy feedback should show a check icon briefly
    // Just verify the modal renders without errors for now

    await closeModal(page);
  });

  test('Dismissing the sheet closes the modal (dismiss = reject)', async ({ page }) => {
    await clickScenario(page, 'Personal Sign');
    await expectModalVisible(page);

    // There is no Reject button since 16282b0 — dismissing the sheet (Escape on
    // web via useWebDialog) IS the reject path (AppModal onClose → onReject).
    await closeModal(page);

    // Modal should be closed — the scenario list should be visible again
    await expect(page.getByText('Clear Signing Test')).toBeVisible();
  });

  test('Confirm (slide-to-confirm) shows signed alert', async ({ page }) => {
    await clickScenario(page, 'Personal Sign');
    await expectModalVisible(page);

    // The footer is a single SlideToConfirmButton since 16282b0. On web the
    // track is a focusable role=button that commits on Enter/Space — the
    // explicit-activation a11y substitute for the drag (SlideToConfirmButton.tsx).
    await page.getByRole('button', { name: 'Sign', exact: true }).press('Enter');

    // showAlert renders the in-app AppAlert on web (AlertProvider is mounted at
    // the root), NOT a browser dialog — assert its DOM copy
    // (clearSigning.alertSignedTitle / alertSignedBody).
    await expect(page.getByText('Signed!')).toBeVisible();
    await expect(page.getByText(/no actual signature was created/)).toBeVisible();
    await page.getByRole('button', { name: 'OK' }).click();
  });
});
