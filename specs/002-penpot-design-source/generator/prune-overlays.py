#!/usr/bin/env python3
"""Split the overlay capture into one board-ready dump per overlay, plus a shared asset registry.

`dom-dumps/overlays-raw.json` is produced in the running app by opening every `gallery-open-*`
launcher in turn and extracting the presented overlay's own subtree (extract-dom-layout.js with
`opts.root`). Those trees are still measured against the gallery's 35,000px scroll frame, so each
one is rebased onto its own 390x806 phone viewport here — an overlay board depicts backdrop plus
sheet exactly as the app presents it.

    python3 prune-overlays.py dom-dumps/overlays-raw.json dom-dumps/overlays
"""
import hashlib
import json
import os
import sys

KEEP = {'x', 'y', 'w', 'h', 'text', 'bg', 'color', 'font', 'radius', 'border',
        'shadow', 'opacity', 'kind', 'label', 'children', 'assetKey'}
FONT_KEEP = {'size', 'weight', 'family', 'lineHeight', 'letterSpacing', 'transform'}

# slug tail -> `O/<surface>/<state>`, following the naming already used on `08 Overlays`
# (`O/signing-sheet/erc20-transfer`). The state half names the scenario the gallery set up, so the
# board says what it depicts rather than just "default".
NAMES = {
    'accountswitchermodal': 'O/account-switcher/default',
    'addtokensheet': 'O/add-token-sheet/default',
    'appalert-destructive': 'O/app-alert/destructive',
    'appalert-single': 'O/app-alert/single-action',
    'appalert-two': 'O/app-alert/two-actions',
    'appmodal-default': 'O/app-modal/page-sheet',
    'appmodal-fit': 'O/app-modal/fit',
    'balancedetailsheet': 'O/balance-detail/degraded-chains',
    'batchimportsheet': 'O/batch-import/default',
    'browserhistorysheet': 'O/browser-history/default',
    'bugreportmodal': 'O/bug-report/default',
    'connectioneventdetailsheet': 'O/connection-event/sign-message',
    'contactpicker': 'O/contact-picker/default',
    'contactsmanager': 'O/contacts-manager/default',
    'currencysheet': 'O/currency/default',
    'identiconviewersheet': 'O/identicon-viewer/default',
    'networkfiltersheet': 'O/network-filter/default',
    'rpcfixmodal': 'O/rpc-fix/default',
    'transactiondetailsheet-batch': 'O/transaction-detail/batch-split',
    'transactiondetailsheet-single': 'O/transaction-detail/single-confirmed',
    'treasurybootstrapsheet': 'O/treasury-bootstrap/bootstrap-needed',
}


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


def rebase(node, dx, dy, assets):
    key = take_asset(node, assets)
    out = {k: v for k, v in node.items() if k in KEEP and k != 'children'}
    if 'font' in out:
        out['font'] = {k: v for k, v in out['font'].items() if k in FONT_KEEP}
    if 'label' in out and not out.get('kind'):
        del out['label']
    out['x'] = round(node['x'] - dx, 2)
    out['y'] = round(node['y'] - dy, 2)
    kids = [k for k in (rebase(c, dx, dy, assets) for c in node.get('children', [])) if k]
    if key:
        out['assetKey'] = key
        if out.get('kind') == 'svg':
            kids = []
    if kids:
        out['children'] = kids
    paints = any(k in out for k in ('bg', 'border', 'shadow', 'text', 'kind', 'radius'))
    if not paints and not kids:
        return None
    return out


def main(raw_path, out_dir):
    raw = json.load(open(raw_path))
    os.makedirs(out_dir, exist_ok=True)
    assets, index, unmapped = {}, [], []

    for slug, dump in raw['captured'].items():
        tail = slug.replace('gallery-open-', '')
        name = NAMES.get(tail)
        if not name:
            unmapped.append(tail)
            continue
        roots = [t for t in dump['tree'] if t]
        if not roots:
            continue
        root = roots[0]
        tree = rebase(root, root['x'], root['y'], assets)
        if tree is None:
            continue
        out = {'url': '#' + slug, 'frame': {'w': round(root['w']), 'h': round(root['h'])},
               'webTextBoost': dump.get('webTextBoost', 1.2), 'tree': [tree]}
        s = json.dumps(out, separators=(',', ':'), ensure_ascii=True)
        json.loads(s)
        open(os.path.join(out_dir, tail + '.json'), 'w').write(s)
        index.append({'slug': tail, 'board': name, 'w': out['frame']['w'], 'h': out['frame']['h'],
                      'bytes': len(s)})

    json.dump(index, open(os.path.join(out_dir, '_index.json'), 'w'), indent=1)
    a = json.dumps(assets, separators=(',', ':'), ensure_ascii=True)
    json.loads(a)
    open(os.path.join(out_dir, '_global.assets.json'), 'w').write(a)

    svgs = sum(1 for v in assets.values() if v['kind'] == 'svg')
    print(f'overlays: {len(index)}  assets: {len(assets)} ({svgs} svg, {len(assets)-svgs} img, {len(a)}B)',
          file=sys.stderr)
    if unmapped:
        print('UNMAPPED (add to NAMES): ' + ', '.join(unmapped), file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
