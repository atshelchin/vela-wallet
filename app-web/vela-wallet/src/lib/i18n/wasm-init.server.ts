/**
 * One-shot wasm initialization for every build-time vela-core consumer
 * (`engine.server.ts`, `wallet/identicon.server.ts`). Node module caching
 * makes this run exactly once per process; splitting it out keeps a second
 * consumer from calling `initSync` on an already-initialized module.
 */
import { initSync } from '../../../../../rust/pkg-web/vela_core.js';
import { WASM_BASE64 } from '../../../../../rust/pkg-web/vela_core_bg.base64.js';

initSync({ module: Buffer.from(WASM_BASE64, 'base64') });
