/**
 * The five-way connect-entry classification, TypeScript ↔ Rust core, over the
 * real wasm.
 *
 * The rule exists twice and neither copy can be deleted: `dapp_session.rs`'s
 * `classify_connect_input` decides it on web (the shell stopped deciding — see
 * `services/connect-entry.web.ts`), while `services/connect-entry.ts` is the
 * only implementation iOS/Android have, because Hermes has no WebAssembly and
 * FR-202 forbids changing native behaviour. So the thing to remove is not the
 * duplication but the DRIFT.
 *
 * What a red test here means, concretely: one platform routes a string
 * somewhere the other does not. Loosen the browser fallback on one side and a
 * scanned `javascript:` payload opens the in-app browser on that platform only;
 * tighten `parseRemoteInjectURL` on one side and a pairing link silently
 * degrades to a web page — a connect attempt turning into a page load is the
 * kind of divergence nobody notices until a user reports it.
 *
 * Both sides are asked the SAME strings, including the order-sensitive one the
 * rule is built around: a remote-inject link IS an https URL, so whichever side
 * runs the browser fallback too early answers `browser` where the other answers
 * `remote-inject`.
 *
 * Same spirit as the identicon / i18n / conformance-vector parity suites: the
 * oracle is the real other implementation, executed, not a transcribed
 * snapshot that can be updated without anyone looking at the other side.
 * `rust/crates/vela-core/tests/app_dapp_session.rs` pins the Rust side from
 * within cargo, so a one-sided edit is red on both toolchains.
 */

// `walletpair-transport` (which owns `isWalletPairURI`) reaches react-native
// and AsyncStorage at module scope. Stubbed, NOT re-stated: the predicate under
// test must be the real one on both sides, so nothing here may hand the TS
// classifier an answer of its own — that would make the parity vacuous.
jest.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web' },
  NativeModules: {},
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: async () => {},
    getItem: async () => null,
    removeItem: async () => {},
  },
}));

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized. Importing the web entry by explicit
// path first runs `initSync` on the planted bytes.
import '@/services/vela-core';
import { classifyConnectEntry as classifyOnNative, type ConnectEntry } from '@/services/connect-entry';
import { classifyConnectEntry as classifyInCore } from '@/services/connect-entry.web';

const RI_PATH = 'https://relay.example.com/s/sess123?n=NONCE&k=SECRET';
const RI_QUERY = 'https://relay.example.com/bridge?session=abc&n=N1&k=K1';

/**
 * Every input either side has an opinion about. Grouped by the branch it is
 * meant to land in, so a table row that moves branch is obvious in the diff.
 */
