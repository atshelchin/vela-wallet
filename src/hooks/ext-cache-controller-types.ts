/**
 * The inputs the Safari-extension cache controller consumes on every platform.
 *
 * A standalone module for the same reason `receive-controller-types.ts` is one:
 * a platform pair (`use-ext-cache.ts` / `use-ext-cache.web.ts`) must never
 * import its own base file — on web, Metro resolves that specifier back to the
 * `.web.ts` variant itself, and a self-referential import recurses at module
 * init. Both variants import from here instead.
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
