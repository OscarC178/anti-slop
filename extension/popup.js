/* Anti-Slop popup — Filter and Scorecard views */
'use strict';

const DEFAULTS = {
  enabled: true, threshold: 3, mode: 'collapse', labels: true, peek: true, signals: {},
  sites: { x: true, linkedin: true, tiktok: true, instagram: true }, keywords: [], telemetry: true,
};
const SITE_NAMES = { x: 'X', linkedin: 'LinkedIn', tiktok: 'TikTok', instagram: 'Instagram' };
const KIND_NAMES = { signal: 'AI-sounding', label: 'AI label', keyword: 'Keyword' };
const $ = (id) => document.getElementById(id);
const PRIVACY_URL = 'https://oscarc178.github.io/anti-slop/privacy.html';
const REVIEW_AFTER_DAYS = 7;      // installed at least a week...
const REVIEW_AFTER_HIDDEN = 50;   // ...and at least this many posts hidden
const REVIEW_SNOOZE_DAYS = 30;    // "Not now" asks once more after this, then never
let settings = Object.assign({}, DEFAULTS);
let lastHidden = null;
let range = 'today';

function save(patch) {
  settings = Object.assign({}, settings, patch);
  chrome.storage.sync.set(settings);
}

// ---------- segmented controls ----------
function moveThumb(nav, btn) {
  const thumb = nav.querySelector('.seg-thumb');
  const btns = Array.from(nav.querySelectorAll('.seg'));
  const i = btns.indexOf(btn);
  thumb.style.width = `calc(${100 / btns.length}% - 2px)`;
  thumb.style.transform = `translateX(${i * 100}%)`;
  btns.forEach(b => { b.classList.toggle('active', b === btn); b.setAttribute('aria-selected', b === btn ? 'true' : 'false'); });
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => { v.hidden = v.id !== 'view-' + name; });
  const nav = document.querySelector('.segmented[role=tablist]');
  moveThumb(nav, nav.querySelector(`[data-view="${name}"]`));
  if (name === 'score') renderScorecard();
  try { localStorage.setItem('antislop.view', name); } catch (e) { /* ignore */ }
}

// ---------- filter view ----------
function setThresholdUI(v) {
  $('threshold').value = v;
  $('thresholdOut').textContent = v;
  $('threshold').style.setProperty('--pct', ((v - 1) / 9 * 100) + '%');
  const words = v <= 2 ? 'Strict: hides most emoji-bullet posts too' : v <= 4 ? 'Balanced for LinkedIn and X' : v <= 6 ? 'Only clearly AI-shaped posts' : 'Only the most obvious slop';
  $('thresholdHint').textContent = `Hide at ${v} point${v > 1 ? 's' : ''} · ${words}`;
}

function renderSignals() {
  const box = $('signals');
  box.innerHTML = '';
  let group = null, on = 0, card = null;
  for (const s of AntiSlopSignals.SIGNALS) {
    if (s.group !== group) {
      group = s.group;
      const g = document.createElement('div'); g.className = 'sig-group'; g.textContent = group; box.appendChild(g);
      card = document.createElement('div'); card.className = 'card list'; box.appendChild(card);
    }
    const enabled = Object.prototype.hasOwnProperty.call(settings.signals, s.id) ? settings.signals[s.id] : s.defaultOn;
    if (enabled) on++;
    const row = document.createElement('label'); row.className = 'sig';
    const text = document.createElement('div'); text.className = 'row-text';
    const title = document.createElement('div'); title.className = 'row-title'; title.textContent = s.name;
    const w = document.createElement('span'); w.className = 'w' + (s.weight >= 2 ? ' strong' : ''); w.textContent = s.weight >= 2 ? '2 pts' : '1 pt';
    title.appendChild(w);
    const sub = document.createElement('div'); sub.className = 'row-sub'; sub.textContent = s.description;
    text.append(title, sub);
    const sw = document.createElement('span'); sw.className = 'switch sm';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = enabled;
    cb.addEventListener('change', () => { save({ signals: Object.assign({}, settings.signals, { [s.id]: cb.checked }) }); updateSignalCount(); });
    const knob = document.createElement('span'); knob.className = 'knob';
    sw.append(cb, knob);
    row.append(text, sw);
    card.appendChild(row);
  }
  $('signalCount').textContent = on + ' of ' + AntiSlopSignals.SIGNALS.length + ' on';
}
function updateSignalCount() {
  const on = AntiSlopSignals.SIGNALS.filter(s => Object.prototype.hasOwnProperty.call(settings.signals, s.id) ? settings.signals[s.id] : s.defaultOn).length;
  $('signalCount').textContent = on + ' of ' + AntiSlopSignals.SIGNALS.length + ' on';
}

