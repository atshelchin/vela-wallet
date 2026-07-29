#!/usr/bin/env python3
"""Prune a DOM layout dump and split its assets into a deduplicated registry.

Two outputs per dump:
  <out>/<slug>.json         the tree — small, one execute_code call, assets referenced by key
  <out>/<slug>.assets.json  {key: {kind:'svg'|'img', mime, payload}} — uploaded separately, once

Deduplication matters: the same chain logo can appear a dozen times on one screen, and inlining
its data URI each time would bloat the tree past what a single call can carry.

    python3 prune-dump.py dom-dumps/home-assets.json dom-dumps/pruned
"""
import hashlib
import json
import os
import sys

DEV_LABELS = {'Parallel space active — test environment'}
DEV_TEXTS = {'PARALLEL SPACE', 'mock passkey · test', 'status: ', 'idle', ' rid:', '(none)'}
KEEP = {'x', 'y', 'w', 'h', 'text', 'bg', 'color', 'font', 'radius', 'border',
        'shadow', 'opacity', 'kind', 'label', 'children', 'assetKey'}
FONT_KEEP = {'size', 'weight', 'family', 'lineHeight', 'letterSpacing', 'transform'}


def take_asset(node, assets):
    """Move an svg/data-uri payload into the registry, return its key."""
    if node.get('kind') == 'svg' and node.get('svg'):
        payload = node['svg']
        kind, mime = 'svg', 'image/svg+xml'
    elif node.get('kind') == 'img' and node.get('dataUri', '').startswith('data:'):
        payload = node['dataUri']
        mime = payload[5:payload.index(',')].split(';')[0] or 'image/png'
        kind = 'img'
    else:
        return None
    key = hashlib.sha1(payload.encode()).hexdigest()[:12]
    if key not in assets:
        assets[key] = {'kind': kind, 'mime': mime, 'payload': payload,
                       'label': node.get('label') or '', 'bytes': len(payload)}
    return key


def prune(node, frame, assets):
    if node.get('label') in DEV_LABELS:
        return None
    if node.get('text', '').strip() in DEV_TEXTS:
        return None

    key = take_asset(node, assets)
    kids = [k for k in (prune(c, frame, assets) for c in node.get('children', [])) if k]
    out = {k: v for k, v in node.items() if k in KEEP and k != 'children'}
    if key:
        out['assetKey'] = key
        # an svg's internal <path> children are carried by the markup itself
        if out.get('kind') == 'svg':
            kids = []
    if 'font' in out:
        out['font'] = {k: v for k, v in out['font'].items() if k in FONT_KEEP}
    if 'label' in out and not out.get('kind'):
        del out['label']
    if kids:
        out['children'] = kids

    paints = any(k in out for k in ('bg', 'border', 'shadow', 'text', 'kind'))
    if not paints:
        if not kids:
            return None
        if round(out.get('w', 0)) >= frame['w'] - 1 and round(out.get('h', 0)) >= frame['h'] - 1:
            return kids if len(kids) != 1 else kids[0]
    return out


def flatten(items):
    out = []
    for i in items:
        if isinstance(i, list):
            out.extend(flatten(i))
        elif i:
            out.append(i)
    return out


def main(path, out_dir):
    d = json.load(open(path))
    frame = d['frame']
    assets = {}
    tree = flatten([prune(t, frame, assets) for t in d['tree']])
    out = {'url': d['url'], 'frame': frame, 'webTextBoost': d.get('webTextBoost', 1.2), 'tree': tree}

    os.makedirs(out_dir, exist_ok=True)
    slug = os.path.basename(path).replace('.json', '')
    s = json.dumps(out, separators=(',', ':'), ensure_ascii=True)
    json.loads(s)
    open(os.path.join(out_dir, slug + '.json'), 'w').write(s)
    a = json.dumps(assets, separators=(',', ':'), ensure_ascii=True)
    json.loads(a)
    open(os.path.join(out_dir, slug + '.assets.json'), 'w').write(a)

    before = len(json.dumps(d, separators=(',', ':')))
    svgs = sum(1 for v in assets.values() if v['kind'] == 'svg')
    imgs = len(assets) - svgs
    print(f'{slug}: tree {before}->{len(s)}B  assets {len(assets)} unique '
          f'({svgs} svg, {imgs} img, {len(a)}B)', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'dom-dumps/pruned')
