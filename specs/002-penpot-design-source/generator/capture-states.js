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
      const el = s.id ? document.getElementById(s.id) : byText(s.text, s.nth);
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

  for (const st of group.states) {
    try {
      for (const s of (st.steps || [])) await step(s);
      await sleep(st.settle || 700);
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
