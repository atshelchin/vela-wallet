/**
 * The `contacts` core session — NATIVE entry point, and deliberately
 * unavailable.
 *
 * React Native runs on Hermes, which has no WebAssembly, so the address-book
 * machine cannot execute on iOS or Android. The mobile app keeps its TypeScript
 * implementation (`services/contacts.ts` + `services/contact-io.ts`, driven by
 * `hooks/use-contacts-book.ts`) and never imports this module at runtime.
 *
 * It exists so the platform pair resolves: `tsc` has no `moduleSuffixes`
 * configured, so it type-checks `.web.ts` files but resolves *their* imports to
 * the base `.ts` variant. Same shape as `session.ts` (spec 016).
 */

import type { EffectLoop } from '@/services/crux/effect-loop';
import type { ContactEvent } from './generated/ContactEvent';
import type { ContactsSessionOptions } from './contacts-types';

export type ContactsSession = EffectLoop<ContactEvent>;

const UNAVAILABLE =
  'wallet-state-core is web-only: this runtime has no WebAssembly. Native uses the TypeScript controllers.';

export function createContactsSession(_options: ContactsSessionOptions): ContactsSession {
  throw new Error(UNAVAILABLE);
}
