// capture-states.js — run in the RUNNING WEB APP (chrome-devtools evaluate_script).
// Drives one URL group of `state-specs.json`: applies each state's steps to the live app, then
// dumps the rendered layout with extract-dom-layout.js. Screen states are reached the way a person
// reaches them — tap a tab, type an amount, inject an RPC failure — so a board records a state the
// app can actually be in, not one composed by hand.
//
// Usage (per group, after navigating to group.url):
//   const src = await (await fetch('/__capture-states.js')).text();
//   new Function(src + '\nwindow.captureStates = captureStates;')();
//   return await window.captureStates(group);
//
// Steps are applied IN ORDER and are CUMULATIVE within a group: state N starts from where state
// N-1 left off, which is what makes a flow (select token -> enter amount -> confirm) cheap to
// capture. Order in the spec file is therefore significant; `reset` steps undo what a state set.
// Walk several groups in ONE page context. Expo Router honours a pushState + popstate pair, so the
// whole sweep runs without a reload — which matters because a reload would throw away the loaded
// extractor, the asset cache, and any fault the previous group injected.
//
// `baseline` is {slug: fingerprint} for boards already captured — earlier groups of this sweep, and
// whatever the driver read off disk. It is what lets state N be checked against a sibling it did not
// itself capture; see the fingerprint block below for why that check has to exist.
async function captureAll(specs, from, count, baseline) {
  const all = { captured: {}, failed: {}, fingerprints: {}, log: [] };
  const seen = Object.assign({}, baseline || {});
  for (const group of specs.slice(from || 0, (from || 0) + (count || specs.length))) {
    history.pushState({}, '', group.url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await new Promise((r) => setTimeout(r, group.settle || 2200));
    const r = await captureStates(group, seen);
    Object.assign(all.captured, r.captured);
    Object.assign(all.failed, r.failed);
    Object.assign(all.fingerprints, r.fingerprints);
    Object.assign(seen, r.fingerprints);          // later groups must clear the earlier ones too
    all.log.push(group.url + ': ' + r.counts.ok + ' ok, ' + r.counts.bad + ' bad');
  }
  all.counts = { ok: Object.keys(all.captured).length, bad: Object.keys(all.failed).length };
  return all;
}

// ── fingerprint ──────────────────────────────────────────────────────────────────────────────
// Reduces a dump to a hash of everything that PAINTS, so two captures can be asked the only
// question that matters: are these the same picture?
//
// Both cruder answers were tried against the 43 boards in dom-dumps/screens and both are wrong:
//
//   * hashing the FILE is too strict. home-activity.json and home-assets.json came back
//     byte-identical, but home-connections.json — the same wrong screen a third time — differed by
//     exactly one node: an empty, transparent 390x844 div with no text and no children. A file hash
//     clears that third board. (Measured: 2 collision groups / 4 files across all 349 dumps.)
//   * hashing the TEXT is too loose. The gallery's VelaButton default and disabled cells carry the
//     same label and differ only in opacity; primary/secondary loading likewise. A text hash fails
//     20 innocent boards. (Measured: 30 groups / 114 files.)
//
// So: keep only nodes that put something on screen, and hash geometry + text + fill + ink + opacity
// + radius + border + shadow + image + font. Measured over dom-dumps/screens that flags exactly two
// groups, and both are real defects — the home tab triple, and home-rate-limited vs home-rpc-trouble,
// which state-specs.json itself says must differ by a banner.
//
// This is a pure string function on purpose: run-capture.mjs lifts it out of this file and runs it
// in Node over dumps already on disk, so the browser and the driver can never disagree about
// whether two boards are the same.
//
// EVERY FIELD HERE MUST SURVIVE PRUNING. `prune-states.py` rewrites committed dumps in place and
// keeps only the whitelist at prune-states.py:19 — `src` and `svg` are NOT on it. Hashing them (the
// first version did) makes a fresh dump and the pruned dump of the SAME screen fingerprint
// differently, so every comparison against a board already on disk silently passes: the
// `differsFrom` check — the one that makes a PARTIAL recapture safe, which is the command anyone
// actually types — becomes a no-op for the 35 of 43 boards that have been pruned. Known cost: two
// boards identical in every box, colour, weight and word but differing only in icon MARKUP now read
// as the same picture. `assetKey` (which pruning does keep) covers the raster case.
function fingerprintDump(dump) {
  const parts = [];
  const visit = (n) => {
    if (Array.isArray(n)) { for (const c of n) visit(c); return; }
    if (!n || typeof n !== 'object') return;
    const paints = n.text || n.bg || n.border || n.shadow || n.radius || n.kind ||
                   n.color || n.opacity !== undefined || n.svg;
    if (paints) {
      parts.push([
        Math.round(n.x), Math.round(n.y), Math.round(n.w), Math.round(n.h),
        n.text || '', n.bg || '', n.color || '',
        n.opacity === undefined ? '' : n.opacity,
        JSON.stringify(n.radius === undefined ? '' : n.radius),
        n.kind || '', n.assetKey || '',
        n.shadow || '', n.border ? n.border.w + String(n.border.color) : '',
        n.font ? n.font.size + '/' + n.font.weight : '',
      ].join(''));
    }
    if (n.children) visit(n.children);
  };
  visit(dump && dump.tree);
  // two independent FNV-1a passes: one 32-bit hash collides at ~1 in 10^5 over a few hundred
  // boards, and a fingerprint collision is a SILENT PASS — the exact failure this file exists to
  // stop. Concatenating two seeds buys the headroom for the price of one more multiply.
  const fnv = (s, seed) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  };
  const joined = parts.join('');
  return fnv(joined, 0x811c9dc5) + fnv(joined, 0x7fffffff) + '-' + parts.length;
}

