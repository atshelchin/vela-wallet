// Fingerprint the four suspicious pairs with the harness's OWN fingerprintDump.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = resolve(HERE, '..');
const D = resolve(GEN, '../dom-dumps/screens');
const harness = readFileSync(resolve(GEN, 'capture-states.js'), 'utf8');
const fingerprintDump = new Function(harness + '\nreturn fingerprintDump;')();

const pairs = [
  ['home-rate-limited', 'home-rpc-trouble'],
  ['onboarding-create', 'onboarding-create-form-ready'],
  ['settings-root', 'settings-scrolled'],
  ['web-request-error-no-session', 'web-request-unavailable'],
];
for (const [a, b] of pairs) {
  const fa = fingerprintDump(JSON.parse(readFileSync(resolve(D, a + '.json'), 'utf8')));
  const fb = fingerprintDump(JSON.parse(readFileSync(resolve(D, b + '.json'), 'utf8')));
  console.log((fa === fb ? 'IDENTICAL ' : 'differs   ') + a + '  vs  ' + b);
  console.log('           ' + fa + '   |   ' + fb);
}
