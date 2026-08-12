/**
 * The F9 caution banner's verdict — `isPossibleDisguisedTransaction`.
 *
 * The banner ("this isn't readable text — it could be a transaction or approval
 * in disguise") is the ONE thing `MessageSignView` still decides for itself, so
 * it lives as a pure function here, over the projection the core hands the view
 * (`ClearMessageView.is_hex` / `.decoded_text`). Jest runs in `node` and renders
 * no components, so this file is the coverage for that verdict.
 *
 * Two cases are deliberately opposite and are the reason the function exists:
 *
 *   (a) a payload the signer treats as TEXT (not `0x`-prefixed even-length hex)
 *       is shown verbatim — emoji, CJK, accents and all — and must NEVER be
 *       flagged. Warning "this isn't readable text" while readable text sits on
 *       screen is the false alarm that teaches users to ignore the real one.
 *   (b) a payload the signer treats as BYTES whose decode lands outside plain
 *       ASCII MUST be flagged, even when those bytes render as a fine Chinese
 *       sentence — that is exactly what a disguised transaction looks like to a
 *       user who cannot tell one hex blob from another, and it is what the
 *       pre-migration UI did.
 */
import {
  decodeSignMessage,
  isPlainAsciiText,
  isPossibleDisguisedTransaction,
} from '@/services/decode-sign-message';

/** UTF-8 encode to a 0x-hex payload — what a dApp's `stringToHex` sends. */
function toHex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The core's projection of a payload, exactly as `analyze_message` builds it
 * (Rust on web, the TS decode on native): `decoded_text` is null iff the bytes
 * are binary, and that null IS `non_printable`.
 */
function asMessageView(payload: string) {
  const { isHex, text, binaryPreview } = decodeSignMessage(payload);
  return {
    payload,
    is_hex: isHex,
    decoded_text: text,
    binary_preview: binaryPreview,
    non_printable: isHex && text === null,
  };
}

/**
 * The pre-migration view-side predicate, verbatim from `MessageSignView.tsx`
 * before the crux port, restricted to the payloads the signer calls hex. The
 * canon rule for this migration is "native behaviour unchanged", so on that
 * domain the new verdict must agree with this one character for character.
 */
function baselineNonPrintable(hexMsg: string): boolean {
  try {
    const clean = hexMsg.startsWith('0x') ? hexMsg.slice(2) : hexMsg;
    if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length < 2) return false;
    const bytes = new Uint8Array(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    return !/^[\x20-\x7E\n\r\t]+$/.test(new TextDecoder().decode(bytes));
  } catch { return false; }
}

describe('(a) a payload signed as text is never flagged', () => {
  const plain = [
    'Confirm you own this wallet — nonce 8f2a41cd',
    'Hello from biubiu.tools 👋',
    '签名消息',
    'Café résumé',
    'deadbeef', // hex-looking, but no 0x prefix → the signer signs the letters
    '0xabc',    // odd length → not a hex payload either
  ];

  it.each(plain)('shows %p verbatim with no caution banner', (payload) => {
    const view = asMessageView(payload);
    expect(view.is_hex).toBe(false);
    expect(view.decoded_text).toBe(payload); // rendered as the text it is
    expect(isPossibleDisguisedTransaction(view)).toBe(false);
  });
});

describe('(b) hex bytes outside plain ASCII are flagged even when readable', () => {
  const nonAscii = [
    'Hello from biubiu.tools 👋',
    '签名消息',
    'Café résumé',
    'Sign in\u00a0now', // NBSP — printable, not ASCII, and invisible on screen
  ];

  it.each(nonAscii)('flags hex-encoded %p while still showing it as text', (message) => {
    const view = asMessageView(toHex(message));
    expect(view.is_hex).toBe(true);
    // Issue #82 stands: it is readable text, NOT a raw-hex fallback...
    expect(view.decoded_text).toBe(message);
    expect(view.non_printable).toBe(false);
    // ...and it still carries the banner, as it did before the crux migration.
    expect(isPossibleDisguisedTransaction(view)).toBe(true);
  });

  it('flags a genuinely binary payload (the disguised 32-byte hash)', () => {
    const view = asMessageView('0x' + 'de1a'.repeat(16));
    expect(view.non_printable).toBe(true);
    expect(view.decoded_text).toBeNull();
    expect(isPossibleDisguisedTransaction(view)).toBe(true);
  });

  it('leaves a plain-ASCII hex message calm', () => {
    const view = asMessageView(toHex('Sign in to Uniswap. Nonce: 8f2a41cd'));
    expect(isPossibleDisguisedTransaction(view)).toBe(false);
  });

  it('leaves a multi-line SIWE hex message calm (tab/newline are text)', () => {
    const view = asMessageView(toHex('example.com wants you to sign in\n\nURI: https://example.com\ttab'));
    expect(isPossibleDisguisedTransaction(view)).toBe(false);
  });

  it('leaves the empty payload calm', () => {
    expect(isPossibleDisguisedTransaction(asMessageView('0x'))).toBe(false);
  });
});

describe('structural invariants', () => {
  const corpus = [
    '0x', toHex(''), toHex('plain ascii'), toHex('Café'), toHex('签名消息'),
    toHex('emoji 👋'), toHex('tab\tand\nnewline'), '0x' + 'de1a'.repeat(16),
    '0x414200', '0x' + '01'.repeat(64), '0xdeadbeef', '0xcafe',
    'plain ascii', 'Café', 'deadbeef', '0xabc', '',
  ];

  it('never goes quiet where the core says the payload is opaque', () => {
    // The banner is a SUPERSET of `non_printable` by construction (the null
    // branch is folded into the predicate), so it cannot go missing on a payload
    // the core already refuses to render as text.
    for (const payload of corpus) {
      const view = asMessageView(payload);
      if (view.non_printable) expect(isPossibleDisguisedTransaction(view)).toBe(true);
    }
  });

  it('matches the pre-migration verdict on every payload the signer calls hex', () => {
    for (const payload of corpus) {
      const view = asMessageView(payload);
      if (!view.is_hex) continue;
      expect([payload, isPossibleDisguisedTransaction(view)])
        .toEqual([payload, baselineNonPrintable(payload)]);
    }
  });

  it('isPlainAsciiText accepts printable ASCII + tab/newline/CR only', () => {
    expect(isPlainAsciiText('')).toBe(true);
    expect(isPlainAsciiText(' ~\n\r\t')).toBe(true);
    expect(isPlainAsciiText('é')).toBe(false);
    expect(isPlainAsciiText('👋')).toBe(false);
    expect(isPlainAsciiText('\u0000')).toBe(false);
    expect(isPlainAsciiText('\u007f')).toBe(false);
  });
});
