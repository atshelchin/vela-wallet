// build-asset-library.mjs — produce the canonical asset payloads for the Penpot design source,
// straight from the app's own sources of truth. Run with: node build-asset-library.mjs
//
//   node specs/002-penpot-design-source/generator/build-asset-library.mjs
//
// Emits generator/assets/library.json:
//   { icons:   { "<LucideName>": "<svg …>" },            ← from the installed lucide package
//     identicons: { "<address>": "<svg …>" },            ← generated with the app's own algorithm
//     chainLogos: { "<chainId>": "<url>" },              ← canonical CDN URL, Penpot fetches it
//     tokenLogos: { "<chainId>:<address>": "<url>" } }
//
// Why not scrape these out of the rendered DOM: the DOM only ever contains what happened to be on
// screen. These three sources are complete and deterministic, so any icon, any address and any
// token can be produced — including ones no captured screen shows.
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const OUT_DIR = join(HERE, 'assets');

// ---------------------------------------------------------------- Lucide icons
// lucide-react-native ships each icon as [tag, attrs][] node arrays; rebuild the SVG exactly as
// the runtime does (24x24 viewBox, stroke currentColor, width 2, round caps/joins).
// Each icon ships as its own .mjs calling createLucideIcon(name, nodes). Importing them means
// executing React Native code, so parse the node arrays out of the source instead — the files are
// generated and uniformly shaped, and this keeps the build free of any RN runtime.
function buildIcons() {
  const icons = {};
  const dir = join(REPO, 'node_modules/lucide-react-native/dist/esm/icons');
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.mjs'));
  } catch (e) {
    return { icons, error: 'lucide icons dir unreadable: ' + e.message };
  }
  const failed = [];
  for (const file of files) {
    const src = readFileSync(join(dir, file), 'utf8');
    const m = src.match(/createLucideIcon\(\s*"([^"]+)"\s*,\s*(\[[\s\S]*?\])\s*\)/);
    if (!m) { failed.push(file); continue; }
    const [, name, nodesSrc] = m;
    let nodes;
    try {
      // object keys are unquoted in the generated source; JSON.parse cannot read it
      nodes = new Function('return ' + nodesSrc)();
    } catch (e) { failed.push(file); continue; }
    const body = nodes.map(([tag, attrs]) => {
      const a = Object.entries(attrs || {})
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    }).join('');
    icons[name] = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" `
      + `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" `
      + `stroke-linejoin="round">${body}</svg>`;
  }
  return { icons, error: failed.length ? failed.length + ' icon files unparsed' : undefined };
}

// ---------------------------------------------------------------- Nimiq identicons
// Mirrors src/components/ui/Identicon.tsx exactly: assemble from the library's params rather than
// calling createIdenticon (its hardcoded clipPath id="a" collides document-wide on the web), and
// lowercase+cap the seed (the chaotic hash underflows past ~1500 chars and emits fill="undefined").
async function buildIdenticons(seeds) {
  const out = {};
  let core;
  try {
    core = await import(join(REPO, 'node_modules/identicons-esm/core/index.js'));
  } catch {
    try { core = await import('identicons-esm/core'); }
    catch (e) { return { identicons: out, error: 'identicons-esm not importable: ' + e.message }; }
  }
  const { getIdenticonsParams, defaultCircleShape, defaultShadow } = core;
  for (const seed of seeds) {
    const key = String(seed).toLowerCase().slice(0, 128);
    const { sections, colors } = getIdenticonsParams(key);
    out[seed] =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">` +
      `<path fill="${colors.background}" d="M0 0h160v160H0z"/>` +
      `<g fill="${colors.accent}" color="${colors.main}">` +
      defaultCircleShape(colors.main) + defaultShadow +
      sections.top + sections.sides + sections.face + sections.bottom +
      `</g></svg>`;
  }
  return { identicons: out };
}

// ---------------------------------------------------------------- chain + token logos
// Same URL shapes the app itself builds (src/models/network.ts, src/models/types.ts). The Penpot
// backend can reach this CDN (verified), so these stay URLs and are pulled by uploadMediaUrl —
// no base64 in the dumps.
const CDN = 'https://ethereum-data.awesometools.dev';
const CHAINS = [
  [1, 'Ethereum'], [56, 'BNB Chain'], [137, 'Polygon'], [42161, 'Arbitrum'], [10, 'Optimism'],
  [8453, 'Base'], [43114, 'Avalanche'], [100, 'Gnosis'], [130, 'Unichain'], [4217, 'Tempo'],
  [143, 'Monad'], [480, 'World Chain'],
];
const TOKENS = [
  // chainId, address (checksummed), symbol — the fixture/demo set the boards actually show
  [1, '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 'USDC'],
  [1, '0xdAC17F958D2ee523a2206206994597C13D831ec7', 'USDT'],
  [1, '0x6B175474E89094C44Da98b954EedeAC495271d0F', 'DAI'],
  [56, '0x55d398326f99059fF775485246999027B3197955', 'USDT'],
  [100, '0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d', 'WXDAI'],
  [8453, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', 'USDC'],
];

function buildLogos() {
  const chainLogos = {};
  for (const [id, name] of CHAINS) chainLogos[id] = { name, url: `${CDN}/chainlogos/eip155-${id}.png` };
  const tokenLogos = {};
  for (const [chainId, address, symbol] of TOKENS) {
    tokenLogos[`${chainId}:${address}`] = {
      symbol, chainId, address,
      url: `${CDN}/assets/eip155-${chainId}/${address}/logo.png`,
      fallbackUrl: `${CDN}/assets/eip155-${chainId}/${address.toLowerCase()}/logo.png`,
    };
  }
  return { chainLogos, tokenLogos };
}

// ---------------------------------------------------------------- main
const SEEDS = [
  '0xD40086dB39F2f9E4E3a2fcC2eBF8B2f4bB1de130b',   // Parallel One (fixture wallet)
  '0x7099797f0e6e40d43D8b78ac3F0ac89b0F4F0d8b',   // demo recipient
  '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',   // demo contract
];

const { icons, error: iconErr } = buildIcons();
const { identicons, error: idErr } = await buildIdenticons(SEEDS);
const { chainLogos, tokenLogos } = buildLogos();

mkdirSync(OUT_DIR, { recursive: true });
const lib = { generatedAt: null, icons, identicons, chainLogos, tokenLogos };
writeFileSync(join(OUT_DIR, 'library.json'), JSON.stringify(lib));
// icons are the bulk; keep a name-only index for humans
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({
  iconCount: Object.keys(icons).length,
  iconNames: Object.keys(icons).sort(),
  identiconSeeds: Object.keys(identicons),
  chains: Object.keys(chainLogos),
  tokens: Object.keys(tokenLogos),
  errors: [iconErr, idErr].filter(Boolean),
}, null, 2));

console.log(`icons: ${Object.keys(icons).length}${iconErr ? ' (' + iconErr + ')' : ''}`);
console.log(`identicons: ${Object.keys(identicons).length}${idErr ? ' (' + idErr + ')' : ''}`);
console.log(`chain logos: ${Object.keys(chainLogos).length}  token logos: ${Object.keys(tokenLogos).length}`);
console.log(`→ ${join(OUT_DIR, 'library.json')}`);
