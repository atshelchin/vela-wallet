/**
 * Platform-neutral types and wire codecs for the `clear_signing` core (spec
 * 017 — `rust/crates/vela-core/src/app/clear_signing.rs`).
 *
 * Standalone for the reason `send-types.ts` states: the native stub
 * (`clear-session.ts`) needs these declarations, and importing them from a
 * `.web` module would drag the web-only service graph into the native bundle.
 *
 * What lives here is ONLY translation, never judgment:
 *
 * - the wire's `snake_case` field roles back to the `kebab-case` the signing
 *   views have always rendered from, and the wire's explicit `null`s back to
 *   the optional properties `ClearSignResult` declares. Both directions are
 *   mechanical; the risk grade, the field roles, the `warning`/`unverified`/
 *   `expired` flags and the `partial`/`bestEffort` verdicts are all decided in
 *   Rust and copied through untouched.
 * - the shell's resolved locale presets onto the core's semantic enums. The
 *   core owns "which number is shown"; the preset says how digits group. `auto`
 *   is resolved here because detecting it reads `Intl`, a shell capability.
 *
 * There is deliberately NO codec for the message adjudication or the blind
 * typed projection: those wire shapes ARE the controller's contract, so a
 * second shell-side shape could only drift from them.
 */

import type { ClearSignField as ShellField, ClearSignResult as ShellResult } from '@/services/clear-signing';

import type { ClearLocale } from './generated/ClearLocale';
import type { ClearOperation } from './generated/ClearOperation';
import type { ClearSignField } from './generated/ClearSignField';
import type { ClearSignResult } from './generated/ClearSignResult';
import type { ClearSigningView } from './generated/ClearSigningView';
import type { SessionOptions } from './types';

/** One request from the core, carrying the id it will be answered by. */
export type ClearEffect = { id: number; operation: ClearOperation };

export type ClearSigningSessionOptions = SessionOptions<ClearSigningView>;

// ---------------------------------------------------------------------------
// Result codec
// ---------------------------------------------------------------------------

/** Layout roles: `send_amount` on the wire, `send-amount` on the screen. */
function toShellRole(role: ClearSignField['role']): ShellField['role'] {
  switch (role) {
    case 'send_amount':
      return 'send-amount';
    case 'receive_amount':
      return 'receive-amount';
    case 'recipient':
      return 'recipient';
    case 'spender':
      return 'spender';
    case 'generic':
      return 'generic';
  }
}

function toShellField(field: ClearSignField): ShellField {
  return {
    label: field.label,
    value: field.value,
    format: field.format,
    role: toShellRole(field.role),
    // The wire states every flag; the display shape declares them optional and
    // every consumer reads them as booleans, so `false` and absent are the same
    // screen. Copied verbatim — a flipped `warning` is a red banner that stops
    // saying "unlimited".
    warning: field.warning,
    unverified: field.unverified,
    detail: field.detail,
    expired: field.expired,
    ...(field.token_address !== null ? { tokenAddress: field.token_address } : {}),
    ...(field.address !== null ? { address: field.address } : {}),
    ...(field.usd_value !== null ? { usdValue: field.usd_value } : {}),
  };
}

/** The core's resolved result in the shape the signing views render from. */
export function toShellResult(result: ClearSignResult): ShellResult {
  return {
    intent: result.intent,
    fields: result.fields.map(toShellField),
    risk: result.risk,
    verified: result.verified,
    type: result.sign_type,
    partial: result.partial,
    bestEffort: result.best_effort,
    // The burn verdict — a rule, decided by `clear_signing::to_own_token`, not
    // a flag the shell may re-derive. Absent on native (see the property's own
    // doc in `services/clear-signing.ts`), so it is stated explicitly here
    // rather than left to a spread.
    toOwnToken: result.to_own_token,
    ...(result.contract_name !== null ? { contractName: result.contract_name } : {}),
    ...(result.owner !== null ? { owner: result.owner } : {}),
    ...(result.contract_address !== null ? { contractAddress: result.contract_address } : {}),
  };
}

// ---------------------------------------------------------------------------
// Locale codec
// ---------------------------------------------------------------------------

/**
 * The shell's resolved presets for one resolution run.
 *
 * `tz_offset_minutes` is minutes to ADD to UTC (the negation of JS
 * `getTimezoneOffset()`), sampled once per request — the core owns the deadline
 * verdict but no clock and no timezone database.
 */
export function toClearLocale(keys: {
  number: ClearLocale['number_format'];
  date: ClearLocale['date_format'];
  time: ClearLocale['time_format'];
}): ClearLocale {
  return {
    number_format: keys.number,
    date_format: keys.date,
    time_format: keys.time,
    tz_offset_minutes: -new Date().getTimezoneOffset(),
  };
}