const INPUTS: { about: string; raw: string }[] = [
  // --- walletpair -----------------------------------------------------------
  { about: 'a pairing URI', raw: 'walletpair:v1?x=1' },
  { about: 'a pairing URI with surrounding whitespace', raw: '  walletpair:v1?x=1 ' },
  { about: 'a bare scheme with no body', raw: 'walletpair:' },

  // --- remote-inject --------------------------------------------------------
  { about: 'the /s/{id} connect link', raw: RI_PATH },
  { about: 'the ?session= connect link', raw: RI_QUERY },
  { about: 'a connect link on a non-default port', raw: 'https://relay.example.com:8443/s/x?n=a&k=b' },
  { about: 'a connect link whose path and query disagree', raw: 'https://r.io/s/frompath?session=fromquery&n=a&k=b' },
  { about: 'percent-encoded credentials', raw: 'https://r.io/bridge?session=a%2Fb&n=n%201&k=k%2B1' },
  { about: 'a connect link missing the nonce', raw: 'https://r.io/s/sess?k=SECRET' },
  { about: 'a connect link missing the secret', raw: 'https://r.io/s/sess?n=NONCE' },
  { about: 'a connect link with an empty nonce', raw: 'https://r.io/s/sess?n=&k=SECRET' },
  { about: 'a bridge link with no session id', raw: 'https://r.io/bridge?n=NONCE&k=SECRET' },

  // --- browser --------------------------------------------------------------
  { about: 'a bare host', raw: 'app.uniswap.org' },
  { about: 'a bare host with a path', raw: 'uniswap.org/swap' },
  { about: 'a full https URL', raw: 'https://app.uniswap.org/swap' },
  { about: 'a full http URL', raw: 'http://example.com' },
  { about: 'mixed case and a default port', raw: 'HTTPS://App.Uniswap.ORG:443/Swap?in=ETH' },
  { about: 'a URL with a fragment', raw: 'https://example.com/a#b' },
  { about: 'an https URL that carries neither n nor k', raw: 'https://relay.example.com/s/sess123' },

  // --- invalid --------------------------------------------------------------
  { about: 'a javascript: payload', raw: 'javascript:alert(1)' },
  { about: 'a file: URL', raw: 'file:///etc/passwd' },
  { about: 'host:port with no scheme (scheme parses as "localhost")', raw: 'localhost:8080' },
  { about: 'a plain word', raw: 'hello' },
  { about: 'a dotted token containing whitespace', raw: 'foo bar.com' },
  { about: 'the empty string', raw: '' },
  { about: 'whitespace only', raw: '   ' },
  { about: 'a mailto link', raw: 'mailto:a@b.com' },
  { about: 'a deep link in the wallet scheme', raw: 'velawallet://send' },
  { about: 'an EIP-681 payment request', raw: 'ethereum:0x1111111111111111111111111111111111111111@1' },
  { about: 'a bare address', raw: '0x1111111111111111111111111111111111111111' },
];

describe('connect-entry classification: TypeScript ↔ Rust core parity', () => {
  it.each(INPUTS)('$about answers identically on both sides', ({ raw }) => {
    expect(classifyInCore(raw)).toEqual(classifyOnNative(raw));
  });

  it('covers every branch (a table that stopped reaching one would go green for the wrong reason)', () => {
    const kinds = new Set<ConnectEntry['kind']>(INPUTS.map(({ raw }) => classifyOnNative(raw).kind));
    expect([...kinds].sort()).toEqual(['browser', 'invalid', 'remote-inject', 'walletpair']);
  });

  it('keeps the load-bearing order: a connect link is an https URL and must NOT become a page load', () => {
    // The whole reason `coerceBrowserUrl` runs last. Asserted on both sides
    // rather than only through the table, because this is the one ordering
    // mistake that is silent: the user sees a web page instead of a pairing.
    expect(classifyInCore(RI_PATH).kind).toBe('remote-inject');
    expect(classifyOnNative(RI_PATH).kind).toBe('remote-inject');
    expect(classifyInCore(RI_QUERY).kind).toBe('remote-inject');
    expect(classifyOnNative(RI_QUERY).kind).toBe('remote-inject');
  });

  it('hands back the SAME relay credentials, field for field', () => {
    // The four fields are bearer credentials — a divergence here is not a
    // routing bug, it is connecting to a different channel.
    const core = classifyInCore(RI_PATH);
    const native = classifyOnNative(RI_PATH);
    expect(core).toEqual({
      kind: 'remote-inject',
      session: {
        serverUrl: 'https://relay.example.com',
        sessionId: 'sess123',
        nonce: 'NONCE',
        secret: 'SECRET',
      },
    });
    expect(native).toEqual(core);
  });

  it('classifying never disturbs anything: repeated calls are pure', () => {
    // The web side constructs a throwaway core per call and frees it. If that
    // ever leaked into the app-resident session, a second identical call would
    // stop answering the same way (the model would no longer be pristine).
    for (let i = 0; i < 3; i += 1) {
      expect(classifyInCore('walletpair:v1?x=1')).toEqual({ kind: 'walletpair', uri: 'walletpair:v1?x=1' });
      expect(classifyInCore(RI_PATH).kind).toBe('remote-inject');
    }
  });
});
