/**
 * The whole translation surface of the onboarding cores.
 *
 * The Rust machines emit semantic variants (`syncing_key`, `recover_offer`) and
 * never a word of user-facing text — that is what keeps 14 locales out of the
 * wasm and makes "the copy did not change" a diff a reviewer can read on one
 * screen.
 *
 * Every mapping below is exhaustive with a `never` fallback, so adding a variant
 * in Rust without adding its copy here is a TypeScript error rather than a blank
 * status line in production.
 */

import type { PromptKind } from './generated/PromptKind';
import type { StatusKey } from './generated/StatusKey';
import type { SubmitLabel } from './generated/SubmitLabel';

/**
 * The keys these mappings can produce. Spelled out as literal unions rather
 * than `string` so `t()` keeps its compile-time key checking: a key that stops
 * existing in `en.json` becomes a type error here, not a missing string in
 * production.
 */
export type StatusI18nKey =
  | 'onboarding.create.statusSettingUpIdentity'
  | 'onboarding.create.statusVerifyingIdentity'
  | 'onboarding.create.statusExtractingKey'
  | 'onboarding.create.statusComputingAddress'
  | 'onboarding.create.statusSyncingKey'
  | 'onboarding.create.statusSetupCancelled'
  | 'onboarding.create.statusVerifyCancelled';

export type SubmitLabelI18nKey =
  | 'onboarding.create.createWalletBtn'
  | 'onboarding.create.finishVerifyBtn';

export type PromptI18nKey =
  | 'onboarding.create.alertNotSupportedTitle'
  | 'onboarding.create.alertNotSupportedBody'
  | 'onboarding.login.alertNotSupportedTitle'
  | 'onboarding.login.alertNotSupportedBody'
  | 'onboarding.create.alertNotDiscoverableTitle'
  | 'onboarding.create.alertNotDiscoverableBody'
  | 'onboarding.login.alertIncompatibleTitle'
  | 'onboarding.login.alertIncompatibleBody'
  | 'onboarding.login.alertIncompatibleBodyCreate'
  | 'onboarding.create.alertErrorTitle'
  | 'onboarding.login.recoverOfferTitle'
  | 'onboarding.login.recoverOfferBody'
  | 'onboarding.login.recoverConfirm'
  | 'onboarding.login.recoverCancel'
  | 'onboarding.login.recoverFailedTitle'
  | 'onboarding.login.recoverFailedBody'
  | 'onboarding.login.alertSignInFailedTitle'
  | 'onboarding.login.alertSignInFailedBody';

/** Narrower than i18next's `TFunction`, and enough for these call sites. */
export type Translate = (key: PromptI18nKey, options?: Record<string, unknown>) => string;

function unreachable(value: never): never {
  // Cannot happen while the generated types are in sync; if the generator was
  // skipped, fail loudly here rather than silently rendering nothing.
  throw new Error(`unhandled onboarding variant: ${JSON.stringify(value)}`);
}

/** The transient line under the create form. */
export function statusKeyToI18n(status: StatusKey): StatusI18nKey {
  switch (status) {
    case 'setting_up_identity':
      return 'onboarding.create.statusSettingUpIdentity';
    case 'verifying_identity':
      return 'onboarding.create.statusVerifyingIdentity';
    case 'extracting_key':
      return 'onboarding.create.statusExtractingKey';
    case 'computing_address':
      return 'onboarding.create.statusComputingAddress';
    case 'syncing_key':
      return 'onboarding.create.statusSyncingKey';
    case 'setup_cancelled':
      return 'onboarding.create.statusSetupCancelled';
    case 'verify_cancelled':
      return 'onboarding.create.statusVerifyCancelled';
    default:
      return unreachable(status);
  }
}

/** The primary button: "Create Wallet", or "Finish verification" on resume. */
export function submitLabelToI18n(label: SubmitLabel): SubmitLabelI18nKey {
  switch (label) {
    case 'create':
      return 'onboarding.create.createWalletBtn';
    case 'finish_verify':
      return 'onboarding.create.finishVerifyBtn';
    default:
      return unreachable(label);
  }
}

export type PromptCopy = {
  title: string;
  message: string;
  /** Present only for the one prompt whose answer changes the flow. */
  confirm?: { confirmLabel: string; cancelLabel: string };
};

/** One entry per `showAlert` call site the screens used to make themselves. */
export function promptCopy(kind: PromptKind, t: Translate): PromptCopy {
  switch (kind.type) {
    case 'not_supported_create':
      return {
        title: t('onboarding.create.alertNotSupportedTitle'),
        message: t('onboarding.create.alertNotSupportedBody'),
      };
    case 'not_supported_login':
      return {
        title: t('onboarding.login.alertNotSupportedTitle'),
        message: t('onboarding.login.alertNotSupportedBody'),
      };
    case 'not_discoverable':
      return {
        title: t('onboarding.create.alertNotDiscoverableTitle'),
        message: t('onboarding.create.alertNotDiscoverableBody'),
      };
    case 'incompatible_create':
      return {
        title: t('onboarding.login.alertIncompatibleTitle'),
        message: t('onboarding.login.alertIncompatibleBodyCreate'),
      };
    case 'incompatible_login':
      return {
        title: t('onboarding.login.alertIncompatibleTitle'),
        message: t('onboarding.login.alertIncompatibleBody'),
      };
    case 'create_failed':
      // The platform's own words. Opaque by nature — it goes straight into the
      // bug report, and inventing friendlier text here would lose the detail.
      return { title: t('onboarding.create.alertErrorTitle'), message: kind.detail };
    case 'recover_offer':
      return {
        title: t('onboarding.login.recoverOfferTitle'),
        message: t('onboarding.login.recoverOfferBody'),
        confirm: {
          confirmLabel: t('onboarding.login.recoverConfirm'),
          cancelLabel: t('onboarding.login.recoverCancel'),
        },
      };
    case 'recover_failed':
      return {
        title: t('onboarding.login.recoverFailedTitle'),
        message: t('onboarding.login.recoverFailedBody'),
      };
    case 'sign_in_failed':
      return {
        title: t('onboarding.login.alertSignInFailedTitle'),
        message: t('onboarding.login.alertSignInFailedBody', { message: kind.detail }),
      };
    default:
      return unreachable(kind);
  }
}