function renderKeywords() {
  const box = $('keywords');
  box.innerHTML = '';
  const list = settings.keywords || [];
  $('keywordCount').textContent = list.length ? list.length + ' active' : '';
  if (!list.length) { box.innerHTML = '<div class="empty">No keywords yet.</div>'; return; }
  for (const k of list) {
    const chip = document.createElement('span'); chip.className = 'kw';
    const t = document.createElement('span'); t.textContent = k;
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Remove ' + k);
    x.addEventListener('click', () => {
      chip.classList.add('out');
      setTimeout(() => { save({ keywords: (settings.keywords || []).filter(v => v !== k) }); renderKeywords(); }, 170);
    });
    chip.append(t, x);
    box.appendChild(chip);
  }
}

function renderSettings() {
  $('enabled').checked = !!settings.enabled;
  setThresholdUI(settings.threshold);
  $('labels').checked = !!settings.labels;
  $('peek').checked = settings.peek !== false;
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode === settings.mode));
  $('site-x').checked = settings.sites.x !== false;
  $('site-linkedin').checked = settings.sites.linkedin !== false;
  $('site-tiktok').checked = settings.sites.tiktok !== false;
  $('site-instagram').checked = settings.sites.instagram !== false;
  $('telemetry').checked = settings.telemetry !== false;
  renderSignals();
  renderKeywords();
}

function renderStats(stats) {
  if (!stats) return;
  $('siteName').textContent = stats.siteName + ' · active';
  if (lastHidden !== null && stats.hidden !== lastHidden) {
    const el = $('hiddenHere'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  }
  lastHidden = stats.hidden;
  $('hiddenHere').textContent = stats.hidden;
  $('scanned').textContent = stats.scanned;
  const box = $('recent');
  box.innerHTML = '';
  if (!stats.recent.length) { box.innerHTML = '<div class="empty">Nothing hidden on this page yet.</div>'; return; }
  for (const r of stats.recent) {
    const row = document.createElement('div'); row.className = 'recent-row';
    const head = document.createElement('div'); head.className = 'recent-head';
    const b = document.createElement('span'); b.className = 'badge ' + (r.kind || 'signal');
    b.textContent = r.kind === 'label' ? 'label' : r.kind === 'keyword' ? 'keyword' : r.points + ' pts';
    const hits = document.createElement('span'); hits.className = 'hits'; hits.textContent = r.hits.join(', ');
    head.append(b, hits);
    const snip = document.createElement('div'); snip.className = 'recent-snip'; snip.textContent = r.snippet || '(no text)';
    row.append(head, snip);
    box.appendChild(row);
  }
}

function loadStats() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) return;
    chrome.tabs.sendMessage(tab.id, { type: 'antislop:stats' }, (res) => {
      if (chrome.runtime.lastError || !res) { $('siteName').textContent = 'Open X, LinkedIn, TikTok or Instagram'; return; }
      renderStats(res);
    });
  });
  chrome.storage.local.get({ totalHidden: 0 }, (d) => { $('hiddenTotal').textContent = d.totalHidden || 0; });
}

// ---------- scorecard ----------
function dayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

function bar(name, n, max, cls) {
  const row = document.createElement('div'); row.className = 'bar';
  const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = name;
  const track = document.createElement('div'); track.className = 'track';
  const fill = document.createElement('div'); fill.className = 'fill ' + cls;
  track.appendChild(fill);
  const num = document.createElement('span'); num.className = 'n'; num.textContent = n;
  row.append(nm, track, num);
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = (max ? Math.round(n / max * 100) : 0) + '%'; }));
  return row;
}

