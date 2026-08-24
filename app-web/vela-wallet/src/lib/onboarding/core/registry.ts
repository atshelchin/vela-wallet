/**
 * The public-key registry, over HTTP.
 *
 * Ported from `src/services/public-key-registry.ts` and
 * `src/services/registry-publish.ts` in the Expo client, narrowed to the six
 * operations the onboarding machines actually ask for.
 *
 * Nothing here decides anything. The one judgement it makes is the `network`
 * bit on a failure — whether the request reached the server at all — because
 * that is the single fact only a shell can know, and the core needs it to tell
 * "the service said no" from "the service was not there".
 */

import type { RegistryProof } from '../generated/RegistryProof';
import type { RegistryPublishMember } from '../generated/RegistryPublishMember';
import type { RegistryUnitMember } from '../generated/RegistryUnitMember';

/** The v2 registry. Overridable so a self-hosted stack is a setting, not a fork. */
export const DEFAULT_REGISTRY_URL = 'https://p256-index-v2.getvela.app';

/** The health identities this endpoint accepts — the legacy index and the v2
 *  registry, so a wallet can point at either during the migration. */
const SERVICE_IDENTITIES = ['webauthn-p256-publickey-registry', 'webauthn-p256-publickey-index'];

const READ_TIMEOUT_MS = 15_000;
const WRITE_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

/**
 * A request that never reached the server, as opposed to one the server
 * refused. The core branches on this: an unreachable index is a transient
 * condition the person can fix by pointing somewhere else, while a 4xx is an
 * answer.
 */
export class RegistryError extends Error {
	readonly network: boolean;
	constructor(message: string, network: boolean) {
		super(message);
		this.name = 'RegistryError';
		this.network = network;
	}
}

export type ChallengeValue = { challenge: string; challengeBase64url: string };

export type GroupChallenge = {
	contentHash: string;
	groupChallenge: ChallengeValue;
	members: (ChallengeValue & { publicKey: string })[];
};

export type KeyStatus = { registered: boolean; unitIds: number[] };

export type UnitDetail = { metadataHex: string; members: RegistryUnitMember[] };

/** A vela wallet's founding set is capped at 7 keys; a larger group is not
 *  ours and must never be reconstructed into an account. */
const MAX_UNIT_MEMBERS = 7;

let baseUrl = DEFAULT_REGISTRY_URL;

export function setRegistryUrl(url: string): void {
	baseUrl =
		url
			.trim()
			.replace(/[\r\n]/g, '')
			.replace(/\/$/, '') || DEFAULT_REGISTRY_URL;
}

export function registryUrl(): string {
	return baseUrl;
}

async function request<T>(
	path: string,
	init: RequestInit,
	timeoutMs: number,
	label: string
): Promise<T> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	let response: Response;
	try {
		response = await fetch(`${baseUrl}${path}`, { ...init, signal: controller.signal });
	} catch (error) {
		// Transport failure or abort: the request never arrived.
		throw new RegistryError(`${label} failed: ${describe(error)}`, true);
	} finally {
		clearTimeout(timer);
	}
	if (!response.ok) {
		// The server answered — a refusal is an answer.
		throw new RegistryError(`${label} failed: ${response.status}`, false);
	}
	return (await response.json()) as T;
}

