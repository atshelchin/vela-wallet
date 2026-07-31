#!/usr/bin/env python3
"""Re-encode any raster asset that is not really a PNG, and re-key every dump that used it.

Why this exists: the chain-logo CDN serves WebP bytes with `Content-Type: image/png`, so a dump
can carry a `data:image/png;base64,UklGRi...` payload. Penpot's media upload rejects it with a
bare "http error". Asset keys are content hashes, so rewriting a payload also rewrites its key —
this walks every pruned tree and remaps the affected assetKeys in the same pass.

    python3 fix-nonpng-assets.py dom-dumps/pruned
"""
import base64
import glob
import hashlib
import io
import json
import os
import sys

from PIL import Image

MAGIC_PNG = b'\x89PNG\r\n\x1a\n'


def main(d):
    remap = {}

    for p in sorted(glob.glob(os.path.join(d, '*.assets.json'))):
        assets = json.load(open(p))
        changed = False
        for k in list(assets):
            v = assets[k]
            if v['kind'] != 'img':
                continue
            raw = base64.b64decode(v['payload'].split(',', 1)[1])
            if raw.startswith(MAGIC_PNG):
                continue
            buf = io.BytesIO()
            Image.open(io.BytesIO(raw)).convert('RGBA').save(buf, 'PNG')
            payload = 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()
            nk = hashlib.sha1(payload.encode()).hexdigest()[:12]
            remap[k] = nk
            del assets[k]
            assets[nk] = {'kind': 'img', 'mime': 'image/png', 'payload': payload,
                          'label': v.get('label', ''), 'bytes': len(payload)}
            changed = True
            print('  %s -> %s  %dB -> %dB  (%s)' % (k, nk, v['bytes'], len(payload),
                                                    os.path.basename(p)))
        if changed:
            json.dump(assets, open(p, 'w'), separators=(',', ':'))

    # The remap has to outlive this run: the asset pass is self-erasing (second time round every
    # payload is already a PNG, so it yields nothing) while the tree pass may still have work left.
    side = os.path.join(d, '_remap.json')
    if os.path.exists(side):
        prev = json.load(open(side))
        prev.update(remap)
        remap = prev
    if not remap:
        print('nothing to fix')
        return
    json.dump(remap, open(side, 'w'), indent=1)

    hits = [0]

    def walk(n):
        if isinstance(n, list):          # pruned trees keep React-fragment arrays
            for c in n:
                walk(c)
            return
        if n.get('assetKey') in remap:
            n['assetKey'] = remap[n['assetKey']]
            hits[0] += 1
        for c in n.get('children', []):
            walk(c)

    trees = 0
    for p in sorted(glob.glob(os.path.join(d, '*.json'))):
        if p.endswith('.assets.json') or os.path.basename(p).startswith('_'):
            continue
        t = json.load(open(p))
        for n in t['tree']:
            walk(n)
        json.dump(t, open(p, 'w'), separators=(',', ':'))
        trees += 1
    print('remapped %d placements across %d trees (%d keys)' % (hits[0], trees, len(remap)))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'dom-dumps/pruned')
