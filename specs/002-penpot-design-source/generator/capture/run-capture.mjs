#!/usr/bin/env node
// run-capture.mjs — drive the running web app with Playwright and dump captures to disk.
//
// The capture harness (`capture-states.js` + `state-specs*.json`) already existed but was executed
// by hand through chrome-devtools' evaluate_script. That browser is also the one holding the Penpot
// plugin session, so it cannot be driven and used at the same time — and a capture pass that only a
// human can run is a capture pass that stops happening. This wrapper runs the SAME harness in its
// own Playwright browser, so a recapture is one command.
//
// Usage:
//   node run-capture.mjs --spec state-specs-2.json                 # a whole spec file
//   node run-capture.mjs --spec state-specs.json --group /wallet   # one URL group
//   node run-capture.mjs --url /wallet --slug home-activity --board S/home/activity \
//        --page '05 Screens · Wallet' --pre "vela.failRpc('all')"  # one ad-hoc state
//
// Output: dom-dumps/<dir>/<slug>.json (default dir: screens) + a merged _global.assets.json.
//
// EXIT CODE IS THE POINT. A capture step can find its element, dispatch its events, throw nothing
// and change nothing; the harness then hands back a dump of the PREVIOUS screen under the new slug.
// That is how S/home/activity, S/home/assets and S/home/connections all reached the design file
// showing the Activity tab. This process now exits non-zero when any state fails its
// post-conditions, so a wrong board cannot be produced by a command that reports success.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = resolve(HERE, '..');
const DUMPS = resolve(GEN, '../dom-dumps');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const has = (k) => argv.includes('--' + k);

const BASE = arg('base', 'http://127.0.0.1:8083');
const OUTDIR = resolve(DUMPS, arg('dir', 'screens'));
if (!existsSync(OUTDIR)) mkdirSync(OUTDIR, { recursive: true });

const extractor = readFileSync(resolve(GEN, 'extract-dom-layout.js'), 'utf8');
const harness = readFileSync(resolve(GEN, 'capture-states.js'), 'utf8');

// Lift the harness's own fingerprint function into Node rather than reimplementing it here. Two
// copies of "are these the same picture?" would drift, and the first symptom of drift is a
// duplicate board that the in-page check rejects and the driver accepts, or the reverse.
const fingerprintDump = new Function(harness + '\nreturn fingerprintDump;')();

// Fingerprint a board already on disk, so a PARTIAL rerun still has something to compare against.
// Recapturing home-assets by itself collides with nothing in-run — home-activity is not being
// recaptured — so without this the one command anyone actually types is the one with no check.
const findDump = (slug) => {
  const direct = resolve(OUTDIR, slug + '.json');
  if (existsSync(direct)) return direct;
  for (const e of readdirSync(DUMPS)) {
    const p = resolve(DUMPS, e, slug + '.json');
    if (statSync(resolve(DUMPS, e)).isDirectory() && existsSync(p)) return p;
  }
  return null;
};
const fpOnDisk = (slug) => {
  const p = findDump(slug);
  if (!p) return null;
  try { return fingerprintDump(JSON.parse(readFileSync(p, 'utf8'))); } catch { return null; }
};

const browser = await chromium.launch();
// The phone frame only appears at desktop width — at a narrow viewport the app renders full-bleed
// and `extractLayout` finds no 390px frame to measure against.
// hasTouch: the `pull` act builds real Touch objects, and `new Touch()` throws in a context
// without touch support — pull-to-refresh is the only way to force Home past its RPC cache.
const page = await browser.newPage({ viewport: { width: 1280, height: 950 }, deviceScaleFactor: 2, hasTouch: true });
page.on('pageerror', (e) => console.error('PAGE ERROR:', String(e).slice(0, 200)));

const install = async () => {
  await page.evaluate(extractor + '\nwindow.preloadAssets = preloadAssets; window.extractLayout = extractLayout;');
  await page.evaluate(harness + '\nwindow.captureStates = captureStates; window.captureAll = captureAll;');
};

// `stale` is its own category and not a rounding error on `failed`. When a state fails, nothing is
// written — but the dump from the LAST run is still sitting there under that slug, and every
// downstream step (70-board-from-dom, the region maps) will happily consume it as though this run
// had blessed it. Naming those files is the difference between "2 states failed" and "2 boards in
// the design file are now unverified".
const out = { captured: [], failed: [], stale: [], assets: {} };
// every fingerprint this run has accepted, handed to each subsequent group as its baseline
const runFps = {};

