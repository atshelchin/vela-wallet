# Generator chunks

Numbered `.js` files whose bodies are passed **verbatim** to `mcp__penpot__execute_code` against the file "Vela Wallet — Design Source of Truth", in numeric order. Full rules: [../contracts/generator-contract.md](../contracts/generator-contract.md) (upsert-by-name, <15s/<200 shapes per chunk, `// inv:` fact anchors, cold-start tolerant).

Operating notes: run `10-lib.js` first after ANY plugin reload (it installs `storage.lib`; later chunks throw without it). On bridge errors see [../quickstart.md](../quickstart.md) §1. Audits are chunks 90–95; their committed output is `audit-report.md`.

## Feeding big payloads to the plugin (70/71)

The screen boards need megabytes of DOM dumps and asset bytes. Do **not** paste those into
`execute_code` — the plugin sandbox can fetch, so serve the data to it instead.

The sandbox has no `location` and is **same-origin only**: `fetch('/api/...')` works,
`fetch('http://localhost:8123/...')` fails with "Failed to fetch". Penpot's frontend is an nginx
container, so the trick is to put the files inside *its own* web root:

```sh
docker exec penpot-penpot-frontend-1 mkdir -p /var/www/app/plugins/mcp/vela
docker cp dom-dumps/pruned/. penpot-penpot-frontend-1:/var/www/app/plugins/mcp/vela/
docker cp generator/70-board-from-dom.js penpot-penpot-frontend-1:/var/www/app/plugins/mcp/gen/
```

`/plugins` has its own nginx `location` with an `alias`, so any extension is served as-is.
(Under `location /`, a rule `~ ^/[^/]+/(.*)$ { return 301 "/404"; }` swallows other subdirectories
unless the file ends in `.js`/`.css`/`.png`/…)

Then the whole run is short calls:

```js
storage.runChunk = async (name) => {
  // cache-bust: nginx sends `Cache-Control: public, max-age=604800` for .js
  const src = await (await fetch('/plugins/mcp/gen/' + name + '?v=' + Date.now(), { cache: 'reload' })).text();
  return await new Function('storage','penpot','penpotUtils',
    'return (async () => {' + src + '})()')(storage, penpot, penpotUtils);
};
storage.runBoard = async (slug, spec) => {
  storage.domDump = await (await fetch('/plugins/mcp/vela/' + slug + '.json')).json();
  storage.boardSpec = spec;
  return await storage.runChunk('70-board-from-dom.js');
};
```

Upload the **global** asset registry once per session (keys are content hashes, so they are shared
across dumps): `storage.assetBatch = await (await fetch('/plugins/mcp/vela/_global.assets.json')).json()`
then `storage.runChunk('71-upload-assets.js')`. `storage.assets` dies with the plugin session —
after a "No plugin instance connected", reload the tab and re-run 71 before any 70.
