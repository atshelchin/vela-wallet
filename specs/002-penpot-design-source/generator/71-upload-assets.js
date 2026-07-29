// 71-upload-assets.js — upload a dump's deduplicated asset registry into Penpot ONCE.
// Input:  storage.assetBatch = { "<key>": { kind:'svg'|'img', mime, payload } , ... }
// Output: storage.assets[key] = { kind:'svg', svg }  |  { kind:'img', media: <ImageData> }
// The board converter (70) then references assets by key, so a chain logo used a dozen times on a
// screen is uploaded once and the tree payload stays small enough for a single call.
if (!storage.lib) (new Function('storage','penpot','penpotUtils', penpot.currentFile.getPluginData('velaLib')))(storage, penpot, penpotUtils);
const batch = storage.assetBatch;
if (!batch) throw new Error('set storage.assetBatch first');
storage.assets = storage.assets || {};

const out = { uploaded: 0, reused: 0, svg: 0, failed: [] };
for (const [key, a] of Object.entries(batch)) {
  if (storage.assets[key]) { out.reused++; continue; }
  try {
    if (a.kind === 'svg') {
      // SVG stays as markup; the converter turns it into real vector shapes per placement
      storage.assets[key] = { kind: 'svg', svg: a.payload };
      out.svg++;
    } else {
      const uri = a.payload;
      const comma = uri.indexOf(',');
      const b64 = uri.slice(comma + 1);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const media = await penpot.uploadMediaData('asset-' + key, bytes, a.mime || 'image/png');
      storage.assets[key] = { kind: 'img', media };
      out.uploaded++;
    }
  } catch (e) {
    out.failed.push(key + ' (' + (a.label || a.kind) + '): ' + (e && e.message ? e.message : String(e)));
  }
}
out.registrySize = Object.keys(storage.assets).length;
return out;
