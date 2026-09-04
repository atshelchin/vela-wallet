# Contract — the page ⇄ wallet channel

Ported from `packages/safari-extension/src/lib/protocol.js` @ 52ad8fa9. This
file records the promises the channel must keep; the shapes themselves come with
the port.

## Hops

```
page (MAIN world)  ──window.postMessage──►  content script (isolated world)
content script     ──runtime.sendMessage─►  background service worker
background         ──────────────────────►  request window (the wallet)
request window     ──────── answer ───────►  background ──► content ──► page
```

## Promises

1. **Origin is the browser's fact.** Every hop carries the sender origin as the
   browser reports it. A page's claimed identity travels beside it as a claim and
   can never widen a grant.
2. **One answer, once.** A request id is single-use. A second answer for the same
   id is dropped, and a request that is settled cannot be re-opened.
3. **Delivery is bound.** An answer reaches only the tab and origin that asked.
   No wildcard `postMessage` targets.
4. **Bounded before it is shown.** A payload that cannot be parsed, or that
   exceeds the size bound, is refused before any screen renders it.
5. **The MAIN-world guard.** The injected script verifies it is running in the
   page's world and bails silently if it is not, rather than half-installing.
6. **Silence is refusal.** A request window closed without a decision, and a
   background torn down mid-flight, both resolve as `4001` rather than hanging.
7. **The wallet's record outlives the page's answer.** An approved operation is
   persisted as pending at submit time (026), whether or not the answer was
   delivered.
