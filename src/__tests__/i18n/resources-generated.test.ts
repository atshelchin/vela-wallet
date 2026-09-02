/**
 * `src/i18n/resources.ts` is GENERATED from the corpus in the Rust crate
 * (spec 004-rust-i18n, FR-010/FR-011). This is the assertion that keeps the
 * generation honest.
 *
 * FR-011 is what makes "zero app changes" true: 1,029 `t()` call sites, 92
 * `useTranslation()` hooks and the typed key union in `i18next.d.ts` all keep
 * working *because* the generated object is deep-equal to the hand-maintained one
 * it replaced. That equality was verified once, at the only moment both files
 * existed. What survives afterwards is this: an INDEPENDENT merge of the corpus,
 * deep-compared against what the generator emitted.
 *
 * Independent matters. A test that re-used the generator's own merge would pass
 * for any generator, including a broken one. This walks the 240 files itself, in
 * the order the generated file declares, and compares the result.
 *
 * It is deliberately immune to legitimate content edits — changing a translation
 * changes both sides — and sensitive to exactly the failure that matters: the
 * generator dropping a namespace, reordering the spread, or losing a locale.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { en, resources } from '@/i18n/resources';

/**
 * The shipped locale set, declared here rather than imported from `@/i18n` —
 * that module pulls in `expo-localization`, which jest cannot transform, and the
 * sibling `sign-handoff-coverage.test.ts` mirrors the list for the same reason.
 * Keeping it local also means this test checks the generator against a written-down
 * expectation instead of against the app's own runtime constant.
 */
const SUPPORTED_LANGUAGES = [
  'en', 'zh', 'zh-TW', 'zh-HK', 'ja', 'ko', 'vi', 'id', 'tr', 'es-MX', 'pt-BR',
  'fr', 'de', 'ru', 'it',
] as const;

/** THE source of truth — the crate, not `src/`. */
const CORPUS = join(__dirname, '../../../rust/crates/vela-core/i18n/locales');

/** Spread order, mirroring `scripts/gen-i18n.mjs`. A later file wins a collision. */
const NAMESPACE_FILES = [
  'home', 'send', 'receive', 'assets', 'addToken', 'tokenDetail', 'history',
  'onboarding', 'connect', 'about', 'clearSigning', 'componentsTx',
  'componentsUi', 'settingsModals', 'contacts',
];

function mergeLocale(lng: string): Record<string, unknown> {
  const read = (p: string) => JSON.parse(readFileSync(join(CORPUS, p), 'utf8'));
  let out = { ...read(`${lng}.json`) };
  for (const ns of NAMESPACE_FILES) out = { ...out, ...read(`${lng}/${ns}.json`) };
  return out;
}

function countLeaves(o: unknown): number {
  if (typeof o !== 'object' || o === null) return 1;
  return Object.values(o).reduce<number>((n, v) => n + countLeaves(v), 0);
}

