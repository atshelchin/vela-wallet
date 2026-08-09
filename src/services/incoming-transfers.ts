/**
 * Incoming-transfer discovery — NATIVE.
 *
 * The platform seam for the receive scanner. Native keeps the TypeScript
 * monitor exactly as it is: this module re-exports `transfer-monitor.ts`'s
 * `fetchIncomingTransfers` with the same name, signature and semantics, so the
 * only thing that changed for iOS/Android is which module `activity.ts` names.
 *
 * `incoming-transfers.web.ts` is the web twin and drives the `token_trust`
 * core instead (spec 017, group G7).
 */

export { fetchIncomingTransfers } from '@/services/transfer-monitor';
