/**
 * The route guard's verdict — NATIVE, today's `src/app/index.tsx` verbatim.
 *
 * Spinner while storage is unread, the wallet with a wallet, onboarding
 * without. On web (`use-session-route.web.ts`) the identical verdict comes out
 * of the Rust `session` machine's view instead of being re-derived here.
 */
import { useWallet } from '@/models/wallet-state';

import type { SessionRouteName } from './session-controller-types';

export function useSessionRoute(): SessionRouteName {
  const { state } = useWallet();
  if (state.isLoading) return 'loading';
  return state.hasWallet ? 'wallet' : 'onboarding';
}