function renderScorecard() {
  chrome.storage.local.get({ events: [], active: {} }, (d) => {
    const now = Date.now();
    const since = range === 'today' ? startOfDay(now) : range === 'all' ? 0 : startOfDay(now - (parseInt(range, 10) - 1) * 86400000);
    const events = d.events.filter(e => e.t >= since);

    // Feed seconds within the range, per site.
    let seconds = 0;
    const secBySite = {};
    for (const [site, days] of Object.entries(d.active || {})) {
      for (const [day, s] of Object.entries(days)) {
        const t = new Date(day + 'T00:00:00').getTime();
        if (t >= since || (range === 'today' && day === dayKey(now))) { seconds += s; secBySite[site] = (secBySite[site] || 0) + s; }
      }
    }
    const minutes = seconds / 60;
    $('scTotal').textContent = events.length;
    $('scMinutes').textContent = minutes < 10 ? minutes.toFixed(1) : Math.round(minutes);
    $('scRate').textContent = minutes > 0 ? (events.length / minutes).toFixed(2) : '–';

    const bySite = {}, byKind = {};
    for (const e of events) { bySite[e.site] = (bySite[e.site] || 0) + 1; byKind[e.kind || 'signal'] = (byKind[e.kind || 'signal'] || 0) + 1; }
    const sites = $('scSites'); sites.innerHTML = '';
    const maxS = Math.max(1, ...Object.values(bySite));
    for (const s of ['x', 'linkedin', 'tiktok', 'instagram']) sites.appendChild(bar(SITE_NAMES[s], bySite[s] || 0, maxS, s));
    const kinds = $('scKinds'); kinds.innerHTML = '';
    const maxK = Math.max(1, ...Object.values(byKind));
    for (const k of ['signal', 'label', 'keyword']) kinds.appendChild(bar(KIND_NAMES[k], byKind[k] || 0, maxK, k));

    // Last 7 days, always, regardless of range.
    const days = $('scDays'); days.innerHTML = '';
    const counts = [];
    for (let i = 6; i >= 0; i--) {
      const t = startOfDay(now - i * 86400000);
      const key = dayKey(t);
      counts.push({ key, n: d.events.filter(e => dayKey(e.t) === key).length, lbl: new Date(t).toLocaleDateString('en-GB', { weekday: 'narrow' }) });
    }
    const maxD = Math.max(1, ...counts.map(c => c.n));
    for (const c of counts) {
      const day = document.createElement('div'); day.className = 'day' + (c.key === dayKey(now) ? ' today' : '');
      const num = document.createElement('span'); num.className = 'num'; num.textContent = c.n || '';
      const col = document.createElement('div'); col.className = 'col';
      const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = c.lbl;
      day.append(num, col, lbl);
      days.appendChild(day);
      requestAnimationFrame(() => requestAnimationFrame(() => { col.style.height = Math.max(3, Math.round(c.n / maxD * 52)) + 'px'; }));
    }
  });
}

// Arrow keys move between segments (pattern from the Halaska segmented control).
function segKeys(nav, onPick) {
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const btns = Array.from(nav.querySelectorAll('.seg'));
    const i = btns.findIndex(b => b.classList.contains('active'));
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
    next.focus(); onPick(next); e.preventDefault();
  });
}

// ---------- first-run notice (telemetry) ----------
function openNotice() {
  $('noticeOptOut').checked = settings.telemetry === false;
  $('notice').hidden = false;
  requestAnimationFrame(() => $('notice').classList.add('open'));
  $('noticeOk').focus();
}
function closeNotice() {
  save({ telemetry: !$('noticeOptOut').checked });
  $('telemetry').checked = settings.telemetry;
  chrome.storage.local.set({ noticeSeen: true });
  $('notice').classList.remove('open');
  setTimeout(() => { $('notice').hidden = true; maybeShowReview(); }, 300);   // matches the sheet's 300 ms slide
}

