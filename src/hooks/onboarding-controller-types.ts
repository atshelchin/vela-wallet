/**
 * The contract between the onboarding screens and whichever implementation is
 * driving them.
 *
 * One implementation exists per flow — the portable Rust state machine, via
 * wasm. (A TypeScript twin for Hermes existed until the Expo-native path
 * retired.) The hooks are typed against these declarations so a drift between
 * a controller and its screens is a compile error rather than a runtime
 * surprise.
 *
 * Note the shape carries **i18n keys**, not sentences: the state machine emits
 * semantic variants and the screen renders them, so the copy is chosen in one
 * place on every platform.
 */

import type { StatusI18nKey, SubmitLabelI18nKey } from '@/services/onboarding-core/copy';

/** Which of the three create panels is showing. */
export type CreateWalletStage = 'form' | 'sync_failed' | 'created';

export type CreateWalletController = {
  stage: CreateWalletStage;
  name: string;
  nameEditable: boolean;
  nameTooLong: boolean;
  /** One flag per acknowledgment row, in display order. */
  acks: boolean[];
  canSubmit: boolean;
  /** i18n key for the primary button — "create wallet" or "finish verification". */
  submitLabelKey: SubmitLabelI18nKey;
  busy: boolean;
  /** i18n key for the transient status line, or null when there is nothing to say. */
  statusKey: StatusI18nKey | null;
  /** The escape hatch out of a passkey that cannot prove itself. */
  showStartOver: boolean;
  /** Only ever present once the wallet is real and synced. */
  address: string | null;
  /** Raw server text for the bug report, shown behind a disclosure. */
  syncErrorDetail: string | null;
  canGoBack: boolean;

  setName: (name: string) => void;
  toggleAck: (index: number) => void;
  submit: () => void;
  startOver: () => void;
  retryUpload: () => void;
  enterWallet: () => void;
  goBack: () => void;
};

export type OnboardingLoginController = {
  /** A sign-in is in flight. */
  busy: boolean;
  /** The passkey index did not answer; the screen surfaces endpoint settings. */
  endpointUnreachable: boolean;
  signIn: () => void;
};

export type CreateWalletControllerOptions = {
  /** Called once the wallet exists and the user chose to enter it. */
  onCreated?: (address: string, name: string) => void;
};

export type OnboardingLoginControllerOptions = {
  /** Embedded flows (the dApp popup) resume their request instead of navigating. */
  onComplete?: () => void;
};
