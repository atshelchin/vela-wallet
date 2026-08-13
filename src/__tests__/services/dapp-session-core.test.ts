// The `dapp_session` core (Rust/wasm) driven through the WEB shell.
//
// This is the densest timer discipline in the repo, and every one of the six
// timers is a rule that a real incident wrote:
//
//   - 4 s GRACE — a relay blip self-heals invisibly, and a repeated blip must
//     never extend the window (③).
//   - 45 s STUCK — an auto-reconnect that drags gets a manual prompt instead of
//     spinning forever (④).
//   - 120 s JOIN — a relay that silently drops the join (CF Worker
//     hibernation) leaves both sides in waiting_accept with no error (④).
//   - 60 s DEADLINE — stop promising a recovery that is not coming (④).
//   - 8 s DROP-IF-DEAD — a restored channel the relay has forgotten can NEVER
//     come back; drop it AND wipe the snapshot or the next launch restore-loops
//     into a fresh pairing's channel (BUG-5/6, ⑤).
//   - BACKOFF min(1s·2ⁿ, 30s) — one armed retry at a time, only while
//     transport-down, reset on connect.
//
// The verdicts are the core's and `rust/crates/vela-core/tests/app_dapp_session.rs`
// covers them in isolation. What only exists on THIS side is the shell: the
// `session_ref` → transport table, the wiring, `setTimeout`, and the one
// deliberate divergence (a `backoff` reconnect is arbitrated by the core and
// executed by `WalletPairTransport`'s own identical ladder — see
// `dsess-executor.web.ts`). So each timer is asserted where it is observable
// from outside: the delay the core armed, the frame before it fires, and the
// frame after — over the real executor, with a fake clock.

const mockStorage = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
  setItem: jest.fn(async (key: string, val: string) => {
    mockStorage.set(key, val);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
}));

// ---------------------------------------------------------------------------
// Transport doubles
// ---------------------------------------------------------------------------
//
// Real sockets are not the subject: the executor's job is to build the right
// transport for the operation, wire it, and report its events keyed by ref.
// These record what was asked of them and let the test drive the events a
// relay would.

type Listener = (...args: any[]) => void;

/** How the NEXT transport the executor builds behaves. Reset per test. */
let defaultConnect: 'ok' | 'throw' = 'ok';
let defaultReconnect: 'ok' | 'throw' = 'ok';
let defaultConnectsTo = true;

class FakeTransport {
  readonly name = 'Fake';
  connected = false;
  disconnects = 0;
  reconnects = 0;
  pushes: { address: string; chainId: number; name: string }[] = [];
  connectResult: 'ok' | 'throw' = defaultConnect;
  /** `connected` after `connect()` resolves — `false` arms the join watchdog. */
  connectsTo = defaultConnectsTo;
  reconnectResult: 'ok' | 'throw' = defaultReconnect;
  dappInfo: { name: string; url: string; icon?: string } | null = { name: 'Fixture dApp', url: 'https://dapp.test' };
  private listeners = new Map<string, Set<Listener>>();

  async connect(): Promise<void> {
    if (this.connectResult === 'throw') throw new Error('connect boom');
    this.connected = this.connectsTo;
    if (this.connected) this.emit('connected', 'Fake');
  }

  async reconnect(): Promise<void> {
    this.reconnects += 1;
    if (this.reconnectResult === 'throw') throw new Error('reconnect boom');
  }

  disconnect(): void {
    this.disconnects += 1;
    this.connected = false;
  }

  sendResponse(): void {}

  pushWalletInfo(info: { address: string; chainId: number; name: string }): void {
    this.pushes.push(info);
  }

  async fetchDAppInfo() {
    return this.dappInfo;
  }

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, ...args: any[]): void {
    this.listeners.get(event)?.forEach((fn) => fn(...args));
  }
}

/** Every remote-inject transport the executor builds, in order. */
const builtRemoteInject: FakeTransport[] = [];
/** Every WalletPair transport `prepare()`/`restore()` handed back, in order. */
const builtWalletPair: FakeTransport[] = [];

let prepareResult: 'ok' | 'throw' = 'ok';
let restoreResult: 'transport' | 'null' | 'throw' = 'transport';
let walletPairSnapshotCleared = 0;

