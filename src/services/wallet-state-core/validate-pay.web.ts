/**
 * `/pay` query validation — WEB, the payment_request core driven
 * synchronously.
 *
 * `link_opened` is a pure event (it requests no shell operations), so no
 * effect loop is needed: construct a core, dispatch once, read the typed
 * verdict, free it. The strict grammar lives in Rust
 * (`payment_request.rs::validate_pay_query`), tested against the crash and
 * misparse inputs the old inline parse mishandled.
 */

import '@/services/vela-core';
import { PaymentRequestCore } from '../../../rust/pkg-web/vela_core.js';

import type { PayRequest } from './generated/PayRequest';
import type { PaymentRequestView } from './generated/PaymentRequestView';
import type { RawPayQuery } from './types';

export function validatePayQuery(query: RawPayQuery): PayRequest | null {
  const core = new PaymentRequestCore();
  try {
    const result = JSON.parse(
      core.dispatch(
        JSON.stringify({
          type: 'link_opened',
          to: query.to ?? null,
          chain: query.chain ?? null,
          token: query.token ?? null,
          amount: query.amount ?? null,
          sym: query.sym ?? null,
          dec: query.dec ?? null,
          net: query.net ?? null,
        }),
      ),
    ) as { view: PaymentRequestView };
    return result.view.pay_valid ? (result.view.pay ?? null) : null;
  } finally {
    core.free();
  }
}
