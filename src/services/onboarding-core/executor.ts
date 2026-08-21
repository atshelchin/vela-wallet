/**
 * The only place onboarding touches the outside world.
 *
 * Each `ShellOperation` the core declares maps to exactly one existing service
 * call — passkey ceremonies, storage, the public-key index, timers, alerts.
 * There is no branching on business meaning here: if this file ever grows an
 * `if` that decides what happens next, that decision belongs in the Rust
 * machine instead.
 *
 * Failure contract: nothing rejects into the effect loop. Every rejection is
 * converted into the result variant that operation answers with, so the core
 * keeps ownership of classification (FR-022).
 */

import { toHex } from '@/services/vela-core';
import * as Passkey from '@/modules/passkey';
import { PasskeyError, PasskeyErrorCode } from '@/modules/passkey';
import * as Registry from '@/services/public-key-registry';
import { publishToRegistry } from '@/services/registry-publish';
import {
  loadAccounts,
  loadServiceEndpoints,
  removePendingUpload,
  saveAccount,
  savePendingUpload,
} from '@/services/storage';
import { isTimeoutError } from '@/services/net';
import { showAlert } from '@/services/platform';
import { DEFAULT_SERVICE_ENDPOINTS } from '@/models/types';
import type { StoredAccount } from '@/models/types';

import type { Account } from './generated/Account';
import type { ShellOperation } from './generated/ShellOperation';
import type { ShellResult } from './generated/ShellResult';
import { promptCopy, type Translate } from './copy';
import type { OnboardingEffect, OnboardingExecutorDeps } from './types';

// ---------------------------------------------------------------------------
// Account mapping
// ---------------------------------------------------------------------------

function toStoredAccount(account: Account): StoredAccount {
  return {
    id: account.id,
    name: account.name,
    address: account.address,
    publicKeyHex: account.public_key_hex,
    createdAt: account.created_at_iso,
    keys: (account.keys ?? []).map((key) => ({
      credentialId: key.credential_id,
      publicKeyHex: key.public_key_hex,
      name: key.name,
    })),
  };
}

export function fromStoredAccount(account: StoredAccount): Account {
  return {
    id: account.id,
    name: account.name,
    address: account.address,
    public_key_hex: account.publicKeyHex,
    created_at_iso: account.createdAt,
    // Legacy records have no keys array; the core's serde default tolerates
    // an empty one and treats the scalar fields as the sole key.
    keys: (account.keys ?? []).map((key) => ({
      credential_id: key.credentialId,
      public_key_hex: key.publicKeyHex,
      name: key.name,
    })),
  };
}

// ---------------------------------------------------------------------------
// Failure classification the shell alone can make
// ---------------------------------------------------------------------------

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Did the request reach the server at all?
 *
 * Only the shell can tell a transport failure from a server-side rejection, so
 * this one bit is delegated. The index client throws `"Query failed: <status>"`
 * / `"Create failed: <status> …"` when the server answered — anything else
 * (timeout, DNS, offline, CORS) never got there.
 */
function isTransportFailure(error: unknown): boolean {
  if (isTimeoutError(error)) return true;
  return !/^(Query|Create) failed:/.test(message(error));
}

function passkeyFailure(error: unknown): ShellResult {
  if (error instanceof PasskeyError) {
    switch (error.code) {
      case PasskeyErrorCode.CANCELLED:
        return { type: 'passkey_failed', kind: 'cancelled', message: null };
      case PasskeyErrorCode.NOT_SUPPORTED:
      case PasskeyErrorCode.NOT_AVAILABLE:
        return { type: 'passkey_failed', kind: 'not_supported', message: null };
      case PasskeyErrorCode.NOT_DISCOVERABLE:
        return { type: 'passkey_failed', kind: 'not_discoverable', message: null };
      default:
        break;
    }
  }
  return { type: 'passkey_failed', kind: 'other', message: message(error) };
}

/**
 * Turn a thrown error into the answer this operation owes the core.
 * Exported because the effect loop needs it as `toFailure`.
 */
