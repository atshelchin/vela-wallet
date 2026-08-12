// What a swipe-dismiss of the signing sheet means.
//
// The question is a fund-safety question, not a UI one: answering EIP-1193 4001
// after the commitment point tells the dApp the user refused while the very same
// userOp still broadcasts and later reports success (docs/KNOWN-BUGS.md BUG-2).
//
// Two halves, and this file pins both:
//
//   - NATIVE (`swipe-dismiss.ts`) has no core — Hermes has no WebAssembly — so
//     the rule is a hand-written port of `sign_request.rs::swipe_action`. The
//     port is graded here over its ENTIRE input domain (16 combinations), which
//     is small precisely because the facts are booleans.
//   - WEB (`swipe-dismiss.web.ts`) must not grade anything. It reports the
//     gesture to the core and the core routes it. The test that matters there
//     is a NEGATIVE one: the handlers are never called, no matter what the
//     facts say — a shell that "helpfully" short-circuits one branch is exactly
//     the drift this seam exists to prevent.

import type { SignSwipeAction } from '@/services/wallet-state-core/generated/SignSwipeAction';
import type { SwipeDismissFacts } from '@/components/signing/swipe-dismiss-types';
import { performSwipeDismiss, swipeAction } from '@/components/signing/swipe-dismiss';
// The WEB variant is imported by its explicit `.web` specifier — jest's resolver
// has no platform extensions, and the base file is the native one.
import * as web from '@/components/signing/swipe-dismiss.web';

// The core resident is never loaded for real: it boots wasm, which jest's node
// environment has no business doing to answer "did the shell dispatch?".
const mockDispatchSign = jest.fn();
jest.mock('@/services/wallet-state-core/sign-resident.web', () => ({
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

describe('swipe-dismiss (native port of sign_request.rs::swipe_action)', () => {
  it('grades every one of the 16 fact combinations the way the core does', () => {
    for (const f of allFacts()) {
      expect([JSON.stringify(f), swipeAction(f)]).toEqual([JSON.stringify(f), expected(f)]);
    }
  });

  it('never answers 4001 once the request is committed', () => {
    // The BUG-2 window itself: anything that says "committed" must dismiss.
    for (const f of allFacts()) {
      if (f.fundingNeeded) continue;
      if (f.signError || f.pendingOpHash || f.isSubmitting) {
        expect(swipeAction(f)).toBe('dismiss');
      }
    }
  });

  it('rejects only when nothing at all has been committed', () => {
    expect(swipeAction(facts())).toBe('reject');
    expect(allFacts().filter((f) => swipeAction(f) === 'reject')).toHaveLength(1);
  });

  it('lets the funding view own the swipe even past the commitment point', () => {
    // The in-sheet funding swap (BUG-1) means the sheet on screen is the funding
    // view; a swipe there is its "取消", not a verdict on the tx underneath.
    expect(swipeAction(facts({ fundingNeeded: true, isSubmitting: true }))).toBe('funding_cancel');
    expect(swipeAction(facts({ fundingNeeded: true, pendingOpHash: true }))).toBe('funding_cancel');
    expect(swipeAction(facts({ fundingNeeded: true, signError: true }))).toBe('funding_cancel');
  });

  it('routes each verdict to the matching handler and nothing else', () => {
    const cases: [SwipeDismissFacts, 'reject' | 'dismiss' | 'fundingCancel'][] = [
      [facts(), 'reject'],
      [facts({ isSubmitting: true }), 'dismiss'],
      [facts({ pendingOpHash: true }), 'dismiss'],
      [facts({ signError: true }), 'dismiss'],
      [facts({ fundingNeeded: true }), 'fundingCancel'],
    ];
    for (const [f, want] of cases) {
      const handlers = { reject: jest.fn(), dismiss: jest.fn(), fundingCancel: jest.fn() };
      performSwipeDismiss(f, handlers);
      const called = (Object.keys(handlers) as (keyof typeof handlers)[]).filter(
        (k) => handlers[k].mock.calls.length > 0,
      );
      expect([JSON.stringify(f), called]).toEqual([JSON.stringify(f), [want]]);
      expect(handlers[want]).toHaveBeenCalledTimes(1);
    }
  });
});

describe('swipe-dismiss.web (the core owns the verdict)', () => {
  beforeEach(() => mockDispatchSign.mockClear());

  it('reports the gesture as `swipe_dismissed` and never grades it', () => {
    for (const f of allFacts()) {
      mockDispatchSign.mockClear();
      const handlers = { reject: jest.fn(), dismiss: jest.fn(), fundingCancel: jest.fn() };
      web.performSwipeDismiss(f, handlers);
      // Exactly one event, and it is the one the core models this question with.
      expect(mockDispatchSign.mock.calls).toEqual([[{ type: 'swipe_dismissed' }]]);
      // And NOT a single shell-side shortcut — this is the whole point.
      expect(handlers.reject).not.toHaveBeenCalled();
      expect(handlers.dismiss).not.toHaveBeenCalled();
      expect(handlers.fundingCancel).not.toHaveBeenCalled();
    }
  });
});
