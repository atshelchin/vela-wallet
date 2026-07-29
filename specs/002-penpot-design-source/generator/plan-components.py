#!/usr/bin/env python3
"""Turn the per-cell gallery dumps into a build plan for 72-components-from-cells.js.

Separating "what to build" from "how to draw it" keeps the decisions reviewable in git: the
family -> `C/<Group>/<Name>` mapping below is a human judgement about the library's taxonomy, not
something derivable from the DOM, and the variant-property scheme has one rule that is easy to get
wrong (see PROPS).

    python3 plan-components.py dom-dumps/cells

Writes `dom-dumps/cells/_plan.json`, one entry per family, in build order.
"""
import json
import os
import re
import sys

# family slug -> library path. Groups follow the manifest's taxonomy
# (Primitives / Controls / Rows / Sheets / Signing / Media). Families the manifest never listed are
# mapped here explicitly rather than guessed at run time: the signing body views are the bulk of
# them — the manifest folded those into SigningSheet's variants, but each renders standalone in the
# gallery and is worth its own component.
GROUPS = {
    'activityrow': 'C/Rows/ActivityRow',
    'advancedpanel': 'C/Signing/AdvancedPanel',
    'amounttext': 'C/Primitives/AmountText',
    'approvalview': 'C/Signing/ApprovalView',
    'autogrowtextinput': 'C/Primitives/AutoGrowTextInput',
    'balancechangepreview': 'C/Signing/BalanceChangePreview',
    'batchcallsview': 'C/Signing/BatchCallsView',
    'blindtransactionview': 'C/Signing/BlindTransactionView',
    'blindtypeddataview': 'C/Signing/BlindTypedDataView',
    'chainlogo': 'C/Media/ChainLogo',
    'clearsignview': 'C/Signing/ClearSignView',
    'collapsible': 'C/Controls/Collapsible',
    'confirmassets': 'C/Rows/ConfirmAssets',
    'contactavatar': 'C/Media/ContactAvatar',
    'contractbar': 'C/Signing/ContractBar',
    'dappbanner': 'C/Signing/DAppBanner',
    'detailrow': 'C/Rows/DetailRow',
    'editableapprovecard': 'C/Signing/EditableApproveCard',
    'ethsigndangerview': 'C/Signing/EthSignDangerView',
    'externallink': 'C/Primitives/ExternalLink',
    'feetokenselector': 'C/Rows/FeeTokenSelector',
    'flowarrow': 'C/Signing/FlowArrow',
    'gasfeecard': 'C/Rows/GasFeeCard',
    'genericfieldrow': 'C/Signing/GenericFieldRow',
    'groupeditor': 'C/Sheets/GroupEditor',
    'identicon': 'C/Media/Identicon',
    'intentheader': 'C/Signing/IntentHeader',
    'messagesignview': 'C/Signing/MessageSignView',
    'multirecipienteditor': 'C/Rows/MultiRecipientEditor',
    'networkfilterbutton': 'C/Controls/NetworkFilterButton',
    'permitsignview': 'C/Signing/PermitSignView',
    'qrcode': 'C/Media/QRCode',
    'receiverequestcontrols': 'C/Controls/ReceiveRequestControls',
    'receivesharecard': 'C/Media/ReceiveShareCard',
    'recipientname': 'C/Primitives/RecipientName',
    'recipienttrust': 'C/Primitives/RecipientTrust',
    'recipienttypebadge': 'C/Primitives/RecipientTypeBadge',
    'rpctroublebanner': 'C/Primitives/RpcTroubleBanner',
    'sectionlabel': 'C/Primitives/SectionLabel',
    'segmentedtoggle': 'C/Controls/SegmentedToggle',
    'signingaccountrow': 'C/Signing/SigningAccountRow',
    'slidetoconfirm': 'C/Controls/SlideToConfirmButton',
    'summaryline': 'C/Signing/SummaryLine',
    'themedtext': 'C/Primitives/ThemedText',
    'themedview': 'C/Primitives/ThemedView',
    'tokencard': 'C/Signing/TokenCard',
    'tokenlogo': 'C/Media/TokenLogo',
    'tokenrow': 'C/Rows/TokenRow',
    'tokenselector': 'C/Rows/TokenSelector',
    'transactionreceipt': 'C/Primitives/TransactionReceipt',
    'txstatusbadge': 'C/Primitives/TxStatusBadge',
    'velabutton': 'C/Primitives/VelaButton',
    'velacard': 'C/Primitives/VelaCard',
    'walletavatar': 'C/Media/WalletAvatar',
    'warningbanner': 'C/Signing/WarningBanner',
    'wavedock': 'C/Controls/WaveDock',
}

# Families whose cells are launchers rather than the component itself; excluded and reported.
SKIP = {'open'}


def props_for(cells):
    """Variant property names + per-cell values.

    A Penpot variant container has ONE property list that every variant must fill, so the axes can
    only come from the caption when EVERY cell in the family declares the same ones. Most families
    are not like that — ActivityRow mixes `direction=in`, `masked=true` and two prose state labels —
    and inventing a shared axis set for them would fabricate structure the app does not have. Those
    fall back to a single `state` property whose value is the cell's own slug suffix, which is
    exactly the identifier the gallery already uses.
    """
    names = sorted({k for c in cells for k in c.get('axes', {})})
    if names:
        # a cell that omits an axis is showing that axis's default — VelaButton's `variant=accent
        # state=disabled` cell is the default SIZE, it just had no reason to say so
        values = [[c.get('axes', {}).get(n, 'default') for n in names] for c in cells]
        if len({tuple(v) for v in values}) == len(values):
            return names, values
        # ...unless filling the gaps makes two cells land on the same coordinates, which would be a
        # variant collision. ActivityRow does that: `direction=in` and `direction=in isNew` differ
        # in something the caption never turned into an axis. Fall back rather than invent one.
    return ['state'], [[c['state']] for c in cells]


def main(cell_dir):
    index = json.load(open(os.path.join(cell_dir, '_index.json')))
    plan, skipped = [], {}
    for family, cells in sorted(index.items()):
        live = [c for c in cells if not c.get('launcherFor')]
        if family in SKIP or not live:
            skipped[family] = [c['slug'] for c in cells]
            continue
        if family not in GROUPS:
            skipped[family] = ['UNMAPPED: ' + c['slug'] for c in cells]
            continue
        for c in live:
            suffix = re.sub(r'^gallery-' + re.escape(family) + r'-?', '', c['slug'])
            c['state'] = suffix or 'default'
        names, values = props_for(live)
        plan.append({
            'family': family,
            'component': GROUPS[family],
            'props': names,
            'cells': [{'slug': c['slug'], 'w': c['w'], 'h': c['h'], 'values': v,
                       'caption': c.get('caption', '')}
                      for c, v in zip(live, values)],
        })

    out = {'families': plan, 'skipped': skipped,
           'totals': {'families': len(plan), 'variants': sum(len(f['cells']) for f in plan)}}
    with open(os.path.join(cell_dir, '_plan.json'), 'w') as f:
        json.dump(out, f, indent=1)
    print(f"families: {out['totals']['families']}  variants: {out['totals']['variants']}",
          file=sys.stderr)
    for f, slugs in skipped.items():
        print(f'  skipped {f}: {len(slugs)} cells', file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'dom-dumps/cells')