export function operationFailure(effect: OnboardingEffect, error: unknown): ShellResult {
  switch (effect.operation.type) {
    case 'check_passkey_support':
    case 'register_passkey':
    case 'sign_proof':
    case 'authenticate_passkey':
      return passkeyFailure(error);

    case 'load_accounts':
    case 'save_account':
    case 'save_pending_upload':
    case 'remove_pending_upload':
      return { type: 'storage_failed', message: message(error) };

    case 'registry_publish':
    case 'registry_query_by_public_key':
    case 'registry_query_unit':
      return {
        type: 'index_failed',
        message: message(error),
        network: isTransportFailure(error),
      };

    case 'probe_index_health':
      return { type: 'index_health', ok: false };

    // A timer that failed is still a timer that elapsed; the core only wants to
    // know it may proceed.
    case 'wait':
      return { type: 'waited' };

    // An alert that could not be shown is treated as dismissed without consent —
    // the safe answer for the one prompt whose answer matters.
    case 'prompt':
      return { type: 'prompt_answered', accepted: false };

    // Handover is a context dispatch and a navigation; there is nothing the core
    // could do about a failure, and reporting one would strand the user on a
    // success screen. Log and let it settle.
    case 'complete_onboarding':
      console.error('[onboarding] completion failed:', error);
      return { type: 'onboarding_completed' };
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/** Unchanged from the previous implementation: uniqueness only, never secrecy. */
function challengeFor(purpose: 'verify' | 'recover_first' | 'recover_second'): string {
  const label = purpose === 'verify' ? 'vela-verify-' : 'vela-recover-';
  return toHex(new TextEncoder().encode(label + Date.now()));
}

/** Same probe the onboarding screen used to run inline. */
async function probeIndexHealth(signal: AbortSignal): Promise<boolean> {
  const endpoints = await loadServiceEndpoints();
  const url = endpoints.passkeyIndexURL || DEFAULT_SERVICE_ENDPOINTS.passkeyIndexURL;
  const base = url.trim().replace(/\/$/, '');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort);
  try {
    const response = await fetch(`${base}/api/health?_t=${Date.now()}`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const json = await response.json();
    return Registry.isRegistryServiceIdentity(json.service) && json.status === 'ok';
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish);
  });
}

/**
 * Show an alert and report what the user did. A plain notice resolves at once —
 * matching today's fire-and-forget `showAlert` — while a confirmable one waits,
 * because its answer is a business decision.
 */
function prompt(
  operation: Extract<ShellOperation, { type: 'prompt' }>,
  t: Translate,
): Promise<boolean> {
  const copy = promptCopy(operation.kind, t);
  const confirm = copy.confirm;
  if (!operation.confirmable || !confirm) {
    showAlert(copy.title, copy.message);
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let answered = false;
    const answer = (accepted: boolean) => {
      if (answered) return;
      answered = true;
      resolve(accepted);
    };
    showAlert(copy.title, copy.message, [
      { text: confirm.cancelLabel, style: 'cancel', onPress: () => answer(false) },
      { text: confirm.confirmLabel, onPress: () => answer(true) },
    ]);
  });
}

