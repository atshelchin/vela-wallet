#!/usr/bin/env python3
"""Prune a DOM layout dump down to what 70-board-from-dom.js actually consumes.

Removes the parallel-space dev chrome, drops keys the converter ignores, and collapses
paint-less full-frame wrapper shells. Emits compact JSON on stdout (and reports the
size reduction on stderr) so the result can be pasted into a single execute_code call.

    python3 prune-dump.py dom-dumps/home-assets.json > pruned/home-assets.json
"""
import json
import sys

# dev-only chrome that exists in the parallel space but is not part of the product UI
DEV_LABELS = {'Parallel space active — test environment'}
DEV_TEXTS = {'PARALLEL SPACE', 'mock passkey · test', 'status: ', 'idle', ' rid:', '(none)'}
KEEP = {'x', 'y', 'w', 'h', 'text', 'bg', 'color', 'font', 'radius', 'border',
        'shadow', 'opacity', 'kind', 'label', 'children'}
FONT_KEEP = {'size', 'weight', 'family', 'lineHeight', 'letterSpacing', 'transform'}


def prune(node, frame):
    if node.get('label') in DEV_LABELS:
        return None
    if node.get('text', '').strip() in DEV_TEXTS:
        return None

    kids = [k for k in (prune(c, frame) for c in node.get('children', [])) if k]
    out = {k: v for k, v in node.items() if k in KEEP and k != 'children'}
    if 'font' in out:
        out['font'] = {k: v for k, v in out['font'].items() if k in FONT_KEEP}
    # label only earns its bytes on icons/images, where it names the asset
    if 'label' in out and not out.get('kind'):
        del out['label']
    if kids:
        out['children'] = kids

    paints = any(k in out for k in ('bg', 'border', 'shadow', 'text', 'kind'))
    if not paints:
        # a paint-less node with no children contributes nothing
        if not kids:
            return None
        # a paint-less full-frame shell just wraps: hoist its children
        if (round(out.get('w', 0)) >= frame['w'] - 1 and round(out.get('h', 0)) >= frame['h'] - 1):
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


def main(path):
    d = json.load(open(path))
    frame = d['frame']
    tree = flatten([prune(t, frame) for t in d['tree']])
    out = {'url': d['url'], 'frame': frame, 'webTextBoost': d.get('webTextBoost', 1.2), 'tree': tree}
    s = json.dumps(out, separators=(',', ':'), ensure_ascii=True)
    json.loads(s)  # never emit something the plugin cannot parse
    before = len(json.dumps(d, separators=(',', ':')))
    print(f'{path}: {before} -> {len(s)} bytes ({100 - round(len(s) / before * 100)}% smaller)', file=sys.stderr)
    print(s)


if __name__ == '__main__':
    main(sys.argv[1])