async function captureStates(group, baseline) {
  const out = { captured: {}, failed: {}, fingerprints: {}, log: [] };
  // fingerprints this run has already accepted, keyed by slug. Seeded from the driver so a
  // one-group rerun is checked against the boards it is not recapturing.
  const seen = Object.assign({}, baseline || {});
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // the element that holds exactly [backdrop, sheet] — see the `scope` note at the capture below
  const overlayRoot = () => {
    const backdrop = [...document.querySelectorAll('div')]
      .find((d) => /rgba\(0, 0, 0, 0\.[23]/.test(getComputedStyle(d).backgroundColor));
    const root = backdrop && backdrop.parentElement;
    if (!root) throw new Error("scope 'overlay' found no backdrop — is the sheet actually open?");
    return root;
  };

  const fire = (el) => {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
  };
  // Inactive routes stay MOUNTED. react-navigation keeps the screen you came from in the DOM under
  // `display:none`, and it sits FIRST in document order — on /parallel, 17 of the 29 nodes this
  // selector returns are a ghost copy of Home. `el.innerText` on a display:none node falls back to
  // textContent, so byText('Assets') matches the ghost's tab happily; fire() then flips the ghost's
  // state and the visible screen never moves, while dispatchEvent swallows the error the ghost
  // raises ("Failed to execute 'setPointerCapture'") so the step reports success. That is exactly
  // how S/home/activity, S/home/assets and S/home/connections became three copies of one picture.
  // Match only what is rendered. (Playwright's own `visible=true` filter selects the same set, and
  // its locator.click() fails on the ghost too — the node choice is the fix, not the event kind.)
  const clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')]
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  const byText = (t, nth) => {
    const want = String(t).toLowerCase();
    const hits = clickable().filter((e) => {
      const s = (e.innerText || '').trim().toLowerCase();
      return s === want || s.startsWith(want + '\n') || s === want.toLowerCase();
    });
    const loose = hits.length ? hits : clickable().filter((e) => (e.innerText || '').toLowerCase().includes(want));
    return loose[nth || 0] || null;
  };

  const step = async (s) => {
    if (s.act === 'wait') return sleep(s.ms || 500);
    if (s.act === 'goto') {
      // Re-enter a route to clear what the previous state left behind — a Send screen already
      // holding an amount is not the screen a person sees on arrival.
      history.pushState({}, '', s.url);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
      return sleep(s.ms || 2200);
    }
    if (s.act === 'vela') {
      if (!window.vela) throw new Error('vela console not installed (not a dev build?)');
      window.vela[s.fn].apply(window.vela, s.args || []);
      return sleep(s.ms || 300);
    }
    if (s.act === 'clickNth') {
      // Positional, for controls whose label is the very thing a state changes: tapping the balance
      // hero masks it, so after the first tap there is no "$3.19" left to match on.
      const el = clickable()[s.n];
      if (!el) throw new Error('no clickable #' + s.n);
      fire(el);
      return sleep(s.ms || 900);
    }
    if (s.act === 'click') {
      // `label` matches aria-label as a REGEX. Needed for controls that carry no matchable text of
      // their own: the balance hero's only label is the amount it shows, so byText finds nothing and
      // a positional clickNth is index-fragile — the same hero is clickable #1 under /wallet and #2
      // under /parallel, which is how a "hidden balance" capture came back with the balance visible.
      const el = s.id ? document.getElementById(s.id)
        : s.label ? clickable().find((e) => new RegExp(s.label).test(e.getAttribute('aria-label') || ''))
        : byText(s.text, s.nth);
      // `optional` is for a control that may legitimately be absent because the app remembers a
      // choice — the Receive safety gate stays dismissed once acknowledged, so a step that clicks
      // "I Understand" must be allowed to be a no-op rather than failing the whole state.
      if (!el && s.optional) return sleep(50);
      if (!el) throw new Error('no element for ' + JSON.stringify(s));
      fire(el.querySelector('[role="button"],button') || el);
      return sleep(s.ms || 900);
    }
    if (s.act === 'type') {
      const inp = s.id ? document.getElementById(s.id)
        : (s.placeholder ? [...document.querySelectorAll('input,textarea')].find((i) => (i.placeholder || '').includes(s.placeholder))
                         : document.querySelectorAll('input,textarea')[s.which || 0]);
      if (!inp) throw new Error('no input for ' + JSON.stringify(s));
      // the native setter must come from the element's OWN class, or a textarea throws
      // "Illegal invocation" — React only sees the change when the native setter is used
      const proto = inp.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(inp, s.value);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return sleep(s.ms || 900);
    }
    if (s.act === 'key') {
      // Aim at the FOCUSED element first. Dispatching Enter on document only was why a pasted
      // pairing URI never submitted: react-native-web's TextInput listens on the input itself, so
      // the connect screen came back identical to its resting state and the "connecting" boards
      // were quietly duplicates of the disconnected one.
      const code = s.keyCode || (s.key === 'Enter' ? 13 : 0);
      const init = { key: s.key, code: s.key === 'Enter' ? 'Enter' : s.key, keyCode: code, which: code, bubbles: true, cancelable: true };
      const targets = [document.activeElement, document, window].filter(Boolean);
      for (const t of targets) {
        for (const type of ['keydown', 'keypress', 'keyup']) {
          try { t.dispatchEvent(new KeyboardEvent(type, init)); } catch (e) {}
        }
        if (t !== document && t !== window) break;    // the focused field got it; do not double-fire
      }
      return sleep(s.ms || 500);
    }
    if (s.act === 'pull') {
      // Pull-to-refresh, dispatched as raw touch on VelaRefresh's own wrapper. This is the ONLY way
      // to make Home re-hit RPC: every other load path is served from fetchTokens' 5-minute cache,
      // which never calls onFailedChains — which is why an injected RPC fault looks like it does
      // nothing, and why the RPC-trouble board was nearly retired as "unreachable". Pulling AFTER
      // the fault (rather than arming it before boot) is also what makes the board correct: the
      // cached balance survives, so the screen shows $3.27 above the warning card instead of the
      // $0.00 a cold start produces.
      const frame = [...document.querySelectorAll('div')].find((e) => { const r = e.getBoundingClientRect(); return Math.abs(r.width - 390) <= 2 && r.height > 600; });
      if (!frame) throw new Error('pull: no 390px phone frame');
      const r = frame.getBoundingClientRect();
      const x = r.left + r.width / 2, y0 = r.top + (s.from || 260);
      const target = document.elementFromPoint(x, y0) || frame;
      const mk = (type, cy) => new TouchEvent(type, { bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target, clientX: x, clientY: cy })],
        changedTouches: [new Touch({ identifier: 1, target, clientX: x, clientY: cy })] });
      target.dispatchEvent(mk('touchstart', y0));
      for (let dy = 10; dy <= 140; dy += 10) { target.dispatchEvent(mk('touchmove', y0 + dy)); await sleep(16); }
      target.dispatchEvent(mk('touchend', y0 + 140));
      return sleep(s.ms || 1200);
    }
    if (s.act === 'scroll') {
      const sc = [...document.querySelectorAll('div')].find((e) => e.scrollHeight > e.clientHeight + 40 && e.clientHeight > 300);
      if (sc) sc.scrollTop = s.y === 'bottom' ? sc.scrollHeight : (s.y || 0);
      else window.scrollTo(0, s.y === 'bottom' ? document.body.scrollHeight : (s.y || 0));
      return sleep(s.ms || 600);
    }
    throw new Error('unknown step ' + JSON.stringify(s));
  };

  // ── assertions ─────────────────────────────────────────────────────────────────────────────
  // A capture that silently records the wrong screen is worse than one that fails: it ships as a
  // confident lie. Two whole classes of defect got through before these existed — states captured
  // while the app was still in Dark appearance (five boards on light pages came out dark), and
  // states whose distinguishing element never rendered (a rate-limited board with no balance, an
  // RPC-trouble board with no banner, a "copied" board with no confirmation). So a state may now
  // declare what must and must not be on screen, and the theme is checked automatically.
  const bodyText = () => (document.body.innerText || '');
  // The 390px phone frame itself is TRANSPARENT — reading its background gives rgba(0,0,0,0), whose
  // channels average to zero and therefore looked "dark" for every screen, light or not. Find the
  // largest element inside the frame that actually paints something and judge on that.
  const rootBg = () => {
    const frame = [...document.querySelectorAll('div')].find((e) => {
      const r = e.getBoundingClientRect();
      return Math.abs(r.width - 390) <= 2 && r.height > 600;
    });
    if (!frame) return '';
    let best = null, bestArea = 0;
    for (const e of [frame, ...frame.querySelectorAll('div')]) {
      const bg = getComputedStyle(e).backgroundColor;
      const m = String(bg).match(/rgba?\(([^)]+)\)/);
      if (!m) continue;
      const p = m[1].split(',').map((s) => parseFloat(s));
      if (p.length > 3 && p[3] < 0.9) continue;         // transparent or nearly so: paints nothing
      const r = e.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { bestArea = area; best = bg; }
    }
    return best || '';
  };
  const isDarkNow = () => {
    const m = String(rootBg()).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b] = m[1].split(',').map((s) => parseFloat(s));
    return (r + g + b) / 3 < 90;                       // the app's dark base is #010101/#141412
  };
  const assertState = (st) => {
    // innerText returns the TRANSFORMED text, so a label the source writes as "Total balance"
    // arrives as "TOTAL BALANCE" wherever the design uppercases it. Compare case-insensitively or
    // every assertion against a section label is a false failure.
    const txt = bodyText().toLowerCase();
    for (const want of [].concat(st.expect || [])) {
      if (!txt.includes(String(want).toLowerCase())) throw new Error('expected on screen but absent: ' + JSON.stringify(want));
    }
    for (const no of [].concat(st.forbid || [])) {
      if (txt.includes(String(no).toLowerCase())) throw new Error('forbidden but present on screen: ' + JSON.stringify(no));
    }
    // A regex is the only way to assert that a VALUE rendered rather than a specific string: the
    // pair of home failure states differ by whether a cached balance survived, and both shipped
    // identical because the hide-balance toggle had been left on since it was captured hours before.
    for (const re of [].concat(st.expectRe || [])) {
      if (!new RegExp(re, 'i').test(txt)) throw new Error('expected pattern absent: /' + re + '/');
    }
    for (const re of [].concat(st.forbidRe || [])) {
      if (new RegExp(re, 'i').test(txt)) throw new Error('forbidden pattern present: /' + re + '/');
    }
    // A board's name declares its theme: only a `-dark` slug may be captured dark. This is the
    // check that would have caught five light-page boards rendered on a dark ground.
    const wantDark = /(^|[-/])dark(-|$)/.test(st.slug) || st.dark === true;
    const dark = isDarkNow();
    if (dark !== null && dark !== wantDark) {
      throw new Error('theme mismatch: screen is ' + (dark ? 'dark' : 'light') +
        ' but slug asks for ' + (wantDark ? 'dark' : 'light') + ' (root bg ' + rootBg() + ')');
    }
  };

  // ── the post-condition every state gets for free ──────────────────────────────────────────
  // `expect`/`forbid` above only catch a wrong screen when the author guessed the right string, and
  // for tabbed screens the obvious guess is worthless: home-assets was captured on the Activity tab,
  // yet its dump contains the word "Assets" TWICE — once as the tab label, once as a section header.
  // `expect: ["Assets"]` would have passed on the wrong picture. What actually distinguishes those
  // boards is not a word, it is that they must not be the SAME PICTURE. So that is now checked for
  // every state, with no authoring at all:
  //
  //   default          this dump must not equal any dump already accepted (this run, or handed in
  //                    by the driver as `baseline`)
  //   sameAs: [slug]   escape hatch — the boards named here are ALLOWED to be identical. For a
  //                    deliberate idempotent re-shoot (state-specs-5's treasury-bootstrap-open is
  //                    documented as exactly that), not for "this keeps failing".
  //   differsFrom: s   a louder, targeted version: name the sibling this state is most likely to be
  //                    silently confused with. Worth attaching to tabs and segmented toggles even
  //                    though the default already covers them, because it survives a PARTIAL rerun —
  //                    recapturing home-assets on its own has nothing in-run to collide with, so
  //                    only a named target sends the driver to read home-activity off disk.
  //
  // A `differsFrom` whose target has no fingerprint is a hard failure, not a skip. A check that
  // quietly declines to run is how this whole class of defect reached the design file.
  const assertDistinct = (st, dump) => {
    const fp = fingerprintDump(dump);
    const allowed = [].concat(st.sameAs || []);
    for (const target of [].concat(st.differsFrom || [])) {
      if (!(target in seen)) {
        throw new Error('differsFrom names "' + target + '" but no fingerprint for it is available' +
          ' — capture it in this run, or let the driver read it from disk, before asserting against it');
      }
      if (seen[target] === fp) {
        throw new Error('identical to "' + target + '": the steps ran and threw nothing but the ' +
          'screen never changed (fp ' + fp + ')');
      }
    }
    for (const other of Object.keys(seen)) {
      if (seen[other] !== fp || other === st.slug || allowed.indexOf(other) >= 0) continue;
      throw new Error('identical to "' + other + '" captured earlier — two boards cannot be the ' +
        'same picture (fp ' + fp + '); if that is genuinely intended, say so with sameAs');
    }
    return fp;
  };

  for (const st of group.states) {
    try {
      for (const s of (st.steps || [])) await step(s);
      await sleep(st.settle || 700);
      assertState(st);
      await window.preloadAssets();
      // `scope: 'overlay'` dumps ONLY the modal, not the screen behind it. The extractor has always
      // supported opts.root; the spec path never passed it, so every overlay captured through a spec
      // carried its whole host screen. That is not cosmetic: gen-region-maps expects an overlay dump
      // to have the backdrop and the sheet as its two roots, and an unscoped one silently collapses
      // to a single region — 21 signing boards did exactly that. The anchor is the backdrop's PARENT
      // (a child of body that contains a 390px frame is no good: the host screen is itself inside
      // the phone frame, so that test returns the whole app).
      const dump = window.extractLayout(st.scope === 'overlay' ? { root: overlayRoot() } : undefined);
      // BEFORE the dump is handed back, never after: the driver writes whatever it is given, and a
      // dump that reaches disk is indistinguishable from a correct one.
      const fp = assertDistinct(st, dump);
      out.captured[st.slug] = dump;
      out.fingerprints[st.slug] = fp;
      seen[st.slug] = fp;
      out.log.push(st.slug + ' ok');
    } catch (e) {
      out.failed[st.slug] = String((e && e.message) || e);
      out.log.push(st.slug + ' FAILED: ' + String((e && e.message) || e));
    }
  }
  // never leave injected faults behind for the next group
  try { if (window.vela) window.vela.clear(); } catch (e) {}
  out.counts = { ok: Object.keys(out.captured).length, bad: Object.keys(out.failed).length };
  return out;
}
