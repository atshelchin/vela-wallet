/**
 * <AccountFileWriter/> — headless. Keeps the Safari extension's account cache
 * (vela.ext.account.json) in sync with the active account so the extension can
 * answer connect/read/state in-Safari with zero app hop.
 *
 * Mounted inside WalletProvider (src/app/_layout.tsx, next to <SigningRequestModal/>).
 * Renders nothing. No-op off iOS (the sync service guards via isSupportedSync).
 *
 * Writes on (a) any account change and (b) every foreground — §12.1.6: a user
 * who installed the extension while already logged in would otherwise have an
 * empty cache until their next in-app account switch.
 *
 * All of that lives in the controller pair `use-ext-cache.ts` (native, today's
 * TypeScript verbatim) / `use-ext-cache.ts` (web, the portable Rust machine
 * `rust/crates/vela-core/src/app/ext_cache.rs`). This component only reads the
 * contexts and hands them over — the theme/language preferences ride the cache
 * so the extension UI matches the app, and re-writing on their change keeps
 * them fresh even when the user flips theme/language without touching accounts
 * (this writer isn't inside the Stack that remounts on those changes).
 */
import { useWallet } from '@/models/wallet-state';
import { useColorSchemePreference } from '@/constants/color-scheme';
import { useLanguagePreference } from '@/i18n/language';
import { useExtCache } from '@/hooks/use-ext-cache';

export function AccountFileWriter(): null {
  const { state, activeAccount } = useWallet();
  const { preference: theme } = useColorSchemePreference();
  const { resolved: locale } = useLanguagePreference();

  useExtCache({
    isLoading: state.isLoading,
    hasWallet: state.hasWallet,
    active: activeAccount ?? null,
    accounts: state.accounts,
    theme,
    locale,
  });

  return null;
}
