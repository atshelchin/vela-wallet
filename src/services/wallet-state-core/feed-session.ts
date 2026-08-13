/**
 * Constructs the `activity_feed` core and wires it to the web shell — WEB entry
 * (spec 017, `rust/crates/vela-core/src/app/activity_feed.rs`).
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` on the fetched module at import time, so the wasm is initialised
 * before the core is constructed here.
 *
 * `feed-session.ts` is the native counterpart and throws.
 */

import '@/services/vela-core';
import { ActivityFeedCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import { createFeedExecutor } from '@/services/wallet-state-core/feed-executor';
import type { FeedEvent } from './generated/FeedEvent';
import type { FeedShellResult } from './generated/FeedShellResult';
import type { FeedView } from './generated/FeedView';
import type { FeedEffect, FeedSessionOptions } from './feed-types';

export type ActivityFeedSession = EffectLoop<FeedEvent>;

export function createActivityFeedSession(options: FeedSessionOptions): ActivityFeedSession {
  const executor = createFeedExecutor(options.ownAccounts, options.records);
  return createJsonWasmShell<FeedView, FeedEvent, FeedEffect, FeedShellResult>(
    new ActivityFeedCore(),
    {
      onView: options.onView,
      execute: (effect, signal) => executor.execute(effect, signal),
      toFailure: (effect, error) => executor.toFailure(effect, error),
      onError: options.onError,
    },
  );
}