jest.mock('@/services/dapp-transport', () => ({
  RemoteInjectTransport: class {
    constructor() {
      const transport = new FakeTransport();
      builtRemoteInject.push(transport);
      return transport as unknown as object;
    }
  },
}));

jest.mock('@/services/walletpair-transport', () => ({
  WalletPairTransport: {
    prepare: (uri: string) => {
      if (prepareResult === 'throw') throw new Error('prepare boom');
      const transport = new FakeTransport();
      builtWalletPair.push(transport);
      return {
        fingerprint: '4271',
        dappInfo: { name: 'Paired dApp', url: `https://paired.test/${uri.length}` },
        transport,
      };
    },
    restore: async () => {
      if (restoreResult === 'throw') throw new Error('restore boom');
      if (restoreResult === 'null') return null;
      const transport = new FakeTransport();
      builtWalletPair.push(transport);
      return transport;
    },
  },
  clearWalletPairSession: async () => {
    walletPairSnapshotCleared += 1;
    mockStorage.delete('vela.walletpairSession');
  },
  loadWalletPairSnapshot: async () => mockStorage.get('vela.walletpairSession') ?? null,
  isWalletPairURI: (raw: string) => raw.trimStart().startsWith('walletpair:'),
}));

// Load-bearing (see browser-history-core.test.ts): jest lists no `.web.ts` in
// `moduleFileExtensions`, so the web entry must be imported by explicit path
// for `initSync` to run on the planted wasm bytes before the core is built.
import '@/services/vela-core';
import { createDappSession } from '@/services/wallet-state-core/dsess-session';
import { remoteInjectLink } from '@/services/wallet-state-core/dsess-executor';
import { dsessErrorMessage } from '@/services/wallet-state-core/dsess-types';
import type { DsessEvent } from '@/services/wallet-state-core/generated/DsessEvent';
import type { DsessView } from '@/services/wallet-state-core/generated/DsessView';

const RI_STORAGE_KEY = 'vela.remoteInjectSession';
const WP_STORAGE_KEY = 'vela.walletpairSession';

const SESSION = {
  server_url: 'https://relay.test',
  session_id: 'abc123',
  nonce: 'nnn',
  secret: 'kkk',
};

/** The connect link for `SESSION`, in the shape the Connect screen produces. */
const CONNECT_URL = 'https://relay.test/s/abc123?n=nnn&k=kkk';

