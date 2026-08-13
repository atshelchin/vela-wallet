/**
 * Drift gate — the `network_admin` admission constants exist in more than one
 * place ON PURPOSE, so this test is what keeps the copies identical.
 *
 * `services/network-checker.ts` is the TypeScript implementation of the
 * compatibility check, surviving from the retired Expo-native path beside the
 * Rust core's (spec 017). While both exist, what can happen is that one
 * is edited and the other is not — and these particular values decide whether a
 * chain may enter the wallet at all. A chain admitted against a table missing an
 * entry is a chain that can accept deposits the wallet can never sign out of
 * (`network_admin` invariant ②), and the failure is silent on exactly one
 * platform.
 *
 * Three copies are compared, byte for byte:
 *
 *   1. `services/network-checker.ts`                       — native's checker
 *   2. `rust/crates/vela-core/src/app/network_admin.rs`    — web's core
 *   3. `wallet-state-core/network-admin-executor.ts`   — the P256 `eth_call`
 *      payload, which the core cannot carry across the wire (it is baked into
 *      the request the shell makes) and therefore hand-copies.
 *
 * Same technique as the i18n supported-language gate
 * (`__tests__/i18n/web-adapter.test.ts:262`): read the Rust source, extract the
 * literal, compare.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { CHAINS } from '@/models/chains';
import {
  P256_PRECOMPILE,
  REQUIRED_CONTRACTS,
  VALID_P256_CALL,
} from '@/services/network-checker';
import {
  buildProviderRpcUrl,
  PROVIDER_ORDER,
  providerChainIds,
  type ProviderId,
} from '@/services/rpc-providers';

const REPO = join(__dirname, '../../..');

const RUST = readFileSync(
  join(REPO, 'rust/crates/vela-core/src/app/network_admin.rs'),
  'utf8',
);
const EXECUTOR = readFileSync(
  join(REPO, 'src/services/wallet-state-core/network-admin-executor.ts'),
  'utf8',
);

/** `pub const REQUIRED_CONTRACTS: [(&str, &str); 11] = [ ("A", "0x…"), … ];` */
function rustRequiredContracts(): { name: string; address: string }[] {
  const block = /pub const REQUIRED_CONTRACTS:[^=]*=\s*\[([\s\S]*?)\n\];/.exec(RUST);
  if (!block) throw new Error('REQUIRED_CONTRACTS not found in network_admin.rs');
  return [...block[1].matchAll(/\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,?\s*\)/g)].map((m) => ({
    name: m[1],
    address: m[2],
  }));
}

/** A `"0x\` … `"` continuation literal, joined back into one string. */
function rustStrConst(name: string): string {
  const block = new RegExp(`pub const ${name}: &str = "([\\s\\S]*?)";`).exec(RUST);
  if (!block) throw new Error(`${name} not found in network_admin.rs`);
  return block[1].replace(/\\\s*\n\s*/g, '').replace(/\s+/g, '');
}

/** A `'0x' + '…' + '…'` concatenation in a TypeScript source. */
function tsConcatConst(source: string, name: string): string {
  const block = new RegExp(`const ${name} =\\s*([\\s\\S]*?);`).exec(source);
  if (!block) throw new Error(`${name} not found in the executor`);
  return [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1]).join('');
}

/** A single-quoted `const NAME = '…';` in a TypeScript source. */
function tsStrConst(source: string, name: string): string {
  const block = new RegExp(`const ${name} = '([^']*)';`).exec(source);
  if (!block) throw new Error(`${name} not found in the executor`);
  return block[1];
}

/** `fn provider_slug`'s match arms, per provider: chainId → slug. */
function rustProviderSlugs(): Record<string, Record<number, string>> {
  const fn = /fn provider_slug\([\s\S]*?\n\}/.exec(RUST);
  if (!fn) throw new Error('provider_slug not found in network_admin.rs');
  const out: Record<string, Record<number, string>> = {};
  for (const arm of fn[0].matchAll(
    /NetProviderId::(\w+) => match chain_id \{([\s\S]*?)\n\s*\},/g,
  )) {
    const map: Record<number, string> = {};
    for (const entry of arm[2].matchAll(/(\d+) => Some\("([^"]+)"\)/g)) {
      map[Number(entry[1])] = entry[2];
    }
    out[arm[1].toLowerCase()] = map;
  }
  return out;
}

/** `build_provider_rpc_url`'s format strings, per provider. */
function rustProviderUrlTemplates(): Record<string, string> {
  const fn = /pub fn build_provider_rpc_url\([\s\S]*?\n\}/.exec(RUST);
  if (!fn) throw new Error('build_provider_rpc_url not found in network_admin.rs');
  const out: Record<string, string> = {};
  for (const arm of fn[0].matchAll(/NetProviderId::(\w+) => format!\("([^"]+)"\)/g)) {
    out[arm[1].toLowerCase()] = arm[2];
  }
  return out;
}

