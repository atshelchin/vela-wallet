/**
 * Create-wallet controller — NATIVE (iOS/Android).
 *
 * This is the previous `CreateWalletScreen` logic, moved out of the component
 * unchanged. React Native runs on Hermes, which has no WebAssembly, so mobile
 * cannot execute the portable state machine that now drives web
 * (`use-create-wallet.web.ts`). Until the native apps adopt the shared core
 * through their own bindings, this is the second implementation of the same
 * rules — see `specs/011-crux-onboarding-state/research.md` D10/D11.
 *
 * Do not "improve" the rules here in isolation. Any change to what the flow
 * decides belongs in `rust/crates/vela-core/src/app/create_wallet.rs` first, and
 * then here, or the two platforms drift.
 */

import { computeAddress, extractPublicKey, fromHex, toHex, verifySafeWebAuthn } from '@/services/vela-core';
import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useWallet } from '@/models/wallet-state';
import { saveAccount, savePendingUpload } from '@/services/storage';
import * as Passkey from '@/modules/passkey';
import { PasskeyError, PasskeyErrorCode } from '@/modules/passkey';
import { uploadPublicKey } from '@/services/public-key-upload';
import { showAlert } from '@/services/platform';
import type { StoredAccount } from '@/models/types';

import type { StatusI18nKey } from '@/services/onboarding-core/copy';
import type {
  CreateWalletController,
  CreateWalletControllerOptions,
} from './onboarding-controller-types';

const ACK_COUNT = 4;

