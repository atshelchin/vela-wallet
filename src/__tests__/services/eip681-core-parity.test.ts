/**
 * The EIP-681 BUILDER exists twice on purpose, and this pins the two together.
 *
 * Web drives the Rust `payment_request` machine (`use-receive-request.web.ts`);
 * iOS/Android cannot — Hermes has no WebAssembly — and run the TypeScript
 * `buildEIP681` / `buildPayLink` in `services/eip681.ts` instead. Neither copy
 * can be deleted, so the thing to remove is not the duplication but the DRIFT.
 *
 * It matters more here than in most twins because the two directions of this
 * format live on opposite sides of the boundary: the core BUILDS the URI a
 * payee's QR carries, and `parseEIP681` (shell, both platforms) READS it back.
 * A builder that drifts on one platform produces codes the other platform's
 * reader turns into a different recipient, a different chain, or a different
 * amount — and a scanned request prefills a LOCKED send. Base units are
 * compared as strings, never as numbers.
 *
 * The Rust core is driven for real (constructed, dispatched, view read), not
 * transcribed into a snapshot someone could regenerate without looking at the
 * other side.
 */
import '@/services/vela-core/index.web';
import { PaymentRequestCore } from '../../../rust/pkg-web/vela_core.js';

import { buildEIP681, buildPayLink, toBaseUnits, parseEIP681 } from '@/services/eip681';
import type { PaymentRequestView } from '@/services/wallet-state-core/generated/PaymentRequestView';

const ME = '0x' + '11'.repeat(20);
const USDC = '0x' + '22'.repeat(20);
const BASE = 'https://wallet.getvela.app/pay';

interface Asset {
  chainId: number;
  tokenAddress: string | null;
  symbol: string;
  decimals: number;
  networkName: string;
}

/** What the Rust machine builds for one asset + one typed amount. */
function coreBuild(asset: Asset, amount: string): { uri: string; payLink: string; amount: string } {
  const core = new PaymentRequestCore();
  try {
    const send = (event: unknown) =>
      (JSON.parse(core.dispatch(JSON.stringify(event))) as { view: PaymentRequestView }).view;
    send({ type: 'start', account: ME, recipient: ME, base_url: BASE });
    send({
      type: 'asset_picked',
      chain_id: asset.chainId,
      token_address: asset.tokenAddress,
      symbol: asset.symbol,
      decimals: asset.decimals,
      network_name: asset.networkName,
    });
    const view = send({ type: 'amount_changed', text: amount });
    return { uri: view.eip681_uri, payLink: view.pay_link, amount: view.amount };
  } finally {
    core.free();
  }
}

const ASSETS: Asset[] = [
  { chainId: 1, tokenAddress: null, symbol: 'ETH', decimals: 18, networkName: 'Ethereum' },
  { chainId: 137, tokenAddress: null, symbol: 'POL', decimals: 18, networkName: 'Polygon' },
  { chainId: 1, tokenAddress: USDC, symbol: 'USDC', decimals: 6, networkName: 'Ethereum' },
  { chainId: 8453, tokenAddress: USDC, symbol: 'USDC', decimals: 6, networkName: 'Base Mainnet' },
  { chainId: 1, tokenAddress: USDC, symbol: 'WBTC', decimals: 8, networkName: 'Ethereum' },
];

// Amounts the sanitizer leaves alone, so the two builders are asked the same
// question. `.5` and `1.` are in the wild (the sanitizer allows both).
const AMOUNTS = ['', '0', '1', '1.5', '0.000001', '1234567.891', '.5', '1.', '1000000'];

describe('build_eip681 (Rust) === buildEIP681 (TypeScript)', () => {
  for (const asset of ASSETS) {
    for (const amount of AMOUNTS) {
      const label = `${asset.symbol}@${asset.chainId} amount=${JSON.stringify(amount)}`;
      test(`same URI — ${label}`, () => {
        const core = coreBuild(asset, amount);
        // The core re-clamps the typed text to the asset's precision; the TS
        // builder is handed the clamped figure so only the ENCODING is compared.
        const ts = buildEIP681({
          recipient: ME,
          chainId: asset.chainId,
          tokenAddress: asset.tokenAddress,
          decimals: asset.decimals,
          amount: core.amount,
        });
        expect(core.uri).toBe(ts);
      });

      test(`same pay link — ${label}`, () => {
        const core = coreBuild(asset, amount);
        const ts = buildPayLink({
          recipient: ME,
          chainId: asset.chainId,
          tokenAddress: asset.tokenAddress,
          amount: core.amount,
          symbol: asset.symbol,
          decimals: asset.decimals,
          networkName: asset.networkName,
          baseUrl: BASE,
        });
        expect(core.payLink).toBe(ts);
      });
    }
  }

  test('a network name needing percent-encoding encodes identically', () => {
    const asset: Asset = {
      chainId: 42161,
      tokenAddress: null,
      symbol: 'ETH',
      decimals: 18,
      networkName: 'Arbitrum One (L2) — 测试',
    };
    const core = coreBuild(asset, '2');
    expect(core.payLink).toBe(
      buildPayLink({
        recipient: ME,
        chainId: asset.chainId,
        tokenAddress: asset.tokenAddress,
        amount: core.amount,
        symbol: asset.symbol,
        decimals: asset.decimals,
        networkName: asset.networkName,
        baseUrl: BASE,
      }),
    );
  });
});

describe('the round trip stays closed across the boundary', () => {
  for (const asset of ASSETS) {
    for (const amount of ['1.5', '0.000001', '1234567.891']) {
      test(`core-built ${asset.symbol}@${asset.chainId} ${amount} parses back to itself`, () => {
        const { uri, amount: clamped } = coreBuild(asset, amount);
        const parsed = parseEIP681(uri);
        expect(parsed).not.toBeNull();
        expect(parsed!.recipient).toBe(ME);
        expect(parsed!.chainId).toBe(asset.chainId);
        expect(parsed!.tokenAddress).toBe(asset.tokenAddress ?? undefined);
        expect(parsed!.isNative).toBe(asset.tokenAddress === null);
        // Base units as a string on both sides — the figure the payee typed is
        // the figure the payer's locked screen is pinned to.
        expect(parsed!.amountBaseUnits?.toString()).toBe(
          toBaseUnits(clamped, asset.decimals).toString(),
        );
      });
    }
  }
});
