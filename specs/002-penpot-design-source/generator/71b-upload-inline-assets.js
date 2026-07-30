// 71b-upload-inline-assets.js — upload the raster bytes a FRESH capture carries inline.
//
// The pruning step of the original pipeline lifted every image out of a dump into a shared registry
// and left an `assetKey` behind. A dump straight off `run-capture.mjs` has not been pruned: the
// bytes sit in each node as `dataUri`, with no key. 70 then found nothing in `storage.assets` and
// drew the red missing-asset box over every token logo.
//
// This walks the dump, uploads each DISTINCT dataUri once, and registers it under the dataUri
// itself — which is what 70's fallback looks up. Keyed by the string, so a logo used a dozen times
// on a screen is uploaded once, and re-running is free.
//
// Input: storage.domDump (the dump about to be converted)
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const dump = storage.domDump;
if (!dump) throw new Error('set storage.domDump first');
storage.assets = storage.assets || {};

const seen = new Set();
const walk = (n) => {
  if (!n) return;
  if (n.kind === 'img' && n.dataUri && !n.assetKey) seen.add(n.dataUri);
  for (const k of (n.children || []).flat(Infinity)) walk(k);
};
for (const r of (dump.tree || []).flat(Infinity)) walk(r);

const out = { distinct: seen.size, uploaded: 0, reused: 0, failed: [] };
for (const uri of seen) {
  if (storage.assets[uri]) { out.reused++; continue; }
  try {
    const comma = uri.indexOf(',');
    const meta = uri.slice(0, comma);
    const mime = (meta.match(/^data:([^;]+)/) || [])[1] || 'image/png';
    const bin = atob(uri.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const media = await penpot.uploadMediaData('inline-' + out.uploaded, bytes, mime);
    storage.assets[uri] = { kind: 'img', media };
    out.uploaded++;
  } catch (e) {
    out.failed.push(String((e && e.message) || e).slice(0, 80));
  }
}
return storage.lib.done('71b-upload-inline-assets', out);
