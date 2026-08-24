/**
 * Onboarding verify-before-persist E2E — the dead-passkey invariant (issue #1).
 *
 * A provider can report a successful create() and still fail to durably store
 * the credential (issue #1: "created successfully" yet absent from Google
 * Password Manager, with nowhere to sign). The creation flow must therefore
 * prove the passkey can SIGN before anything is persisted or the address is
 * ever shown: register → test signature → index upload → save → success.
 *
 * Approach: a CDP virtual WebAuthn authenticator (Chrome's virtual passkeys)
 * drives real create()/get() ceremonies. For the dead-passkey case the test
 * gates navigator.credentials.get() behind a resumable latch, removes the
 * just-created credential via CDP while the app is paused at the latch, then
 * releases it — deterministically simulating "credential vanished between
 * creation and first use" with no race.
 *
 * Run: npx playwright test onboarding-verify
 */
import { test, expect, type Page } from '@playwright/test';

// Two gates now, not four (spec 019): self-custody, and legal assent. The
// recovery line is still on the screen but is an assurance, not a checkbox —
// so it deliberately does NOT appear here. Clicking it would be a no-op and
// the Create button would stay disabled, which is exactly the failure this
// list exists to make impossible.
const ACK_FRAGMENTS = [
  'My private keys are held by my own device',
  'I agree to the',
];

const AUTHENTICATOR_OPTIONS = {
  protocol: 'ctap2',
  transport: 'internal',
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
  automaticPresenceSimulation: true,
  // Chrome's virtual authenticator leaves the authenticatorData backup flags
  // clear by default, which the core correctly reads as "this key exists only
  // on this device" — and a sole device-bound key cannot finish the founding
  // set (needs_second_key). Declaring the credential backed up is what makes
  // this a SINGLE-key happy path rather than a test of the second-key gate,
  // which `a_sole_device_bound_key_cannot_finish_alone` already covers in the
  // core suite.
  defaultBackupEligibility: true,
  defaultBackupState: true,
} as const;

/**
 * Stub the network: local assets pass through, the public-key index gets a
 * stateful in-memory mock (create stores, query echoes — uploadPublicKey
 * verifies the stored key matches), everything else external gets a benign
 * JSON-RPC null so nothing hangs or spends real funds.
 */
async function stubNetworkWithIndexMock(page: Page): Promise<void> {
  let record: Record<string, unknown> | null = null;

  await page.route('**/*', (route) => {
    const url = route.request().url();
    const local =
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url) ||
      url.startsWith('data:') || url.startsWith('blob:');
    if (local) return route.continue();

    if (url.includes('/api/health')) {
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
    // POST /api/challenge — MEMBER mode (one founding key confirming at
    // creation) and GROUP mode (closing the group at publish) share the
    // endpoint and are told apart by whether the body carries `members`. The
    // interleaved create->confirm flow calls the member form once per key
    // BEFORE any publish exists, so a stub without this route leaves the
    // executor reading `.challenge` off undefined and the whole create path
    // dies at "Verifying identity...".
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
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    }
    // POST /api/register accepts, and the task it names is immediately done —
    // the flow only needs a terminal state, not a realistic settlement delay.
    if (url.includes('/api/register')) {
      const req = route.request().postDataJSON() as Record<string, unknown>;
      record = { ...req, createdAt: Date.now() };
      return route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'task-e2e', status: 'pending' }),
      });
    }
    if (url.includes('/api/task/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'task-e2e', status: 'done', onChainId: 1, txHash: null }),
      });
    }
    if (url.includes('/api/query')) {
      return record
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

async function fillCreateForm(page: Page, name: string): Promise<void> {
  await page.goto('/onboarding?mode=create');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).toContainText('Create Wallet', { timeout: 40_000 });
  await page.getByPlaceholder('Enter a name for your account').fill(name);
  // Click the checkbox itself, not the row's centre. The last row's text wraps
  // around inline "Privacy Policy" / "Terms of Service" links, and a
  // centre-of-box click can land on one of them — opening a tab instead of
  // ticking the box, which left the Create button permanently disabled. Where
  // the box actually is depends on font metrics and wrap width, so this was
  // environment-dependent rather than reliably red.
  for (const frag of ACK_FRAGMENTS) {
    await page.getByText(frag, { exact: false }).first().click({ position: { x: 6, y: 6 } });
  }
}