// The ad-hoc path gets the same post-conditions as a spec state. It used to get none, which is why
// `--click "Assets"` could report a hit and still dump the Activity tab: --expect/--forbid say what
// must be on screen, --differs-from names the sibling board this one must not be a copy of.
const dumpOne = async (slug, board, pageName, note) => {
  const res = await page.evaluate(async () => {
    await window.preloadAssets();
    return window.extractLayout();
  });
  if (!res || !res.tree || !res.tree.length) { out.failed.push(slug + ': empty tree'); return null; }

  const body = (await page.evaluate(() => document.body.innerText || '')).toLowerCase();
  for (const want of (arg('expect') ? arg('expect').split('|') : [])) {
    if (!body.includes(want.toLowerCase())) { out.failed.push(slug + ': expected on screen but absent: ' + want); return null; }
  }
  for (const no of (arg('forbid') ? arg('forbid').split('|') : [])) {
    if (body.includes(no.toLowerCase())) { out.failed.push(slug + ': forbidden but present on screen: ' + no); return null; }
  }
  const fp = fingerprintDump(res);
  for (const target of (arg('differs-from') ? arg('differs-from').split('|') : [])) {
    const other = fpOnDisk(target);
    // an unavailable comparison is a failure, not a pass — a check that quietly declines to run is
    // exactly how three identical home boards were signed off as three different screens
    if (!other) { out.failed.push(slug + ': differs-from target "' + target + '" has no dump on disk to compare against'); return null; }
    if (other === fp) { out.failed.push(slug + ': identical to "' + target + '" — the steps changed nothing (fp ' + fp + ')'); return null; }
  }

  writeFileSync(resolve(OUTDIR, slug + '.json'), JSON.stringify(res));
  out.captured.push({ slug, board, page: pageName, note: note || '', w: res.frame.w, h: res.frame.h, fp });
  return res;
};

const goto = async (path, settle) => {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(settle || 4000);
  await install();
};

if (arg('spec')) {
  const spec = JSON.parse(readFileSync(resolve(GEN, arg('spec')), 'utf8'));
  const groups = Array.isArray(spec) ? spec : (spec.groups || []);
  const only = arg('group');
  for (const group of groups) {
    if (only && group.url !== only) continue;
    await goto(group.url, group.settle);
    // Seed the group's baseline: everything captured so far this run, plus the on-disk fingerprint
    // of every board a state in this group names in `differsFrom`. Resolving those here rather than
    // in the page is what makes `--group` and a single-state recapture as safe as a full sweep.
    const baseline = Object.assign({}, runFps);
    for (const st of (group.states || [])) {
      for (const target of [].concat(st.differsFrom || [])) {
        if (target in baseline) continue;
        const fp = fpOnDisk(target);
        if (fp) baseline[target] = fp;
        else console.error('  ! differsFrom target has no dump on disk:', target);
      }
    }
    const r = await page.evaluate(async ([g, b]) => await window.captureStates(g, b), [group, baseline]);
    for (const [slug, dump] of Object.entries(r.captured || {})) {
      writeFileSync(resolve(OUTDIR, slug + '.json'), JSON.stringify(dump));
      const st = (group.states || []).find((s) => s.slug === slug) || {};
      out.captured.push({ slug, board: st.board, page: st.page, note: st.note || '', w: dump.frame.w, h: dump.frame.h });
    }
    Object.assign(runFps, r.fingerprints || {});
    for (const [slug, why] of Object.entries(r.failed || {})) {
      out.failed.push(slug + ': ' + why);
      const p = findDump(slug);
      if (p) out.stale.push(slug + ': not rewritten — ' + p + ' is from an earlier run and is now unverified');
    }
    console.log(group.url, '→', Object.keys(r.captured || {}).length, 'ok,', Object.keys(r.failed || {}).length, 'failed');
    for (const [slug, why] of Object.entries(r.failed || {})) console.error('  FAILED', slug, '—', why);
  }
} else {
  // ad-hoc single state
  var adhocAborted = false;
  const url = arg('url', '/wallet');
  await goto(url, Number(arg('settle', 4000)));
  const pre = arg('pre');
  if (pre) {
    await page.evaluate((code) => { try { eval(code); } catch (e) { console.error('pre failed', e); } }, pre);
    await page.waitForTimeout(Number(arg('after', 3500)));
  }
  for (const step of (arg('click') ? arg('click').split('|') : [])) {
    // report the hit: a click that silently found nothing produced a dump of the PREVIOUS state,
    // which is indistinguishable from a correct capture of a screen that never changed
    const hit = await page.evaluate((t) => {
      const cands = [...document.querySelectorAll('[role="button"],button,[tabindex]')]
        .filter((e) => (e.textContent || '').trim().toLowerCase().includes(String(t).toLowerCase()));
      if (!cands.length) return 'MISS: ' + t;
      const el = cands[cands.length - 1];   // innermost match wins: the label, not its container
      for (const ev of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window }));
      }
      return 'hit(' + cands.length + '): ' + (el.textContent || '').trim().slice(0, 30);
    }, step);
    console.error('  click', JSON.stringify(step), '→', hit);
    // a MISS was only ever printed. Printing is not stopping: the run carried on and dumped the
    // screen the click failed to leave, under the slug of the screen it was supposed to reach.
    if (String(hit).startsWith('MISS')) {
      out.failed.push(arg('slug', 'adhoc') + ': click found no element for ' + JSON.stringify(step));
      adhocAborted = true;
      break;
    }
    await page.waitForTimeout(Number(arg("clickwait", 3200)));
  }
  if (has('shot')) await page.screenshot({ path: resolve(OUTDIR, arg('slug', 'adhoc') + '.png') });
  if (!adhocAborted) await dumpOne(arg('slug', 'adhoc'), arg('board', ''), arg('page', ''), arg('note', ''));
  if (out.failed.length) {
    const p = findDump(arg('slug', 'adhoc'));
    if (p) out.stale.push(arg('slug', 'adhoc') + ': not rewritten — ' + p + ' is from an earlier run and is now unverified');
  }
}

