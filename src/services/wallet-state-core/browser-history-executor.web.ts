/**
 * The only place the `browser_history` core touches the outside world.
 *
 * Three operations, one AsyncStorage call each — the KV vocabulary the core
 * declares (`ReadHistory` / `WriteHistory` / `RemoveHistory`) on the key
 * `services/browser-history.ts` owns today. No branching on business meaning:
 * the dedupe, the fallback chain, the cap and the "write vs remove" choice are
 * all decided in Rust.
 *
 * Wire vs stored shape: the core speaks `BhistEntry` (`last_visited_ms`), the
 * store holds `BrowserHistoryEntry` (`lastVisited`). Translating between them
 * is this file's job — the stored bytes stay byte-compatible with the
 * TypeScript service so native and web read the same records, and so an
 * existing install's history survives.
 *
 * Failure contract (shared effect loop): nothing rejects. Every rejection is
 * converted into the result variant that operation answers with.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { BhistEntry } from './generated/BhistEntry';
import type { BhistShellResult } from './generated/BhistShellResult';
import type { BhistEffect } from './browser-history-types';

/** Same key `services/browser-history.ts` owns today — the value format is unchanged. */
const HISTORY_KEY = 'vela.browserHistory';

/** The record shape actually on disk (`BrowserHistoryEntry`). */
type StoredEntry = {
  origin: string;
  url: string;
  host: string;
  title: string;
  favicon: string;
  lastVisited: number;
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * Decode one stored record. A codec, not a policy: serde rejects a record whose
 * fields are missing or mistyped, and a rejected `Loaded` would strand the core
 * in `Hydrating` forever, so junk is coerced to the empty/zero value rather
 * than allowed through — the same nothing-useful an entry with `undefined`
 * fields renders as today.
 */
function decodeEntry(raw: unknown): BhistEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const lastVisited = Number(record.lastVisited);
  return {
    origin: asString(record.origin),
    url: asString(record.url),
    host: asString(record.host),
    title: asString(record.title),
    favicon: asString(record.favicon),
    last_visited_ms: Number.isFinite(lastVisited) ? lastVisited : 0,
  };
}

/**
 * `read()`'s body (browser-history.ts:41-49): absent, unparseable or non-array
 * contents all read as an empty list. The list is NOT capped here — the TS
 * `read()` doesn't slice either, so a legacy over-cap store shows in full until
 * the core's next write trims it.
 */
function decodeStored(raw: string | null): BhistEntry[] {
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(decodeEntry).filter((entry): entry is BhistEntry => entry !== null);
}

function encodeEntry(entry: BhistEntry): StoredEntry {
  return {
    origin: entry.origin,
    url: entry.url,
    host: entry.host,
    title: entry.title,
    favicon: entry.favicon,
    lastVisited: entry.last_visited_ms,
  };
}

export async function executeBrowserHistoryOperation(
  effect: BhistEffect,
): Promise<BhistShellResult> {
  const operation = effect.operation;
  switch (operation.type) {
    case 'read_history': {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      return { type: 'loaded', entries: decodeStored(raw) };
    }
    case 'write_history':
      // The core already applied the cap; slicing again here would duplicate a
      // rule that lives in Rust.
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(operation.entries.map(encodeEntry)));
      return { type: 'written' };
    case 'remove_history':
      await AsyncStorage.removeItem(HISTORY_KEY);
      return { type: 'written' };
  }
}

export function browserHistoryOperationFailure(
  effect: BhistEffect,
  _error: unknown,
): BhistShellResult {
  switch (effect.operation.type) {
    case 'read_history':
      // An unreadable/corrupt store reads as "no history" — today's `catch { [] }`.
      return { type: 'loaded', entries: [] };
    case 'write_history':
    case 'remove_history':
      // Best-effort, as the TS `write()`/`clearBrowserHistory()` swallow
      // storage errors today; the in-memory mirror stays authoritative.
      return { type: 'written' };
  }
}
