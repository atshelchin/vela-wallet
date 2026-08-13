// The `browser_history` core (Rust/wasm) driven through the WEB shell.
//
// The machine's own rules are covered by the Rust suite; what only exists on
// this side is the executor's storage codec — the wire shape (`last_visited_ms`)
// against the shape actually on disk (`lastVisited`, written by
// `services/browser-history.ts` and still written by native). Getting that
// mapping wrong would silently empty an existing install's history, so it is
// asserted against the real core rather than a hand-written double.
const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => { mockStorage.set(key, val); }),
  removeItem: jest.fn(async (key: string) => { mockStorage.delete(key); }),
}));

// Load-bearing, and easy to get wrong: jest lists no `.web.ts` in
// `moduleFileExtensions`, so a bare `@/services/vela-core` resolves the NATIVE
// index and the wasm is never initialized (metro resolves the same specifier to
// `index.web.ts`, which is why the session module imports it bare). Importing
// the web entry by explicit path first runs `initSync` on the planted bytes.
import '@/services/vela-core';
import { createBrowserHistorySession } from '@/services/wallet-state-core/browser-history-session.web';
import type { BhistView } from '@/services/wallet-state-core/generated/BhistView';

const KEY = 'vela.browserHistory';

/** Let the effect loop's storage round-trip settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function open() {
  const faults: unknown[] = [];
  let view: BhistView = { entries: [] };
  const session = createBrowserHistorySession({
    onView: (next) => { view = next; },
    onError: (error) => { faults.push(error); },
  });
  session.start({ type: 'start' });
  return { session, faults, latest: () => view };
}

beforeEach(() => mockStorage.clear());

describe('browser_history core (web shell)', () => {
  test('hydrates from a store written by the TypeScript service', async () => {
    // Exactly what `services/browser-history.ts` persists today.
    mockStorage.set(
      KEY,
      JSON.stringify([
        { origin: 'https://b.io', url: 'https://b.io/x', host: 'b.io', title: 'B', favicon: '', lastVisited: 2000 },
        { origin: 'https://a.io', url: 'https://a.io', host: 'a.io', title: 'A', favicon: 'https://a.io/f.png', lastVisited: 3000 },
      ]),
    );
    const h = open();
    await settle();
    // Newest-first, like `getBrowserHistory`'s sort.
    expect(h.latest().entries.map((e) => e.host)).toEqual(['a.io', 'b.io']);
    expect(h.latest().entries[0]).toEqual({
      origin: 'https://a.io',
      url: 'https://a.io',
      host: 'a.io',
      title: 'A',
      favicon: 'https://a.io/f.png',
      last_visited_ms: 3000,
    });
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a recorded visit is written back in the stored (camelCase) shape', async () => {
    const h = open();
    await settle();
    h.session.dispatch({
      type: 'visit_recorded',
      url: 'https://app.uniswap.org/swap',
      title: 'Uniswap',
      favicon: 'https://app.uniswap.org/f.ico',
      now_ms: 1000,
    });
    await settle();
    expect(JSON.parse(mockStorage.get(KEY)!)).toEqual([
      {
        origin: 'https://app.uniswap.org',
        url: 'https://app.uniswap.org/swap',
        host: 'app.uniswap.org',
        title: 'Uniswap',
        favicon: 'https://app.uniswap.org/f.ico',
        lastVisited: 1000,
      },
    ]);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('a corrupt store hydrates as empty instead of stalling the core', async () => {
    mockStorage.set(KEY, '{ not json');
    const h = open();
    await settle();
    expect(h.latest().entries).toEqual([]);
    // Ready, not stuck hydrating: a mutation still lands.
    h.session.dispatch({ type: 'visit_recorded', url: 'https://a.io/p', title: null, favicon: null, now_ms: 5 });
    await settle();
    expect(h.latest().entries.map((e) => e.host)).toEqual(['a.io']);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });

  test('delete removes one origin, clear removes the key', async () => {
    const h = open();
    await settle();
    h.session.dispatch({ type: 'visit_recorded', url: 'https://a.io', title: null, favicon: null, now_ms: 1000 });
    h.session.dispatch({ type: 'visit_recorded', url: 'https://b.io', title: null, favicon: null, now_ms: 2000 });
    await settle();
    h.session.dispatch({ type: 'delete_origin', origin: 'https://a.io' });
    await settle();
    expect(h.latest().entries.map((e) => e.host)).toEqual(['b.io']);
    h.session.dispatch({ type: 'clear_all' });
    await settle();
    expect(h.latest().entries).toEqual([]);
    expect(mockStorage.has(KEY)).toBe(false);
    expect(h.faults).toEqual([]);
    h.session.dispose();
  });
});
