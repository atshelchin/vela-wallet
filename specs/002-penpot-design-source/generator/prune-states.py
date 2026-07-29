#!/usr/bin/env python3
"""Turn the screen-state capture batches into board-ready dumps + one shared asset registry.

`capture-states.js` writes one file per batch, keyed by state slug, with the app's full rendered
tree for each. This prunes them the way prune-dump.py prunes a single screen, lifts icon/logo
payloads into a content-hashed registry shared by every state, and records which board and page
each one belongs on (from the spec files, so the mapping stays reviewable in git).

    python3 prune-states.py dom-dumps/states dom-dumps/screens

Later batches win on slug collisions: a state is re-captured when its first attempt was wrong.
"""
import hashlib
import json
import os
import sys
import glob

KEEP = {'x', 'y', 'w', 'h', 'text', 'bg', 'color', 'font', 'radius', 'border',
        'shadow', 'opacity', 'kind', 'label', 'children', 'assetKey'}
FONT_KEEP = {'size', 'weight', 'family', 'lineHeight', 'letterSpacing', 'transform'}
# dev-only chrome the app paints over every screen in a dev build — not part of the design
DEV_LABELS = {'Parallel space active — test environment'}
DEV_TEXTS = {'PARALLEL SPACE', 'mock passkey · test', 'status: ', 'idle', ' rid:', '(none)',
             'status: idle rid:(none)'}


def take_asset(node, assets):
    if node.get('kind') == 'svg' and node.get('svg'):
        payload, kind, mime = node['svg'], 'svg', 'image/svg+xml'
    elif node.get('kind') == 'img' and node.get('dataUri', '').startswith('data:'):
        payload = node['dataUri']
        mime = payload[5:payload.index(',')].split(';')[0] or 'image/png'
        kind = 'img'
    else:
        return None
    key = hashlib.sha1(payload.encode()).hexdigest()[:12]
    assets.setdefault(key, {'kind': kind, 'mime': mime, 'payload': payload,
                            'label': node.get('label') or '', 'bytes': len(payload)})
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
        if out.get('kind') == 'svg':
            kids = []
    if 'font' in out:
        out['font'] = {k: v for k, v in out['font'].items() if k in FONT_KEEP}
    if 'label' in out and not out.get('kind'):
        del out['label']
    if kids:
        out['children'] = kids
    paints = any(k in out for k in ('bg', 'border', 'shadow', 'text', 'kind', 'radius'))
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


def main(in_dir, out_dir):
    # board/page per slug comes from the spec files, not from the capture
    meta = {}
    for spec in glob.glob(os.path.join(os.path.dirname(in_dir) or '.', '..', 'generator', 'state-specs*.json')):
        for group in json.load(open(spec)):
            for st in group['states']:
                meta[st['slug']] = {'board': st['board'], 'page': st['page'],
                                    'note': st.get('note', ''), 'url': group['url']}

    captured = {}
    for path in sorted(glob.glob(os.path.join(in_dir, '*.json'))):
        batch = json.load(open(path))
        for slug, dump in batch.get('captured', {}).items():
            captured[slug] = dump           # later file wins

    os.makedirs(out_dir, exist_ok=True)
    assets, index, unmapped = {}, [], []
    for slug, dump in sorted(captured.items()):
        m = meta.get(slug)
        if not m:
            unmapped.append(slug)
            continue
        frame = dump['frame']
        tree = flatten([prune(t, frame, assets) for t in dump['tree']])
        out = {'url': m['url'], 'frame': frame, 'webTextBoost': dump.get('webTextBoost', 1.2), 'tree': tree}
        s = json.dumps(out, separators=(',', ':'), ensure_ascii=True)
        json.loads(s)
        open(os.path.join(out_dir, slug + '.json'), 'w').write(s)
        index.append({'slug': slug, 'board': m['board'], 'page': m['page'], 'note': m['note'],
                      'w': frame['w'], 'h': frame['h'], 'bytes': len(s)})

    json.dump(index, open(os.path.join(out_dir, '_index.json'), 'w'), indent=1, ensure_ascii=False)
    a = json.dumps(assets, separators=(',', ':'), ensure_ascii=True)
    json.loads(a)
    open(os.path.join(out_dir, '_global.assets.json'), 'w').write(a)

    svgs = sum(1 for v in assets.values() if v['kind'] == 'svg')
    print(f'states: {len(index)}  assets: {len(assets)} ({svgs} svg, {len(assets)-svgs} img, {len(a)}B)',
          file=sys.stderr)
    if unmapped:
        print('UNMAPPED (no spec entry): ' + ', '.join(unmapped), file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
