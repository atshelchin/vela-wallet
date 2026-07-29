#!/usr/bin/env python3
"""Split the design-gallery DOM dump into one pruned, origin-rebased dump per component cell.

The gallery renders every shared component in every state, each cell carrying a stable
`gallery-<component>-<state...>` id. This turns that one 2.9MB dump into per-cell dumps that
70-board-from-dom.js can consume directly, so each component variant is built from the exact
geometry the app rendered rather than from reading its source.

    python3 split-gallery-cells.py dom-dumps/design-gallery.json dom-dumps/cells
"""
import json
import os
import re
import sys
from collections import defaultdict

KEEP = {'x', 'y', 'w', 'h', 'text', 'bg', 'color', 'font', 'radius', 'border',
        'shadow', 'opacity', 'kind', 'label', 'children'}
FONT_KEEP = {'size', 'weight', 'family', 'lineHeight', 'letterSpacing', 'transform'}
# the caption above each cell is gallery scaffolding, not part of the component
CAPTION_RE = re.compile(r'^[A-Za-z0-9_]+ · ')


def walk(node, out):
    out.append(node)
    for c in node.get('children', []):
        walk(c, out)


def rebase(node, dx, dy):
    out = {k: v for k, v in node.items() if k in KEEP and k != 'children'}
    if 'font' in out:
        out['font'] = {k: v for k, v in out['font'].items() if k in FONT_KEEP}
    if 'label' in out and not out.get('kind'):
        del out['label']
    out['x'] = round(node['x'] - dx, 2)
    out['y'] = round(node['y'] - dy, 2)
    kids = [rebase(c, dx, dy) for c in node.get('children', [])]
    kids = [k for k in kids if k is not None]
    if kids:
        out['children'] = kids
    paints = any(k in out for k in ('bg', 'border', 'shadow', 'text', 'kind'))
    if not paints and not kids:
        return None
    return out


def main(dump_path, out_dir):
    d = json.load(open(dump_path))
    nodes = []
    for t in d['tree']:
        walk(t, nodes)

    cells = [n for n in nodes if str(n.get('label', '')).startswith('gallery-')]
    os.makedirs(out_dir, exist_ok=True)

    families = defaultdict(list)
    written = skipped = 0
    for cell in cells:
        slug = cell['label']
        if slug in ('gallery-index',) or slug.startswith('gallery-section-'):
            continue
        # drop the caption text node; keep the rendered component only
        body = dict(cell)
        kids = []
        caption = None
        for c in cell.get('children', []):
            txt = str(c.get('text', ''))
            if CAPTION_RE.match(txt):
                # the caption carries the axis names ("VelaButton · variant=accent size=default")
                caption = txt
                continue
            kids.append(c)
        body['children'] = kids
        tree_node = rebase(body, cell['x'], cell['y'])
        if tree_node is None:
            skipped += 1
            continue
        out = {
            'url': '#' + slug,
            'frame': {'w': round(cell['w']), 'h': round(cell['h'])},
            'webTextBoost': d.get('webTextBoost', 1.2),
            'tree': [tree_node],
        }
        s = json.dumps(out, separators=(',', ':'), ensure_ascii=True)
        json.loads(s)
        with open(os.path.join(out_dir, slug + '.json'), 'w') as f:
            f.write(s)
        written += 1
        family = slug.split('-')[1] if len(slug.split('-')) > 1 else 'misc'
        entry = {'slug': slug, 'w': round(cell['w']), 'h': round(cell['h']), 'bytes': len(s)}
        if caption:
            entry['caption'] = caption
            # "VelaButton · variant=accent size=default state=disabled" -> component + axes
            head, _, tail = caption.partition(' · ')
            entry['component'] = head.strip()
            axes = dict(re.findall(r'(\w+)=([^\s]+)', tail))
            if axes:
                entry['axes'] = axes
            else:
                entry['stateLabel'] = tail.strip()
        families[family].append(entry)

    index = {f: sorted(v, key=lambda x: x['slug']) for f, v in sorted(families.items())}
    with open(os.path.join(out_dir, '_index.json'), 'w') as f:
        json.dump(index, f, indent=2)

    print(f'cells found: {len(cells)}  written: {written}  skipped(empty): {skipped}', file=sys.stderr)
    print(f'families: {len(index)}', file=sys.stderr)
    for fam, items in index.items():
        print(f'  {fam:28} {len(items):3} cells', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
