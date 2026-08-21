/**
 * Possession-proven publish of a wallet's key set as one p256-index group.
 *
 * The mechanism the onboarding shell runs for a `RegistryPublish` operation:
 * generate a one-time software "group key", ask the server for the group and
 * member challenges, have each member passkey sign its own challenge, build
 * every proof in the Rust core, then register and wait for the task to land.
 *
 * All randomness (the group-key seed) and all authenticator ceremonies live
 * here in the shell; all byte layout and P-256 math live in the core. This
 * module holds neither.
 */

import * as Registry from './public-key-registry';
import * as VelaCore from './vela-core';
import * as Passkey from '@/modules/passkey';

/** One member passkey to include in the group. */
export interface PublishMember {
  credentialId: string;
  /** Uncompressed P-256 point, `04‖x‖y` hex. */
  publicKeyHex: string;
  /** Empty, or 20 versioned attestation bytes (hex). */
  attestationHex?: string;
  /** PublicKeyCredential response hints, stored on the entry for display
   *  (not signed): the `authenticatorAttachment` token and the comma-joined
   *  transports list. */
  authenticatorAttachment?: string;
  transports?: string;
}

export interface PublishArgs {
  rpId: string;
  /** The group's opaque metadata, already `0x`-hex encoded (see
   *  `VelaCore.encodeRegistryMetadata`). */
  metadataHex: string;
  /** The wallet's founding passkeys, in canonical founding order. */
  members: PublishMember[];
}

export interface PublishResult {
  /** The confirmed unit id, or null when the identical group was already
   *  on-chain (idempotent resubmission). */
  onChainId: number | null;
}

function stripHex(value: string): string {
  return value.startsWith('0x') ? value.slice(2) : value;
}

/**
 * Run the full publish. Throws on any failure; the caller decides whether a
 * failure blocks (it does not — a wallet stays reachable) or defers to a
 * pending retry.
 */
export async function publishToRegistry(args: PublishArgs): Promise<PublishResult> {
  const { rpId, metadataHex, members } = args;
  if (members.length === 0) throw new Error('registry publish needs at least one member');

  // 1. One-time group key — the only randomness, and it stays in the shell.
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  const seedHex = VelaCore.toHex(seed);
  const groupPublicKey = VelaCore.groupPublicKeyFromSeed(seedHex);

  // 2. Server-derived challenges for the group and every member.
  const challenge = await Registry.requestGroupChallenge({
    rpId,
    metadata: metadataHex,
    groupPublicKey,
    members: members.map((member) => ({
      publicKey: member.publicKeyHex,
      attestation: member.attestationHex,
    })),
  });

  // 3. Each member signs its own challenge; the core assembles the proof from
  //    the real assertion.
  const memberProofs: Registry.RegistryMember[] = [];
  for (const member of members) {
    const derived = challenge.members.find(
      (candidate) => candidate.publicKey.toLowerCase() === member.publicKeyHex.toLowerCase(),
    );
    if (!derived) {
      throw new Error(`registry challenge is missing member ${member.publicKeyHex}`);
    }
    const assertion = await Passkey.sign(stripHex(derived.challenge), member.credentialId);
    const proof = VelaCore.buildMemberProof(
      assertion.authenticatorDataHex,
      assertion.clientDataJSONHex,
      assertion.signatureHex,
    );
    memberProofs.push({
      publicKey: member.publicKeyHex,
      attestation: member.attestationHex,
      credentialId: member.credentialId,
      authenticatorAttachment: member.authenticatorAttachment,
      transports: member.transports,
      proof,
    });
  }

  // 4. The group key silently closes over the content hash.
  const group = VelaCore.buildGroupProof(seedHex, rpId, challenge.groupChallenge.challenge);

  // 5. Register, then wait for the task to land on-chain.
  const accepted = await Registry.register({
    rpId,
    metadata: metadataHex,
    groupPublicKey,
    groupProof: group.proof,
    members: memberProofs,
  });
  if (accepted.status === 'done') {
    // The identical group was already on-chain (idempotent by content hash).
    return { onChainId: null };
  }
  if (!accepted.id) {
    throw new Error('register was accepted without a task id');
  }
  const task = await Registry.pollTask(accepted.id);
  if (task.status !== 'done') {
    throw new Error(`register task ${accepted.id} ${task.status}: ${task.error ?? 'no detail'}`);
  }
  return { onChainId: task.onChainId ?? null };
}