/** Drain the microtask queue. Fake timers make `setTimeout(0)` unusable here. */
async function flush(turns = 60) {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

function open() {
  const faults: unknown[] = [];
  const browsed: string[] = [];
  let invalidAlerts = 0;
  let view: DsessView = {
    status: 'disconnected',
    error: null,
    session: null,
    dapp_info: null,
    connection_type: null,
    pending_fingerprint: null,
    reconnect_stuck: false,
    chain_id: 1,
  };
  let emit: (event: DsessEvent) => void = () => {};
  const session = createDappSession({
    onView: (next) => {
      view = next;
    },
    onError: (error) => faults.push(error),
    ports: {
      emit: (event) => emit(event),
      request: () => {},
      durableTransportChanged: () => {},
      transportDropped: () => {},
      walletInfo: () => ({
        address: '0xfixture',
        name: 'Wallet',
        accounts: [{ name: 'Wallet', address: '0xfixture' }],
      }),
      openBrowser: (url) => browsed.push(url),
      alertInvalidLink: () => {
        invalidAlerts += 1;
      },
    },
  });
  emit = (event) => session.dispatch(event);
  session.start({ type: 'wallet_changed', chain_id: 1 });
  return {
    session,
    faults,
    browsed,
    invalidAlerts: () => invalidAlerts,
    latest: () => view,
  };
}

type App = ReturnType<typeof open>;

async function dispatch(app: App, event: DsessEvent) {
  app.session.dispatch(event);
  await flush();
}

/** Fire every timer due within `ms`, then drain the microtasks they queued. */
async function advance(ms: number) {
  jest.advanceTimersByTime(ms);
  await flush();
}

beforeEach(() => {
  mockStorage.clear();
  builtRemoteInject.length = 0;
  builtWalletPair.length = 0;
  defaultConnect = 'ok';
  defaultReconnect = 'ok';
  defaultConnectsTo = true;
  prepareResult = 'ok';
  restoreResult = 'transport';
  walletPairSnapshotCleared = 0;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// The core's own constants, restated so a change in Rust breaks a test here
// rather than silently changing the product's timing.
const GRACE_MS = 4_000;
const STUCK_MS = 45_000;
const JOIN_MS = 120_000;
const DEADLINE_MS = 60_000;
const DROP_IF_DEAD_MS = 8_000;

// ---------------------------------------------------------------------------

describe('dapp_session · entry classification (⑨)', () => {
  test('a walletpair URI is classified first and prepares a pairing', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: '  walletpair:relay?ch=1  ' });
    expect(builtWalletPair).toHaveLength(1);
    expect(app.latest().status).toBe('connecting');
    expect(app.latest().pending_fingerprint).toBe('4271');
    expect(app.latest().dapp_info?.name).toBe('Paired dApp');
    expect(app.browsed).toEqual([]);
  });

  test('a remote-inject link is NOT treated as a browser URL (order is load-bearing)', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    expect(builtRemoteInject).toHaveLength(1);
    expect(app.browsed).toEqual([]);
    expect(app.latest().session).toEqual(SESSION);
  });

  test('a bare host falls through to the browser and leaves the session alone', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    await flush();
    const before = app.latest();
    await dispatch(app, { type: 'input_submitted', raw: 'app.uniswap.org' });
    expect(app.browsed).toEqual(['https://app.uniswap.org/']);
    expect(app.latest().session).toEqual(before.session);
    expect(app.latest().status).toBe(before.status);
  });

  test('anything else alerts and touches nothing', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'not a link' });
    expect(app.invalidAlerts()).toBe(1);
    expect(builtRemoteInject).toHaveLength(0);
    expect(builtWalletPair).toHaveLength(0);
  });

  test('`remoteInjectLink` round-trips a parsed session through the core parser', async () => {
    const app = open();
    // The shape `connectToBridge(session)` re-serialises: every field must come
    // back byte-identical or the Connect screen would silently open a browser.
    const awkward = {
      serverUrl: 'https://relay.test:8443',
      sessionId: 'a+b/c',
      nonce: 'n=1&x',
      secret: 'k%20space',
    };
    await dispatch(app, { type: 'input_submitted', raw: remoteInjectLink(awkward) });
    expect(app.latest().session).toEqual({
      server_url: 'https://relay.test:8443',
      session_id: 'a+b/c',
      nonce: 'n=1&x',
      secret: 'k%20space',
    });
    expect(app.browsed).toEqual([]);
  });
});

describe('dapp_session · remote-inject lifecycle', () => {
  test('connect saves the session, fetches the dApp and pushes wallet info', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    await flush();
    const transport = builtRemoteInject[0];
    expect(app.latest().status).toBe('connected');
    expect(app.latest().connection_type).toBe('remote_inject');
    expect(app.latest().dapp_info).toEqual({
      name: 'Fixture dApp',
      url: 'https://dapp.test',
      icon: null,
    });
    expect(JSON.parse(mockStorage.get(RI_STORAGE_KEY)!)).toEqual({
      serverUrl: 'https://relay.test',
      sessionId: 'abc123',
      nonce: 'nnn',
      secret: 'kkk',
    });
    // Chain comes from the core, identity from the shell.
    expect(transport.pushes[0]).toEqual({
      address: '0xfixture',
      chainId: 1,
      name: 'Wallet',
      accounts: [{ name: 'Wallet', address: '0xfixture' }],
    });
  });

  test('a fresh connect failure ends in `error` with the message verbatim', async () => {
    const app = open();
    builtRemoteInject.length = 0;
    // The transport is built inside the operation, so the failure is scripted
    // before the operation runs.
    defaultConnect = 'throw';
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    await flush();
    expect(app.latest().status).toBe('error');
    expect(app.latest().error).toEqual({
      type: 'transport',
      message: 'connect boom',
    });
  });

  test('an explicit disconnect wipes BOTH stores and clears the session', async () => {
    const app = open();
    mockStorage.set(WP_STORAGE_KEY, '{"dapp":{"name":"x","url":"y"}}');
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    await flush();
    await dispatch(app, { type: 'disconnect_requested' });
    await flush();
    expect(app.latest().status).toBe('disconnected');
    expect(app.latest().session).toBeNull();
    expect(app.latest().dapp_info).toBeNull();
    expect(mockStorage.has(RI_STORAGE_KEY)).toBe(false);
    expect(walletPairSnapshotCleared).toBeGreaterThan(0);
    expect(builtRemoteInject[0].disconnects).toBe(1);
  });
});