export function useCreateWallet(
  options: CreateWalletControllerOptions = {},
): CreateWalletController {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [checks, setChecks] = useState<boolean[]>(() => Array(ACK_COUNT).fill(false));
  const [loading, setLoading] = useState(false);
  const [statusKey, setStatusKey] = useState<StatusI18nKey | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [created, setCreated] = useState(false);
  // A passkey that registered OK but hasn't proven it can sign yet. Kept in
  // state so a cancelled verification can resume (re-sign only) without
  // minting a second passkey, and so the button label reflects the resume.
  const [pendingReg, setPendingReg] = useState<{
    registration: Passkey.PasskeyRegistrationResult;
    name: string;
  } | null>(null);

  // WebAuthn user.id caps at 64 bytes; the UTF-8 name gets 27 of them (see
  // MAX_USER_NAME_BYTES). Validate live — without this, a long (esp. CJK)
  // name only fails deep inside the passkey ceremony with a cryptic
  // "User handle exceeds 64 bytes."
  const nameTooLong =
    new TextEncoder().encode(name.trim()).length > Passkey.MAX_USER_NAME_BYTES;

  const pendingRef = useRef<{
    account: StoredAccount;
    credentialId: string;
    publicKeyHex: string;
    name: string;
  } | null>(null);
  const { dispatch } = useWallet();
  const router = useRouter();

  async function tryUpload(params: {
    credentialId: string;
    publicKeyHex: string;
    name: string;
  }): Promise<boolean> {
    // Auto-retry transient sync failures. The index server's on-chain queue can
    // briefly fail (e.g. a 5xx under load); a quick retry almost always succeeds.
    // uploadPublicKey is idempotent — createRecord dedupes server-side and the
    // pending record is only cleared on success — so re-running it is safe.
    const maxAttempts = 3;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        setStatusKey('onboarding.create.statusSyncingKey');
        await uploadPublicKey(params);
        return true;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt)); // 1s, then 2s
        }
      }
    }
    setUploadError(lastErr instanceof Error ? lastErr.message : String(lastErr));
    return false;
  }

  async function handleCreate() {
    const trimmed = pendingReg?.name ?? name.trim();
    if (!trimmed || loading) return;
    if (!pendingReg && nameTooLong) return; // resumed names were validated at registration
    setLoading(true);
    setStatusKey(null);
    setUploadFailed(false);
    setUploadError('');

    // ------------------------------------------------------------------
    // Stage 1 — register the passkey (skipped when resuming a cancelled
    // verification, so we never mint a second passkey for the same wallet).
    // ------------------------------------------------------------------
    let registration = pendingReg?.registration ?? null;
    if (!registration) {
      try {
        const supported = await Passkey.isSupported();
        if (!supported) {
          showAlert(t('onboarding.create.alertNotSupportedTitle'), t('onboarding.create.alertNotSupportedBody'));
          setLoading(false);
          return;
        }

        setStatusKey('onboarding.create.statusSettingUpIdentity');
        registration = await Passkey.register(trimmed);
        setPendingReg({ registration, name: trimmed });
      } catch (error) {
        if (error instanceof PasskeyError && error.code === PasskeyErrorCode.CANCELLED) {
          setStatusKey('onboarding.create.statusSetupCancelled');
        } else if (error instanceof PasskeyError && error.code === PasskeyErrorCode.NOT_DISCOVERABLE) {
          // The authenticator created a device-local (non-discoverable) passkey.
          // It would sign fine on this device but never appear at sign-in or sync
          // for recovery — nothing was saved, so guide the user to a compatible
          // provider instead (issue #1).
          showAlert(
            t('onboarding.create.alertNotDiscoverableTitle'),
            t('onboarding.create.alertNotDiscoverableBody'),
          );
        } else {
          showAlert(t('onboarding.create.alertErrorTitle'), error instanceof Error ? error.message : String(error));
        }
        setLoading(false);
        return;
      }
    }

    // ------------------------------------------------------------------
    // Stage 2 — prove the passkey can actually SIGN before anything is
    // persisted or the address is ever shown. A provider can report a
    // successful create() and still fail to durably store the credential
    // (issue #1: "created successfully" yet absent from Google Password
    // Manager, with nowhere to sign). Verifying up front means a dead
    // passkey aborts cleanly: no index record, no local account, no
    // fundable address — instead of a permanently unusable wallet.
    // ------------------------------------------------------------------
    try {
      setStatusKey('onboarding.create.statusVerifyingIdentity');
      const testChallenge = toHex(new TextEncoder().encode('vela-verify-' + Date.now()));
      const assertion = await Passkey.sign(testChallenge, registration.credentialId);
      const compat = verifySafeWebAuthn(assertion);
      if (!compat.ok) {
        // Non-retryable: the provider's response format can't work with the
        // Safe contracts. The user needs a different provider (B05).
        setPendingReg(null);
        showAlert(
          t('onboarding.login.alertIncompatibleTitle'),
          t('onboarding.login.alertIncompatibleBodyCreate'),
        );
        setLoading(false);
        setStatusKey(null);
        return;
      }

      setStatusKey('onboarding.create.statusExtractingKey');
      const attestationBytes = fromHex(registration.attestationObjectHex);
      const pubKey = extractPublicKey(attestationBytes);
      if (!pubKey) {
        throw new Error('Failed to extract public key from attestation');
      }
      const publicKeyHex = '04' + toHex(pubKey.x) + toHex(pubKey.y);

      setStatusKey('onboarding.create.statusComputingAddress');
      const address = computeAddress(publicKeyHex);

      const account: StoredAccount = {
        id: registration.credentialId,
        name: trimmed,
        address,
        publicKeyHex,
        createdAt: new Date().toISOString(),
      };

      // Persist a pending upload (drives retry) but DO NOT save the account
      // locally yet. The account is saved only once the public key is confirmed
      // on the index server (see below). Otherwise a sync failure would leave a
      // wallet that's usable on THIS device but unrecoverable on any other —
      // boot auto-enters on any saved account, and login checks local first, so
      // the server-side gap would stay silent. No funds risk: the address is
      // only shown on the success screen — after signing is proven and the key
      // is synced — so an unverified or unsynced wallet is never funded.
      await savePendingUpload({
        id: registration.credentialId,
        name: trimmed,
        publicKeyHex,
        attestationObjectHex: registration.attestationObjectHex,
        createdAt: new Date().toISOString(),
      });

      const uploadParams = { credentialId: registration.credentialId, publicKeyHex, name: trimmed };
      pendingRef.current = { account, ...uploadParams };

      const uploadOk = await tryUpload(uploadParams);
      if (!uploadOk) {
        setUploadFailed(true);
        setLoading(false);
        setStatusKey(null);
        return;
      }

      await saveAccount(account); // only now that signing is proven AND the key is confirmed server-side
      setCreated(true);
      setLoading(false);
      setStatusKey(null);

    } catch (error) {
      if (error instanceof PasskeyError && error.code === PasskeyErrorCode.CANCELLED) {
        // Verification cancelled — pendingReg is kept, so the button resumes
        // from the signature (never a second registration).
        setStatusKey('onboarding.create.statusVerifyCancelled');
      } else {
        showAlert(t('onboarding.create.alertErrorTitle'), error instanceof Error ? error.message : String(error));
      }
      setLoading(false);
    }
  }

  async function handleRetryUpload() {
    const pending = pendingRef.current;
    if (!pending) return;
    setLoading(true);
    setUploadError('');

    const ok = await tryUpload({
      credentialId: pending.credentialId,
      publicKeyHex: pending.publicKeyHex,
      name: pending.name,
    });
    if (ok) {
      await saveAccount(pending.account); // confirmed server-side — now safe to persist locally
      setCreated(true);
      setUploadFailed(false);
    }
    setLoading(false);
    setStatusKey(null);
  }

  function handleStartOver() {
    // Abandon the unverified passkey and let the user mint a fresh one.
    // Nothing about the old one was persisted (no account, no upload), so
    // this is a clean reset; the orphaned authenticator entry is inert.
    setPendingReg(null);
    setStatusKey(null);
  }

  function handleEnter() {
    // Signing was already proven during creation (stage 2 of handleCreate) —
    // entering the wallet is now just a state transition.
    const pending = pendingRef.current;
    if (!pending || loading) return;
    dispatch({ type: 'ADD_ACCOUNT', account: pending.account });
    if (options.onCreated) options.onCreated(pending.account.address, pending.account.name);
    else router.replace('/(tabs)/wallet');
  }

  return useMemo<CreateWalletController>(
    () => ({
      stage: created ? 'created' : uploadFailed ? 'sync_failed' : 'form',
      name,
      nameEditable: !loading && !pendingReg,
      nameTooLong,
      acks: checks,
      canSubmit: !(
        (!pendingReg && (!name.trim() || nameTooLong)) ||
        loading ||
        !checks.every(Boolean)
      ),
      submitLabelKey: pendingReg
        ? 'onboarding.create.finishVerifyBtn'
        : 'onboarding.create.createWalletBtn',
      busy: loading,
      statusKey,
      showStartOver: !!pendingReg && !loading,
      address: created ? (pendingRef.current?.account.address ?? null) : null,
      syncErrorDetail: uploadError || null,
      canGoBack: !uploadFailed,

      setName,
      toggleAck: (index) =>
        setChecks((prev) => {
          const next = [...prev];
          next[index] = !next[index];
          return next;
        }),
      submit: () => void handleCreate(),
      startOver: handleStartOver,
      retryUpload: () => void handleRetryUpload(),
      enterWallet: handleEnter,
      goBack: () => setStatusKey(null),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, checks, loading, statusKey, uploadFailed, uploadError, created, pendingReg, nameTooLong],
  );
}
