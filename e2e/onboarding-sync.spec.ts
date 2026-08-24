/**
 * Onboarding sync-failure E2E — the fund-safety invariant (US 1.3).
 *
 * Guards the recent fix "don't persist wallet locally until public key is synced"
 * (commit bfa6465): if the key upload to the index server fails, the wallet must
 * NOT be written to local storage — otherwise it would be usable on this device
 * but unrecoverable on any other, and boot auto-enters on any saved account so
 * the gap would stay silent.
 *
 * Approach: a CDP virtual WebAuthn authenticator makes passkey registration
 * produce a real, parseable attestation without a device, and all external hosts
 * are blocked so the index-server upload fails deterministically after its 3
 * retries.
 *
 * Run: npx playwright test onboarding-sync
 */
import { test, expect, type Page } from '@playwright/test';

/** Block every external host; the app bundle + routes are served from localhost. */
/**
 * Let the founding key be minted and confirmed, then kill the PUBLISH.
 *
 * "Block every external host" used to be enough, because the single-key flow's
 * only network call was the upload. The interleaved multi-key flow calls
 * `/api/challenge` once per key BEFORE the publish exists, so blocking
 * everything now fails at membership confirmation — which lands on the key
 * list with an unconfirmed row, not on the sync-failed screen this test is
 * about. Challenge and health are therefore served; register and task are not.
 */
async function blockPublish(page: Page) {
  await page.route('**/*', (route) => {
    const url = route.request().url();
    const h = new URL(url).hostname;
    if (h === 'localhost' || h === '127.0.0.1') return route.continue();

    if (url.includes('/api/health')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ service: 'webauthn-p256-publickey-registry', status: 'ok' }),
      });
    }
    if (url.includes('/api/challenge')) {
      const body = route.request().postDataJSON() as {
        members?: { publicKey: string; attestation?: string }[];
      };
      const value = (seed: string) => ({
        challenge: `0x${seed.padEnd(64, '0').slice(0, 64)}`,
        challengeBase64url: Buffer.from(seed.padEnd(32, '0').slice(0, 32)).toString('base64url'),
      });
      const payload = body.members
        ? {
            contentHash: `0x${'c0'.repeat(32)}`,
            groupChallenge: value('a1'),
            members: body.members.map((m, i) => ({ ...value(`b${i}`), publicKey: m.publicKey })),
          }
        : value('b0');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    }
    // Everything the publish needs is dead — that is the scenario.
    return route.abort();
  });
}

// Two gates now, not four (spec 019): self-custody, and legal assent. The
// recovery line is still on the screen but is an assurance, not a checkbox —
// so it deliberately does NOT appear here. Clicking it would be a no-op and
// the Create button would stay disabled, which is exactly the failure this
// list exists to make impossible.
const ACK_FRAGMENTS = [
  'My private keys are held by my own device',
  'I agree to the',
];

test.describe('Onboarding — wallet is NOT persisted until the key syncs (US 1.3)', () => {
  test('sync failure keeps the account out of local storage and offers retry', async ({ page }) => {
    // 1. Virtual WebAuthn authenticator → passkey registration returns a real,
    //    parseable attestation with no physical device.
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    await client.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
        // Backed up, so the sole founding key clears the second-key gate and
        // this test stays about the publish rather than about that gate.
        defaultBackupEligibility: true,
        defaultBackupState: true,
      },
    });

    // 2. Serve the challenge, kill the publish → the group never lands.
    await blockPublish(page);

    // 3. Land straight on the create form.
    await page.goto('/onboarding?mode=create');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Create Wallet', { timeout: 40_000 });

    // 4. Name + acknowledge both checkboxes (the Create button is disabled
    //    until name is set and every box is checked).
    await page.getByPlaceholder('Enter a name for your account').fill('E2E Sync Test');
    // Click the checkbox itself, not the row's centre. The last row's text wraps
    // around inline "Privacy Policy" / "Terms of Service" links, and a
    // centre-of-box click can land on one of them — opening a tab instead of
    // ticking the box, which left the Create button permanently disabled. Where
    // the box actually is depends on font metrics and wrap width, so this was
    // environment-dependent rather than reliably red.
    for (const frag of ACK_FRAGMENTS) {
      await page.getByText(frag, { exact: false }).first().click({ position: { x: 6, y: 6 } });
    }

    // 5. Create → passkey registers (virtual authenticator) → upload retries 3×
    //    (1s + 2s backoff) and fails. The header and the button share the label
    //    "Create Wallet", so target the button (last in DOM order).
    await page.getByText('Create Wallet', { exact: true }).last().click();

    // 5b. The founding-key list, then finish the set — the publish happens on
    //     the far side of this step.
    await expect(page.locator('body')).toContainText('Added', { timeout: 30_000 });
    await page.getByText('Continue', { exact: true }).last().click();

    // 6. The sync-failed state must appear with retry + bug-report affordances.
    await expect(page.locator('body')).toContainText('Sync failed', { timeout: 30_000 });
    await expect(page.locator('body')).toContainText('Retry Upload');
    await expect(page.locator('body')).toContainText('Report this error');
    await page.screenshot({ path: 'e2e/screenshots/onboarding-sync-failed.png', fullPage: true });

    // 7. THE INVARIANT: the account is NOT in local storage (an unsynced wallet
    //    is usable here but unrecoverable elsewhere — so it must not be saved).
    const accounts = await page.evaluate(() => localStorage.getItem('vela.accounts'));
    expect(accounts === null || accounts === '[]').toBeTruthy();

    // A pending upload SHOULD exist — it's what the Retry button drives.
    const pending = await page.evaluate(() => localStorage.getItem('vela.pendingUploads'));
    expect(pending).toBeTruthy();
    expect(pending).not.toBe('[]');
  });
});