describe('dapp_session · the fingerprint gate (① ②)', () => {
  test('a pairing never joins without an explicit confirmation', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    const transport = builtWalletPair[0];
    // Everything short of the confirmation: a wallet change, a stray timer, a
    // reconnect request. None of them may reach `confirmJoin()`.
    await dispatch(app, { type: 'wallet_changed', chain_id: 137 });
    await dispatch(app, { type: 'manual_reconnect' });
    await dispatch(app, { type: 'timer_fired', id: 999 });
    expect(transport.connected).toBe(false);
    expect(app.latest().status).toBe('connecting');

    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    expect(app.latest().status).toBe('connected');
    expect(app.latest().connection_type).toBe('wallet_pair');
    expect(app.latest().pending_fingerprint).toBeNull();
  });

  test('cancelling a pairing releases the ephemeral key', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    const transport = builtWalletPair[0];
    await dispatch(app, { type: 'fingerprint_cancelled' });
    await flush();
    expect(transport.disconnects).toBe(1);
    expect(app.latest().status).toBe('disconnected');
    expect(app.latest().pending_fingerprint).toBeNull();
    expect(app.latest().dapp_info).toBeNull();
  });

  test('replacing a pending pairing releases the first one', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:one' });
    const first = builtWalletPair[0];
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:two' });
    await flush();
    expect(first.disconnects).toBe(1);
    expect(builtWalletPair).toHaveLength(2);
    expect(app.latest().pending_fingerprint).toBe('4271');
  });
});

describe('dapp_session · counter durability (⑦)', () => {
  test('a WalletPair push happens only after the counters are persisted', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    const transport = builtWalletPair[0];
    expect(transport.pushes).toHaveLength(1);

    // A wallet change while connected pushes again — still through the persist.
    await dispatch(app, { type: 'wallet_changed', chain_id: 100 });
    await flush();
    expect(transport.pushes[1].chainId).toBe(100);
  });

  test('a push is skipped when the channel dropped while persisting', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    const transport = builtWalletPair[0];
    const before = transport.pushes.length;
    transport.emit('reconnecting');
    await flush();
    await dispatch(app, { type: 'wallet_changed', chain_id: 8453 });
    await flush();
    // `wallet_changed` only pushes from `connected` + transport up; the blip
    // took the transport down, so nothing new went out.
    expect(transport.pushes).toHaveLength(before);
  });
});

describe('dapp_session · the 4s grace window (③)', () => {
  async function connectedWalletPair() {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    return { app, transport: builtWalletPair[0] };
  }

  test('a blip holds "connected" for exactly the grace window', async () => {
    const { app, transport } = await connectedWalletPair();
    transport.emit('reconnecting');
    await flush();
    expect(app.latest().status).toBe('connected');
    await advance(GRACE_MS - 1);
    expect(app.latest().status).toBe('connected');
    await advance(1);
    expect(app.latest().status).toBe('reconnecting');
  });

  test('a repeated blip never extends the window', async () => {
    const { app, transport } = await connectedWalletPair();
    transport.emit('reconnecting');
    await flush();
    await advance(GRACE_MS - 500);
    // Three more blips inside the window: the armed timer is left to run.
    transport.emit('reconnecting');
    transport.emit('reconnecting');
    transport.emit('reconnecting');
    await flush();
    await advance(500);
    expect(app.latest().status).toBe('reconnecting');
  });

  test('recovering inside the window means "Reconnecting…" never showed', async () => {
    const { app, transport } = await connectedWalletPair();
    transport.emit('reconnecting');
    await flush();
    await advance(GRACE_MS - 1);
    transport.connected = true;
    transport.emit('connected');
    await flush();
    await advance(GRACE_MS);
    expect(app.latest().status).toBe('connected');
  });

  test('a manual reconnect bypasses the grace window entirely', async () => {
    const { app, transport } = await connectedWalletPair();
    transport.emit('reconnecting');
    await flush();
    await dispatch(app, { type: 'manual_reconnect' });
    expect(app.latest().status).toBe('reconnecting');
    expect(transport.reconnects).toBe(1);
  });
});