test.describe('Onboarding — passkey must prove it can sign before anything persists (issue #1)', () => {

  test('happy path: create → auto-verify → address only on success → Enter Wallet', async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    await client.send('WebAuthn.addVirtualAuthenticator', { options: AUTHENTICATOR_OPTIONS });
    await stubNetworkWithIndexMock(page);

    await fillCreateForm(page, 'E2E Verify Test');
    await page.getByText('Create Wallet', { exact: true }).last().click();

    // The founding-key list: the first key is registered and has confirmed its
    // group membership, and the person decides whether one is enough. This
    // step exists because the address is a function of the WHOLE set, so it is
    // the last moment a key can be added.
    await expect(page.locator('body')).toContainText('Added', { timeout: 30_000 });
    await page.getByText('Continue', { exact: true }).last().click();

    // Register + test signature + publish all run inside one flow; the success
    // screen appears only after signing is proven AND the group has landed.
    await expect(page.locator('body')).toContainText('Wallet created', { timeout: 30_000 });
    await expect(page.locator('body')).toContainText(/0x[0-9a-fA-F]/);
    await expect(page.locator('body')).toContainText('Enter Wallet');

    // Persisted exactly one account — signing was proven, key confirmed synced.
    const accounts = await page.evaluate(() => localStorage.getItem('vela.accounts'));
    expect(accounts).toBeTruthy();
    expect(JSON.parse(accounts!)).toHaveLength(1);

    await page.getByText('Enter Wallet', { exact: true }).click();
    await expect(page.locator('body')).toContainText('E2E Verify Test', { timeout: 20_000 });
  });

  test('dead passkey: created but unable to sign → NOTHING persisted, resume offered, no second passkey', async ({ page }) => {
    const client = await page.context().newCDPSession(page);
    await client.send('WebAuthn.enable');
    const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
      options: AUTHENTICATOR_OPTIONS,
    });
    await stubNetworkWithIndexMock(page);

    // Latch navigator.credentials.get() so the credential can be removed
    // deterministically between create() resolving and the verify signature.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __gateNextGet?: boolean;
        __releaseGet?: (() => void) | null;
      };
      const orig = navigator.credentials.get.bind(navigator.credentials);
      navigator.credentials.get = async (options?: CredentialRequestOptions) => {
        if (w.__gateNextGet) {
          w.__gateNextGet = false;
          await new Promise<void>((resolve) => { w.__releaseGet = resolve; });
        }
        return orig(options);
      };
    });

    const created: string[] = [];
    client.on('WebAuthn.credentialAdded', (event) => {
      created.push(event.credential.credentialId);
    });

    await fillCreateForm(page, 'E2E Dead Passkey');
    await page.evaluate(() => { (window as unknown as { __gateNextGet?: boolean }).__gateNextGet = true; });
    await page.getByText('Create Wallet', { exact: true }).last().click();

    // The passkey registers, then the app parks at the latched get(). Remove
    // the credential — "provider lost it" — and let the verify signature run.
    await expect.poll(() => created.length, { timeout: 20_000 }).toBe(1);
    await expect.poll(() =>
      page.evaluate(() => Boolean((window as unknown as { __releaseGet?: unknown }).__releaseGet)),
      { timeout: 20_000 },
    ).toBe(true);
    await client.send('WebAuthn.removeCredential', { authenticatorId, credentialId: created[0] });
    await page.evaluate(() => {
      const w = window as unknown as { __releaseGet?: (() => void) | null };
      w.__releaseGet?.();
      w.__releaseGet = null;
    });

    // Verification fails → the key list with that row unconfirmed, NOT a
    // success screen. The retry is per row ("Confirm"), because with a
    // founding SET the failure belongs to one key rather than to the flow —
    // the others keep their proofs and are not re-signed.
    await expect(page.locator('body')).toContainText('Verification was cancelled', { timeout: 30_000 });
    await expect(page.locator('body')).toContainText('Confirm');
    await expect(page.locator('body')).not.toContainText('Wallet created');

    // THE INVARIANT: a passkey that cannot sign leaves NO trace — no local
    // account (would sit dead in the switcher forever) and no pending upload
    // (the index must never hear about an unusable credential).
    const accounts = await page.evaluate(() => localStorage.getItem('vela.accounts'));
    expect(accounts === null || accounts === '[]').toBeTruthy();
    const pending = await page.evaluate(() => localStorage.getItem('vela.pendingUploads'));
    expect(pending === null || pending === '[]').toBeTruthy();

    // Resume retries ONLY the signature — it must never mint a second passkey.
    await page.getByText('Confirm', { exact: true }).first().click();
    await expect(page.locator('body')).toContainText('Verification was cancelled', { timeout: 30_000 });
    expect(created).toHaveLength(1);

    await page.screenshot({ path: 'e2e/screenshots/onboarding-dead-passkey.png', fullPage: true });

    // THE ESCAPE HATCH: a dead passkey must not trap the user in a retry loop.
    // "Start over" discards it, and the next Create mints a FRESH passkey that
    // completes the whole journey: stuck → start over → wallet created.
    await expect(page.locator('body')).toContainText('Start over with a new passkey');
    await page.getByText('Start over with a new passkey', { exact: true }).click();
    await expect(page.locator('body')).not.toContainText('Confirm');

    await page.getByText('Create Wallet', { exact: true }).last().click();
    await expect(page.locator('body')).toContainText('Added', { timeout: 30_000 });
    await page.getByText('Continue', { exact: true }).last().click();
    await expect(page.locator('body')).toContainText('Wallet created', { timeout: 30_000 });
    expect(created).toHaveLength(2); // a fresh passkey — not the dead one

    const accountsAfter = await page.evaluate(() => localStorage.getItem('vela.accounts'));
    expect(JSON.parse(accountsAfter!)).toHaveLength(1);
  });
});
