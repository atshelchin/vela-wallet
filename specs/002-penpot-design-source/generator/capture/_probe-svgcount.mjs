// Do these dumps carry svg markup at all? (If not, a checkbox tick is invisible to the board.)
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const D = resolve(dirname(fileURLToPath(import.meta.url)), '../../dom-dumps/screens');
for (const slug of process.argv.slice(2)) {
  const d = JSON.parse(readFileSync(resolve(D, slug + '.json'), 'utf8'));
  let nodes = 0, withSvg = 0, kindSvg = 0, colors = [];
  const visit = (n) => {
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (!n || typeof n !== 'object') return;
    nodes++;
    if (n.svg) { withSvg++; colors.push(String(n.svg).slice(0, 0) + (String(n.svg).match(/stroke="([^"]+)"/) || [])[1]); }
    if (n.kind === 'svg') kindSvg++;
    if (n.children) visit(n.children);
  };
  visit(d.tree);
  console.log(`${slug.padEnd(32)} nodes=${nodes} kind:svg=${kindSvg} withSvgMarkup=${withSvg} strokes=${JSON.stringify(colors)}`);
}
