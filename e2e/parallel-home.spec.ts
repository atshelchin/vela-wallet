/**
 * Home daily-use flows — through the parallel space (Epic 2/6). P1.
 *
 * The fixture keyset gives three real accounts, so the multi-account UX (switcher +
 * SWITCH_ACCOUNT + header) is exercisable deterministically. Read-only (no funds).
 */
import { test, expect } from '@playwright/test';
import { enterParallel, stubWalletNetwork } from './support/parallel';

test.describe('parallel-space · Home', () => {
  test('switches between the fixture accounts', async ({ page }) => {
    await enterParallel(page); // lands on Home as "Parallel One"

    // Open the account switcher from the header (by role so it's identity-agnostic;
    // force-click because the Home's entering animations keep it "unstable").
    await page.getByRole('button', { name: /Switch account/ }).click({ force: true });

    // The switcher lists the other fixture accounts.
    //
    // `.first()`: two HomeScreens are mounted (react-navigation keeps the
    // inactive stack screen — the same duplicate 233c062 diagnosed on a clean
    // baseline), each with its own switcher portaled to #root, so an account
    // name matches twice. The two nodes are identical and overlap exactly, so
    // either satisfies "the switcher lists it" and either is clickable.
    await expect(page.getByText('Parallel Two').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Parallel Three').first()).toBeVisible();

    // Switch to Parallel Two → the Home header reflects it, with its address.
    await page.getByText('Parallel Two').first().click({ force: true });
    await expect(page.getByRole('button', { name: /Parallel Two/ }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('0x031d...772b').first()).toBeVisible();
  });

  test('toggles Activity ⇄ Connections tabs', async ({ page }) => {
    await stubWalletNetwork(page);
    await enterParallel(page);

    // `.filter({ visible: true }).first()` on every Home-screen selector, for the
    // same reason as enterParallel/openWalletConnect in support/parallel.ts (see
    // 233c062): on web react-navigation keeps the inactive stack screen mounted
    // (display:none) ahead of the active one in DOM order, so a bare selector for
    // a Home string is a strict-mode violation against the hidden duplicate.
    await page.getByText('Connections', { exact: true }).filter({ visible: true }).first().click({ force: true });
    await expect(page.getByText('No active connection').filter({ visible: true }).first())
      .toBeVisible({ timeout: 10_000 });
    await page.getByText('Activity', { exact: true }).filter({ visible: true }).first().click({ force: true });
  });
});
