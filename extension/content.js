/*
 * Anti-Slop — content script.
 *
 * Watches the feed, scores every post with signals.js, and hides the ones
 * that cross the user's threshold. Keeps a count for the popup and badge.
 * Runs entirely in the page; this script makes no network requests (daily totals are sent by background.js).
 */
(function () {
  'use strict';

  const Signals = self.AntiSlopSignals;
  const site = self.AntiSlopSites.siteFor(location.hostname);
  if (!site) return;

  // ---------- settings ----------
  const DEFAULTS = {
    enabled: true,
    threshold: 3,          // points needed before a post is hidden
    mode: 'collapse',      // 'collapse' (placeholder with Show) or 'remove'
    labels: true,          // level 1: hide platform-labelled AI content
    signals: {},           // id -> bool overrides
    sites: { x: true, linkedin: true, tiktok: true, instagram: true },
    peek: true,            // click "Show more" / "…more" on borderline posts to score the full text
    keywords: [], telemetry: true,          // user words/phrases; any match hides the post
  };
  let settings = Object.assign({}, DEFAULTS);

  // ---------- state ----------
  const state = {
    hiddenKeys: new Set(), // posts redacted right now (badge + "on this page")
    everHidden: new Set(), // posts redacted at least once this page load (feeds the all-time total)
    scanned: 0,
    recent: [],            // last hides for the popup: {key, snippet, points, hits}
  };
  const PROCESSED = 'antislopKey';   // dataset key on the post element
  const allowed = new Set();         // post keys the user chose to show

  // ---------- helpers ----------
  function q(el, selectors) {
    for (const s of selectors) {
      const found = el.querySelectorAll(s);
      if (found.length) return Array.from(found);
    }
    return [];
  }

  function postKey(post) {
    return site.key(post) || ('text:' + hashText(postText(post)));
  }

  function hashText(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function postText(post) {
    let nodes = q(post, site.text);
    if (site.pickText && nodes.length) nodes = site.pickText(nodes, post);
    else if (site.firstTextOnly && nodes.length > 1) nodes = nodes.slice(0, 1);
    if (nodes.length) {
      const t = nodes.map(n => n.innerText || n.textContent || '').join('\n').trim();
      return site.stripText ? t.replace(site.stripText, '').trim() : t;
    }
    return '';
  }

  // Text in the post that is NOT the body: author line, labels, menus. Used for level 1.
  function chromeText(post) {
    const clone = post.cloneNode(true);
    let body = q(clone, site.text);
    if (site.pickText && body.length) body = site.pickText(body, clone);
    for (const n of body) n.remove();
    for (const sel of (site.exclude || [])) clone.querySelectorAll(sel).forEach(n => n.remove());
    return (clone.innerText || clone.textContent || '').trim();
  }

  function outermostPosts(root) {
    const sel = site.post.join(',');
    let candidates = [];
    if (root.nodeType === 1) {
      if (root.matches(sel)) candidates.push(root);
      candidates = candidates.concat(Array.from(root.querySelectorAll(sel)));
    }
    // keep only outermost matches so nested wrappers are not double-counted
    return candidates.filter(el => !el.parentElement || !el.parentElement.closest(sel));
  }

  // ---------- hide / show ----------
  function hide(post, key, reason) {
    const target = site.hideTarget(post);
    if (target.dataset.antislopHidden === key) return;
    target.dataset.antislopHidden = key;
    target.classList.add('antislop-hidden');
    target.classList.toggle('antislop-remove', settings.mode === 'remove');

    let ph = target.querySelector(':scope > .antislop-placeholder');
    if (!ph) {
      ph = document.createElement('div');
      ph.className = 'antislop-placeholder';
      target.prepend(ph);
    }
    ph.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'antislop-label';
    label.textContent = reason.title;
    const why = document.createElement('span');
    why.className = 'antislop-why';
    why.textContent = reason.detail;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'antislop-show';
    btn.textContent = 'Show';
    btn.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      allowed.add(key);
      unhide(target);
    });
    ph.append(label, why, btn);

    state.hiddenKeys.add(key);
    const fresh = !state.everHidden.has(key);
    state.everHidden.add(key);
    state.recent = state.recent.filter(r => r.key !== key);
    state.recent.unshift({ key, kind: reason.kind, snippet: reason.snippet, points: reason.points, hits: reason.hitNames, at: Date.now() });
    state.recent = state.recent.slice(0, 12);
    if (fresh) {
      // One event per first-time hide feeds the scorecard (time, site, reason, points).
      try { chrome.runtime.sendMessage({ type: 'antislop:hide', site: site.id, kind: reason.kind, points: reason.points, t: Date.now() }); } catch (e) { /* reloaded */ }
    }
    reportCount(fresh ? 1 : 0);
  }

  function unhide(target) {
    const key = target.dataset.antislopHidden;
    delete target.dataset.antislopHidden;
    target.classList.remove('antislop-hidden', 'antislop-remove');
    const ph = target.querySelector(':scope > .antislop-placeholder');
    if (ph) ph.remove();
    if (key && state.hiddenKeys.delete(key)) reportCount(0);
  }

  // ---------- evaluate one post ----------
  function evaluate(post) {
    const key = postKey(post);
    const target = site.hideTarget(post);

    // A recycled cell showing a different post: reset it.
    if (target.dataset.antislopHidden && target.dataset.antislopHidden !== key) unhide(target);

    // Skip work if we already judged this exact text (like counts etc. mutate constantly).
    const body = postText(post);
    const bodyHash = hashText(body);
    if (post.dataset[PROCESSED] === key && post.dataset.antislopHash === bodyHash) return;
    if (post.dataset[PROCESSED] !== key) state.scanned++;
    post.dataset[PROCESSED] = key;
    post.dataset.antislopHash = bodyHash;

    if (!settings.enabled || settings.sites[site.id] === false || allowed.has(key)) return;

    const snippet = body.replace(/\s+/g, ' ').slice(0, 110);

    // Level 0: the user's own keywords, matched against the body and the author line.
    if (settings.keywords && settings.keywords.length) {
      const hay = (body + '\n' + chromeText(post)).toLowerCase();
      const kw = settings.keywords.find(k => k && hay.includes(String(k).toLowerCase()));
      if (kw) {
        hide(post, key, {
          kind: 'keyword',
          title: 'Hidden: keyword',
          detail: '"' + kw + '"',
          snippet, points: 0, hitNames: ['keyword: ' + kw],
        });
        return;
      }
    }

    // Level 1: platform label or self-disclosure.
    if (settings.labels) {
      const lab = Signals.labelled(chromeText(post), body);
      if (lab) {
        hide(post, key, {
          kind: 'label',
          title: 'Hidden: labelled AI content',
          detail: lab,
          snippet, points: 0, hitNames: ['platform label'],
        });
        return;
      }
    }

    // Level 2: heuristic signals.
    if (!body) return;
    const result = Signals.score(body, settings.signals);
    if (result.points >= settings.threshold) {
      const names = result.hits.map(h => h.name);
      hide(post, key, {
        kind: 'signal',
        title: 'Hidden: reads like AI slop (' + result.points + ' pts)',
        detail: result.hits.map(h => h.name + ' [' + h.evidence + ']').join(' · '),
        snippet, points: result.points, hitNames: names,
      });
      return;
    }
    peekBehindMore(post, result.points);
  }

  // Long posts are cut off behind "Show more" (X, 280 chars) or "…more" (LinkedIn, ~200 chars)
  // and the rest is not in the page. If the preview is already borderline, press the button
  // so the full text gets scored; the observer re-runs evaluate() when the text changes.
  function peekBehindMore(post, previewPoints) {
    if (!settings.peek || !site.more || post.dataset.antislopPeeked) return;
    if (previewPoints < Math.max(1, settings.threshold - 2)) return;
    let btn = null;
    if (site.moreText) {
      for (const sel of site.more) {
        btn = Array.from(post.querySelectorAll(sel)).find(b => site.moreText.test((b.innerText || b.textContent || '').trim()));
        if (btn) break;
      }
    } else {
      btn = q(post, site.more)[0];
    }
    if (!btn) return;
    post.dataset.antislopPeeked = '1';
    try { btn.click(); } catch (e) { /* ignore */ }
  }

  // ---------- scanning ----------
  let scheduled = false;
  const pending = new Set();

  function scan(root) {
    for (const p of outermostPosts(root || document.body)) evaluate(p);
  }

  function scheduleScan(node) {
    pending.add(node);
    if (scheduled) return;
    scheduled = true;
    // A short timer, not requestAnimationFrame: background tabs throttle rAF to a standstill.
    setTimeout(() => {
      scheduled = false;
      const nodes = Array.from(pending);
      pending.clear();
      for (const n of nodes) {
        if (!n.isConnected) continue;
        // Text may arrive after the post shell; re-check the enclosing post.
        const post = n.nodeType === 1 && n.closest ? n.closest(site.post.join(',')) : null;
        if (post) { delete post.dataset[PROCESSED]; }
        scan(post || n);
      }
    }, 20);
  }

  function rescanAll() {
    document.querySelectorAll('[data-antislop-key]').forEach(p => { delete p.dataset[PROCESSED]; delete p.dataset.antislopHash; });
    document.querySelectorAll('.antislop-hidden').forEach(unhide);
    scan(document.body);
  }

  const observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'childList') {
        // Added elements (new posts) and the parent itself (text swapped in behind "Show more").
        let elem = false;
        for (const n of m.addedNodes) if (n.nodeType === 1) { scheduleScan(n); elem = true; }
        if (!elem && m.addedNodes.length && m.target.nodeType === 1) scheduleScan(m.target);
      } else if (m.type === 'characterData' && m.target.parentElement) {
        scheduleScan(m.target.parentElement);
      }
    }
  });

  // ---------- messaging ----------
  // count = posts hidden right now on this page; newHides = first-time hides to add to the all-time total.
  let reportTimer = null, pendingNew = 0;
  function reportCount(newHides) {
    pendingNew += newHides || 0;
    if (reportTimer) return;
    reportTimer = setTimeout(() => {
      reportTimer = null;
      const n = pendingNew; pendingNew = 0;
      try {
        chrome.runtime.sendMessage({ type: 'antislop:count', count: state.hiddenKeys.size, newHides: n, site: site.id });
      } catch (e) { /* extension reloaded */ }
    }, 50);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'antislop:stats') {
      sendResponse({ site: site.id, siteName: site.name, hidden: state.hiddenKeys.size, everHidden: state.everHidden.size, scanned: state.scanned, recent: state.recent });
    } else if (msg && msg.type === 'antislop:rescan') {
      rescanAll();
      sendResponse({ ok: true });
    }
    return true;
  });

  function loadSettings(cb) {
    chrome.storage.sync.get(DEFAULTS, (s) => {
      settings = Object.assign({}, DEFAULTS, s);
      settings.sites = Object.assign({}, DEFAULTS.sites, s.sites || {});
      settings.keywords = Array.isArray(s.keywords) ? s.keywords : [];
      cb && cb();
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    loadSettings(() => {
      document.documentElement.classList.toggle('antislop-mode-remove', settings.mode === 'remove');
      rescanAll();
    });
  });

  // ---------- active feed time (for the scorecard's per-minute rate) ----------
  // Every 30 s the tab is visible counts as 30 s of feed time on this site.
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !settings.enabled) return;
    try { chrome.runtime.sendMessage({ type: 'antislop:active', site: site.id, seconds: 30 }); } catch (e) { /* reloaded */ }
  }, 30000);

  // ---------- start ----------
  loadSettings(() => {
    document.documentElement.classList.toggle('antislop-mode-remove', settings.mode === 'remove');
    // Observe first, then scan: the first pass may press "Show more" and we must see the text arrive.
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    scan(document.body);
    reportCount(0);
  });
})();