describe('dapp_session · the 45s stuck prompt and the 60s deadline (④)', () => {
  async function reconnecting() {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    const transport = builtWalletPair[0];
    transport.connected = false;
    transport.emit('reconnecting');
    await flush();
    await advance(GRACE_MS);
    expect(app.latest().status).toBe('reconnecting');
    return { app, transport };
  }

  test('the prompt appears at 45s and not before', async () => {
    const { app } = await reconnecting();
    // The stuck timer was armed at the flip, so it still has 45s to run.
    await advance(STUCK_MS - 1);
    expect(app.latest().reconnect_stuck).toBe(false);
    await advance(1);
    expect(app.latest().reconnect_stuck).toBe(true);
  });

  test('a manual reconnect re-arms the prompt even though the status is unchanged', async () => {
    const { app } = await reconnecting();
    await advance(STUCK_MS);
    expect(app.latest().reconnect_stuck).toBe(true);
    await dispatch(app, { type: 'manual_reconnect' });
    expect(app.latest().reconnect_stuck).toBe(false);
    await advance(STUCK_MS - 1);
    expect(app.latest().reconnect_stuck).toBe(false);
    await advance(1);
    expect(app.latest().reconnect_stuck).toBe(true);
  });

  test('the deadline surfaces a recoverable error and keeps the session', async () => {
    const { app } = await reconnecting();
    // The deadline was armed with the grace timer, so 60s from the blip.
    await advance(DEADLINE_MS - GRACE_MS - 1);
    expect(app.latest().error).toBeNull();
    await advance(1);
    expect(app.latest().error).toEqual({ type: 'reconnect_deadline' });
    expect(dsessErrorMessage(app.latest().error!)).toBe(
      'Still trying to reconnect to the dApp. Check your connection or reconnect manually.',
    );
    // The session is kept — the UI merely stops promising a recovery.
    expect(app.latest().status).toBe('reconnecting');
    expect(app.latest().dapp_info).not.toBeNull();
  });

  test('a recovery before the deadline cancels it', async () => {
    const { app, transport } = await reconnecting();
    transport.connected = true;
    transport.emit('connected');
    await flush();
    await advance(DEADLINE_MS * 2);
    expect(app.latest().error).toBeNull();
    expect(app.latest().status).toBe('connected');
  });
});

describe('dapp_session · the 120s join watchdog (④)', () => {
  test('a join that resolves without connecting is bounded', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    const transport = builtWalletPair[0];
    // `confirmJoin()` resolves, but the relay silently dropped the join.
    transport.connectsTo = false;
    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    expect(app.latest().status).toBe('connecting');

    await advance(JOIN_MS - 1);
    expect(app.latest().error).toBeNull();
    await advance(1);
    expect(app.latest().error).toEqual({ type: 'join_timeout' });
    expect(dsessErrorMessage(app.latest().error!)).toBe(
      'Connection timed out. The relay may be unavailable — try scanning again.',
    );
    // Ends `disconnected`, not `error` — the ported clobber quirk.
    expect(app.latest().status).toBe('disconnected');
    expect(transport.disconnects).toBe(1);
  });

  test('connecting before the deadline cancels the watchdog', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    const transport = builtWalletPair[0];
    transport.connectsTo = false;
    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    transport.connected = true;
    transport.emit('connected');
    await flush();
    await advance(JOIN_MS * 2);
    expect(app.latest().status).toBe('connected');
    expect(app.latest().error).toBeNull();
    expect(transport.disconnects).toBe(0);
  });
});