// ---------- review reminder ----------
// Only for copies installed from the Chrome Web Store (they carry Google's update_url),
// only after real use, at most twice, never on top of the user's feeds.
function storeInstall() { return /google\.com/.test(chrome.runtime.getManifest().update_url || ''); }
function reviewUrl() { return 'https://chromewebstore.google.com/detail/' + chrome.runtime.id + '/reviews'; }
function maybeShowReview() {
  chrome.storage.local.get({ installedAt: 0, totalHidden: 0, review: {}, noticeSeen: false, reviewTest: false }, (d) => {
    const r = d.review || {};
    const now = Date.now();
    const show = (storeInstall() || d.reviewTest) && d.noticeSeen && d.installedAt &&
      now - d.installedAt >= REVIEW_AFTER_DAYS * 86400000 && d.totalHidden >= REVIEW_AFTER_HIDDEN &&
      r.state !== 'done' && r.state !== 'never' && now >= (r.askAfter || 0);
    if (!show) { $('review').hidden = true; return; }
    $('reviewText').textContent = `Anti-Slop has hidden ${d.totalHidden.toLocaleString('en-GB')} posts for you so far. If your feed feels cleaner, a quick rating on the Chrome Web Store helps other people find it.`;
    $('review').hidden = false;
  });
}
function setReview(patch) {
  chrome.storage.local.get({ review: {} }, (d) => chrome.storage.local.set({ review: Object.assign({}, d.review, patch) }));
  $('review').classList.add('out');
  setTimeout(() => { $('review').hidden = true; $('review').classList.remove('out'); }, 200);
}

// ---------- wire up ----------
$('telemetry').addEventListener('change', e => save({ telemetry: e.target.checked }));
$('whatSent').addEventListener('click', (e) => { e.preventDefault(); openNotice(); });
$('privacyLink').addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: PRIVACY_URL }); });
$('noticeOk').addEventListener('click', closeNotice);
$('notice').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); closeNotice(); } });
$('reviewRate').addEventListener('click', () => { chrome.tabs.create({ url: reviewUrl() }); setReview({ state: 'done' }); });
$('reviewLater').addEventListener('click', () => {
  chrome.storage.local.get({ review: {} }, (d) => {
    if ((d.review || {}).snoozed) setReview({ state: 'never' });
    else setReview({ snoozed: true, askAfter: Date.now() + REVIEW_SNOOZE_DAYS * 86400000 });
  });
});
$('reviewNever').addEventListener('click', () => setReview({ state: 'never' }));
document.querySelectorAll('.segmented[role=tablist] .seg').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
segKeys(document.querySelector('.segmented[role=tablist]'), (b) => showView(b.dataset.view));
const pickRange = (b) => { range = b.dataset.range; moveThumb($('rangeSeg'), b); renderScorecard(); };
document.querySelectorAll('#rangeSeg .seg').forEach(b => b.addEventListener('click', () => pickRange(b)));
segKeys($('rangeSeg'), pickRange);
$('enabled').addEventListener('change', e => save({ enabled: e.target.checked }));
$('threshold').addEventListener('input', e => setThresholdUI(parseInt(e.target.value, 10)));
$('threshold').addEventListener('change', e => save({ threshold: parseInt(e.target.value, 10) }));
$('labels').addEventListener('change', e => save({ labels: e.target.checked }));
$('peek').addEventListener('change', e => save({ peek: e.target.checked }));
document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#modeSeg button').forEach(x => x.classList.toggle('active', x === b));
  save({ mode: b.dataset.mode });
}));
for (const id of ['x', 'linkedin', 'tiktok', 'instagram']) {
  $('site-' + id).addEventListener('change', e => save({ sites: Object.assign({}, settings.sites, { [id]: e.target.checked }) }));
}
$('kwForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('kwInput').value.trim();
  if (!v) return;
  const list = settings.keywords || [];
  if (!list.some(k => k.toLowerCase() === v.toLowerCase())) save({ keywords: list.concat([v]) });
  $('kwInput').value = '';
  renderKeywords();
});

chrome.storage.sync.get(DEFAULTS, (s) => {
  settings = Object.assign({}, DEFAULTS, s);
  settings.sites = Object.assign({}, DEFAULTS.sites, s.sites || {});
  settings.keywords = Array.isArray(s.keywords) ? s.keywords : [];
  renderSettings();
  loadStats();
  let view = 'filter';
  try { view = localStorage.getItem('antislop.view') || 'filter'; } catch (e) { /* ignore */ }
  // Set the thumb without animation on first paint.
  document.documentElement.style.setProperty('--t', '0ms');
  showView(view);
  moveThumb($('rangeSeg'), $('rangeSeg').querySelector('.seg.active'));
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.style.removeProperty('--t')));
  chrome.storage.local.get({ noticeSeen: false }, (d) => { if (!d.noticeSeen) openNotice(); else maybeShowReview(); });
});
setInterval(loadStats, 1500);