function postJson<T>(path: string, body: unknown, timeoutMs: number, label: string): Promise<T> {
	return request<T>(
		path,
		{ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
		timeoutMs,
		label
	);
}

/** MEMBER-mode challenge: one founding passkey confirming AT CREATION. Binds
 *  only (groupPublicKey, own attestation), so it exists before the rest of the
 *  set does — which is what makes the interleaved create→confirm flow work. */
export function memberChallenge(body: {
	rpId: string;
	groupPublicKey: string;
	publicKey: string;
	attestation?: string;
}): Promise<ChallengeValue> {
	return postJson('/api/challenge', body, READ_TIMEOUT_MS, 'Challenge');
}

/** GROUP-mode challenge: closing the group at publish. */
export function groupChallenge(body: {
	rpId: string;
	metadata?: string;
	groupPublicKey: string;
	members: { publicKey: string; attestation?: string }[];
}): Promise<GroupChallenge> {
	return postJson('/api/challenge', body, READ_TIMEOUT_MS, 'Challenge');
}

export function registerGroup(body: {
	rpId: string;
	metadata?: string;
	groupPublicKey: string;
	groupProof: RegistryProof;
	members: RegistryPublishMember[];
}): Promise<{ id?: string; status: string; contentHash?: string }> {
	return postJson('/api/register', body, WRITE_TIMEOUT_MS, 'Register');
}

type TaskStatus = { id: string; status: 'pending' | 'done' | 'failed'; error?: string | null };

/** Poll until terminal. A transient read failure is retried until the budget
 *  runs out — the task is already accepted, so giving up on one bad read would
 *  report a failure that did not happen. */
export async function awaitTask(id: string): Promise<void> {
	const deadline = Date.now() + POLL_TIMEOUT_MS;
	let lastError: unknown = null;
	while (Date.now() < deadline) {
		try {
			const task = await request<TaskStatus>(
				`/api/task/${encodeURIComponent(id)}`,
				{},
				READ_TIMEOUT_MS,
				'Task status'
			);
			if (task.status === 'done') return;
			if (task.status === 'failed') {
				throw new RegistryError(`Register failed: ${task.error ?? 'unknown'}`, false);
			}
		} catch (error) {
			if (error instanceof RegistryError && !error.network) throw error;
			lastError = error;
		}
		await sleep(POLL_INTERVAL_MS);
	}
	throw new RegistryError(
		`Register timed out after ${POLL_TIMEOUT_MS / 1000}s${lastError ? `: ${describe(lastError)}` : ''}`,
		true
	);
}

type KeyProfile = {
	entry: { publicKey: string } | null;
	groups?: { total: number; unitIds: number[] };
};

type UnitMember = {
	publicKey: string;
	credentialId: string;
	authenticatorAttachment?: string;
	transports?: string;
};

type UnitResponse = {
	unit: { metadata: string };
	members?: { total: number; items: UnitMember[] };
};

/** `/api/query?publicKey=` — is this key registered, and which groups does it
 *  found? */
export async function queryByPublicKey(publicKey: string): Promise<KeyStatus> {
	const profile = await request<KeyProfile>(
		`/api/query?publicKey=${encodeURIComponent(publicKey)}`,
		{},
		READ_TIMEOUT_MS,
		'Query'
	);
	const unitIds = profile.groups?.unitIds ?? [];
	// The core speaks u32 unit ids because the wire is JSON. An id past 2^32
	// would truncate into a DIFFERENT group, so this fails the query instead of
	// quietly fetching the wrong founding set.
	if (unitIds.some((id) => !Number.isInteger(id) || id < 0 || id >= 2 ** 32)) {
		throw new RegistryError(
			`Query failed: unit id out of u32 range in ${JSON.stringify(unitIds)}`,
			false
		);
	}
	return { registered: profile.entry !== null, unitIds };
}

/**
 * `/api/query?unitId=` — the group's frozen metadata and ALL its founding
 * members in ascending order, which IS the canonical founding order the Safe
 * address derivation pins.
 *
 * Both guards refuse rather than degrade: a group larger than a wallet's cap is
 * not ours, and a partial page would rebuild the address from a SUBSET of the
 * founding set — a different, wrong, fundable address.
 */
export async function queryUnit(unitId: number): Promise<UnitDetail> {
	const detail = await request<UnitResponse>(
		`/api/query?unitId=${encodeURIComponent(unitId)}&pageSize=${MAX_UNIT_MEMBERS}&order=asc`,
		{},
		READ_TIMEOUT_MS,
		'Query'
	);
	const total = detail.members?.total ?? 0;
	const items = detail.members?.items ?? [];
	if (total > MAX_UNIT_MEMBERS) {
		throw new RegistryError(
			`Query failed: unit ${unitId} has ${total} members (cap ${MAX_UNIT_MEMBERS})`,
			false
		);
	}
	if (items.length !== total) {
		throw new RegistryError(
			`Query failed: unit ${unitId} page holds ${items.length} of ${total} members`,
			false
		);
	}
	return {
		metadataHex: detail.unit.metadata,
		members: items.map((member) => ({
			credential_id: member.credentialId,
			public_key_hex: member.publicKey,
			authenticator_attachment: member.authenticatorAttachment ?? '',
			transports: member.transports ?? ''
		}))
	};
}

/** One health probe. Never throws: the core asks a yes/no question. */
export async function probeHealth(): Promise<boolean> {
	try {
		const health = await request<{ service?: string; status?: string }>(
			`/api/health?_t=${Date.now()}`,
			{},
			READ_TIMEOUT_MS,
			'Health'
		);
		return SERVICE_IDENTITIES.includes(health.service ?? '') && health.status === 'ok';
	} catch {
		return false;
	}
}

/** The v1 index's display name for a credential — the only place a v1-era
 *  wallet's name survives. Best-effort and read-only; a lost name degrades the
 *  label, never the flow. */
export async function legacyName(credentialId: string): Promise<string | null> {
	try {
		const record = await request<{ name?: string }>(
			`/api/query?credentialId=${encodeURIComponent(credentialId)}`,
			{},
			READ_TIMEOUT_MS,
			'Legacy name'
		);
		return record.name?.trim() || null;
	} catch {
		return null;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function describe(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}
