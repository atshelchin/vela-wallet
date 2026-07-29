#!/usr/bin/env python3
"""Split the design-gallery DOM dump into one pruned, origin-rebased dump per component cell.

The gallery renders every shared component in every state, each cell carrying a stable
`gallery-<component>-<state...>` id. This turns that one ~2.5MB dump into per-cell dumps that
70-board-from-dom.js can consume directly, so each component variant is built from the exact
geometry the app rendered rather than from reading its source.

Assets (Lucide markup, identicon markup, token/chain logo bytes) are lifted out of the trees into
ONE registry shared by every cell, exactly as prune-dump.py does for screens: keys are content
hashes, so the same chain logo appearing in thirty cells is carried once. Without this the cells
build with red MISSING placeholders where every icon should be — which is precisely what the first
generation of cell dumps did, because the gallery had been captured before the extractor learned
to carry svg/dataUri payloads at all.

    python3 split-gallery-cells.py dom-dumps/design-gallery-v2.json dom-dumps/cells
"""
import hashlib
import json
import os
import re
import sys
from collections import defaultdict

KEEP = {'x', 'y', 'w', 'h', 'text', 'bg', 'color', 'font', 'radius', 'border',
        'shadow', 'opacity', 'kind', 'label', 'children', 'assetKey'}
FONT_KEEP = {'size', 'weight', 'family', 'lineHeight', 'letterSpacing', 'transform'}
# the caption above each cell is gallery scaffolding, not part of the component
CAPTION_RE = re.compile(r'^[A-Za-z0-9_]+ · ')


def walk(node, out):
    out.append(node)
    for c in node.get('children', []):
        walk(c, out)


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


def rebase(node, dx, dy, assets):
    key = take_asset(node, assets)
    out = {k: v for k, v in node.items() if k in KEEP and k != 'children'}
    if 'font' in out:
        out['font'] = {k: v for k, v in out['font'].items() if k in FONT_KEEP}
    if 'label' in out and not out.get('kind'):
        del out['label']
    out['x'] = round(node['x'] - dx, 2)
    out['y'] = round(node['y'] - dy, 2)
    kids = [rebase(c, dx, dy, assets) for c in node.get('children', [])]
    kids = [k for k in kids if k is not None]
    if key:
        out['assetKey'] = key
        # an svg's internal <path> children are carried by the markup itself
        if out.get('kind') == 'svg':
            kids = []
    if kids:
        out['children'] = kids
    # a radius alone is a visual fact (a rounded clipping wrapper), so it counts as painting —
    # same rule as prune-dump.py, and what keeps avatar circles and logo discs from coming out square
    paints = any(k in out for k in ('bg', 'border', 'shadow', 'text', 'kind', 'radius'))
    if not paints and not kids:
        return None
    return out


def paints(node):
    return any(k in node for k in ('bg', 'border', 'shadow', 'text', 'kind', 'radius'))


def tighten(tree):
    """Shift a cell's tree onto its own content box and return that box's size.

    A cell is `caption + component`; dropping the caption leaves the component starting ~22px down
    inside a wrapper that still claims the full cell height. Boards built from that carry a band of
    dead space at the top and a height that is not the component's. Only nodes that actually paint
    define the box — the wrapper does not paint, so it cannot pad the result.
    """
    nodes = []
    walk_all(tree, nodes)
    boxes = [n for n in nodes if paints(n)]
    if not boxes:
        return None
    x0 = min(n['x'] for n in boxes)
    y0 = min(n['y'] for n in boxes)
    x1 = max(n['x'] + n.get('w', 0) for n in boxes)
    y1 = max(n['y'] + n.get('h', 0) for n in boxes)
    for n in nodes:
        n['x'] = round(n['x'] - x0, 2)
        n['y'] = round(n['y'] - y0, 2)
    return {'w': max(1, round(x1 - x0)), 'h': max(1, round(y1 - y0))}


def walk_all(node, out):
    out.append(node)
    for c in node.get('children', []):
        walk_all(c, out)


def main(dump_path, out_dir):
    d = json.load(open(dump_path))
    nodes = []
    for t in d['tree']:
        walk(t, nodes)

    cells = [n for n in nodes if str(n.get('label', '')).startswith('gallery-')]
    os.makedirs(out_dir, exist_ok=True)

    assets = {}
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
        tree_node = rebase(body, cell['x'], cell['y'], assets)
        if tree_node is None:
            skipped += 1
            continue
        frame = tighten(tree_node) or {'w': round(cell['w']), 'h': round(cell['h'])}
        out = {
            'url': '#' + slug,
            'frame': frame,
            'webTextBoost': d.get('webTextBoost', 1.2),
            'tree': [tree_node],
        }
        s = json.dumps(out, separators=(',', ':'), ensure_ascii=True)
        json.loads(s)
        with open(os.path.join(out_dir, slug + '.json'), 'w') as f:
            f.write(s)
        written += 1
        family = slug.split('-')[1] if len(slug.split('-')) > 1 else 'misc'
        entry = {'slug': slug, 'w': frame['w'], 'h': frame['h'], 'bytes': len(s)}
        # `gallery-open-*` is a LAUNCHER row, not the overlay it opens: an overlay cannot sit inline,
        # so the gallery gives each one a button that presents the real thing full-screen. Boarding
        # the launcher under the overlay's name would put a 350x56 button where AppModal belongs, so
        # these are flagged and excluded from the component build — the overlays need their own
        # capture pass (open, dump, dismiss) and are reported as a gap until they get one.
        if slug.startswith('gallery-open-'):
            entry['launcherFor'] = True
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
    a = json.dumps(assets, separators=(',', ':'), ensure_ascii=True)
    json.loads(a)
    with open(os.path.join(out_dir, '_global.assets.json'), 'w') as f:
        f.write(a)

    svgs = sum(1 for v in assets.values() if v['kind'] == 'svg')
    print(f'cells found: {len(cells)}  written: {written}  skipped(empty): {skipped}', file=sys.stderr)
    print(f'families: {len(index)}  assets: {len(assets)} unique '
          f'({svgs} svg, {len(assets) - svgs} img, {len(a)}B)', file=sys.stderr)
    for fam, items in index.items():
        print(f'  {fam:28} {len(items):3} cells', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
