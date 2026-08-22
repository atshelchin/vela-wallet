/**
 * Create-wallet controller — WEB, driven by the portable Rust state machine.
 *
 * This file owns no rules. It creates the core, forwards taps as events,
 * renders whatever view comes back, and performs the handover the core asks
 * for. Every decision — when to register, when to resume, when it is safe to
 * save — lives in `rust/crates/vela-core/src/app/create_wallet.rs`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useWallet } from '@/models/wallet-state';
import { createCreateWalletSession, type CreateWalletSession } from '@/services/onboarding-core/session';
import { statusKeyToI18n, submitLabelToI18n } from '@/services/onboarding-core/copy';
import type { Account } from '@/services/onboarding-core/generated/Account';
import type { CompletionMode } from '@/services/onboarding-core/generated/CompletionMode';
import type { CreateView } from '@/services/onboarding-core/generated/CreateView';
import type { CreateWalletEvent } from '@/services/onboarding-core/generated/CreateWalletEvent';
import type { StoredAccount } from '@/models/types';

import type {
  CreateWalletController,
  CreateWalletControllerOptions,
} from './onboarding-controller-types';

/** What the machine projects before its first event — the empty form. */
const INITIAL_VIEW: CreateView = {
  stage: 'form',
  name: '',
  name_editable: true,
  name_too_long: false,
  acks: [false, false, false, false],
  can_submit: false,
  submit_label: 'create',
  busy: false,
  status: null,
  show_start_over: false,
  address: null,
  sync_error_detail: null,
  can_go_back: true,
  keys: [],
  can_add_key: false,
  can_finish: false,
};

function toStored(account: Account): StoredAccount {
  return {
    id: account.id,
    name: account.name,
    address: account.address,
    publicKeyHex: account.public_key_hex,
    createdAt: account.created_at_iso,
    // `?? []` tolerates a stale wasm bundle from before the field existed —
    // the mapping must never be the thing that crashes onboarding.
    keys: (account.keys ?? []).map((key) => ({
      credentialId: key.credential_id,
      publicKeyHex: key.public_key_hex,
      name: key.name,
    })),
  };
}

export function useCreateWallet(
  options: CreateWalletControllerOptions = {},
): CreateWalletController {
  const { t } = useTranslation();
  const router = useRouter();
  const { dispatch } = useWallet();
  const [view, setView] = useState<CreateView>(INITIAL_VIEW);
  const session = useRef<CreateWalletSession | null>(null);

  // The core outlives individual renders, so it must never close over a stale
  // `t` or `onCreated`. Route both through a ref that each render refreshes.
  const latest = useRef({ t, dispatch, router, onCreated: options.onCreated });
  latest.current = { t, dispatch, router, onCreated: options.onCreated };

  const complete = useCallback((mode: CompletionMode) => {
    const { dispatch: dispatchWallet, router: currentRouter, onCreated } = latest.current;
    if (mode.type === 'add_account') {
      const account = toStored(mode.account);
      dispatchWallet({ type: 'ADD_ACCOUNT', account });
      if (onCreated) onCreated(account.address, account.name);
      else currentRouter.replace('/(tabs)/wallet');
      return;
    }
    // The create flow never produces `set_wallet`; sign-in does. Handled anyway
    // so the completion contract has no hole if that ever changes.
    dispatchWallet({
      type: 'SET_WALLET',
      accounts: mode.accounts.map(toStored),
      activeIndex: mode.active_index,
    });
    const active = mode.accounts[mode.active_index];
    if (onCreated) onCreated(active?.address ?? '', active?.name ?? '');
    else currentRouter.replace('/(tabs)/wallet');
  }, []);

  useEffect(() => {
    const loop = createCreateWalletSession({
      onView: setView,
      deps: {
        t: (key, opts) => latest.current.t(key, opts) as string,
        complete,
      },
      onError: (error) => console.error('[create-wallet] core fault:', error),
    });
    session.current = loop;
    loop.start({ type: 'start' });

    // Also covers React 19 StrictMode's development double-mount: the first
    // core is freed before the second is built, so the wasm keeps one live
    // instance per screen.
    return () => {
      loop.dispose();
      session.current = null;
    };
  }, [complete]);

  const send = useCallback((event: CreateWalletEvent) => {
    session.current?.dispatch(event);
  }, []);

  return useMemo<CreateWalletController>(
    () => ({
      stage: view.stage,
      name: view.name,
      nameEditable: view.name_editable,
      nameTooLong: view.name_too_long,
      acks: view.acks,
      canSubmit: view.can_submit,
      submitLabelKey: submitLabelToI18n(view.submit_label),
      busy: view.busy,
      statusKey: view.status ? statusKeyToI18n(view.status) : null,
      showStartOver: view.show_start_over,
      address: view.address,
      syncErrorDetail: view.sync_error_detail,
      canGoBack: view.can_go_back,
      keys: (view.keys ?? []).map((key) => ({
        name: key.name,
        authenticatorAttachment: key.authenticator_attachment,
        transports: key.transports,
        confirmed: key.confirmed ?? true,
      })),
      canAddKey: view.can_add_key ?? false,
      canFinish: view.can_finish ?? false,

      setName: (name) => send({ type: 'name_changed', name }),
      toggleAck: (index) => send({ type: 'ack_toggled', index }),
      submit: () => send({ type: 'submit' }),
      addKey: (name) => send({ type: 'add_key', name }),
      removeKey: (index) => send({ type: 'remove_key', index }),
      renameKey: (index, name) => send({ type: 'key_name_changed', index, name }),
      confirmKey: (index) => send({ type: 'confirm_key', index }),
      finishKeys: () => send({ type: 'finish_keys' }),
      startOver: () => send({ type: 'start_over' }),
      retryUpload: () => send({ type: 'retry_upload' }),
      enterWallet: () => send({ type: 'enter_wallet' }),
      goBack: () => send({ type: 'go_back' }),
    }),
    [view, send],
  );
}
