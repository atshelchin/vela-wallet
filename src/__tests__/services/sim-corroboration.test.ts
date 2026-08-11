/**
 * The signing sheet's corroboration verdict — `simCorroboratedByHero`.
 *
 * TRUE folds the whole simulated balance-change list away behind a one-line
 * green ✓ ("matches what you're signing"). FALSE itemises every movement. So
 * this predicate is the difference between a user seeing an undeclared outflow
 * and not seeing it, and jest renders no components — this file is its only
 * coverage.
 *
 * It was written twice inside `BalanceChangePreview.tsx` (once for the preview,
 * once for the 技术细节 summary line) before being pulled into one module; the
 * whole point of the move is that there is now one thing to test.
 *
 * Every case below is chosen so that the WRONG answer is the dangerous one: a
 * false ✓ hides money leaving the wallet.
 */
import { simCorroboratedByHero, type HeroFlow } from '@/services/sim-corroboration';
import type { AssetChange } from '@/services/tx-simulation';

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const out = (token: string | undefined, amount = 1_000_000n): AssetChange => ({
  kind: token ? 'erc20' : 'native', token, delta: -amount, symbol: 'X', decimals: 6,
});
const inn = (token: string | undefined, amount = 1_000_000n): AssetChange => ({
  kind: token ? 'erc20' : 'native', token, delta: amount, symbol: 'X', decimals: 6,
});

const hero = (token: string | undefined, dir: 'out' | 'in'): HeroFlow => ({ token, dir });

describe('corroborated (the quiet ✓ is allowed)', () => {
  it('one declared outflow, one simulated outflow of the same token', () => {
    expect(simCorroboratedByHero([out(USDC)], [hero(USDC, 'out')])).toBe(true);
  });

  it('a swap: both legs declared, both simulated', () => {
    expect(
      simCorroboratedByHero([out(USDC), inn(WETH)], [hero(USDC, 'out'), hero(WETH, 'in')]),
    ).toBe(true);
  });

  it('the native coin, declared as an undefined token', () => {
    expect(simCorroboratedByHero([out(undefined)], [hero(undefined, 'out')])).toBe(true);
  });

  it('a checksummed sim address still matches the lowercased hero flow', () => {
    // `AssetChange.token` is documented lowercase, but the predicate lowercases
    // anyway — a casing slip must not silently turn into "undeclared".
    const mixedCase = { ...out(USDC), token: USDC.toUpperCase().replace('0X', '0x') };
    expect(simCorroboratedByHero([mixedCase], [hero(USDC, 'out')])).toBe(true);
  });

  it('amounts are not compared — corroboration is identity + direction', () => {
    // Documented scope: the hero carries no amount, so this predicate cannot
    // and does not check one. Pinned so nobody reads a ✓ as "the numbers agree".
    expect(simCorroboratedByHero([out(USDC, 999_999_999n)], [hero(USDC, 'out')])).toBe(true);
  });
});

describe('NOT corroborated (the full list must be shown)', () => {
  it('an UNDECLARED outflow riding along with a declared one', () => {
    // The case the whole predicate exists for.
    expect(
      simCorroboratedByHero([out(USDC), out(WETH)], [hero(USDC, 'out')]),
    ).toBe(false);
  });

  it('an undeclared outflow alone', () => {
    expect(simCorroboratedByHero([out(WETH)], [hero(USDC, 'out')])).toBe(false);
  });

  it('the declared token moves the WRONG WAY', () => {
    expect(simCorroboratedByHero([out(USDC)], [hero(USDC, 'in')])).toBe(false);
    expect(simCorroboratedByHero([inn(USDC)], [hero(USDC, 'out')])).toBe(false);
  });

  it('a swap whose OUTPUT token is not the one declared', () => {
    expect(
      simCorroboratedByHero([out(USDC), inn(WETH)], [hero(USDC, 'out'), hero(USDC, 'in')]),
    ).toBe(false);
  });

  it('an unverified change poisons an otherwise perfect match', () => {
    // Decimals could not be confirmed, so no amount is shown at all — that
    // caution must not be foldable behind a ✓.
    expect(
      simCorroboratedByHero([{ ...out(USDC), unverified: true }], [hero(USDC, 'out')]),
    ).toBe(false);
    expect(
      simCorroboratedByHero(
        [out(USDC), { ...inn(WETH), unverified: true }],
        [hero(USDC, 'out'), hero(WETH, 'in')],
      ),
    ).toBe(false);
  });

  it('a native outflow is not corroborated by an ERC-20 hero flow (or vice versa)', () => {
    expect(simCorroboratedByHero([out(undefined)], [hero(USDC, 'out')])).toBe(false);
    expect(simCorroboratedByHero([out(USDC)], [hero(undefined, 'out')])).toBe(false);
  });

  it('no hero flows at all — approvals, permits, batches never corroborate', () => {
    expect(simCorroboratedByHero([out(USDC)], [])).toBe(false);
  });

  it('an empty change list is not corroboration', () => {
    // `[].every()` is vacuously true; without the explicit guard "the sim saw
    // nothing" would render as "the sim agreed with the hero".
    expect(simCorroboratedByHero([], [hero(USDC, 'out')])).toBe(false);
    expect(simCorroboratedByHero([], [])).toBe(false);
  });

  it('a zero delta matches neither direction', () => {
    expect(
      simCorroboratedByHero([{ ...out(USDC), delta: 0n }], [hero(USDC, 'out')]),
    ).toBe(false);
  });
});