export function createOnboardingExecutor(deps: OnboardingExecutorDeps) {
  return async function execute(
    effect: OnboardingEffect,
    signal: AbortSignal,
  ): Promise<ShellResult> {
    const operation = effect.operation;
    const nowIso = () => new Date().toISOString();

    switch (operation.type) {
      case 'check_passkey_support':
        return { type: 'passkey_support', supported: await Passkey.isSupported() };

      case 'register_passkey': {
        const registration = await Passkey.register(operation.name, operation.exclude_credential_ids);
        return {
          type: 'passkey_registered',
          registration: {
            credential_id: registration.credentialId,
            attestation_object_hex: registration.attestationObjectHex,
            client_data_json_hex: registration.clientDataJSONHex,
            authenticator_attachment: registration.authenticatorAttachment,
            transports: registration.transports,
          },
          now_iso: nowIso(),
        };
      }

      case 'sign_proof': {
        const assertion = await Passkey.sign(
          challengeFor(operation.purpose),
          operation.credential_id,
        );
        return {
          type: 'proof_signed',
          assertion: {
            credential_id: assertion.credentialId,
            signature_der_hex: assertion.signatureHex,
            authenticator_data_hex: assertion.authenticatorDataHex,
            client_data_json_hex: assertion.clientDataJSONHex,
            user_id_hex: assertion.userIdHex ?? null,
            authenticator_attachment: assertion.authenticatorAttachment,
          },
          now_iso: nowIso(),
        };
      }

      case 'authenticate_passkey': {
        const assertion = await Passkey.authenticate();
        return {
          type: 'passkey_authenticated',
          assertion: {
            credential_id: assertion.credentialId,
            signature_der_hex: assertion.signatureHex,
            authenticator_data_hex: assertion.authenticatorDataHex,
            client_data_json_hex: assertion.clientDataJSONHex,
            user_id_hex: assertion.userIdHex ?? null,
            authenticator_attachment: assertion.authenticatorAttachment,
          },
          now_iso: nowIso(),
        };
      }

      case 'load_accounts':
        return { type: 'accounts_loaded', accounts: (await loadAccounts()).map(fromStoredAccount) };

      case 'save_account':
        await saveAccount(toStoredAccount(operation.account));
        return { type: 'account_saved' };

      case 'save_pending_upload':
        await savePendingUpload({
          id: operation.record.id,
          name: operation.record.name,
          publicKeyHex: operation.record.public_key_hex,
          attestationObjectHex: operation.record.attestation_object_hex,
          createdAt: operation.record.created_at_iso,
          authenticatorAttachment: operation.record.authenticator_attachment,
          transports: operation.record.transports,
          members: (operation.record.members ?? []).map((member) => ({
            credentialId: member.credential_id,
            name: member.name,
            publicKeyHex: member.public_key_hex,
            attestationObjectHex: member.attestation_object_hex,
            authenticatorAttachment: member.authenticator_attachment,
            transports: member.transports,
          })),
        });
        return { type: 'pending_upload_saved' };

      case 'remove_pending_upload':
        await removePendingUpload(operation.credential_id);
        return { type: 'pending_upload_removed' };

      case 'registry_publish': {
        // The whole possession-proven publish — one-time group key, server
        // challenges, per-member signatures, proofs, register and poll.
        await publishToRegistry({
          rpId: Passkey.getRelyingPartyId(),
          metadataHex: operation.metadata_hex,
          members: operation.members.map((member) => ({
            credentialId: member.credential_id,
            publicKeyHex: member.public_key_hex,
            attestationHex: member.attestation_hex,
            authenticatorAttachment: member.authenticator_attachment,
            transports: member.transports,
          })),
        });
        return { type: 'registry_published' };
      }

      case 'registry_query_by_public_key': {
        const profile = await Registry.queryByPublicKey(operation.public_key_hex);
        // The core speaks u32 unit ids (JSON numbers); an id past 2^32 would
        // truncate, so it fails the query instead — see the shell contract.
        const unitIds = profile.groups?.unitIds ?? [];
        if (unitIds.some((id) => !Number.isInteger(id) || id < 0 || id >= 2 ** 32)) {
          throw new Error(`Query failed: unit id out of u32 range in ${JSON.stringify(unitIds)}`);
        }
        return {
          type: 'registry_key_status',
          registered: profile.entry !== null,
          unit_ids: unitIds,
        };
      }

      case 'registry_query_unit': {
        const detail = await Registry.queryUnit(operation.unit_id);
        return {
          type: 'registry_unit',
          metadata_hex: detail.unit.metadata,
          members: detail.members.items.map((member) => ({
            credential_id: member.credentialId,
            public_key_hex: member.publicKey,
            authenticator_attachment: member.authenticatorAttachment ?? '',
            transports: member.transports ?? '',
          })),
        };
      }

      case 'probe_index_health':
        return { type: 'index_health', ok: await probeIndexHealth(signal) };

      case 'wait':
        await wait(Number(operation.ms), signal);
        return { type: 'waited' };

      case 'prompt':
        return { type: 'prompt_answered', accepted: await prompt(operation, deps.t) };

      case 'complete_onboarding':
        await deps.complete(operation.mode);
        return { type: 'onboarding_completed' };
    }
  };
}
