/**
 * RecipientTypeBadge — a small trailing marker (shown to the RIGHT of a recipient name)
 * that encodes WHO/WHAT the address is, at a glance:
 *
 *   1. Saved contact        → green ✓ (you vouched for this address; anti-poisoning signal)
 *   2. Vela user (passkey)  → the Vela sailboat mark (a Vela smart account — its being a
 *                             contract is expected, so it is NOT flagged as "合约")
 *   3. Unknown EOA          → "unknown" + a wallet mark (an ordinary externally-owned account
 *                             you've not saved)
 *   4. Unknown contract     → "unknown" + a contract mark (an unsaved contract address)
 *
 * Priority is contact → vela → (contract ? unknown-contract : unknown-eoa). Renders nothing
 * until the saved-contact lookup resolves, so a contact never flashes as "unknown" first.
 * Shared by the Send confirm flow and the transaction receipt so the marker reads identically.
 *
 * ---------------------------------------------------------------------------
 * OWNERSHIP: the four-level PRIORITY below is the shell's, and stays there.
 * Written down so nobody adjudicates it a third time.
 * ---------------------------------------------------------------------------
 *
 * Every INPUT is already owned somewhere else, and none of it is decided here:
 *   - "is this a saved contact" → `savedContactFor`, which on web is the
 *     `contacts` Rust ledger (`saved-contact.ts` → the one resident session)
 *     and on native the TypeScript address book. What counts as saved, the
 *     lower-cased key and the deletion tombstones are all the core's.
 *   - "is this a Vela account" / "does it have a name" → the recipient-identity
 *     port (passkey index, then ENS/Basename/.bnb/.arb over RPC). Network facts.
 *   - "EOA or contract" → the recipient-risk probe (`eth_getCode`, including the
 *     EIP-7702 delegated-EOA carve-out). Also a network fact, decided there.
 *
 * What is left after those four facts is WHICH GLYPH WINS — pure icon
 * precedence over booleans someone else established. It moves no money, gates
 * nothing, has exactly one implementation (this file), and would have to carry
 * lucide icon identities into wasm to live in a core. So it is `keep_in_shell`:
 * a display rule with a single owner, which is the whole point.
 *
 * RELATIONSHIP TO `RecipientTrust` (the overlap, resolved): both components ask
 * "is this a saved contact", and both reach the SAME owner — this one through
 * `savedContactFor`, `RecipientTrust` through `useRecipientTrust`. They cannot
 * disagree about who is trusted; they only differ in what they need back, and
 * that difference is deliberate:
 *   - this badge needs a THREE-state answer (unknown / saved / not saved) so it
 *     can render NOTHING while the lookup is outstanding — a saved contact must
 *     never flash as "unknown" (`isContact === null` below);
 *   - `RecipientTrust` needs the contact's NAME and `favorite` flag, and treats
 *     "not yet loaded" and "not saved" identically because it renders nothing in
 *     either case anyway.
 * Collapsing this onto `useRecipientTrust` would trade the tri-state for that
 * flash, which is why they are two hooks over one source of truth rather than
 * one hook. The two are never rendered with a leading icon at the same site
 * (the confirm rows pass `nameOnly` to `RecipientTrust` precisely so this badge
 * is the only marker), so their green checkmarks never appear side by side.
 */
import React, { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import { BadgeCheck, Globe, HelpCircle, Wallet, FileText } from 'lucide-react-native';
import { savedContactFor } from '@/services/saved-contact';
import { useRecipientIdentity } from '@/hooks/use-recipient-identity';
import type { RecipientIdentity } from '@/services/recipient-identity';
import { color, createStyles, space } from '@/constants/theme';

/** The Vela brand mark (app icon) — used as the "this is a Vela account" badge. */
const VELA_LOGO = require('@/../assets/images/icon.png');

export function RecipientTypeBadge({
  address,
  identity,
  isContract,
  size = 15,
}: {
  address?: string;
  identity?: RecipientIdentity | null;
  /** From the recipient-risk probe — decides EOA vs contract for an unsaved address. */
  isContract?: boolean | null;
  size?: number;
}) {
  const [isContact, setIsContact] = useState<boolean | null>(null);

  useEffect(() => {
    setIsContact(null);
    if (!address) return;
    let cancelled = false;
    savedContactFor(address)
      .then((c) => { if (!cancelled) setIsContact(!!c); })
      .catch(() => { if (!cancelled) setIsContact(false); });
    return () => { cancelled = true; };
  }, [address]);

  // Resolve the live identity (Vela/passkey, then a name service) — cached, so a batch of
  // recipients each resolves at most once. Skipped when the caller already passed `identity`.
  const resolved = useRecipientIdentity(address, identity ?? undefined);

  // Wait for the contact lookup so a saved contact never flashes as "unknown".
  if (isContact === null) return null;

  const isVela = resolved?.source === 'passkey';
  // A name from a name service (ENS / Basename / .bnb / .arb …) — not passkey, but named.
  const isNamed = !isVela && !!resolved?.name;

  if (isContact) {
    return (
      <View style={styles.wrap}>
        <BadgeCheck size={size} color={color.success.base} strokeWidth={2.4} />
      </View>
    );
  }
  if (isVela) {
    return (
      <View style={styles.wrap}>
        <Image source={VELA_LOGO} style={{ width: size + 1, height: size + 1, borderRadius: (size + 1) / 2 }} resizeMode="contain" />
      </View>
    );
  }
  if (isNamed) {
    // ENS / name-service identity — a calm blue globe (not the accent orange).
    return (
      <View style={styles.wrap}>
        <Globe size={size} color={color.info.base} strokeWidth={2} />
      </View>
    );
  }
  // Unknown address — "unknown" paired with its account kind (EOA vs contract).
  return (
    <View style={styles.wrap}>
      <HelpCircle size={size} color={color.fg.subtle} strokeWidth={2} />
      {isContract === true
        ? <FileText size={size} color={color.fg.subtle} strokeWidth={2} />
        : <Wallet size={size} color={color.fg.subtle} strokeWidth={2} />}
    </View>
  );
}

const styles = createStyles(() => ({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
}));
