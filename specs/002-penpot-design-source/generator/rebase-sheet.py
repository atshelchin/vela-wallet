#!/usr/bin/env python3
"""Isolate the signing sheet panel out of a full-screen pruned dump and rebase it to (0,0).

The clear-signing scenarios render the sheet over the test-harness list, so the raw dump is
"harness + sheet". The Penpot board we want is the sheet alone, its own board, starting at the
origin. The panel is identified structurally, not by position: it is the node whose radius is
[20,20,0,0] — a bottom sheet's rounded top corners — so a taller or shorter sheet still lands.

    python3 rebase-sheet.py dom-dumps/pruned/signing-erc20-transfer.json
      -> dom-dumps/pruned/signing-erc20-transfer-sheet.json
      -> dom-dumps/pruned/signing-erc20-transfer-sheet.assets.json  (only what the sheet uses)
"""
import json
import os
import sys


def find_panel(node):
    if node.get('radius') == [20, 20, 0, 0]:
        return node
    for c in node.get('children', []):
        hit = find_panel(c)
        if hit:
            return hit
    return None


def rebase(node, dx, dy, used):
    node['x'] = round(node.get('x', 0) - dx, 2)
    node['y'] = round(node.get('y', 0) - dy, 2)
    if node.get('assetKey'):
        used.add(node['assetKey'])
    for c in node.get('children', []):
        rebase(c, dx, dy, used)


def main(path):
    d = json.load(open(path))
    assets = json.load(open(path.replace('.json', '.assets.json')))

    panel = None
    for t in d['tree']:
        panel = find_panel(t)
        if panel:
            break
    if not panel:
        raise SystemExit('no [20,20,0,0] panel found in ' + path)

    dx, dy = panel.get('x', 0), panel.get('y', 0)
    used = set()
    rebase(panel, dx, dy, used)

    out = {
        'url': d['url'],
        'frame': {'w': round(panel['w']), 'h': round(panel['h'])},
        'webTextBoost': d.get('webTextBoost', 1.2),
        'tree': [panel],
    }
    sub = {k: v for k, v in assets.items() if k in used}

    base = path.replace('.json', '-sheet')
    s = json.dumps(out, separators=(',', ':'), ensure_ascii=True)
    json.loads(s)
    open(base + '.json', 'w').write(s)
    a = json.dumps(sub, separators=(',', ':'), ensure_ascii=True)
    json.loads(a)
    open(base + '.assets.json', 'w').write(a)
    print('%-42s panel %dx%d rebased from (%d,%d)  tree %dB  assets %d/%d (%dB)'
          % (os.path.basename(base), out['frame']['w'], out['frame']['h'], dx, dy,
             len(s), len(sub), len(assets), len(a)))


if __name__ == '__main__':
    for p in sys.argv[1:]:
        main(p)
