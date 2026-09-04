# The Chrome extension (spec 027)

This directory is the MV3 artifact: the scripts that live in a web page and the
manifest that installs them. It is **not** a second wallet — it packages this
app's own client build (`build.mjs` assembles `dist/`), so everything the wallet
knows and decides comes from `src/`, unchanged.

It lives inside the app rather than beside `packages/safari-extension` because
it is a build target of THIS package: `pnpm build:extension` is its script, it
shares one package manager, one lint config and one gate suite, and it has no
life apart from app-web. The Safari extension is a genuinely separate artifact —
it talks to a native iOS app over `nativeMessaging` — and stays where it is.

These files sit outside `src/` on purpose: they are not SvelteKit modules and
must never be bundled by it. `inpage.js` in particular runs in the page's MAIN
world, where a bundler's module wrapper would be a bug.

## Four measured constraints this directory has to respect

They are recorded with their evidence in [`research.md`](../../../specs/027-web-extension-provider/research.md)
(D31, D33, D34, D35); the short version, because breaking any of them is silent:

1. **The manifest must declare `'wasm-unsafe-eval'`** in
   `content_security_policy.extension_pages`. Under MV3's default CSP,
   `WebAssembly.compile` fails outright — and every decision this product makes
   lives in that binary.
2. **No inline `<script>` in any extension page**, and a `'sha256-…'` hash is not
   an escape hatch — Chrome refuses to load the extension at all. This is why
   `dist/` carries a client-rendered shell rather than the site's prerendered
   pages.
3. **`host_permissions` must include `https://getvela.app/*`.** That entry is
   what lets the passkey ceremony run under the hosted site's relying party,
   which is what makes the extension the SAME wallet at the same address. Remove
   it and the extension quietly becomes a different, empty wallet.
4. **A dApp request opens a dedicated window, never the action popup.** The
   popup closes when the passkey prompt takes focus, mid-signature.

## Layout (as phases land it)

```
manifest.json      the four constraints above, plus a pinned id (`key`)
inpage.js          MAIN world: the provider, its announcement, the legacy shim
content.js         isolated world: the page bridge
background.js      the service worker: routing, and no authoritative state
lib/protocol.js    the message shapes both sides agree on
build.mjs          assembles the app's client build + these scripts into dist/
dist/              build output — gitignored
```