describe('network_admin admission constants — Rust ⇄ TypeScript', () => {
  test('the eleven required contracts agree, in order, name and address', () => {
    const rust = rustRequiredContracts();
    // Guard the extraction itself: a regex that silently matched nothing would
    // turn this gate into a green no-op.
    expect(rust).toHaveLength(11);
    expect(REQUIRED_CONTRACTS).toHaveLength(11);
    // ORDER matters — it is the order the compatibility checklist renders, and
    // the core zips its `getCode` answers back onto it positionally.
    expect(rust).toEqual(REQUIRED_CONTRACTS);
  });

  test('every address is a distinct 20-byte hex address', () => {
    const seen = new Set<string>();
    for (const { address } of REQUIRED_CONTRACTS) {
      expect(address).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(seen.has(address.toLowerCase())).toBe(false);
      seen.add(address.toLowerCase());
    }
  });

  test('the RIP-7212 precompile address agrees across all three copies', () => {
    expect(rustStrConst('P256_PRECOMPILE')).toBe(P256_PRECOMPILE);
    expect(tsStrConst(EXECUTOR, 'P256_PRECOMPILE')).toBe(P256_PRECOMPILE);
  });

  test('the P256 probe payload agrees across all three copies', () => {
    // 4 words of signature/pubkey material + the hash = 160 bytes.
    expect(VALID_P256_CALL).toHaveLength(2 + 320);
    expect(rustStrConst('VALID_P256_CALL')).toBe(VALID_P256_CALL);
    expect(tsConcatConst(EXECUTOR, 'VALID_P256_CALL')).toBe(VALID_P256_CALL);
  });
});

/**
 * The provider tables are the second pair that must not drift, and they drift
 * INVISIBLY: the RPC pool builds provider URLs from the TypeScript map
 * (`rpc-providers.ts:74-131`) on every platform, while the settings screen's
 * capability probe builds them from the Rust map on web. Disagree, and the
 * screen reports a network as supported that the pool never asks that provider
 * for — or the reverse, a paid endpoint quietly unused.
 *
 * Compared through the exported API only: for every chain either side knows,
 * the URL the TypeScript builder returns must be the one the Rust template and
 * slug produce.
 */
describe('network_admin provider tables — Rust ⇄ TypeScript', () => {
  const KEY = 'TESTKEY';
  const slugs = rustProviderSlugs();
  const templates = rustProviderUrlTemplates();
  const providers: ProviderId[] = ['alchemy', 'drpc', 'ankr'];

  test('the extraction found all three providers on both sides', () => {
    expect(Object.keys(slugs).sort()).toEqual([...providers].sort());
    expect(Object.keys(templates).sort()).toEqual([...providers].sort());
    // `PROVIDER_ORDER` is the cold-start tie-break in the pool AND the row order
    // in the modal; the core carries its own copy.
    const rustOrder = /pub const PROVIDER_ORDER: \[NetProviderId; \d+\] =\s*\[([^\]]*)\]/
      .exec(RUST);
    expect(rustOrder).not.toBeNull();
    expect(
      [...(rustOrder?.[1] ?? '').matchAll(/NetProviderId::(\w+)/g)].map((m) => m[1].toLowerCase()),
    ).toEqual(PROVIDER_ORDER);
  });

  test.each(providers)('%s serves exactly the same chains, at the same URLs', (id) => {
    const rust = slugs[id];
    const template = templates[id];
    expect(Object.keys(rust).length).toBeGreaterThan(0);

    for (const [chainId, slug] of Object.entries(rust)) {
      const expected = template.replace('{slug}', slug).replace('{key}', KEY);
      expect(buildProviderRpcUrl(id, Number(chainId), KEY)).toBe(expected);
    }

    // Every canonical chain the Rust map does NOT carry must have no URL on the
    // TypeScript side either — an extra slug on one side is the silent half.
    for (const chain of CHAINS) {
      if (rust[chain.chainId] === undefined) {
        expect(buildProviderRpcUrl(id, chain.chainId, KEY)).toBeUndefined();
      }
    }

    // `providerChainIds` is what the probe iterates: the canonical table
    // filtered by the slug map, so a chain the core cannot address (X Layer is
    // in Alchemy's map but not in `CHAINS`) must not appear.
    const probed = providerChainIds(id);
    expect(probed).toEqual(CHAINS.filter((c) => rust[c.chainId] !== undefined).map((c) => c.chainId));
    expect(probed).not.toContain(196);
  });

  test('an empty key builds no URL, so the pool never falls back to an unauthenticated one', () => {
    for (const id of providers) {
      const [firstChain] = Object.keys(slugs[id]);
      expect(buildProviderRpcUrl(id, Number(firstChain), '')).toBeUndefined();
    }
  });
});
