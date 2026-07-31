#!/usr/bin/env node
// merge-component-docs.mjs — fold the verified code refs and the authored usage rules into
// dom-dumps/cells/_plan.json (RESTRUCTURE-2026-07-30 §5/§8, W1).
//
// Why into the PLAN and not onto the canvas: 72-components-from-cells REBUILDS a family's container
// from scratch on every run (variant components cannot be edited in place), so anything attached by
// hand to a component dies at the next regen. The plan is the committed source; 72 stamps
// vela.codeRef / vela.usage from it, and 75-components-shelf prints the same strings as the visible
// docs block. One source, two projections.
//
// codeRef/props/desc/usedIn: generator/component-code-refs.json — resolved from the source tree and
// path-validated (53/53), cross-checked against manifest.json's sourceRef with zero disagreements.
// usage/dont: authored here from docs/DESIGN-LANGUAGE.md and docs/DESIGN-REVIEW-2026-07.md. These
// are NORMATIVE rules for a new feature, which is exactly what the file could not answer before.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLAN = resolve(HERE, '../dom-dumps/cells/_plan.json');
const REFS = resolve(HERE, 'component-code-refs.json');

// Tier 1 = the high-reuse vocabulary a feature author picks from first. Each gets a use-when rule
// and, where the rule is violable, the failure it prevents.
const USAGE = {
  'C/Primitives/VelaButton': {
    tier: 1,
    usage: 'The ONLY call-to-action control. variant=primary for the single committing action on a surface, secondary for the way out, accent for money movement and submission. size=default unless the row is dense.',
    dont: 'Never hand-roll a CTA out of a Pressable + rounded rect; never put two primary buttons on one surface. There is no destructive variant in code — Sign Out overrides the background, a drift the design review tracks.',
  },
  'C/Controls/SegmentedToggle': {
    tier: 1,
    usage: 'The ONLY segmented control. Use for 2–4 mutually exclusive views of the same content (Activity / Assets / Connections, Address / Request).',
    dont: 'Not for navigation between unrelated destinations, and not for more than four segments — the track scrolls and neighbours get clipped mid-word.',
  },
  'C/Controls/SlideToConfirmButton': {
    tier: 1,
    usage: 'Irreversible money movement only: the final confirm on Send and on a signing sheet. The deliberate gesture is the point.',
    dont: 'Never use it for a reversible or cheap action — the friction stops meaning anything.',
  },
  'C/Primitives/AmountText': {
    tier: 1,
    usage: 'Every monetary figure. It subordinates the decimal tail and the currency symbol so the significant digits carry the eye; it also owns the hide-balance masking.',
    dont: 'Never format money with plain Text — the tail/symbol scales and the masked state would be lost, and the figure would stop matching every other screen.',
  },
  'C/Rows/TokenRow': {
    tier: 1,
    usage: 'A balance-bearing token in a list: logo, symbol + name, amount + fiat. Has a checkbox mode for multi-select (sweep).',
    dont: 'Do not box it in a card. Selection is a check, not an accent border — the accent-border treatment is legacy.',
  },
  'C/Rows/ActivityRow': {
    tier: 1,
    usage: 'One transaction in the activity feed: direction glyph, counterparty, amount, chain and time. Carries the arrival glow for a newly seen inbound transfer.',
    dont: 'Do not reuse it for a non-transaction list; the direction semantics would be a lie.',
  },
  'C/Rows/DetailRow': {
    tier: 1,
    usage: 'A label/value pair in a details or confirmation surface. Values that are addresses or hashes use the mono zone.',
    dont: 'Do not use it as a tap target for navigation; that is a settings row.',
  },
  'C/Rows/GasFeeCard': {
    tier: 1,
    usage: 'The fee line on any surface that submits a transaction — Send and dApp signing share it, including the estimating and requote states.',
    dont: 'Never present a fee you have not estimated, and never let a confirm control stay enabled while this is estimating.',
  },
  'C/Rows/FeeTokenSelector': {
    tier: 1,
    usage: 'Choosing which token pays the fee, one row per candidate with its balance and fiat value. Shared by Send and dApp signing.',
    dont: 'Do not collapse it to a chip strip — the balance per fee token is the whole decision.',
  },
  'C/Primitives/VelaCard': {
    tier: 1,
    usage: 'Reach for it only when content genuinely needs to be lifted off the page (a receipt, a warning). The default is no container at all.',
    dont: 'Do not wrap lists or sections in cards — the design language is de-containered; hairline dividers separate content.',
  },
  'C/Primitives/SectionLabel': {
    tier: 1,
    usage: 'The uppercase, tracked micro-label that opens a section. It replaces a card header.',
    dont: 'Do not use sentence-case headings for sections, and do not pair it with a container.',
  },
  'C/Primitives/TransactionReceipt': {
    tier: 1,
    usage: 'The outcome of a submitted transaction, across three statuses (submitted / confirmed / failed) and three batch kinds (single / batch / split).',
    dont: 'Do not show a success receipt before the receipt is authenticated on chain.',
  },
  'C/Signing/IntentHeader': {
    tier: 1,
    usage: 'The first thing a signing sheet says: what the transaction WILL DO, in two-colour plain language, with the risk eyebrow above it.',
    dont: 'Never open a signing sheet with a method name or calldata — that is blind signing, which this component exists to end.',
  },
  'C/Signing/ClearSignView': {
    tier: 1,
    usage: 'The body of a signing sheet when the transaction is understood (ERC-7730 style): intent, token amounts, recipient, and the collapsible technical details.',
    dont: 'Do not fall back to it when decoding failed — that is BlindTransactionView, and pretending to understand is the dangerous case.',
  },
  'C/Signing/EditableApproveCard': {
    tier: 1,
    usage: 'Any allowance-granting call. The spending cap is an editable field with Custom / Revoke pills, defaulted to the amount actually needed.',
    dont: 'Never present an unlimited approval as the default or the recommended path.',
  },
  'C/Signing/BalanceChangePreview': {
    tier: 1,
    usage: 'What the signer will hold afterwards, from a simulation: outgoing and incoming per asset.',
    dont: 'Do not trust simulated INCOMING assets as authenticated — token-add and other trust decisions must wait for the confirmed receipt logs.',
  },
  'C/Signing/WarningBanner': {
    tier: 1,
    usage: 'A risk that the signer must read before confirming, at one of the defined severities.',
    dont: 'Do not use it for neutral information; the severity grammar loses its meaning if it cries wolf.',
  },
  'C/Sheets/GroupEditor': {
    tier: 1,
    usage: 'The in-sheet editing pattern (contact groups): a sheet whose body swaps between list and edit rather than stacking a second overlay.',
    dont: 'Never stack a second overlay on top of a sheet — the single-overlay rule exists because a stacked modal rendered invisibly on iOS.',
  },
  'C/Controls/WaveDock': {
    tier: 1,
    usage: 'The persistent bottom chrome: primary destinations plus the scan FAB. One per screen stack.',
    dont: 'Do not hide it mid-journey to make room for content; a screen that needs the space is a sheet, not a tab.',
  },
  'C/Media/TokenLogo': {
    tier: 1,
    usage: 'A token\'s artwork at the standard sizes, with the lettered fallback disc when no artwork resolves.',
    dont: 'Do not tint or recolour it — brand artwork is deliberately unbound from the token system and stays constant in dark mode.',
  },
  // Tier 2 entries carry a use-when line only where it is not obvious from the name.
  'C/Primitives/ExternalLink': {
    usage: 'Opens a URL outside the app. Currently rendered only by the design gallery.',
    dont: 'Publishing it as a design-system component overstates its reuse: production surfaces do not import it today.',
  },
  'C/Signing/FlowArrow': {
    usage: 'The circled downward arrow between the two halves of a token flow inside a signing sheet.',
    dont: 'Note there are TWO FlowArrows in the code — this one lives in signing/TokenCard.tsx; send/FlowArrow.tsx is a different, hairline variant used by the Send confirm step and the receipt.',
  },
  'C/Primitives/AutoGrowTextInput': {
    usage: 'A single-line input that grows to fit its content (amounts, notes, spending caps).',
    dont: 'The generator scripts and the old draft board called this "Input"; the component\'s real name is AutoGrowTextInput. Use the real name.',
  },
};

const plan = JSON.parse(readFileSync(PLAN, 'utf8'));
const refs = JSON.parse(readFileSync(REFS, 'utf8'));
const byName = new Map(refs.map((r) => [r.component, r]));

const out = { merged: 0, missingRef: [], tier1: 0, withUsage: 0 };
for (const f of plan.families) {
  const r = byName.get(f.component);
  if (!r) { out.missingRef.push(f.component); continue; }
  f.codeRef = r.codeRef;
  f.desc = r.desc;
  f.propsAll = r.props;
  f.usedIn = r.usedIn;
  if (r.note) f.codeNote = r.note;
  const u = USAGE[f.component];
  if (u) {
    f.tier = u.tier || 2;
    f.usage = u.usage;
    f.dont = u.dont;
    out.withUsage++;
    if (u.tier === 1) out.tier1++;
  } else {
    f.tier = 2;
  }
  out.merged++;
}

writeFileSync(PLAN, JSON.stringify(plan, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
