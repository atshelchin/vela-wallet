/**
 * The NATIVE mirror of the `clear_signing` core's pure adjudications: the
 * personal_sign / eth_sign verdict and the blind typed-data projection.
 *
 * Web runs the Rust machine; iOS/Android cannot (Hermes has no WebAssembly) and
 * run this instead. Neither copy can be deleted — so the thing to remove is not
 * the duplication but the DRIFT, which is what
 * `__tests__/services/clear-signing-adjudication-parity.test.ts` pins.
 *
 * A divergence here is a security bug, not a cosmetic one: these functions
 * decide whether a phishing SIWE prompt shows a red banner and buzzes, and
 * whether an opaque payload is called out as a possible transaction in disguise.
 *
 * It lives outside the hook because it is pure, and because a parity test must
 * be able to call it without rendering anything.
 */

import { decodeSignMessage } from '@/services/decode-sign-message';
import { checkSiweDomainBinding, parseSiwe, siweHost } from '@/services/siwe';
import type { ClearBlindTyped } from '@/services/wallet-state-core/generated/ClearBlindTyped';
import type { ClearMessageView } from '@/services/wallet-state-core/generated/ClearMessageView';

/** `String(v)`, with `undefined`/`null` reading as the empty payload. */
export const asString = (value: unknown): string =>
  typeof value === 'string' ? value : String(value ?? '');

/**
 * The whole `personal_sign` / `eth_sign` verdict, from the raw param list.
 *
 * WHICH param carries the signed bytes is part of the ruling: `params[0]` for
 * `personal_sign`, `params[1]` for `eth_sign(address, data)` — falling back to
 * `params[0]` only for a malformed single-param request. Reading the wrong one
 * would put the ADDRESS on screen where the opaque digest belongs.
 */
export function adjudicateMessage(
  method: 'personal_sign' | 'eth_sign',
  params: unknown[],
  requestOrigin?: string,
): ClearMessageView {
  const payload = asString(
    method === 'eth_sign' ? (params.length > 1 ? params[1] : params[0]) : params[0],
  );
  const { isHex, text, binaryPreview } = decodeSignMessage(payload);
  // The canonical readability verdict — the same one the signer branches on.
  const nonPrintable = binaryPreview !== null;

  if (method === 'eth_sign') {
    // The classic blind-sign trap — hard warning, no message analysis.
    return {
      payload,
      is_hex: isHex,
      decoded_text: text,
      binary_preview: binaryPreview,
      non_printable: nonPrintable,
      siwe: null,
      binding: null,
      danger_class: 'eth_sign',
    };
  }

  // A binary payload is not a sign-in message: SIWE is parsed from readable
  // text only, and the binding is adjudicated exactly ONCE — the red banner and
  // the warning haptic both read this verdict.
  const parsed = text !== null ? parseSiwe(text) : null;
  const binding = parsed ? checkSiweDomainBinding(parsed.domain, requestOrigin) : null;
  return {
    payload,
    is_hex: isHex,
    decoded_text: text,
    binary_preview: binaryPreview,
    non_printable: nonPrintable,
    siwe: parsed
      ? {
          domain: parsed.domain,
          // The host the binding was COMPARED on — the domain row renders this,
          // so the string on screen is the string that was adjudicated.
          domain_host: siweHost(parsed.domain),
          address: parsed.address ?? null,
          statement: parsed.statement ?? null,
          uri: parsed.uri ?? null,
          chain_id: parsed.chainId ?? null,
          nonce: parsed.nonce ?? null,
        }
      : null,
    binding,
    danger_class: parsed
      ? binding === 'mismatch'
        ? 'siwe_phish'
        : 'siwe_ok'
      : nonPrintable
        ? 'opaque_hash'
        : 'plain',
  };
}

/**
 * Render one raw typed-data value on a single line. A long hex blob (address /
 * salt / bytes) is mid-truncated so it never wraps into a two-line hex wall;
 * everything else is stringified and capped. Deliberately NOT reinterpreted (no
 * decimals, no timestamp guessing) — the descriptor is unknown, so an honest raw
 * value beats a confident wrong one.
 */
function formatBlindValue(v: unknown): string {
  if (v && typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  const s = String(v);
  if (/^0x[0-9a-fA-F]{21,}$/.test(s)) return `${s.slice(0, 10)}…${s.slice(-8)}`;
  return s.slice(0, 60);
}

const EMPTY_BLIND: ClearBlindTyped = {
  primary_type: null,
  has_domain: false,
  domain_name: null,
  verifying_contract: null,
  fields: [],
};

/** The raw EIP-712 projection the blind typed surface renders. */
export function projectBlindTyped(typedDataRaw: unknown): ClearBlindTyped {
  try {
    const data = typeof typedDataRaw === 'string' ? JSON.parse(typedDataRaw) : typedDataRaw;
    const domain = data?.domain;
    const msg = data?.message;
    return {
      primary_type: data?.primaryType ? String(data.primaryType) : null,
      has_domain: !!domain,
      domain_name: domain?.name ? String(domain.name) : null,
      // `.toLowerCase()` is only reachable on a string; anything else is no
      // address at all rather than a coerced one.
      verifying_contract:
        typeof domain?.verifyingContract === 'string'
          ? domain.verifyingContract.toLowerCase()
          : null,
      fields:
        msg && typeof msg === 'object'
          ? Object.entries(msg)
              .slice(0, 5)
              .map(([key, value]) => ({ key, value: formatBlindValue(value) }))
          : [],
    };
  } catch {
    return EMPTY_BLIND;
  }
}
