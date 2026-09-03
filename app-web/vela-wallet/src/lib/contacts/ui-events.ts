/**
 * The contacts screens' UI-event vocabulary (spec 024) — the contacts
 * sibling of settings' `net-events.ts`. One union, one optional callback:
 * absent = the gallery's pure picture; present = the route translates each
 * variant into core events. No variant decides anything.
 */

export type ContactsUiEvent =
	| { kind: 'tab'; id: 'wallet' | 'contacts' | 'explore' | 'settings' }
	| { kind: 'query'; value: string }
	| { kind: 'add' }
	| { kind: 'open'; address: string }
	| { kind: 'back' }
	| { kind: 'edit' }
	| { kind: 'delete'; address: string }
	| { kind: 'group-open'; id: string }
	| { kind: 'group-new' }
	| { kind: 'add-member' }
	| { kind: 'empty-primary' }
	| { kind: 'empty-secondary' }
	/** A row in the open action/confirm sheet, by its label (the sheet is data). */
	| { kind: 'sheet-select'; label: string }
	| { kind: 'sheet-close' };

export type OnContactsUiEvent = (event: ContactsUiEvent) => void;
