/**
 * The differential harness (spec 005-web-i18n-adoption, T030–T033).
 *
 * The harness is the product of this spec, so its own failure modes matter more
 * than usual. Two in particular:
 *
 *  - It must return the ORACLE on disagreement (FR-016) while still making the
 *    RUST value available for assertion. A harness that only returned the oracle
 *    would be safe and useless.
 *  - `first-seen` must never cache a divergent input. If it did, one lucky
 *    comparison would retire an input permanently and the divergence would go
 *    quiet.
 */
import { createDiffHarness, encodeOptions, dumperLine } from '@/i18n/diff-harness';

const silent = () => undefined;

const harness = (mode: 'off' | 'first-seen' | 'every', onPoison?: (d: unknown) => void) =>
  createDiffHarness({
    language: () => 'ja',
    mode,
    warn: silent,
    onPoison: onPoison as never,
  });

describe('i18n diff harness', () => {
  it('renders the ORACLE when the engines disagree, but records the rust value', () => {
    const h = harness('every');
    const out = h.dispatch('k', undefined, () => 'RUST', () => 'ORACLE');

    // FR-016: the product never degrades while the engine is on trial.
    expect(out).toBe('ORACLE');

    const report = h.report();
    expect(report.divergences).toHaveLength(1);
    expect(report.divergences[0]).toMatchObject({
      key: 'k',
      rust: 'RUST',
      oracle: 'ORACLE',
      reason: 'mismatch',
      language: 'ja',
    });
  });

  it('records a rust throw as a divergence and still renders', () => {
    const h = harness('every');
    const out = h.dispatch(
      'k',
      undefined,
      () => {
        throw new Error('engine exploded');
      },
      () => 'ORACLE',
    );

    expect(out).toBe('ORACLE');
    expect(h.report().divergences[0]).toMatchObject({ rust: null, reason: 'threw' });
  });

  it('flags the borrow-leak signature as poisoned and fires the hook once', () => {
    const seen: unknown[] = [];
    const h = harness('every', (d) => seen.push(d));
    const boom = () => {
      throw new Error('recursive use of an object detected which would lead to unsafe aliasing in rust');
    };

    h.dispatch('a', undefined, boom, () => 'A');
    h.dispatch('b', undefined, boom, () => 'B');

    expect(h.report().poisoned).toBe(true);
    // Once, not once per call — a poisoned engine fails on EVERY subsequent call
    // and the report would otherwise be nothing but poison records.
    expect(seen).toHaveLength(1);
    expect(h.report().divergences.every((d) => d.reason === 'poisoned')).toBe(true);
  });

  it('never retires a divergent input in first-seen mode', () => {
    const h = harness('first-seen');
    let oracleCalls = 0;
    const oracle = () => {
      oracleCalls++;
      return 'ORACLE';
    };

    for (let i = 0; i < 5; i++) h.dispatch('k', undefined, () => 'RUST', oracle);

    // Still compared every time — a divergence that goes quiet after one sighting
    // is worse than no harness at all.
    expect(oracleCalls).toBe(5);
    expect(h.report().compared).toBe(5);
    expect(h.report().divergences).toHaveLength(5);
  });

  it('retires an AGREEING input in first-seen mode, and the result is unchanged', () => {
    const h = harness('first-seen');
    let oracleCalls = 0;
    const oracle = () => {
      oracleCalls++;
      return 'SAME';
    };

    const first = h.dispatch('k', undefined, () => 'SAME', oracle);
    const second = h.dispatch('k', undefined, () => 'SAME', oracle);
    const third = h.dispatch('k', undefined, () => 'SAME', oracle);

    // The oracle stops being consulted...
    expect(oracleCalls).toBe(1);
    // ...and that is only safe because the values were proven equal first.
    expect([first, second, third]).toEqual(['SAME', 'SAME', 'SAME']);
    expect(h.report().agreed).toBe(1);
  });

  it('distinguishes inputs by language and options, not just by key', () => {
    let lang = 'ja';
    const h = createDiffHarness({ language: () => lang, mode: 'first-seen', warn: silent });
    let oracleCalls = 0;
    const oracle = () => {
      oracleCalls++;
      return 'SAME';
    };

    h.dispatch('k', undefined, () => 'SAME', oracle);
    h.dispatch('k', { count: 1 }, () => 'SAME', oracle); // different options
    lang = 'ru';
    h.dispatch('k', undefined, () => 'SAME', oracle); // different language

    // Three distinct inputs — collapsing them would let a locale-specific or
    // count-specific divergence hide behind one earlier agreement.
    expect(oracleCalls).toBe(3);
  });

  it('costs nothing when off, but still catches a poison', () => {
    const h = harness('off');
    let oracleCalls = 0;
    const out = h.dispatch('k', undefined, () => 'RUST', () => {
      oracleCalls++;
      return 'ORACLE';
    });

    // Off means the engine's value renders and the oracle is never consulted.
    expect(out).toBe('RUST');
    expect(oracleCalls).toBe(0);
    expect(h.report().compared).toBe(0);

    // ...but layer 0 is unconditional: a throw must never escape into render.
    const h2 = harness('off');
    const recovered = h2.dispatch('k', undefined, () => {
      throw new Error('recursive use of an object detected');
    }, () => 'ORACLE');
    expect(recovered).toBe('ORACLE');
    expect(h2.report().poisoned).toBe(true);
  });

  describe('divergence encoding', () => {
    it('tags values JSON cannot carry, so a record is replayable', () => {
      expect(encodeOptions(undefined)).toBe('undefined');
      expect(encodeOptions({ count: Number.NaN })).toContain('"__t":"nan"');
      expect(encodeOptions({ count: Number.POSITIVE_INFINITY })).toContain('"__t":"infinity"');
      expect(encodeOptions({ count: Number.NEGATIVE_INFINITY })).toContain('"sign":-1');
      expect(encodeOptions({ v: undefined })).toContain('"__t":"undefined"');
    });

    it('sorts keys so the same options always encode identically', () => {
      expect(encodeOptions({ b: 1, a: 2 })).toBe(encodeOptions({ a: 2, b: 1 }));
    });

    it('emits a dumper source line WITHOUT an expectation', () => {
      const line = dumperLine({
        key: 'send.recipientCount',
        options: '{count:2}',
        language: 'ru',
        rust: 'X',
        oracle: 'Y',
        reason: 'mismatch',
        at: 0,
      });
      expect(line).toContain("add('mismatch/send.recipientCount/ru'");
      // The expectation must be re-derived by the dumper from the real i18next.
      // Copying the oracle value from the record would pin whatever it happened
      // to say at capture time — the one number a regression vector must not
      // inherit. And a hand-pasted vector is deleted anyway: CI regenerates the
      // corpus and diffs it.
      expect(line).not.toContain('Y');
    });
  });
});
