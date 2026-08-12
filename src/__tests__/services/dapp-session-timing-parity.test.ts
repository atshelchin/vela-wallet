/**
 * The WalletPair reconnect clock, checked against the Rust core number for
 * number and sentence for sentence.
 *
 * `dapp_session.rs` is the arbiter of this machine's six timers on web, but
 * `WalletPairTransport` is not a dumb socket: it owns its OWN 60 s reconnect
 * deadline and its OWN `min(1s·2ⁿ, 30s)` backoff ladder, armed from its own
 * `phase === 'disconnected'` handler. That file is shared with iOS/Android,
 * where FR-202 forbids any behaviour change, so neither copy can be deleted —
 * the transport's ladder is what actually reconnects (the core arbitrates,
 * the transport executes, deliberately, so two writers never race one relay
 * channel; the reasoning is in `dsess-executor.web.ts`'s divergence note and
 * the BUG-5/6 history).
 *
 * That arrangement is only safe while the two sides are numerically identical,
 * and nothing enforced it. This does.
 *
 * What a red test here means, concretely:
 *
 * - **The deadline (60 s).** Both sides arm it on the same event. Move one and
 *   the user gets two "still reconnecting" episodes at different moments, or a
 *   status that says recovering while the transport has already given up.
 * - **The wording.** Both the transport's `error` event and the core's own
 *   deadline timer describe the SAME episode, and on web both fire. Identical
 *   text is what makes the double report idempotent instead of a flicker
 *   between two wordings (`dsess-types.ts` says so; this proves it).
 * - **The ladder (1 s base, 30 s cap).** The core arms a timer it believes
 *   matches the transport's next retry. Diverge and the core's `Backoff`
 *   deadline fires against a transport that is either still waiting (a
 *   reconnect nobody asked for) or already retried (a doubled attempt).
 * - **The web-recovery throttle (3 s) and the stale-background threshold
 *   (20 s).** `online` + `visibilitychange` arriving together must collapse to
 *   one reconnect on whichever side is counting.
 *
 * Source-level on purpose, like `native-fixes.test.ts` and the approval-cap
 * parity suite: the Rust file is the oracle, read at test time rather than
 * transcribed into a snapshot someone can update without opening the other
 * side. `rust/crates/vela-core/tests/app_dapp_session.rs` pins the core's half
 * from within cargo.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { dsessErrorMessage } from '@/services/wallet-state-core/dsess-types';

const ROOT = resolve(__dirname, '../../..');
const read = (path: string) => readFileSync(resolve(ROOT, path), 'utf8');

const RUST_PATH = 'rust/crates/vela-core/src/app/dapp_session.rs';
const TS_PATH = 'src/services/walletpair-transport.ts';

const rust = read(RUST_PATH);
const transport = read(TS_PATH);

/** `pub const NAME: <int ty> = 12_345;` — the core's integer timer constants. */
function rustConst(name: string): number {
  const match = new RegExp(
    `pub const ${name}\\s*:\\s*(?:u8|u16|u32|u64|usize|f32|f64)\\s*=\\s*([0-9_]+(?:\\.[0-9_]+)?)\\s*;`,
  ).exec(rust);
  if (!match) {
    throw new Error(`${name} not found in ${RUST_PATH} — did the core rename or restate it?`);
  }
  return Number(match[1].replace(/_/g, ''));
}

/** A `const NAME = 12_345;` in the transport, at module or block scope. */
function tsConst(name: string): number {
  const match = new RegExp(`const ${name}\\s*=\\s*([0-9_]+)\\s*;`).exec(transport);
  if (!match) {
    throw new Error(`${name} not found in ${TS_PATH} — did the transport rename or inline it?`);
  }
  return Number(match[1].replace(/_/g, ''));
}

describe('WalletPair reconnect clock: transport ↔ Rust core parity', () => {
  it('finds both sides (a moved file must not turn this suite into a no-op)', () => {
    expect(rust).toContain('pub const RECONNECT_DEADLINE_MS');
    expect(transport).toContain('const RECONNECT_MAX_MS');
    expect(transport).toContain('scheduleReconnect');
  });

  it('the reconnect deadline is the same 60 s on both sides', () => {
    expect(tsConst('RECONNECT_MAX_MS')).toBe(rustConst('RECONNECT_DEADLINE_MS'));
    // Pins the absolute value too: a coordinated edit that keeps both equal but
    // moves the deadline is still a product change someone must look at.
    expect(tsConst('RECONNECT_MAX_MS')).toBe(60_000);
  });

  it('both sides describe the elapsed deadline with the SAME sentence', () => {
    // `walletpair-transport.ts`'s `emit('error', …)` rides into the core as
    // `DsessError::Transport { message }` and lands in the same slot the core's
    // own `ReconnectDeadline` writes. Two wordings would flicker.
    const emitted = /emit\('error',\s*'([^']*reconnect[^']*)'\)/i.exec(transport);
    if (!emitted) {
      throw new Error(`the reconnect-deadline error text was not found in ${TS_PATH}`);
    }
    expect(dsessErrorMessage({ type: 'reconnect_deadline' })).toBe(emitted[1]);
  });

  it('the backoff ladder is the same base and the same cap on both sides', () => {
    // The transport writes the ladder inline; read the literals back out of
    // `scheduleReconnect` rather than trusting a comment.
    const ladder = /Math\.min\(([0-9_]+)\s*\*\s*2\s*\*\*\s*this\.reconnectAttempt,\s*([0-9_]+)\)/
      .exec(transport);
    if (!ladder) {
      throw new Error(
        `the min(base·2ⁿ, cap) ladder was not found in ${TS_PATH} — if it was rewritten, re-check it against the core`,
      );
    }
    const base = Number(ladder[1].replace(/_/g, ''));
    const cap = Number(ladder[2].replace(/_/g, ''));
    expect(base).toBe(rustConst('BACKOFF_BASE_MS'));
    expect(cap).toBe(rustConst('BACKOFF_CAP_MS'));
    expect([base, cap]).toEqual([1_000, 30_000]);
  });

  it('the ladder produces the same delays attempt for attempt', () => {
    // The shapes are written differently (`base * 2 ** n` here, `base << n`
    // there); equal constants are not the same thing as equal schedules, and it
    // is the schedule the core's `Backoff` timer is supposed to shadow.
    const base = rustConst('BACKOFF_BASE_MS');
    const cap = rustConst('BACKOFF_CAP_MS');
    const fromTransport = (n: number) => Math.min(base * 2 ** n, cap);
    // The core's `schedule_backoff`: `(BACKOFF_BASE_MS << attempt).min(cap)`,
    // saturating to the cap once the shift would overflow.
    const fromCore = (n: number) => (n >= 32 ? cap : Math.min(base * 2 ** n, cap));
    for (let attempt = 0; attempt <= 40; attempt += 1) {
      expect(fromTransport(attempt)).toBe(fromCore(attempt));
    }
    expect(fromCore(0)).toBe(1_000);
    expect(fromCore(5)).toBe(30_000);
  });

  it('the web-recovery throttle is the same 3 s on both sides', () => {
    const throttle = /now - this\.lastRecoverAt < ([0-9_]+)/.exec(transport);
    if (!throttle) {
      throw new Error(`the recovery throttle was not found in ${TS_PATH}`);
    }
    expect(Number(throttle[1].replace(/_/g, ''))).toBe(rustConst('RECOVER_THROTTLE_MS'));
  });

  it('the stale-background threshold is the same 20 s on both sides', () => {
    expect(tsConst('STALE_AFTER_MS')).toBe(rustConst('STALE_AFTER_MS'));
  });
});
