/**
 * Decode a `personal_sign` hex payload to readable text for the signing sheet.
 *
 * dApps send `personal_sign` with `params[0] = stringToHex(message)`, so the
 * bytes are (almost always) UTF-8 text. We show that text — including emoji,
 * CJK and accented Latin — and fall back to a short hex preview only for
 * genuinely binary payloads (raw 32-byte hashes / non-UTF-8).
 *
 * The readability guard is Unicode-aware. The previous guard accepted only
 * printable ASCII (`[\x20-\x7E]`), so ANY non-ASCII character — an emoji, a
 * Chinese character, an accented letter — forced the raw-hex fallback even
 * though the bytes decoded to perfectly valid text (issue #82: biubiu's default
 * "Hello from biubiu.tools 👋" rendered as hex). Now we reject only control
 * characters (C0/C1, except tab/newline/CR so multi-line SIWE stays legal) and
 * the U+FFFD replacement char a non-fatal TextDecoder emits for invalid UTF-8.
 */

/**
 * A char that marks a payload as binary, not text: a C0 control (< 0x20) other
 * than tab/newline/CR, DEL (0x7F), a C1 control (0x80–0x9F), or the U+FFFD
 * replacement char TextDecoder emits for invalid UTF-8 (e.g. a raw 32-byte
 * hash). Emoji are UTF-16 surrogate pairs (0xD800–0xDFFF), which are not in any
 * of these ranges, so they read as text.
 */
function isBinaryChar(code: number): boolean {
  if (code < 0x20) return code !== 0x09 && code !== 0x0a && code !== 0x0d;
  if (code === 0x7f) return true;
  if (code >= 0x80 && code <= 0x9f) return true;
  return code === 0xfffd;
}

/**
 * Is this `personal_sign` payload hex-encoded bytes, or plain UTF-8 text?
 *
 * Not every dApp hex-encodes, so both the SIGNER (personalSignBytes in
 * use-dapp-signing.ts) and this DISPLAY path must branch on the same predicate.
 * If they ever disagree, the sheet shows one thing and the passkey signs
 * another — and the SIWE domain check reads a mangled string.
 *
 * MetaMask's rule: only a `0x`-prefixed, even-length, all-hex payload is hex.
 * A bare `deadbeef` with no prefix is a message that happens to look hexish,
 * and is signed and displayed as the text it is.
 */
export function isHexPayload(payload: string): boolean {
  if (!payload.startsWith('0x')) return false;
  const body = payload.slice(2);
  return body.length % 2 === 0 && /^[0-9a-fA-F]*$/.test(body);
}

/**
 * The decode, split into its two outcomes.
 *
 * `text` and `binaryPreview` are mutually exclusive, and WHICH one you get is
 * the canonical "is this a readable message?" verdict — the same predicate the
 * signer branches on. It is exported because the signing sheet needs the verdict
 * itself, not just the string: a payload that decoded to a hex preview is a
 * possible transaction in disguise and must be flagged, while a payload that
 * decoded to text — emoji, CJK, accents and all — must NOT be
 * (`MessageSignView` used to run a second, ASCII-only test here and raised a
 * false alarm on every non-ASCII message).
 */
export function decodeSignMessage(hexMsg: string): {
  isHex: boolean;
  text: string | null;
  binaryPreview: string | null;
} {
  if (!isHexPayload(hexMsg)) {
    return { isHex: false, text: hexMsg, binaryPreview: null }; // plain UTF-8 — verbatim
  }
  try {
    const clean = hexMsg.slice(2);
    if (clean.length === 0) return { isHex: true, text: '', binaryPreview: null };
    const bytes = new Uint8Array(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    const decoded = new TextDecoder().decode(bytes); // non-fatal → U+FFFD on invalid bytes
    for (let i = 0; i < decoded.length; i++) {
      if (isBinaryChar(decoded.charCodeAt(i))) {
        return {
          isHex: true,
          text: null,
          binaryPreview: `0x${clean.slice(0, 64)}${clean.length > 64 ? '...' : ''}`,
        };
      }
    }
    return { isHex: true, text: decoded, binaryPreview: null };
  } catch {
    return {
      isHex: true,
      text: null,
      binaryPreview: hexMsg.slice(0, 66) + (hexMsg.length > 66 ? '...' : ''),
    };
  }
}

export function decodePersonalMessage(hexMsg: string): string {
  const { text, binaryPreview } = decodeSignMessage(hexMsg);
  return text ?? binaryPreview ?? '';
}

// ---------------------------------------------------------------------------
// The "could be a transaction in disguise" verdict (F9 caution banner)
// ---------------------------------------------------------------------------

/**
 * Printable ASCII plus the whitespace multi-line text needs (SIWE is multi-line).
 *
 * Deliberately a DIFFERENT and weaker bar than `isBinaryChar`: that one answers
 * "can this be rendered as text at all?", this one answers "is this the plain
 * ASCII a dApp's login prompt is made of?".
 */
const PLAIN_ASCII_TEXT = /^[\x20-\x7E\n\r\t]*$/;

/** Is every character printable ASCII (or tab/newline/CR)? */
export function isPlainAsciiText(text: string): boolean {
  return PLAIN_ASCII_TEXT.test(text);
}

/**
 * Does this personal_sign payload deserve the F9 caution banner ("this isn't
 * readable text — it could be a transaction or approval in disguise")?
 *
 * TWO different questions live here and conflating them is how the warning got
 * lost once already:
 *
 * 1. *Which string do we SHOW?* — `decodeSignMessage`'s Unicode-aware verdict.
 *    Emoji / CJK / accents are text and render as text (issue #82).
 * 2. *Is the payload suspicious?* — THIS predicate, computed from that same
 *    verdict, never from a second decode. It is strictly weaker: hex-encoded
 *    bytes that decode to anything outside plain ASCII are flagged even when
 *    they render perfectly, because a disguised 32-byte hash and a Chinese
 *    sentence are indistinguishable to a user reading a hex blob, and the
 *    baseline UI flagged both.
 *
 * The gate is `is_hex`, and that is the whole distinction:
 * - a payload the signer treats as TEXT (not `0x`-prefixed even-length hex) is
 *   shown verbatim and signed verbatim — CJK, emoji and all — and is never
 *   flagged. Warning "this isn't readable text" over readable text on screen is
 *   the false alarm that trains users to ignore the real one.
 * - a payload the signer treats as BYTES is flagged the moment those bytes are
 *   not plain ASCII, whether they decoded to a hex preview (`decoded_text` is
 *   null — the core's `non_printable`) or to non-ASCII text.
 *
 * Because the null case is folded in here, this can never be *narrower* than
 * `non_printable`: the banner cannot go missing while the core calls the
 * payload opaque.
 *
 * Takes the core's own projection, so web (Rust `analyze_message`) and native
 * (the TS decode above) feed it the identical two fields — there is no second
 * decode to drift.
 */
export function isPossibleDisguisedTransaction(
  view: { is_hex: boolean; decoded_text: string | null },
): boolean {
  if (!view.is_hex) return false;
  if (view.decoded_text === null) return true; // binary — the core's non_printable
  return !isPlainAsciiText(view.decoded_text);
}
