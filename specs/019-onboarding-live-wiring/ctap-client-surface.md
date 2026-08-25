# What we are actually building: an OS-grade CTAP2 client

**Status**: living inventory · started 2026-08-25, during Phase 5 hardware testing

## The premise

The desktop client has no system passkey service, so it talks to security keys
itself. That decision is not "add USB support to onboarding". It is:

> **We are writing the CTAP2 client that an operating system would otherwise
> provide — all of it, except the platform-authenticator half.**

Everything a browser's passkey sheet does for the other four clients, this app
does for itself: choosing a device, telling a person their key is blinking,
asking for a PIN, counting the attempts left, enumerating the credentials on a
key, letting someone pick between them. None of that is optional polish. Each
one is a thing the OS would have done, and it is not going to.

Phase 5 was written as if it were a transport. Five bugs found in one afternoon
with a key in hand — every one of them a client responsibility, not a protocol
error — is what that assumption costs. This file is the inventory, so the
remaining ones are found by reading rather than by tripping over them.

## Legend

| | |
| --- | --- |
| ✅ | done |
| ⚠️ | partial, with the gap named |
| ❌ | not done |
| ⛔ | deliberately out of scope, with the reason |

---

## 1. Transports

| | Surface | Notes |
| --- | --- | --- |
| ✅ | USB HID | `ctap/usb.rs`. Verified on macOS against a real key. |
| ❌ | NFC | No desktop reader story worth having yet. |
| ❌ | BLE | Superseded by hybrid for the cases that matter. |
| ❌ | Hybrid / caBLE v2 (QR → phone) | **Feature 020.** The key screen already renders it as unavailable-and-explained rather than hiding it. |
| ⛔ | Platform authenticator | The premise's exception — but see §7, because "the OS has one" is not the same as "we cannot reach it", and on Windows it is the ONLY route. |

## 2. Device layer

| | Surface | Notes |
| --- | --- | --- |
| ✅ | Enumerate by usage page `0xF1D0` / usage `0x01` | |
| ✅ | Several keys: `authenticatorSelection` race | The one touched wins. |
| ✅ | Targeted open by credential | Silent `up:false` probe; only the key that holds it blinks. |
| ❌ | **Hot-plug** | "No security key is plugged in" needs the person to press retry. An OS client notices the insert and continues. This is the next one to fix — it is the first thing a new user hits. |
| ⚠️ | `CTAPHID_CANCEL` to the losers of a race | The losing threads are left to their own exchange timeout. Correct, but they keep blinking for up to 120 s after the race is decided. |
| ❌ | `WINK` | "Which key is this?" — identify a device by making it flash. Wanted once a person has three plugged in. |
| ❌ | `PING` | Liveness. Low value. |
| ❌ | Channel-busy handling | A browser talking to the same key concurrently gets `CTAP1_ERR_CHANNEL_BUSY`; we surface it as `Other(0x06)`. |

## 3. CTAPHID framing

