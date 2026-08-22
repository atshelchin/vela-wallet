/**
 * The contract between the onboarding screens and whichever implementation is
 * driving them.
 *
 * Two implementations exist per flow, and they must stay interchangeable:
 *
 * - `use-*.web.ts` — the portable Rust state machine, via wasm
 * - `use-*.ts`     — the TypeScript path, unchanged, for iOS/Android (Hermes
 *                    has no WebAssembly)
 *
 * Both are typed against these declarations, so a divergence is a compile error
 * rather than a platform-specific runtime surprise. The screens import the
 * hooks by their base name; metro picks `.web.ts` on web, `tsc` and native
 * resolve the base file.
 *
 * Note the shape carries **i18n keys**, not sentences: the state machine emits
 * semantic variants and the screen renders them, so the copy is chosen in one
 * place on every platform.
 */

import type { StatusI18nKey, SubmitLabelI18nKey } from '@/services/onboarding-core/copy';

/** Which of the four create panels is showing. */
export type CreateWalletStage = 'form' | 'add_keys' | 'sync_failed' | 'created';

/** One row of the founding-key list on the add-keys panel. */
export type CreateWalletKeyRow = {
  /** Per-key label; row 0 carries the wallet name. */
  name: string;
  /** "platform" / "cross-platform" / "" — display hint only. */
  authenticatorAttachment: string;
  /** Comma-joined transports ("hybrid,internal") or "" — display hint only. */
  transports: string;
  /** The key confirmed its membership at creation; a false row (cancelled
   *  confirmation) shows its own retry, and Continue stays disabled. */
  confirmed: boolean;
  /** Backed up to a sync fabric (BS flag); unknown reads as true. */
  synced: boolean;
  /** Authenticator model AAGUID (canonical uuid) or "" — resolved to a
   *  provider name + icon via the AAGUID Explorer. */
  aaguid: string;
};

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
  /** The drafted founding keys (1..=7), founding order. */
  keys: CreateWalletKeyRow[];
  /** One more key may be added (below the cap, nothing in flight). */
  canAddKey: boolean;
  /** The set may be frozen and published. */
  canFinish: boolean;
  /** The sole drafted key is device-bound (not synced): one lost device
   *  would lose the wallet, so finishing needs a second key. */
  needsSecondKey: boolean;

  setName: (name: string) => void;
  toggleAck: (index: number) => void;
  submit: () => void;
  /** Mint one more founding passkey with this label ("" ⇒ "Key N"). */
  addKey: (name: string) => void;
  /** Drop a drafted extra key (index ≥ 1; the first key is fixed). */
  removeKey: (index: number) => void;
  /** Relabel a drafted extra key (index ≥ 1). */
  renameKey: (index: number, name: string) => void;
  /** Retry an unconfirmed key's membership confirmation. */
  confirmKey: (index: number) => void;
  /** Freeze the founding set — derive the address and publish. */
  finishKeys: () => void;
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
