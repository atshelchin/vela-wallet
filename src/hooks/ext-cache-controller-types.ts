/**
 * The inputs the Safari-extension cache controller consumes on every platform.
 *
 * A standalone module from the days this controller was a platform pair:
 * the pair could not import its own base file (Metro resolved it back to
 * the `.web.ts` half and recursed at module init), so both halves imported
 * from here. The pair is gone; the module stays as the one place the
 * contract the screens compile against is declared.
 */

import type { ColorSchemePreference } from '@/constants/color-scheme';
import type { Account } from '@/models/types';

/**
 * The whole wallet state the writer reacts to, exactly as
 * `<AccountFileWriter/>` reads it from context. Deliberately the raw values,
 * not a decision: which of them means "write" and which means "clear" is the
 * controller's (on web, the Rust machine's) call.
 */
export interface ExtCacheInputs {
  /** True until storage has been read on startup — neither write nor clear. */
  isLoading: boolean;
  hasWallet: boolean;
  /** The active account, or null when there is none. */
  active: Account | null;
  /** Every account, for the extension's connect sheet. */
  accounts: Account[];
  /** The app's colour-scheme PREFERENCE, so the extension UI matches the app. */
  theme: ColorSchemePreference;
  /** The RESOLVED display language (e.g. 'en', 'zh'). */
  locale: string;
}
