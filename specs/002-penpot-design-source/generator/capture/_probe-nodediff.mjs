// Node-level diff of two dumps: which painting nodes differ, and how.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const D = resolve(HERE, '../../dom-dumps/screens');

const flat = (dump) => {
  const out = [];
  const visit = (n) => {
    if (Array.isArray(n)) { for (const c of n) visit(c); return; }
    if (!n || typeof n !== 'object') return;
    const paints = n.text || n.bg || n.border || n.shadow || n.radius || n.kind ||
                   n.color || n.opacity !== undefined || n.svg;
    if (paints) {
      out.push({
        box: [Math.round(n.x), Math.round(n.y), Math.round(n.w), Math.round(n.h)].join(','),
        text: (n.text || '').slice(0, 40), bg: n.bg || '', color: n.color || '',
        op: n.opacity, kind: n.kind || '',
        svg: n.svg ? String(n.svg).length + ':' + String(n.svg).slice(0, 60).replace(/\s+/g, ' ') : '',
      });
    }
    if (n.children) visit(n.children);
  };
  visit(dump.tree);
  return out;
};

const [a, b] = process.argv.slice(2);
const A = flat(JSON.parse(readFileSync(resolve(D, a + '.json'), 'utf8')));
const B = flat(JSON.parse(readFileSync(resolve(D, b + '.json'), 'utf8')));
console.log(`${a}: ${A.length} nodes | ${b}: ${B.length} nodes`);
const n = Math.max(A.length, B.length);
let diffs = 0;
for (let i = 0; i < n; i++) {
  const x = A[i], y = B[i];
  const sx = JSON.stringify(x), sy = JSON.stringify(y);
  if (sx !== sy) {
    diffs++;
    console.log(`#${i}`);
    console.log('   A ' + sx);
    console.log('   B ' + sy);
  }
}
console.log('differing nodes:', diffs, '/', n);
