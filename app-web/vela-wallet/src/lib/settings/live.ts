/**
 * The live settings builders (spec 024, research D7): `NetView` → the same
 * display models the drawn components already consume. Siblings of the
 * fixture builders, never replacements — the galleries keep their canon.
 *
 * Presentation only. Every VALUE here is either the core's or the corpus's;
 * the one judgement this file exercises is wording states the core expresses
 * as data (a probe health, a wizard phase, a refusal) — exactly the job the
 * core's module doc assigns to shells.
 */

import { fill } from '$lib/wallet/messages';
import { shortenAddress } from '$lib/wallet/identity';
import type { NetChainIndexEntry } from '$lib/core/generated/NetChainIndexEntry';
import type { NetNetworkRow } from '$lib/core/generated/NetNetworkRow';
import type { NetProbeHealth } from '$lib/core/generated/NetProbeHealth';
import type { NetServiceHealth } from '$lib/core/generated/NetServiceHealth';
import type { NetView } from '$lib/core/generated/NetView';
import type { NetWizardView } from '$lib/core/generated/NetWizardView';
import type { CurrencyView } from '$lib/core/generated/CurrencyView';
import { chainMeta, markFor } from './fixtures';
import type { SettingsMessages } from './messages';
import type {
	AddNetworkModel,
	SettingsDesktopModel,
	CheckItemModel,
	EndpointsModel,
	NetworkDetailModel,
	NetworkRowModel,
	RpcProvidersModel,
	SettingsHomeModel,
	StatusPillModel,
	UrlFieldModel
} from './model';

// ---------------------------------------------------------------------------
// Badges — the probe/health vocabularies, worded once.
// ---------------------------------------------------------------------------

