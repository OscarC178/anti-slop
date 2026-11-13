/*
 * Anti-Slop — service worker.
 *
 * - Toolbar badge: posts hidden right now in each tab.
 * - History for the scorecard (chrome.storage.local):
 *     events        last 5000 hides: {t, site, kind, points}
 *     active        feed seconds per site per day: {site: {YYYY-MM-DD: seconds}}
 *     totalHidden   lifetime count (kept for backwards compatibility)
 *     bySite        lifetime count per site
 *     tally         unsent daily counts for telemetry: {YYYY-MM-DD: {"site|kind": n}}
 *     installedAt   ms timestamp of first install (for the review reminder)
 *
 * Telemetry (on by default, opt out in the popup): once a finished day is over, send
 * {v, type:"counts", ext, day, counts:[{site, kind, n}]} to TELEMETRY_URL. Nothing else: no IDs,
 * no URLs, no post text. Plus one {v, type:"install", ext} ping on first install.
 */
'use strict';

// Set to the deployed Worker, e.g. "https://anti-slop-telemetry.<account>.workers.dev/v1/collect".
// While empty, nothing is ever sent.
const TELEMETRY_URL = 'https://anti-slop-telemetry.anti-slop-telemetry.workers.dev/v1/collect';
const TELEMETRY_SITES = ['x', 'linkedin', 'tiktok', 'instagram'];
const TELEMETRY_KINDS = ['signal', 'label', 'keyword'];
const KEEP_DAYS = 7;  // the Worker refuses anything older than 8 days
// Tests point this at a local Worker by setting self.ANTISLOP_TEST_URL; nothing in the extension sets it.
const endpoint = () => self.ANTISLOP_TEST_URL || TELEMETRY_URL;

const MAX_EVENTS = 5000;
const perTab = new Map();

// Serialise writes so two quick messages cannot clobber each other.
let queue = Promise.resolve();
function update(fn) {
  queue = queue.then(() => new Promise((resolve) => {
    chrome.storage.local.get({ events: [], active: {}, totalHidden: 0, bySite: {} }, (d) => {
      const next = fn(d) || d;
      chrome.storage.local.set(next, resolve);
    });
  })).catch(() => {});
  return queue;
}

function dayKey(t) {
  const d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !sender.tab) return;
  const tabId = sender.tab.id;

  if (msg.type === 'antislop:count') {
    const count = msg.count | 0;
    perTab.set(tabId, count);
    chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#ff3b30' });
    const delta = msg.newHides | 0;
    if (delta) {
      update((d) => {
        d.bySite[msg.site] = (d.bySite[msg.site] || 0) + delta;
        d.totalHidden = (d.totalHidden || 0) + delta;
        return d;
      });
    }
  } else if (msg.type === 'antislop:hide') {
    update((d) => {
      d.events.push({ t: msg.t || Date.now(), site: msg.site, kind: msg.kind || 'signal', points: msg.points | 0 });
      if (d.events.length > MAX_EVENTS) d.events = d.events.slice(-MAX_EVENTS);
      return d;
    });
    addToTally(msg.site, msg.kind || 'signal', msg.t || Date.now());
  } else if (msg.type === 'antislop:active') {
    update((d) => {
      const day = dayKey(Date.now());
      d.active[msg.site] = d.active[msg.site] || {};
      d.active[msg.site][day] = (d.active[msg.site][day] || 0) + (msg.seconds | 0);
      return d;
    });
  }
});

// A navigation restarts the content script; clear the badge until it reports again.
chrome.webNavigation && chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId === 0) { perTab.delete(d.tabId); chrome.action.setBadgeText({ tabId: d.tabId, text: '' }); }
});
chrome.tabs.onRemoved.addListener((tabId) => { perTab.delete(tabId); });

// ---------- telemetry ----------
function telemetryOn() {
  return new Promise((resolve) => chrome.storage.sync.get({ telemetry: true }, (s) => resolve(s.telemetry !== false)));
}

function addToTally(site, kind, t) {
  if (!TELEMETRY_SITES.includes(site) || !TELEMETRY_KINDS.includes(kind)) return;
  telemetryOn().then((on) => {
    if (!on) return;
    const day = dayKey(t), k = site + '|' + kind;
    queue = queue.then(() => new Promise((resolve) => {
      chrome.storage.local.get({ tally: {} }, (d) => {
        d.tally[day] = d.tally[day] || {};
        d.tally[day][k] = (d.tally[day][k] || 0) + 1;
        chrome.storage.local.set({ tally: d.tally }, resolve);
      });
    })).catch(() => {});
  });
}

function post(body) {
  return fetch(endpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },  // a "simple" request: no CORS preflight
    body: JSON.stringify(body),
    credentials: 'omit',
    cache: 'no-store',
  });
}

// Send every finished day still in the tally, then forget it. Today is never sent.
async function flush() {
  if (!endpoint() || !(await telemetryOn())) return;
  const { tally } = await chrome.storage.local.get({ tally: {} });
  const today = dayKey(Date.now());
  const oldest = dayKey(Date.now() - KEEP_DAYS * 86400000);
  const ext = chrome.runtime.getManifest().version;
  for (const day of Object.keys(tally).sort()) {
    if (day >= today) continue;
    let done = day < oldest;  // too old for the server: just drop it
    if (!done) {
      const counts = Object.entries(tally[day])
        .map(([k, n]) => { const [site, kind] = k.split('|'); return { site, kind, n: Math.min(n, 5000) }; })
        .filter(c => c.n > 0);
      if (!counts.length) done = true;
      else {
        try {
          const r = await post({ v: 1, type: 'counts', ext, day, counts });
          done = r.ok || (r.status >= 400 && r.status < 500 && r.status !== 429);  // rejected for good: do not retry
        } catch (e) { done = false; }  // offline: try again later
      }
    }
    if (done) {
      await new Promise((resolve) => {
        queue = queue.then(() => new Promise((res) => chrome.storage.local.get({ tally: {} }, (d) => {
          delete d.tally[day]; chrome.storage.local.set({ tally: d.tally }, res);
        }))).then(resolve, resolve);
      });
    }
  }
}

// Opting out wipes anything not yet sent.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.telemetry && changes.telemetry.newValue === false) chrome.storage.local.remove('tally');
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'antislop:telemetry') flush(); });
function scheduleFlush() { chrome.alarms.create('antislop:telemetry', { delayInMinutes: 1, periodInMinutes: 180 }); }
chrome.runtime.onStartup.addListener(scheduleFlush);

chrome.runtime.onInstalled.addListener(async (details) => {
  chrome.action.setBadgeBackgroundColor({ color: '#ff3b30' });
  scheduleFlush();
  const { installedAt } = await chrome.storage.local.get({ installedAt: 0 });
  if (!installedAt) await chrome.storage.local.set({ installedAt: Date.now() });
  if (details.reason !== 'install') return;
  if (endpoint() && (await telemetryOn())) {
    try { await post({ v: 1, type: 'install', ext: chrome.runtime.getManifest().version }); } catch (e) { /* offline: skip */ }
  }
});
