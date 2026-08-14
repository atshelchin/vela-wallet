/**
 * Step 1: generate a fresh multi-passkey keyset, compute the counterfactual
 * Safe address with vela-core, and persist everything to state/keys.json.
 * Idempotent-safe: refuses to overwrite an existing keyset unless --force.
 */
import { existsSync } from 'node:fs';
import {
  KEYS_FILE,
  generateKeys,
  packKeys,
  saveState,
  wasm,
} from './core';

const KEY_COUNT = Number(process.env.KEY_COUNT ?? 3);

if (existsSync(KEYS_FILE) && !process.argv.includes('--force')) {
  console.error(`refusing to overwrite ${KEYS_FILE} (pass --force to regenerate)`);
  process.exit(1);
}

const keys = generateKeys(KEY_COUNT);
const info = wasm.computeSafeAddressMulti(packKeys(keys));

saveState({
  keys,
  safeAddress: info.address,
  saltNonce: info.salt_nonce,
  setupData: info.setup_data,
  initCodeHash: info.init_code_hash,
});

console.log(`generated ${KEY_COUNT} P-256 keypairs → ${KEYS_FILE}`);
console.log('');
console.log(`  Safe (Gnosis):  ${info.address}`);
console.log('');
for (const [i, k] of keys.entries()) {
  const role =
    i === 0
      ? 'shared WebAuthn signer (owner 0)'
      : `factory signer ${wasm.computeWebauthnSignerAddress(
          Uint8Array.from(Buffer.from(k.x, 'hex')),
          Uint8Array.from(Buffer.from(k.y, 'hex')),
        )}`;
  console.log(`  key ${i}: x=${k.x.slice(0, 16)}… — ${role}`);
}
console.log('');
console.log('fund the Safe address with 1 xDAI, then run `bun run status` / `bun run deploy`');
