// What a swipe-dismiss of the signing sheet means.
//
// The question is a fund-safety question, not a UI one: answering EIP-1193 4001
// after the commitment point tells the dApp the user refused while the very same
// userOp still broadcasts and later reports success (docs/KNOWN-BUGS.md BUG-2).
//
// This file used to pin BOTH halves: a hand-written native port of
// `sign_request.rs::swipe_action`, graded over its entire 16-combination input
// domain, and the web shell's obligation to grade NOTHING. The native port is
// gone with the rest of the Hermes path, so `sign_request.rs` is now the only
// implementation of the rule and the only place it needs grading.
//
// What remains here is the half that still has a job: the NEGATIVE test. The
// shell reports the gesture and the core routes it — a shell that "helpfully"
// short-circuits one branch is exactly the drift this seam exists to prevent,
// and no Rust test can catch that, because it is about what the shell does NOT do.

import type { SignSwipeAction } from '@/services/wallet-state-core/generated/SignSwipeAction';
import type { SwipeDismissFacts } from '@/components/signing/swipe-dismiss-types';
import { performSwipeDismiss } from '@/components/signing/swipe-dismiss';

// The core resident is never loaded for real: it boots wasm, which jest's node
// environment has no business doing to answer "did the shell dispatch?".
const mockDispatchSign = jest.fn();
jest.mock('@/services/wallet-state-core/sign-resident', () => ({
  dispatchSign: (...args: unknown[]) => mockDispatchSign(...args),
}));

const facts = (over: Partial<SwipeDismissFacts> = {}): SwipeDismissFacts => ({
  fundingNeeded: false,
  signError: false,
  pendingOpHash: false,
  isSubmitting: false,
  ...over,
});

/** Every combination of the four booleans, in a stable order. */
function allFacts(): SwipeDismissFacts[] {
  const out: SwipeDismissFacts[] = [];
  for (let bits = 0; bits < 16; bits += 1) {
    out.push({
      fundingNeeded: !!(bits & 1),
      signError: !!(bits & 2),
      pendingOpHash: !!(bits & 4),
      isSubmitting: !!(bits & 8),
    });
  }
  return out;
}

/**
 * The rule, restated independently of the implementation so a typo in the
 * implementation cannot be "confirmed" by a copy of itself:
 *
 *   funding view up            → funding_cancel   (it IS the funding cancel)
 *   committed (error/hash/     → dismiss          (the op proceeds; BUG-2)
 *   submitting)
 *   otherwise                  → reject           (4001; nothing committed)
 */
function expected(f: SwipeDismissFacts): SignSwipeAction {
  if (f.fundingNeeded) return 'funding_cancel';
  if (f.signError) return 'dismiss';
  if (f.pendingOpHash) return 'dismiss';
  if (f.isSubmitting) return 'dismiss';
  return 'reject';
}

describe('swipe-dismiss (the core owns the verdict)', () => {
  beforeEach(() => mockDispatchSign.mockClear());

  it('reports the gesture as `swipe_dismissed` and never grades it', () => {
    for (const f of allFacts()) {
      mockDispatchSign.mockClear();
      const handlers = { reject: jest.fn(), dismiss: jest.fn(), fundingCancel: jest.fn() };
      performSwipeDismiss(f, handlers);
      // Exactly one event, and it is the one the core models this question with.
      expect(mockDispatchSign.mock.calls).toEqual([[{ type: 'swipe_dismissed' }]]);
      // And NOT a single shell-side shortcut — this is the whole point.
      expect(handlers.reject).not.toHaveBeenCalled();
      expect(handlers.dismiss).not.toHaveBeenCalled();
      expect(handlers.fundingCancel).not.toHaveBeenCalled();
    }
  });
});