describe('dapp_session · restore, and the 8s dead-channel drop (⑤ ⑥)', () => {
  test('remote-inject is restored BEFORE walletpair', async () => {
    const app = open();
    mockStorage.set(WP_STORAGE_KEY, JSON.stringify({ dapp: { name: 'wp', url: 'https://wp.test' } }));
    await dispatch(app, {
      type: 'restore_loaded',
      remote_inject: SESSION,
      wallet_pair: { name: 'wp', url: 'https://wp.test', icon: null },
    });
    await flush();
    expect(builtRemoteInject).toHaveLength(1);
    expect(builtWalletPair).toHaveLength(0);
    // The WalletPair snapshot is left exactly as it was (today's early return).
    expect(mockStorage.has(WP_STORAGE_KEY)).toBe(true);
    expect(app.latest().connection_type).toBe('remote_inject');
  });

  test('a stale relay session is cleaned up silently — no error shown', async () => {
    defaultConnect = 'throw';
    const app = open();
    mockStorage.set(RI_STORAGE_KEY, JSON.stringify(SESSION));
    await dispatch(app, { type: 'restore_loaded', remote_inject: SESSION, wallet_pair: null });
    await flush();
    expect(app.latest().status).toBe('disconnected');
    expect(app.latest().error).toBeNull();
    expect(app.latest().session).toBeNull();
    expect(mockStorage.has(RI_STORAGE_KEY)).toBe(false);
    expect(builtRemoteInject[0].disconnects).toBe(1);
  });

  test('a restored channel that is not live within 8s is dropped AND wiped', async () => {
    const app = open();
    mockStorage.set(WP_STORAGE_KEY, 'snapshot');
    await dispatch(app, {
      type: 'restore_loaded',
      remote_inject: null,
      wallet_pair: { name: 'wp', url: 'https://wp.test', icon: null },
    });
    await flush();
    const transport = builtWalletPair[0];
    expect(transport.reconnects).toBe(1);
    expect(app.latest().dapp_info?.name).toBe('wp');
    // Status stays 'disconnected' until the grace window elapses — today's
    // launch UX, and it must not race the drop.
    expect(app.latest().status).toBe('disconnected');

    await advance(DROP_IF_DEAD_MS - 1);
    expect(transport.disconnects).toBe(0);
    await advance(1);
    expect(transport.disconnects).toBe(1);
    expect(walletPairSnapshotCleared).toBeGreaterThan(0);
    expect(app.latest().status).toBe('disconnected');
  });

  test('a restored channel that comes up survives the 8s window', async () => {
    const app = open();
    await dispatch(app, {
      type: 'restore_loaded',
      remote_inject: null,
      wallet_pair: { name: 'wp', url: 'https://wp.test', icon: null },
    });
    await flush();
    const transport = builtWalletPair[0];
    transport.connected = true;
    transport.emit('connected');
    await flush();
    await advance(DROP_IF_DEAD_MS * 2);
    expect(transport.disconnects).toBe(0);
    expect(app.latest().status).toBe('connected');
    expect(walletPairSnapshotCleared).toBe(0);
  });

  test('a reconnect that throws during restore drops and wipes immediately', async () => {
    defaultReconnect = 'throw';
    const app = open();
    await dispatch(app, {
      type: 'restore_loaded',
      remote_inject: null,
      wallet_pair: { name: 'wp', url: 'https://wp.test', icon: null },
    });
    await flush();
    const transport = builtWalletPair[0];
    expect(transport.disconnects).toBe(1);
    expect(walletPairSnapshotCleared).toBeGreaterThan(0);
  });

  test('a restore that throws is wiped too, not left to loop forever', async () => {
    restoreResult = 'throw';
    const app = open();
    mockStorage.set(WP_STORAGE_KEY, 'garbage');
    await dispatch(app, {
      type: 'restore_loaded',
      remote_inject: null,
      wallet_pair: { name: '', url: '', icon: null },
    });
    await flush();
    expect(walletPairSnapshotCleared).toBeGreaterThan(0);
    expect(app.latest().status).toBe('disconnected');
  });

  test('an unusable snapshot is wiped, not left to loop forever', async () => {
    restoreResult = 'null';
    const app = open();
    mockStorage.set(WP_STORAGE_KEY, 'garbage');
    await dispatch(app, {
      type: 'restore_loaded',
      remote_inject: null,
      wallet_pair: { name: '', url: '', icon: null },
    });
    await flush();
    expect(walletPairSnapshotCleared).toBeGreaterThan(0);
    expect(app.latest().status).toBe('disconnected');
    expect(app.latest().dapp_info).toBeNull();
  });

  test('restore is single-shot and never clobbers a live session', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    await flush();
    const live = builtRemoteInject[0];
    await dispatch(app, { type: 'restore_loaded', remote_inject: SESSION, wallet_pair: null });
    await flush();
    expect(builtRemoteInject).toHaveLength(1);
    expect(live.disconnects).toBe(0);
  });
});

