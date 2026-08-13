/**
 * Constructs the `contacts` core and wires it to the web shell — WEB entry.
 *
 * Importing `@/services/vela-core` first is load-bearing: its web entry runs
 * `initSync` at import time, so the wasm is
 * initialised before the core is constructed here. (Metro resolves that facade
 * to `index.ts` in this bundle.)
 */

import '@/services/vela-core';
import { ContactsCore } from '../../../rust/pkg-web/vela_core.js';

import { createJsonWasmShell } from '@/services/crux/json-wasm-shell';
import type { EffectLoop } from '@/services/crux/effect-loop';

import {
  contactOperationFailure,
  executeContactOperation,
} from '@/services/wallet-state-core/contacts-executor';
import type { ContactEvent } from './generated/ContactEvent';
import type { ContactShellResult } from './generated/ContactShellResult';
import type { ContactsView } from './generated/ContactsView';
import type { ContactEffect, ContactsSessionOptions } from './contacts-types';

export type ContactsSession = EffectLoop<ContactEvent>;

export function createContactsSession(options: ContactsSessionOptions): ContactsSession {
  return createJsonWasmShell<ContactsView, ContactEvent, ContactEffect, ContactShellResult>(
    new ContactsCore(),
    {
      onView: options.onView,
      execute: executeContactOperation,
      toFailure: contactOperationFailure,
      onError: options.onError,
    },
  );
}
