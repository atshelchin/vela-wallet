/**
 * "Is this method a signature?" — the one question this wallet answers in four
 * places, pinned against each other.
 *
 * The four sites, and why none of them can simply be deleted:
 *
 * 1. `hooks/use-dapp-signing.ts` `isSigningMethod` — the LOOSE predicate
 *    (`eth_sendTransaction`, `wallet_sendCalls`, `personal_sign`, `eth_sign`,
 *    or any method whose name CONTAINS `signTypedData`). It is the fork in
 *    `dapp-connection(.web).tsx`: signing goes to the approval sheet,
 *    everything else to the read-only RPC gate. Hermes has no wasm, so on
 *    iOS/Android this is the only copy there is.
 * 2. `sign_request.rs::is_signing_method` — the same loose predicate, re-run by
 *    the core at `on_request_arrived` as its own backstop. On web BOTH 1 and 2
 *    execute for every inbound request; the shell's call cannot move into the
 *    core because the core has no read-only-RPC operation to route the other
 *    branch to.
 * 3. `services/wallet-browser-router.ts` — a STRICT 8-name table, used only by
 *    `shouldBlockInsecureSigning` (the in-app dApp browser's refusal to sign on
 *    public http).
 * 4. `dapp_permissions.rs::SIGNING_METHODS` — the same strict 8, for the same
 *    block inside `decide_browser_request`.
 *
 * So there are two SEMANTICS, not one, and they are not interchangeable:
 * strict ⊂ loose. Every name the strict table lists is also loose-signing, so
 * for all four methods that ship today the two agree. They part company on a
 * `signTypedData` spelling nobody enumerated — `eth_signTypedData_v5`, a
 * vendor-prefixed variant — which the loose predicate routes to the approval
 * sheet while the strict table does not consider it worth blocking on an
 * insecure origin. That direction is a fail-OPEN, and it is asserted below
 * explicitly rather than left as folklore, so that either (a) someone
 * converges them on purpose, or (b) the day one side moves, this goes red.
 *
 * The tests read the Rust files as the oracle (the approval-cap parity suite's
 * pattern) so neither language can be edited alone.
 */

// Mock react-native transitive dependencies — `use-dapp-signing` reaches them
// at module scope; the predicate under test is pure.
jest.mock('react-native', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock('@/modules/passkey', () => ({}));

import { readFileSync } from 'fs';
import { resolve } from 'path';

import { isSigningMethod } from '@/hooks/use-dapp-signing';
import { shouldBlockInsecureSigning } from '@/services/wallet-browser-router';

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const SIGN_REQUEST_PATH = 'rust/crates/vela-core/src/app/sign_request.rs';
const DPERM_PATH = 'rust/crates/vela-core/src/app/dapp_permissions.rs';
const ROUTER_PATH = 'src/services/wallet-browser-router.ts';

const signRequest = read(SIGN_REQUEST_PATH);
const dperm = read(DPERM_PATH);
const router = read(ROUTER_PATH);

/**
 * Rebuild the core's LOOSE predicate from its own source, so the comparison is
 * against what Rust actually says rather than a transcription of it.
 *
 * Deliberately narrow: only the two clause shapes the core uses parse
 * (`method == "literal"` and `method.contains("literal")`). Anything else
 * throws, so a rewrite surfaces as a loud failure and a human re-checks the
 * parity instead of the gate quietly going green.
 */
function rustLoosePredicate(source: string, path: string): (method: string) => boolean {
  const body = new RegExp(
    String.raw`pub fn is_signing_method\(method: &str\) -> bool \{([\s\S]*?)\n\}`,
  ).exec(source);
  if (!body) throw new Error(`is_signing_method not found in ${path}`);
  const clauses = body[1]
    .split('||')
    .map((clause) => clause.trim())
    .filter(Boolean);
  const tests = clauses.map((clause) => {
    const equals = /^method\s*==\s*"([^"]+)"$/.exec(clause);
    if (equals) return (method: string) => method === equals[1];
    const contains = /^method\.contains\("([^"]+)"\)$/.exec(clause);
    if (contains) return (method: string) => method.includes(contains[1]);
    throw new Error(`unparseable is_signing_method clause in ${path}: ${JSON.stringify(clause)}`);
  });
  if (tests.length === 0) throw new Error(`is_signing_method in ${path} has no clauses`);
  return (method: string) => tests.some((test) => test(method));
}