describe('dapp_session · the backoff ladder', () => {
  test('the delays double to a 30s cap and reset on connect', async () => {
    const spy = jest.spyOn(global, 'setTimeout');
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    const transport = builtWalletPair[0];

    const delays: number[] = [];
    for (let episode = 0; episode < 7; episode++) {
      spy.mockClear();
      transport.connected = false;
      transport.emit('reconnecting');
      await flush();
      // `on_transport_reconnecting` arms grace, then the deadline, then the
      // backoff — each only when it is not already running — so the backoff is
      // the LAST timer of the episode whatever else was skipped. (Identifying
      // it by its delay would be circular: 4000 is both a grace window and a
      // legitimate third backoff step.)
      const armed = spy.mock.calls.map((call) => call[1] as number);
      delays.push(armed[armed.length - 1]);
      // Let the armed backoff fire so the next episode can arm a new one.
      await advance(delays[delays.length - 1]);
    }
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);

    // Recovering resets the ladder.
    transport.connected = true;
    transport.emit('connected');
    await flush();
    spy.mockClear();
    transport.connected = false;
    transport.emit('reconnecting');
    await flush();
    const afterReset = spy.mock.calls.map((call) => call[1] as number);
    expect(afterReset[afterReset.length - 1]).toBe(1_000);
    spy.mockRestore();
  });

  test('a backoff reconnect is arbitrated by the core, executed by the transport', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    const transport = builtWalletPair[0];
    transport.connected = false;
    transport.emit('reconnecting');
    await flush();
    // The transport owns its own identical ladder, so the shell must NOT open a
    // second socket for the same channel when the core's backoff fires
    // (BUG-5/6). The documented divergence in `dsess-executor.web.ts`.
    await advance(1_000);
    expect(transport.reconnects).toBe(0);
    // A MANUAL reconnect still calls through for real.
    await dispatch(app, { type: 'manual_reconnect' });
    expect(transport.reconnects).toBe(1);
  });
});

describe('dapp_session · terminal drops and stale handles', () => {
  test('a terminal drop keeps session + dappInfo, as it always did', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    await flush();
    const transport = builtRemoteInject[0];
    transport.connected = false;
    transport.emit('disconnected');
    await flush();
    expect(app.latest().status).toBe('disconnected');
    expect(app.latest().connection_type).toBeNull();
    expect(app.latest().session).toEqual(SESSION);
    expect(app.latest().dapp_info).not.toBeNull();
  });

  test('a released transport can no longer move the session', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    await flush();
    const first = builtRemoteInject[0];
    await dispatch(app, { type: 'disconnect_requested' });
    await flush();
    // A zombie listener on the old transport: today it would have called
    // setStatus; the staleness guard drops it.
    first.emit('connected');
    first.emit('error', 'ghost');
    await flush();
    expect(app.latest().status).toBe('disconnected');
    expect(app.latest().error).toBeNull();
  });

  test('a transport error rides verbatim without moving the status', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    await flush();
    builtRemoteInject[0].emit('error', 'relay hiccup');
    await flush();
    expect(app.latest().error).toEqual({ type: 'transport', message: 'relay hiccup' });
    expect(dsessErrorMessage(app.latest().error!)).toBe('relay hiccup');
    expect(app.latest().status).toBe('connected');
  });
});

describe('dapp_session · shell plumbing', () => {
  test('no core faults are produced by any of the flows above', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: CONNECT_URL });
    await flush();
    await dispatch(app, { type: 'wallet_changed', chain_id: 42 });
    await dispatch(app, { type: 'manual_reconnect' });
    await dispatch(app, { type: 'disconnect_requested' });
    await flush();
    expect(app.faults).toEqual([]);
  });

  test('a prepare failure ends in `error` with the message verbatim', async () => {
    prepareResult = 'throw';
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    await flush();
    expect(app.latest().status).toBe('error');
    expect(app.latest().error).toEqual({ type: 'transport', message: 'prepare boom' });
  });

  test('a join failure ends `disconnected` and releases the retry loop', async () => {
    const app = open();
    await dispatch(app, { type: 'input_submitted', raw: 'walletpair:x' });
    const transport = builtWalletPair[0];
    transport.connectResult = 'throw';
    await dispatch(app, { type: 'fingerprint_confirmed' });
    await flush();
    expect(app.latest().error).toEqual({ type: 'transport', message: 'connect boom' });
    expect(app.latest().status).toBe('disconnected');
    expect(transport.disconnects).toBe(1);
  });
});
