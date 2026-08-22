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
  /** The possession proof collected AT CREATION (interleaved onboarding).
   *  When present the publish replays it — no prompt for this member. */
  proof?: Registry.RegistryProof;
}

export interface PublishArgs {
  rpId: string;
  /** The group's opaque metadata, already `0x`-hex encoded (see
   *  `VelaCore.encodeRegistryMetadata`). */
  metadataHex: string;
  /** The wallet's founding passkeys, in canonical founding order. */
  members: PublishMember[];
  /** The one-time group key minted at onboarding start (interleaved flow).
   *  Omitted ⇒ a fresh key is minted here (the legacy login re-publish).
   *  Member proofs collected at creation are only valid under the SAME
   *  group key, so the pair travels together. */
  seedHex?: string;
  groupPublicKey?: string;
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
  if (!!args.seedHex !== !!args.groupPublicKey) {
    throw new Error('seedHex and groupPublicKey travel together');
  }

  // 1. The one-time group key: echoed from onboarding (interleaved flow —
  //    creation-time member proofs bind to it) or minted fresh here (login
  //    re-publish). Either way the seed stays in the shell.
  let seedHex = args.seedHex;
  let groupPublicKey = args.groupPublicKey;
  if (!seedHex || !groupPublicKey) {
    const seed = new Uint8Array(32);
    crypto.getRandomValues(seed);
    seedHex = VelaCore.toHex(seed);
    groupPublicKey = VelaCore.groupPublicKeyFromSeed(seedHex);
  }

  // 2. Server-derived challenges for the group (and any member still owing a
  //    proof — none in the interleaved flow, every one on the legacy path).
  const challenge = await Registry.requestGroupChallenge({
    rpId,
    metadata: metadataHex,
    groupPublicKey,
    members: members.map((member) => ({
      publicKey: member.publicKeyHex,
      attestation: member.attestationHex,
    })),
  });

  // 3. Replay each member's creation-time proof, or sign live for one that
  //    has none. The member challenge binds only (groupPublicKey, own
  //    attestation), so a proof collected at creation under this group key
  //    is exactly the one the register call needs.
  const memberProofs: Registry.RegistryMember[] = [];
  for (const member of members) {
    let proof = member.proof;
    if (!proof) {
      const derived = challenge.members.find(
        (candidate) => candidate.publicKey.toLowerCase() === member.publicKeyHex.toLowerCase(),
      );
      if (!derived) {
        throw new Error(`registry challenge is missing member ${member.publicKeyHex}`);
      }
      const assertion = await Passkey.sign(stripHex(derived.challenge), member.credentialId);
      proof = VelaCore.buildMemberProof(
        assertion.authenticatorDataHex,
        assertion.clientDataJSONHex,
        assertion.signatureHex,
      );
    }
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