/** `pub const SIGNING_METHODS: [&str; N] = [ "a", "b", … ];` */
function rustStrictTable(): string[] {
  const match = /pub const SIGNING_METHODS:\s*\[&str;\s*(\d+)\]\s*=\s*\[([\s\S]*?)\];/.exec(dperm);
  if (!match) throw new Error(`SIGNING_METHODS not found in ${DPERM_PATH}`);
  const names = [...match[2].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (names.length !== Number(match[1])) {
    throw new Error(`SIGNING_METHODS declares ${match[1]} entries but lists ${names.length}`);
  }
  return names;
}

/** `const SIGNING_METHODS = new Set([ 'a', 'b', … ]);` in the browser router. */
function tsStrictTable(): string[] {
  const match = /const SIGNING_METHODS = new Set\(\[([\s\S]*?)\]\);/.exec(router);
  if (!match) throw new Error(`SIGNING_METHODS not found in ${ROUTER_PATH}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

/** Every name either semantics has an opinion about, plus the gap cases. */
const METHODS = [
  'eth_sendTransaction',
  'wallet_sendCalls',
  'personal_sign',
  'eth_sign',
  'eth_signTypedData',
  'eth_signTypedData_v1',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  // Not enumerated anywhere — the gap between the two semantics.
  'eth_signTypedData_v5',
  'wallet_signTypedData_v4',
  // Plainly not signing.
  'eth_accounts',
  'eth_chainId',
  'eth_call',
  'eth_getBalance',
  'wallet_switchEthereumChain',
  'wallet_requestPermissions',
  'personal_ecRecover',
  'eth_signTransaction',
  '',
];

describe('signing-method classification: TypeScript ↔ Rust core parity', () => {
  it('finds all four sites (a moved file must not turn this suite into a no-op)', () => {
    expect(signRequest).toContain('pub fn is_signing_method');
    expect(dperm).toContain('pub const SIGNING_METHODS');
    expect(router).toContain('const SIGNING_METHODS = new Set(');
    expect(router).toContain('export function shouldBlockInsecureSigning');
  });

  describe('the LOOSE predicate: the approval-sheet fork (both copies run on web)', () => {
    const inCore = rustLoosePredicate(signRequest, SIGN_REQUEST_PATH);

    it.each(METHODS)('%p is classified the same by the shell and by the core', (method) => {
      expect(isSigningMethod(method)).toBe(inCore(method));
    });

    it('still means what the fork depends on', () => {
      // A false here sends a signature to the read-only RPC gate, which answers
      // it from a public node instead of asking the user.
      for (const method of ['eth_sendTransaction', 'wallet_sendCalls', 'personal_sign', 'eth_sign']) {
        expect(isSigningMethod(method)).toBe(true);
      }
      // A true here opens an approval sheet for a plain read.
      for (const method of ['eth_accounts', 'eth_call', 'wallet_switchEthereumChain']) {
        expect(isSigningMethod(method)).toBe(false);
      }
      // The substring clause is what makes the predicate loose at all.
      expect(isSigningMethod('eth_signTypedData_v5')).toBe(true);
    });
  });

  describe('the STRICT table: the insecure-http signing block', () => {
    it('lists exactly the same 8 names, in the same order, on both sides', () => {
      expect(tsStrictTable()).toEqual(rustStrictTable());
      expect(tsStrictTable()).toHaveLength(8);
    });

    it('blocks every listed name on a public http origin', () => {
      for (const method of rustStrictTable()) {
        expect(shouldBlockInsecureSigning(method, 'http://evil.io')).toBe(true);
        // https and loopback stay usable — the block is about the transport,
        // not the method.
        expect(shouldBlockInsecureSigning(method, 'https://app.example')).toBe(false);
        expect(shouldBlockInsecureSigning(method, 'http://127.0.0.1:8080')).toBe(false);
      }
    });
  });

  describe('the relationship between the two semantics', () => {
    it('strict is a SUBSET of loose — every blocked name is also sheet-routed', () => {
      // If this inverts, the browser would block on an insecure origin
      // something the provider does not even treat as a signature.
      for (const method of rustStrictTable()) {
        expect(isSigningMethod(method)).toBe(true);
      }
    });

    it('pins the KNOWN gap: a signTypedData spelling nobody enumerated is sheet-routed but not blocked', () => {
      // Documented, deliberate-for-now, and fail-OPEN: `eth_signTypedData_v5`
      // reaches the approval sheet (so a user still has to confirm) but the
      // in-app browser will not refuse it on a public http origin, where a MITM
      // can inject the page script that asked for it.
      //
      // Converging means widening the strict table to the loose predicate on
      // BOTH sides at once (TypeScript and Rust); the direction is safe —
      // loose ⊇ strict, so no method that works today would start being
      // refused. Until that lands, this assertion is what makes the gap
      // impossible to widen or to forget.
      const gap = METHODS.filter((method) => isSigningMethod(method) && !rustStrictTable().includes(method));
      expect(gap).toEqual(['eth_signTypedData_v5', 'wallet_signTypedData_v4']);
      for (const method of gap) {
        expect(shouldBlockInsecureSigning(method, 'http://evil.io')).toBe(false);
      }
    });
  });
});
