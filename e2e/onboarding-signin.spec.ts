/**
 * Sign-in and on-device recovery E2E — the "way back into a funded wallet" paths.
 *
 * These branches had no automated coverage until spec 011 moved them into the
 * portable core: local hit, index hit, and the two-signature recovery that keeps
 * the key-index server a cache rather than a single point of failure. A wrong
 * turn here does not render badly — it locks someone out of their money.
 *
 * Approach mirrors onboarding-verify: a CDP virtual WebAuthn authenticator
 * performs real create()/get() ceremonies (so recovery really does rebuild the
 * public key from two genuine signatures), with the index server replaced by a
 * stateful in-memory mock whose behaviour each test controls.
 *
 * Run: npx playwright test onboarding-signin
 */
import { test, expect, type Page, type CDPSession } from '@playwright/test';

const ACK_FRAGMENTS = [
  'This is a self-custodial wallet',
  'If you lose your device',
  'If your iCloud or Google account is compromised',
  'I agree to the',
];

const AUTHENTICATOR_OPTIONS = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
} as const;

type IndexMode = 'record' | 'missing' | 'unreachable';

/**
 * Stub the network. `mode` decides what the key index does, and can be flipped
 * mid-test — that is how "the record vanished" and "the server is down" are
 * simulated without touching app code.
 */
async function stubNetwork(page: Page, state: { mode: IndexMode }): Promise<void> {
  let record: Record<string, unknown> | null = null;

  await page.route('**/*', (route) => {
    const url = route.request().url();
    const local =
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url) ||
      url.startsWith('data:') || url.startsWith('blob:');
    if (local) return route.continue();

    if (state.mode === 'unreachable' && !url.includes('/api/health')) return route.abort();

    if (url.includes('/api/health')) {
      if (state.mode === 'unreachable') return route.abort();
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ service: 'webauthn-p256-publickey-index', status: 'ok' }),
      });
    }
    if (url.includes('/api/create')) {
      record = { ...(route.request().postDataJSON() as Record<string, unknown>), createdAt: Date.now() };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(record) });
    }
    if (url.includes('/api/query')) {
      const found = state.mode === 'record' && record !== null;
      return found
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(record) })
        : route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not found"}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: null }),
    });
  });
}

async function virtualAuthenticator(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR_OPTIONS });
  return client;
}

/** Run the create flow so a real passkey and a real index record exist. */
async function createWallet(page: Page, name: string): Promise<void> {
  await page.goto('/onboarding?mode=create');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).toContainText('Create Wallet', { timeout: 40_000 });
  await page.getByPlaceholder('Enter a name for your account').fill(name);
  for (const frag of ACK_FRAGMENTS) {
    // Hit the checkbox, not the row centre — see onboarding-verify.spec.ts.
    await page.getByText(frag, { exact: false }).first().click({ position: { x: 6, y: 6 } });
  }
  await page.getByText('Create Wallet', { exact: true }).last().click();
  await expect(page.locator('body')).toContainText('Your wallet is ready!', { timeout: 30_000 });
}

async function readAccounts(page: Page): Promise<{ id: string; address: string; name: string }[]> {
  const raw = await page.evaluate(() => localStorage.getItem('vela.accounts'));
  return raw ? JSON.parse(raw) : [];
}

test.describe('Onboarding — signing back in', () => {

  test('a locally known passkey opens the wallet with no index call', async ({ page }) => {
    await virtualAuthenticator(page);
    const state: { mode: IndexMode } = { mode: 'record' };
    await stubNetwork(page, state);
    await createWallet(page, 'E2E Local Hit');
    const [created] = await readAccounts(page);

    // The index is now switched off entirely: a local hit must not need it.
    state.mode = 'unreachable';
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    await page.getByText('I already have a wallet', { exact: true }).click();

    await expect(page.locator('body')).toContainText('E2E Local Hit', { timeout: 30_000 });
    const after = await readAccounts(page);
    expect(after).toHaveLength(1);
    expect(after[0].address).toBe(created.address);
  });

  test('a passkey known only to the index restores the wallet from it', async ({ page }) => {
    await virtualAuthenticator(page);
    const state: { mode: IndexMode } = { mode: 'record' };
    await stubNetwork(page, state);
    await createWallet(page, 'E2E Index Hit');
    const [created] = await readAccounts(page);

    // Same browser, same passkey, but this device has forgotten the wallet.
    await page.evaluate(() => localStorage.removeItem('vela.accounts'));
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    await page.getByText('I already have a wallet', { exact: true }).click();

    await expect(page.locator('body')).toContainText('E2E Index Hit', { timeout: 30_000 });
    const after = await readAccounts(page);
    expect(after).toHaveLength(1);
    // Derived from the indexed public key — it must be the same wallet.
    expect(after[0].address).toBe(created.address);
  });

  test('an unknown-to-the-index passkey rebuilds the wallet from two signatures', async ({ page }) => {
    await virtualAuthenticator(page);
    const state: { mode: IndexMode } = { mode: 'record' };
    await stubNetwork(page, state);
    await createWallet(page, 'E2E Recovery');
    const [created] = await readAccounts(page);

    // The index has lost the record and this device has forgotten the wallet.
    // Everything that remains is the passkey itself.
    await page.evaluate(() => localStorage.removeItem('vela.accounts'));
    state.mode = 'missing';
    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    await page.getByText('I already have a wallet', { exact: true }).click();

    await expect(page.locator('body')).toContainText('Recover Your Wallet', { timeout: 30_000 });
    await page.getByText('Recover Now', { exact: true }).click();

    await expect(page.locator('body')).toContainText('E2E Recovery', { timeout: 30_000 });
    const after = await readAccounts(page);
    expect(after).toHaveLength(1);
    // THE INVARIANT: two signatures pin down exactly one public key, so the
    // address recovered on-device is the original wallet — not a new one.
    expect(after[0].address).toBe(created.address);
  });

  test('declining recovery leaves nothing behind', async ({ page }) => {
    await virtualAuthenticator(page);
    const state: { mode: IndexMode } = { mode: 'record' };
    await stubNetwork(page, state);
    await createWallet(page, 'E2E Decline');
    await page.evaluate(() => localStorage.removeItem('vela.accounts'));
    state.mode = 'missing';

    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');
    await page.getByText('I already have a wallet', { exact: true }).click();
    await expect(page.locator('body')).toContainText('Recover Your Wallet', { timeout: 30_000 });
    await page.getByText('Not Now', { exact: true }).click();

    await expect(page.locator('body')).toContainText('I already have a wallet');
    expect(await readAccounts(page)).toHaveLength(0);
  });

  test('an unreachable key index surfaces the endpoint settings by itself', async ({ page }) => {
    await virtualAuthenticator(page);
    await stubNetwork(page, { mode: 'unreachable' });

    await page.goto('/onboarding');
    await page.waitForLoadState('networkidle');

    // Three probes, two seconds apart, before the app concludes anything.
    await expect(page.locator('body')).toContainText('Settings', { timeout: 30_000 });
  });
});
