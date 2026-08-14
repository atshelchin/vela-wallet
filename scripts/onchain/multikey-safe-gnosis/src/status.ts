/**
 * Step 2: watch the counterfactual wallet — funding balance, Safe code, and
 * each extra key's signer-proxy code, straight from Gnosis RPC.
 */
import { hexToBytes, loadState, rpc, wasm } from './core';

const state = loadState();

const balanceHex = (await rpc('eth_getBalance', [state.safeAddress, 'latest'])) as string;
const balance = BigInt(balanceHex);
const safeCode = (await rpc('eth_getCode', [state.safeAddress, 'latest'])) as string;

console.log(`Safe:     ${state.safeAddress}`);
console.log(`balance:  ${Number(balance) / 1e18} xDAI`);
console.log(`deployed: ${safeCode !== '0x' ? 'yes' : 'no (counterfactual)'}`);

for (const [i, k] of state.keys.entries()) {
  if (i === 0) continue;
  const signer = wasm.computeWebauthnSignerAddress(hexToBytes(k.x), hexToBytes(k.y));
  const code = (await rpc('eth_getCode', [signer, 'latest'])) as string;
  console.log(`signer ${i}: ${signer} — ${code !== '0x' ? 'deployed' : 'counterfactual'}`);
}