| | Surface |
| --- | --- |
| ✅ | `INIT` with nonce echo (checked — two clients on one key must not adopt each other's channel) |
| ✅ | Fragmentation and reassembly, sequence-checked |
| ✅ | `KEEPALIVE`, with `UP_NEEDED` surfaced to the screen |
| ✅ | `ERROR` |
| ⚠️ | `CANCEL` — sent on ceremony failure, not on the race |

## 4. CTAP2 commands

| | Command | Notes |
| --- | --- | --- |
| ✅ | `authenticatorMakeCredential` | |
| ✅ | `authenticatorGetAssertion` | |
| ✅ | `authenticatorGetNextAssertion` | Enumerates a multi-credential key. |
| ✅ | `authenticatorGetInfo` | |
| ✅ | `authenticatorSelection` | |
| ✅ | `authenticatorClientPIN` — `getKeyAgreement`, `getPinRetries`, `getPinToken`, `…UsingPinWithPermissions`, `…UsingUvWithPermissions` | |
| ⚠️ | `authenticatorClientPIN` — `getUvRetries` | Encoder exists, never called. The PIN dialog shows PIN attempts; the fingerprint path shows nothing when a finger fails. |
| ❌ | `authenticatorClientPIN` — `setPIN` / `changePIN` | A key with no PIN is currently told to go and use the vendor's tool. Setting one in-app is the difference between "go install YubiKey Manager" and "type a PIN twice". |
| ❌ | `authenticatorCredentialManagement` | List and DELETE credentials on the key. A person who abandons a wallet has no way to reclaim the slot — and keys hold 25–100. |
| ❌ | `authenticatorBioEnrollment` | Enrolling a fingerprint. Same argument as `setPIN`. |
| ❌ | `authenticatorConfig` | `alwaysUv`, `minPinLength`, enterprise attestation. |
| ❌ | `authenticatorLargeBlobs` | No use for it here. |
| ⛔ | `authenticatorReset` | A reset erases every passkey on the key, including other services'. If this is ever offered it needs its own confirmation design, not a menu item. |

## 5. PIN and user verification

| | Surface | Notes |
| --- | --- | --- |
| ✅ | Protocols One and Two, negotiated from `getInfo` | |
| ✅ | Built-in UV preferred over PIN | A key with a sensor is asked for a finger. |
| ✅ | Token permissions + rpId binding | `mc \| ga` on `getvela.app`. |
| ✅ | PIN attempts shown before the guess | |
| ✅ | PIN cached per DEVICE, in memory, one flow | Never crosses keys; dropped on refusal and on close. |
| ❌ | `minPinLength` | A key may demand a longer PIN than the person types. `PIN_POLICY_VIOLATION` (0x37) currently falls through to "something went wrong". |
| ❌ | `alwaysUv` | A key configured to always require UV changes what a request must carry. |
| ❌ | UV retries / lockout counter | See `getUvRetries` above. |
| ❌ | `forcePINChange` | A key can demand a PIN change before it will do anything. |

## 6. WebAuthn client rules

| | Surface |
| --- | --- |
| ✅ | `clientDataJSON` in the layout the core's own parsers read (tested both ceremonies) |
| ✅ | ES256 only — RS256 can never satisfy RIP-7212 |
| ✅ | Discoverable credential required |
| ✅ | `excludeCredentials` on every add-a-key registration |
| ✅ | User verification required |
| ✅ | The `credProps.rk` equivalent — `rk` support checked from `getInfo` before anything is minted |
| ❌ | `credProtect` extension |
| ❌ | `hmac-secret`, `largeBlob`, `minPinLength` extensions |

## 7. Platform reality — the part that is not a feature list

### macOS ✅

Works. Verified against a real key: HID enumeration, framing, `getAssertion`,
registry lookup, account restore.

### Linux ✅ — packaging gap closed

Direct `hidraw` access needs a **udev rule** granting the logged-in user access
to FIDO devices. Our `.deb`, `.rpm` and flatpak ship none, and the flatpak
manifest has no device permission beyond `--device=dri`. On a distro without
`libfido2`'s rules already installed, the key enumerates and fails to open —
which today reports as "no security key is plugged in", the least useful
sentence available.

**Done.** `packaging/70-vela-fido.rules` matches the USAGE PAGE rather than a
vendor-id list — webauthn-rs's own notes are that systemd 252+ tags FIDO devices
that way, and that the older vendor-id packages go stale the moment somebody
buys a key they predate. It applies `uaccess`, which is the right scope for a
thing you touch with a finger, and is inert alongside systemd's rule. The `.deb`
also recommends `libu2f-udev`, the `.rpm` installs the rule, and the flatpak
gained `--device=all` — the narrowest permission flatpak has for this, and the
same trade every browser flatpak makes.

A permission error also reports as itself now (`UsbError::AccessDenied`), rather
than as "no security key is plugged in".

### Windows ✅ *(written, type-checked, never run)* — via the platform API

Since **Windows 10 1903**, a non-elevated process **cannot open a FIDO HID
device at all**. The OS reserves them for `webauthn.dll`, which is why
`libfido2` uses that API on Windows rather than its own HID backend.

This is not a bug to fix in `usb.rs`. It means:

> On Windows, the platform's CTAP client is the ONLY route, and asking the user
> to run a wallet as Administrator is not an answer.

The Windows desktop build therefore needs `WebAuthNAuthenticatorMakeCredential`
/ `…GetAssertion` — which is the same call that gives Windows Hello for free,
and which draws its own picker, PIN prompt and touch prompt. Everything in §1–§6
becomes, on that one platform, work the OS does.

**This inverts the premise for Windows, and it was not caught when the desktop
transport was chosen (research D3 evaluated HID crates and never asked whether
the OS would let us use one).** It does not change macOS or Linux.

**Built**, in `app-desktop/vela-passkey-win`, after reading
`webauthn-authenticator-rs`'s `win10` module. Three things carried over from it:

1. **We still build the clientDataJSON.** Windows takes it as bytes and hashes
   it; it does not construct it. So the same builder the CTAP2 path uses runs
   here, and the join with the core's parsers — the property that one
   authenticator derives one address on every platform — is untouched.
2. **`WebAuthNGetErrorName`** maps an `HRESULT` to the WebAuthn DOM exception
   name a browser would have raised (`NotAllowedError`, `InvalidStateError`).
   That is the vocabulary the web client already classifies by, so the failure
   mapping is a translation rather than an invention.
3. **Pointer lifetime.** Every request struct holds bare pointers into buffers
   we own; they are bound to names that outlive the call, never to temporaries.

One thing deliberately NOT carried over: their 1×1 helper window. It exists
because `webauthn-authenticator-rs` is a library called from console apps with
no window; gpui implements `raw_window_handle`, so the dialog parents to the
wallet's real window and inherits its focus and z-order.

**Windows Hello comes with it.** `WEBAUTHN_AUTHENTICATOR_ATTACHMENT_ANY` means a
Windows user with a fingerprint reader and no security key can use this wallet —
which on macOS and Linux they still cannot.

**The verification gap, stated plainly.** `scripts/check-windows.sh` type-checks
the whole path from any machine (`cargo clippy --target x86_64-pc-windows-gnu`,
wired into CI), which is why the crate is separate: the desktop app's own tree
compiles C and cannot be cross-checked at all, so anything living there could
only be compiled by a Windows machine. Type-checked is not tested. Every struct
field and signature is verified; no behaviour is.

### The macOS platform authenticator, revisited

`ASAuthorizationPlatformPublicKeyCredentialProvider` is available on macOS 12+
and would give Touch ID passkeys in the system's own sheet. This feature's
premise — "the desktop has no system passkey service" — is true of *gpui*, not
of *macOS*. Worth reopening as a choice rather than leaving as an assumption:
a Mac user with Touch ID currently must own a security key to use this wallet.

---

## 8. What to do next, in order

1. **Run the Windows path on Windows** (§7). It is written and type-checked and
   has never executed. Everything else on this list is smaller than the risk of
   a platform whose only route is unverified.
2. **Hot-plug** (§2). The first thing a new user hits, and today it is a dead
   end that needs a retry press. `fido-hid-rs` does this with a udev
   `MonitorBuilder` on Linux and the equivalent per OS — worth reading before
   writing.
3. **`CTAPHID_CANCEL` to race losers** (§2). Keys blinking after the question
   was answered.
4. **`setPIN` / `changePIN`** (§4). Removes "go install the vendor's tool" from
   the happy path of a brand-new key.
5. **`minPinLength`, `alwaysUv`, `forcePINChange`, UV retries** (§5). The
   configurations that currently land in "something went wrong".
6. **`credentialManagement`** (§4). Reclaiming slots on a full key.

~~Linux udev + flatpak permission~~ and ~~permission errors reported as
themselves~~ are done, above.