// MERGE THE INDEX. The driver used to print these entries and leave the merging to whoever was
// watching, which meant a capture could succeed and still be invisible: the dump sits on disk, no
// index entry points at it, and every downstream step (region maps, 73, the audits) skips it in
// silence. That happened twice. A dump this run verified is a dump this run registers.
if (out.captured.length) {
  const idxPath = resolve(OUTDIR, '_index.json');
  const prev = existsSync(idxPath) ? JSON.parse(readFileSync(idxPath, 'utf8')) : [];
  const bySlug = new Map(prev.map((e) => [e.slug, e]));
  let added = 0, updated = 0;
  for (const c of out.captured) {
    const { fp, ...entry } = c;                      // the fingerprint is run state, not manifest data
    if (bySlug.has(entry.slug)) { Object.assign(bySlug.get(entry.slug), entry); updated++; }
    else { bySlug.set(entry.slug, entry); added++; }
  }
  const merged = prev.filter((e) => bySlug.has(e.slug));
  for (const [slug, e] of bySlug) if (!merged.includes(e)) merged.push(e);
  writeFileSync(idxPath, JSON.stringify(merged, null, 1) + '\n');
  out.index = { file: idxPath, added, updated, total: merged.length };
}

// merge the asset registry the extractor collected across every state in this run
const assets = await page.evaluate(() => {
  const map = window.__ASSETMAP || {};
  const o = {};
  for (const [url, uri] of Object.entries(map)) o[url] = uri;
  return o;
});
out.assetCount = Object.keys(assets).length;
writeFileSync(resolve(OUTDIR, '_run-assets.json'), JSON.stringify(assets));

await browser.close();
console.log(JSON.stringify({ captured: out.captured.map((c) => c.slug), index: out.index, failed: out.failed, stale: out.stale, assets: out.assetCount }, null, 1));

// Fail loudly and last, so the reason is the final thing on screen. A capture pass whose broken
// states scroll past in a JSON blob is a capture pass whose broken states ship.
if (out.failed.length) {
  console.error('\n' + out.failed.length + ' state(s) FAILED their post-conditions — nothing was written for them:');
  for (const f of out.failed) console.error('  ✗ ' + f);
  if (out.stale.length) {
    console.error('\n' + out.stale.length + ' slug(s) still hold a dump from an EARLIER run. Those boards are ' +
      'unverified: fix the steps and recapture, or delete the file so nothing downstream consumes it.');
    for (const s of out.stale) console.error('  ! ' + s);
  }
  process.exit(1);
}
