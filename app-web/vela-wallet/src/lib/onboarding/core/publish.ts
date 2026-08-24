/**
 * Possession-proven publish of a wallet's founding key set as one registry
 * group.
 *
 * The mechanism a `registry_publish` operation runs: take (or mint) the
 * one-time software group key, ask the server for the group and member
 * challenges, replay each member's creation-time proof — or sign live for one
 * that has none — build every proof in the Rust core, register, and wait for
 * the task to land.
 *
 * All randomness and all authenticator ceremonies live here in the shell; all
 * byte layout and P-256 math live in the core. This module holds neither.
 */

import { buildGroupProof, buildMemberProof, groupPublicKeyFromSeed, toHex } from './wasm-client';
import * as Registry from './registry';
import * as Passkey from './passkey';
import type { RegistryProof } from '../generated/RegistryProof';
import type { RegistryPublishMember } from '../generated/RegistryPublishMember';

export type PublishArgs = {
	rpId: string;
	/** The group's opaque metadata blob, already hex-encoded by the core. */
	metadataHex: string;
	/** The founding passkeys, in canonical founding order. */
	members: RegistryPublishMember[];
	/** The group key minted at onboarding start. Member proofs collected at
	 *  creation are only valid under the SAME group key, so the pair travels
	 *  together; empty on the login re-publish, which mints a fresh one. */
	seedHex: string;
	groupPublicKeyHex: string;
};

function stripHex(value: string): string {
	return value.startsWith('0x') ? value.slice(2) : value;
}

export async function publish(args: PublishArgs): Promise<void> {
	if (args.members.length === 0) throw new Error('registry publish needs at least one member');

	let seedHex = args.seedHex;
	let groupPublicKey = args.groupPublicKeyHex;
	if (!seedHex || !groupPublicKey) {
		const seed = new Uint8Array(32);
		crypto.getRandomValues(seed);
		seedHex = toHex(seed, false);
		groupPublicKey = groupPublicKeyFromSeed(seedHex);
	}

	const challenge = await Registry.groupChallenge({
		rpId: args.rpId,
		metadata: args.metadataHex,
		groupPublicKey,
		members: args.members.map((member) => ({
			publicKey: member.public_key_hex,
			attestation: member.attestation_hex
		}))
	});

	const proven: (RegistryPublishMember & { proof: RegistryProof })[] = [];
	for (const member of args.members) {
		let proof = member.proof ?? undefined;
		if (!proof) {
			const derived = challenge.members.find(
				(candidate) => candidate.publicKey.toLowerCase() === member.public_key_hex.toLowerCase()
			);
			if (!derived) {
				throw new Error(`registry challenge is missing member ${member.public_key_hex}`);
			}
			const assertion = await Passkey.sign(stripHex(derived.challenge), member.credential_id);
			proof = buildMemberProof(
				assertion.authenticatorDataHex,
				assertion.clientDataJSONHex,
				assertion.signatureHex
			) as RegistryProof;
		}
		proven.push({ ...member, proof });
	}

	// The group key silently closes over the content hash.
	const group = buildGroupProof(seedHex, args.rpId, challenge.groupChallenge.challenge) as {
		proof: RegistryProof;
	};

	const accepted = await Registry.registerGroup({
		rpId: args.rpId,
		metadata: args.metadataHex,
		groupPublicKey,
		groupProof: group.proof,
		members: proven
	});

	// `done` up front means the identical group was already on-chain —
	// idempotent by content hash, and just as landed as a fresh one.
	if (accepted.status === 'done') return;
	if (!accepted.id) throw new Error('register was accepted without a task id');
	await Registry.awaitTask(accepted.id);
}