describe('generated i18n resources', () => {
  it('covers exactly the shipped locale set', () => {
    expect(Object.keys(resources).sort()).toEqual([...SUPPORTED_LANGUAGES].sort());
  });

  it.each(SUPPORTED_LANGUAGES)('%s is deep-equal to an independent corpus merge', (lng) => {
    expect(resources[lng].translation).toEqual(mergeLocale(lng));
  });

  it('exports `en` by name, which is what the typed key union is derived from', () => {
    // src/i18n/i18next.d.ts does `import type { en } from './resources'`. Dropping
    // this export does not fail here first — it fails `tsc` for all 1,029 call
    // sites at once, with an error that points nowhere near the generator.
    expect(en).toBe(resources.en.translation);
    expect(en['common']).toBeDefined();
  });

  it('carries the whole corpus — 20,673 leaves across 15 locales', () => {
    // A generator that silently dropped a namespace would still produce a
    // structurally valid object; only the count catches it.
    //
    // 18,723 = 16,817 original, plus the 16 CLDR `many` forms FR-017 added to
    // fr/it/es-MX/pt-BR (without them MODE A selects `many`, misses, and falls
    // through to English at large counts), plus the 195 desktop-onboarding
    // strings spec 007 added (13 `onboarding.welcome.*` keys × 15 locales),
    // plus the 240 web-onboarding strings spec 006 added (16
    // `onboarding.welcomeWeb.*` keys × 15 locales), plus the 30 in-band fee-hold
    // strings spec 013 added (`send.txHeldFees` + `send.txRejectedFees` × 15
    // locales), plus the 210 wallet-home strings spec 015 added (14 keys ×
    // 15 locales: componentsUi mainNav/dayGroup/commandBar/qrPlaceholder,
    // networkFilter.pillAll, receive.addressLabel, history bare labels +
    // name-only subtitles), plus the 720 onboarding-flow strings spec 014
    // added (48 keys × 15 locales: the `onboarding.common.*` branch, 10
    // `onboarding.login.*` leaves, `onboarding.create.retryVerifyBtn`), plus
    // the 30 settings-domain strings spec 017 added (2 keys × 15 locales:
    // `settings.signOut.keeps` — what signing out does NOT take with it — and
    // `settingsModals.network.rpcChainMismatch` — an RPC override refused for
    // serving another chain), plus the 120 erase-this-device strings spec 017
    // added (8 keys × 15 locales: `settings.eraseDevice.*`, the destructive
    // counterpart to sign-out — its copy has to name what is lost AND what is
    // not, which is why it is eight strings and not one), plus the 30 send
    // unit-refusal strings spec 017 added (2 keys × 15 locales:
    // `send.warnCannotConvert` — a fiat figure the screen cannot restate in
    // token units — and `send.denomToggleNoRate` — the ⇄ row shown but inert,
    // the one branch the first key cannot cover, since there the figure is in
    // TOKEN units and resolves fine so nothing else on the screen speaks).
    // the 315 contacts-UI strings spec 018 added (21 `contacts.*` keys × 15
    // locales: manage, sectionContacts, countPeople, membersCount,
    // allContacts, addMember, batchSend + its two hint variants,
    // importFile/importAll/exportAll, importGroup/exportGroup, groupRename,
    // moveGroup, recentActivity, viewAllActivity, deleteContact, actionQr,
    // edit).
    // The number moving is the point; it should only ever move deliberately.
    // 18,918 = 18,723 at the 018 base, plus multi-passkey onboarding's
    // 13 keys × 15 locales = 195 (5 add-keys strings, confirmKeyBtn for the
    // interleaved flow, then the sync-badge/provider/second-key-gate set).
    // 19,368 = 18,918 plus spec 019's net 30 × 15 = 450: 31 keys added for the
    // v2 create journey (the hero, the key screen, the three add methods, the
    // progress tasks, the done screen's labels, the desktop security-key
    // sheet, login.switchDeviceBtn) against 1 removed — create.ack2, when the
    // acknowledgement gate went from four boxes to two. The six ack1/ack3
    // moves are renames and net zero.
    // 19,383 = 19,368 plus `create.nameTitle` × 15: the design's name screen
    // is titled 「给钱包起个名字」, which is not the flow's own label.
    // 19,563 = 19,383 plus 12 desktop-only keys × 15. The desktop is the only
    // client that speaks CTAP2 itself, so it is the only one that has to say
    // any of this on its own behalf — every other client hands the ceremony to
    // a system passkey sheet that says it for them:
    //   create.pin*   (5) the PIN prompt, which shipped reading
    //                     `securityKeyRequiredTitle` ("Plug in a security key")
    //                     as its heading — a different sentence about a
    //                     different moment.
    //   create.touch* (4) "your key is blinking, touch it" — with a separate
    //                     body for a sensor, because pressing a button and
    //                     resting a finger are different physical acts, and a
    //                     third for when SEVERAL keys are blinking at once.
    //   login.pick*   (3) which of several wallets on one key to sign in to.
    // 19,593 = 19,563 plus create.keyUnreadable* × 15: a key that is plugged in
    // and cannot be OPENED is a permissions problem wearing a hardware
    // problem's clothes, and the code used to report it as "no security key is
    // plugged in" — which sends a person to look at the port instead of at
    // their udev rules.
    // 19,608 = 19,593 plus welcome.heroTitleFit × 15: the one corpus value that
    // is not prose but an enum — which rung of the hero type ladder that
    // locale's headline needs. It rides with the string because the width is a
    // property of the translation (6.9em in zh, 10.9em in ru), and all four
    // clients read it through the `t()` they already call.
    // 19,698 = 19,608 plus the desktop rail's 6 `create.step*` keys × 15: the
    // three journey steps (Name / Keys / Create), each a label plus a detail
    // sentence, for the rail that replaced the phone-page-pulled-tall layout.
    // 20,658 = 19,818 plus the settings UI's 56 keys \u00d7 15 (spec 023): device
    // storage, the network list/detail chrome, the passkey-index rescue screen,
    // the compatibility checklist, About's links heading, SR3's "updated"
    // group, and the labels the bug-report disclosure prints beside the values
    // it is about to send.
    const total = SUPPORTED_LANGUAGES.reduce((n, l) => n + countLeaves(resources[l].translation), 0);
    expect(total).toBe(20_673);
  });

  it('preserves load-bearing leading and trailing whitespace', () => {
    // 39 values are sentence fragments concatenated at render time, and
    // zh/zh-TW/zh-HK deliberately OMIT the spaces — so no uniform trim rule is
    // safe, and any trimming step in the pipeline shows up right here.
    // `ack2`, not `ack1`: the legal line moved to index 2 when the checklist
    // went two rows to three (create_wallet.rs `ACK_COUNT`), and its fragments
    // were renamed with it — a fragment key whose name disagrees with the row it
    // renders is exactly how the ack3 -> ack1 confusion started.
    expect(en.onboarding.create.ack2).toMatch(/ $/);
    expect(en.home.switcherAccountCount).toMatch(/ $/);
  });
});