function latencyLabel(ms: number, m: SettingsMessages): string {
	return ms >= 1000 ? `${m.networks.slow} · ${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

/** A card-field probe badge. `checking` renders quiet (the field itself says). */
function probePill(
	health: NetProbeHealth | null,
	m: SettingsMessages
): StatusPillModel | undefined {
	if (health === null || health.type === 'checking') return undefined;
	if (health.type === 'ok') {
		return {
			tone: health.latency_ms >= 1000 ? 'warn' : 'ok',
			label: latencyLabel(health.latency_ms, m),
			dot: true
		};
	}
	return { tone: 'error', label: m.networks.offline, dot: true };
}

/** A service-endpoint badge — every `NetServiceHealth` variant worded. */
function servicePill(health: NetServiceHealth, m: SettingsMessages): StatusPillModel | undefined {
	switch (health.type) {
		case 'checking':
			return undefined;
		case 'ok':
			return {
				tone: health.latency_ms >= 1000 ? 'warn' : 'ok',
				label: latencyLabel(health.latency_ms, m),
				dot: true
			};
		case 'not_https':
			return { tone: 'error', label: m.networks.httpsRequired, dot: true };
		case 'unreachable':
			return { tone: 'error', label: m.networks.offline, dot: true };
		case 'invalid_response':
			return { tone: 'error', label: m.networks.invalid, dot: true };
	}
}

// ---------------------------------------------------------------------------
// Networks list + detail
// ---------------------------------------------------------------------------

export function liveNetworkRows(
	view: NetView,
	m: SettingsMessages,
	expandedId?: string
): NetworkRowModel[] {
	return view.networks.map((row) => ({
		id: row.id,
		mark: markFor(row.id, row.display_name),
		name: row.display_name,
		meta: chainMeta(m, row.chain_id),
		badge: row.is_custom ? undefined : probePill(row.rpc_health, m),
		tag: row.is_custom ? m.networks.custom : undefined,
		removable: row.is_custom,
		expanded: expandedId === row.id
	}));
}

export function liveNetworkDetail(row: NetNetworkRow, m: SettingsMessages): NetworkDetailModel {
	const mismatch = row.rpc_chain_mismatch;
	const rpc: UrlFieldModel = {
		id: 'rpc',
		label: m.networks.rpcUrl,
		value: row.rpc_url,
		hint: m.networks.saveHint,
		badge: probePill(row.rpc_health, m),
		tone: mismatch !== null ? 'error' : 'default'
	};
	return {
		title: row.display_name,
		subtitle: `${chainMeta(m, row.chain_id)} · ${row.native_symbol}`,
		mark: markFor(row.id, row.display_name),
		name: row.display_name,
		note: row.is_custom ? m.networks.custom : m.networks.builtinNote,
		badge: probePill(row.rpc_health, m) ?? { tone: 'neutral', label: m.networks.online },
		rpc,
		explorer: {
			id: 'explorer',
			label: m.networks.explorer,
			value: row.explorer_url,
			badge: probePill(row.explorer_health, m)
		},
		callout:
			mismatch !== null
				? {
						tone: 'danger',
						text: fill(m.networks.mismatch, {
							reported: mismatch.reported_chain_id,
							expected: mismatch.expected_chain_id
						})
					}
				: undefined
	};
}

// ---------------------------------------------------------------------------
// Add-network wizard
// ---------------------------------------------------------------------------

function suggestionRow(entry: NetChainIndexEntry, m: SettingsMessages): NetworkRowModel {
	return {
		id: String(entry.chain_id),
		mark: markFor('', entry.name),
		name: entry.name,
		meta: chainMeta(m, entry.chain_id)
	};
}

export function liveAddNetwork(wizard: NetWizardView, m: SettingsMessages): AddNetworkModel {
	const base = {
		title: m.advanced.addNetworkTitle,
		subtitle: m.addNetwork.description,
		searchPlaceholder: m.addNetwork.searchPlaceholder
	};

	// Search phases: the list is the whole surface.
	if (wizard.phase === 'idle' || wizard.phase === 'searching' || wizard.phase === 'suggested') {
		return { ...base, results: wizard.suggestions.map((s) => suggestionRow(s, m)) };
	}

	const info = wizard.chain_info;
	const name = info?.name ?? '';
	const meta = info !== null ? chainMeta(m, info.chain_id) : '';
	const mark = markFor('', name);

	// Resolving / checking: a candidate with the neutral "checking" badge.
	if (wizard.phase === 'resolving' || wizard.phase === 'checking') {
		return {
			...base,
			subtitle: info !== null ? `${name} · ${meta}` : m.addNetwork.searching,
			results: [],
			candidate: {
				mark,
				name,
				meta: m.addNetwork.checkingCompatibility,
				badge: { tone: 'neutral', label: m.addNetwork.compatibilityCheck, dot: true }
			}
		};
	}

	if (wizard.phase === 'error') {
		// The wizard stopped. The core says why as data; the words are ours —
		// and inconclusive is NEVER worded as incompatible (invariant ③).
		return {
			...base,
			results: [],
			callout: { tone: 'warning', text: m.addNetwork.incompatibleHint },
			secondary: m.addNetwork.openChainSetupTool,
			recheck: m.addNetwork.recheckWithRpc
		};
	}

	// Checked: a verdict — compatible, incompatible, or unverifiable.
	const compat = wizard.compat;
	const unverified = compat === null || compat.rpc_failure !== null;
	const compatible = compat !== null && compat.compatible && compat.rpc_failure === null;

	const checks: CheckItemModel[] =
		compat === null
			? []
			: [
					...compat.contracts.map((c) => ({ label: c.name, ok: c.deployed })),
					{ label: m.addNetwork.checkSigner, ok: compat.p256_available === true }
				];

	if (compatible) {
		return {
			...base,
			subtitle: `${name} · ${meta}`,
			results: [],
			candidate: {
				mark,
				name,
				meta:
					compat.best_rpc_latency_ms !== null
						? fill(m.addNetwork.bestRpc, { latencyMs: compat.best_rpc_latency_ms })
						: meta,
				badge: { tone: 'ok', label: m.addNetwork.compatible, dot: true }
			},
			checksTitle: m.addNetwork.compatibilityCheck,
			checks,
			customRpc: {
				id: 'custom-rpc',
				label: m.addNetwork.customRpcTitle,
				value: wizard.custom_rpc,
				placeholder: m.addNetwork.customRpcPlaceholder
			},
			primary: m.addNetwork.addNetworkBtn
		};
	}

	if (unverified) {
		return {
			...base,
			subtitle: `${name} · ${meta}`,
			results: [],
			candidate: {
				mark,
				name,
				meta: m.addNetwork.compatibilityCheck,
				badge: { tone: 'warn', label: m.addNetwork.unableToVerify, dot: true }
			},
			customRpc: {
				id: 'custom-rpc',
				label: m.addNetwork.customRpcTitle,
				value: wizard.custom_rpc,
				placeholder: m.addNetwork.customRpcPlaceholder
			},
			primary: m.addNetwork.retry,
			recheck: m.addNetwork.recheckWithRpc
		};
	}

	return {
		...base,
		subtitle: `${name} · ${meta}`,
		results: [],
		candidate: {
			mark,
			name,
			meta: m.addNetwork.compatibilityCheck,
			badge: { tone: 'error', label: m.addNetwork.incompatible, dot: true }
		},
		checksTitle: m.addNetwork.compatibilityCheck,
		checks,
		callout: { tone: 'warning', text: m.addNetwork.incompatibleHint },
		secondary: m.addNetwork.openChainSetupTool,
		recheck: m.addNetwork.recheckWithRpc
	};
}

// ---------------------------------------------------------------------------
// Providers + endpoints
// ---------------------------------------------------------------------------

const PROVIDER_NAMES = { alchemy: 'Alchemy', drpc: 'dRPC', ankr: 'Ankr' } as const;

export function liveRpcProviders(view: NetView, m: SettingsMessages): RpcProvidersModel {
	return {
		title: m.advanced.rpcProvidersTitle,
		subtitle: m.advanced.rpcProvidersSubtitle,
		description: m.rpcProviders.description,
		providers: view.providers.map((p) => {
			const test = p.test;
			return {
				id: p.provider,
				name: PROVIDER_NAMES[p.provider],
				badge: p.has_key
					? { tone: 'ok' as const, label: m.rpcProviders.connected, dot: true }
					: { tone: 'neutral' as const, label: m.rpcProviders.notSet, dot: true },
				field: {
					id: p.provider,
					label: '',
					value: p.key,
					placeholder: p.has_key ? undefined : m.rpcProviders.notSet
				},
				action: p.has_key ? m.rpcProviders.checkKey : m.rpcProviders.getKey,
				support:
					test !== null && test.done
						? fill(m.rpcProviders.supportsCount, { count: test.ok_count, total: test.total })
						: undefined,
				link: p.has_key ? undefined : `${m.rpcProviders.getKey} →`
			};
		})
	};
}

const ENDPOINT_COPY = {
	ethereum_data: { label: 'chainDataLabel', hint: 'chainDataHint' },
	passkey_index: { label: 'passkeyLabel', hint: 'passkeyHint' },
	bundler_service: { label: 'bundlerLabel', hint: 'bundlerHint' },
	fiat_rates: { label: 'fiatLabel', hint: 'fiatHint' }
} as const;

export function liveEndpoints(view: NetView, m: SettingsMessages): EndpointsModel {
	return {
		title: m.advanced.endpointsTitle,
		description: m.endpoints.description,
		fields: view.endpoints.map((e) => {
			const copy = ENDPOINT_COPY[e.field];
			return {
				id: e.field,
				label: m.endpoints[copy.label],
				value: e.value,
				placeholder: e.default_value,
				hint: m.endpoints[copy.hint],
				badge: servicePill(e.health, m)
			};
		}),
		reset: m.endpoints.reset,
		guide: m.endpoints.guide
	};
}

// ---------------------------------------------------------------------------
// The overlay — live sections over a fixture-built page model.
// ---------------------------------------------------------------------------

/**
 * Replace the network-owned sections of a built settings model with the
 * core's view. Identity, appearance, localization, storage and about stay
 * exactly as built — their machines are later features.
 */
export function withLiveNetworks(
	model: SettingsHomeModel,
	view: NetView,
	m: SettingsMessages,
	expandedId?: string
): SettingsHomeModel {
	const expanded = view.networks.find((row) => row.id === expandedId);
	return {
		...model,
		networks: { ...model.networks, rows: liveNetworkRows(view, m, expandedId) },
		networkDetail: expanded !== undefined ? liveNetworkDetail(expanded, m) : model.networkDetail,
		addNetwork: liveAddNetwork(view.wizard, m),
		rpcProviders: liveRpcProviders(view, m),
		endpoints: liveEndpoints(view, m)
	};
}

/** The desktop shape of the same overlay: `detail` rides inside `networks`. */
export function withLiveNetworksDesktop(
	model: SettingsDesktopModel,
	view: NetView,
	m: SettingsMessages,
	expandedId?: string
): SettingsDesktopModel {
	const expanded = view.networks.find((row) => row.id === expandedId);
	return {
		...model,
		networks: {
			...model.networks,
			rows: liveNetworkRows(view, m, expandedId),
			detail: expanded !== undefined ? liveNetworkDetail(expanded, m) : model.networks.detail
		},
		addNetwork: liveAddNetwork(view.wizard, m),
		rpcProviders: liveRpcProviders(view, m),
		endpoints: liveEndpoints(view, m)
	};
}

/**
 * The display-currency overlay (phase 5): the localization row shows the
 * committed code and the sheet marks it selected. The value's sample amount
 * is presentation the fixture already words; with no rate source yet the row
 * shows the code alone — honest, not a mocked conversion.
 */
export function withLiveCurrency(model: SettingsHomeModel, view: CurrencyView): SettingsHomeModel {
	return {
		...model,
		sections: model.sections.map((section) => ({
			...section,
			rows: section.rows.map((row) => (row.id === 'currency' ? { ...row, value: view.code } : row))
		})),
		currencySheet: {
			...model.currencySheet,
			rows: model.currencySheet.rows.map((row) => ({
				...row,
				selected: row.id === view.code
			}))
		}
	};
}

/**
 * The connected sites, in the drawn storage row (spec 027 T350).
 *
 * 023 drew this group with one fixture row — "Connected dApps · 4 sites" and a
 * destructive "Disconnect all". A grant is a standing permission, so a person
 * has to be able to see WHICH sites hold one, not only how many; this fills the
 * same drawn rows with one per site, keeping the group action as the way to cut
 * them all off at once.
 *
 * `id` is the origin, so the row's own `onclear` says exactly which grant to
 * revoke. Off the extension there are no grants and the fixture row stands.
 */
export function withLiveConnections(
	model: SettingsHomeModel,
	grants: { origin: string; address: string }[],
	m: SettingsMessages
): SettingsHomeModel {
	const groups = model.storage.groups.map((group) => {
		if (group.label !== m.storage.connections) return group;
		if (grants.length === 0) {
			return {
				...group,
				items: [
					{
						id: 'dapps',
						label: m.storage.itemDapps,
						meta: fill(m.storage.sitesCount, { count: 0 }),
						action: m.storage.disconnectAll,
						destructive: true
					}
				]
			};
		}
		return {
			...group,
			items: grants.map((grant) => ({
				id: grant.origin,
				label: hostOf(grant.origin),
				meta: shortenAddress(grant.address),
				// Singular: this row cuts off ONE site. Saying "Disconnect all" on
				// a row that disconnects one is the kind of label that gets tapped
				// by someone who meant something else.
				action: m.storage.disconnectOne,
				destructive: true
			}))
		};
	});
	return { ...model, storage: { ...model.storage, groups } };
}

function hostOf(origin: string): string {
	try {
		return new URL(origin).host || origin;
	} catch {
		return origin;
	}
}
