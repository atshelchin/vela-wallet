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
async function captureAll(specs, from, count) {
  const all = { captured: {}, failed: {}, log: [] };
  for (const group of specs.slice(from || 0, (from || 0) + (count || specs.length))) {
    history.pushState({}, '', group.url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    await new Promise((r) => setTimeout(r, group.settle || 2200));
    const r = await captureStates(group);
    Object.assign(all.captured, r.captured);
    Object.assign(all.failed, r.failed);
    all.log.push(group.url + ': ' + r.counts.ok + ' ok, ' + r.counts.bad + ' bad');
  }
  all.counts = { ok: Object.keys(all.captured).length, bad: Object.keys(all.failed).length };
  return all;
}

async function captureStates(group) {
  const out = { captured: {}, failed: {}, log: [] };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const fire = (el) => {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    }
  };
  const clickable = () => [...document.querySelectorAll('[role="button"],button,[tabindex]')];
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

  for (const st of group.states) {
    try {
      for (const s of (st.steps || [])) await step(s);
      await sleep(st.settle || 700);
      assertState(st);
      await window.preloadAssets();
      out.captured[st.slug] = window.extractLayout();
      out.log.push(st.slug + ' ok');
    } catch (e) {
      out.failed[st.slug] = String((e && e.message) || e);
    }
  }
  // never leave injected faults behind for the next group
  try { if (window.vela) window.vela.clear(); } catch (e) {}
  out.counts = { ok: Object.keys(out.captured).length, bad: Object.keys(out.failed).length };
  return out;
}
