/**
 * Constructs the `contacts` core and wires it to the web shell (spec 024).
 *
 * Route-scoped factory with `dispose()` (research D8): the address book is
 * the contacts route's concern; when 026's send flow needs recipient
 * suggestions it constructs its own session — the core is cheap, and a
 * global ledger would be state nobody owns. Pattern:
 * `$lib/onboarding/core/sessions.ts`.
 */

import { ContactsCore } from '$lib/core/client';
import { createJsonWasmShell } from '$lib/core/json-shell';
import type { EffectLoop } from '$lib/core/effect-loop';
import type { ContactEvent } from '$lib/core/generated/ContactEvent';
import type { ContactShellResult } from '$lib/core/generated/ContactShellResult';
import type { ContactsView } from '$lib/core/generated/ContactsView';
import { contactOperationFailure, executeContactOperation } from './contacts-executor';
import type { ContactEffect, ContactsSessionOptions } from './contacts-types';

export type ContactsSession = EffectLoop<ContactEvent>;

/** Callers `loadCore()` first (route onMount) — construction is synchronous. */
export function createContactsSession(options: ContactsSessionOptions): ContactsSession {
	return createJsonWasmShell<ContactsView, ContactEvent, ContactEffect, ContactShellResult>(
		new ContactsCore(),
		{
			onView: options.onView,
			execute: executeContactOperation,
			toFailure: contactOperationFailure,
			onError: options.onError
		}
	);
}
