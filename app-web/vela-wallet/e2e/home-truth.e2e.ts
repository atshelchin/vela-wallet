/**
 * A wallet home that tells the truth (spec 025 T126 — SC-101), hermetically.
 *
 * Every chain's RPC is a user override pointing at the stub host (so the
 * pool's fastest-endpoint race is deterministic), the chain registry knows
 * only Ethereum (native coin, no stables, no DEX), and the stub answers every
 * multicall with N results shaped as Chainlink `latestRoundData` whose first
 * word doubles as the balance: `decU256` reads word 0 (the balance),
 * `decChainlinkUsd` reads word 1 (the price). One shape, both decoders — so
 * 1.5 ETH at $3,000 renders as $4,500 with zero live traffic.
 */
import { expect, test } from '@playwright/test';
import { CHAINS } from '../src/lib/services/chains';
import { en, seedSignedIn } from './live-helpers';
import {
	abiWord,
	aggregate3CallCount,
	denyOffOrigin,
	encodeAggregate3Result,
	seedNetworkOverrides,
	stubChainRegistry,
	stubJsonRpc
} from './stub-chain';

test.use({ viewport: { width: 390, height: 844 } });

const STUB = 'https://stub-rpc.test/rpc';
const ONE_AND_A_HALF_ETH = 1_500_000_000_000_000_000n;
const THREE_THOUSAND_USD_8DP = 3000n * 100_000_000n;

test.beforeEach(async ({ page }) => {
	await seedSignedIn(page);
	await denyOffOrigin(page);
	await stubChainRegistry(page, {
		1: {
			chainId: 1,
			name: 'Ethereum',
			nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
			stables: [],
			wrappedNativeToken: null,
			dex: null,
			rpc: [`${STUB}/1`]
		}
	});
	await stubJsonRpc(page, /stub-rpc\.test\/rpc\/(\d+)/, (method, params, url) => {
		const chainId = Number(/\/rpc\/(\d+)/.exec(url)?.[1]);
		if (method === 'eth_chainId') return '0x' + chainId.toString(16);
		if (method === 'eth_blockNumber') return '0x10';
		if (method === 'eth_call') {
			const call = params[0] as { data?: string } | undefined;
			const n = call?.data ? aggregate3CallCount(call.data) : 0;
			const balance = chainId === 1 ? ONE_AND_A_HALF_ETH : 0n;
			const data =
				'0x' +
				abiWord(balance) +
				abiWord(THREE_THOUSAND_USD_8DP) +
				abiWord(0) +
				abiWord(0) +
				abiWord(0);
			return encodeAggregate3Result(Array.from({ length: n }, () => ({ success: true, data })));
		}
		return undefined;
	});
});

async function openHome(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/en/wallet');
	await expect(page.getByText('E2E Wallet').first()).toBeVisible();
	// Overrides are read at pool-config time; seed them, then let the core
	// re-hydrate for the account through a reload.
	await seedNetworkOverrides(
		page,
		CHAINS.map((c) => ({ chainId: c.chainId, rpcURL: `${STUB}/${c.chainId}` }))
	);
	await page.reload();
	await expect(page.getByText('E2E Wallet').first()).toBeVisible();
}

test("balances are the chain's, not a fixture's (SC-101)", async ({ page }) => {
	await openHome(page);
	// The held asset, from the stubbed multicall.
	await expect(page.getByText('ETH', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText('1.5', { exact: true }).first()).toBeVisible();
	// The total is the core's aggregation at the on-chain Chainlink price.
	await expect(page.getByText('$4,500', { exact: true })).toBeVisible();
	// The spec-015 fixture identities never appear on a live home.
	await expect(page.getByText('$1,383')).toHaveCount(0);
	await expect(page.getByText('大表哥')).toHaveCount(0);
});

test("tap-to-hide masks every figure and survives a reload (privacy is the core's)", async ({
	page
}) => {
	await openHome(page);
	await expect(page.getByText('$4,500', { exact: true })).toBeVisible({ timeout: 20_000 });

	// The figure itself is the tap-to-hide target, named by the corpus.
	await page.getByRole('button', { name: en('home.a11yHideBalance') }).click();
	await expect(page.getByText('••••••').first()).toBeVisible();
	await expect(page.getByText('$4,500')).toHaveCount(0);

	await page.reload();
	await expect(page.getByText('E2E Wallet').first()).toBeVisible();
	await expect(page.getByText('••••••').first()).toBeVisible({ timeout: 20_000 });
});
