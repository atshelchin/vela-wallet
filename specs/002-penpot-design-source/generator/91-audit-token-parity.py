# 91-audit-token-parity.py — SC-001: Penpot token values ≡ src/constants/theme.ts, both directions.
# Repo side of the audit: parses theme.ts directly (independent of the inventory) and compares
# against the canonical token tables that chunks 20/21 write (kept in EXPECTED below — update
# together with those chunks). Penpot side: run generator snippet to dump
# penpot.library.local.tokens and diff against the same tables.
import re, sys

THEME = 'src/constants/theme.ts'
src = open(THEME).read()

def block(name):
    m = re.search(name + r'[^{]*\{(.*?)\n\}', src, re.S)
    return m.group(1) if m else ''

def parse(b):
    out = {}
    for gm in re.finditer(r'(\w+):\s*\{([^}]*)\}', b):
        g, body = gm.group(1), gm.group(2)
        for km in re.finditer(r"(\w+):\s*'([^']+)'", body):
            out[f'{g}.{km.group(1)}'] = km.group(2)
    return out

EXPECTED_LIGHT = {
 'fg.base':'#1A1A18','fg.muted':'#6E6B62','fg.subtle':'#8C887E','fg.inverse':'#FFFFFF',
 'bg.base':'#FAFAF8','bg.raised':'#FFFFFF','bg.sunken':'#F5F3EF',
 'accent.base':'#E8572A','accent.soft':'#FFF0EB','success.base':'#2D8E5F','success.soft':'#EDFAF2',
 'warning.base':'#92600A','warning.soft':'#FFF8F0','warning.border':'#F0DCC8',
 'error.base':'#C62828','error.soft':'#FEF2F2','info.base':'#4267F4','info.soft':'#EDF0FF',
 'border.base':'#ECEBE4','border.strong':'#D8D6CE'}
EXPECTED_DARK = {
 'fg.base':'#E8E6E1','fg.muted':'#9A9790','fg.subtle':'#85827A','fg.inverse':'#1A1A18',
 'bg.base':'#141412','bg.raised':'#1E1E1B','bg.sunken':'#0F0F0D',
 'accent.base':'#E8572A','accent.soft':'#2C1A12','success.base':'#3DA872','success.soft':'#132A1E',
 'warning.base':'#D4A54A','warning.soft':'#2A2010','warning.border':'#3D3020',
 'error.base':'#F87171','error.soft':'#2D1515','info.base':'#5A7CF6','info.soft':'#131B33',
 'border.base':'#2C2C28','border.strong':'#3E3E38'}
EXPECTED_SCALES = {
    'TEXT_BASE': {'xs':10,'sm':11,'base':13,'lg':15,'xl':17,'2xl':20,'3xl':26,'4xl':32,'5xl':40},
    'space': {'0':0,'xs':2,'sm':4,'md':8,'lg':12,'xl':16,'2xl':20,'3xl':24,'4xl':32,'5xl':48},
    'radius': {'none':0,'sm':4,'md':8,'lg':12,'xl':16,'2xl':20,'full':9999},
}

errs = []
for label, expected, blockname in [('light', EXPECTED_LIGHT, 'LIGHT_COLORS'), ('dark', EXPECTED_DARK, 'DARK_COLORS')]:
    actual = parse(block(blockname))
    for k, v in expected.items():
        av = actual.get(k)
        if av is None: errs.append(f'{label} {k}: not found in theme.ts')
        elif av.upper() != v.upper(): errs.append(f'{label} {k}: tokens say {v}, theme.ts says {av}')
    for k in set(actual) - set(expected):
        errs.append(f'{label} {k}: exists in theme.ts but not tokenized')

for name, expected in EXPECTED_SCALES.items():
    pat = (r'const ' if name == 'TEXT_BASE' else r'export const ') + name + r'[^{]*\{([^}]*)\}'
    m = re.search(pat, src, re.S)
    if not m:
        errs.append(f'{name}: block not found in theme.ts'); continue
    actual = {k: int(v) for k, v in re.findall(r"'?([\w]+)'?:\s*(\d+)", m.group(1))}
    if actual != expected:
        errs.append(f'{name}: tokens {expected} != theme.ts {actual}')

if errs:
    print('FAIL')
    for e in errs: print(' -', e)
    sys.exit(1)
print(f'PASS — {len(EXPECTED_LIGHT)}+{len(EXPECTED_DARK)} colors, {sum(len(v) for v in EXPECTED_SCALES.values())} scale values match theme.ts exactly')
