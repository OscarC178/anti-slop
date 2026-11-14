// End-to-end evaluation: loads the real extension into the system Chromium and
// serves fixture pages at the real hostnames (x.com, linkedin.com, tiktok.com)
// via request interception, so the content scripts inject exactly as they
// would on the live sites. Run: node tests/e2e.js
'use strict';
const path = require('path');
const fs = require('fs');
const S = require('../extension/signals.js');

// Playwright ships inside the playwright-cli mise install; reuse it.
const PW_ROOT = path.join(process.env.HOME, '.local/share/mise/installs/npm-playwright-cli/latest/node_modules/.mise');
const pwDir = fs.readdirSync(PW_ROOT).find(d => /^playwright@/.test(d));
const { chromium } = require(path.join(PW_ROOT, pwDir, 'node_modules', 'playwright'));

const EXT = path.resolve(__dirname, '..', 'extension');
const FIX = path.resolve(__dirname, 'fixtures');
const USER_DATA = fs.mkdtempSync('/tmp/antislop-e2e-');

let failures = 0, passes = 0;
function check(cond, msg) {
  console.log((cond ? '  ✔ ' : '  ✘ ') + msg);
  if (cond) passes++; else failures++;
}

(async () => {
  const context = await chromium.launchPersistentContext(USER_DATA, {
    executablePath: '/usr/bin/chromium',
    headless: true,
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox'],
  });

  // Serve fixtures at the real hostnames so the manifest "matches" apply.
  const routes = {
    'https://x.com/feed': 'x.html',
    'https://www.linkedin.com/feed': 'linkedin.html',              // classic markup
    'https://www.linkedin.com/feed/foryou/': 'linkedin-2026.html', // live markup seen 2026-11-13
    'https://www.tiktok.com/feed': 'tiktok.html',
    'https://x.com/more': 'x-more.html',                             // long posts behind "Show more"
    'https://www.instagram.com/': 'instagram.html',
    'https://www.instagram.com/reels/RRR111/': 'instagram-reels.html', // Reels viewer, live markup 2026-11-14
  };
  await context.route('**/*', (route) => {
    const u = route.request().url();
    const f = routes[u];
    if (f) return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(FIX, f), 'utf8') });
    if (u.startsWith('chrome-extension:') || u.startsWith('http://127.0.0.1:8787/')) return route.continue();
    return route.fulfill({ status: 204, body: '' });
  });

  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  console.log('extension id', extId);

  const hiddenCount = (page) => page.evaluate(() => document.querySelectorAll('.antislop-hidden').length);
  const processed = (page) => page.evaluate(() => document.querySelectorAll('[data-antislop-key]').length);
  const placeholders = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.antislop-placeholder')).map(p => p.innerText.replace(/\s+/g, ' ')));
  const total = () => sw.evaluate(() => new Promise(r => chrome.storage.local.get({ totalHidden: 0, bySite: {} }, d => r(d))));
  const setSetting = (patch) => sw.evaluate((p) => new Promise(r => chrome.storage.sync.get(null, s => chrome.storage.sync.set(Object.assign({}, s, p), r))), patch);
  // Badge text for a page: bring it to the front, then ask the worker for the active tab's badge
  // (tab URLs are not visible to the worker without the "tabs" permission, which the extension does not need).
  const badge = async (page) => {
    await page.bringToFront();
    await page.waitForTimeout(100);
    return sw.evaluate(async () => {
      const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return t ? chrome.action.getBadgeText({ tabId: t.id }) : null;
    });
  };
  // Expected heuristic hides for a page: the first text box of each post, scored >= t.
  const expectHidden = (page, postSel, textSel, t) => page.evaluate(([p, s]) =>
    Array.from(document.querySelectorAll(p)).map(post => { const b = post.querySelector(s); return b ? b.innerText : ''; }), [postSel, textSel])
    .then(texts => texts.filter(x => S.score(x).points >= t).length);

  // =============== X ===============
  console.log('\nX (fixture, 5 tweets, one late-loaded)');
  const x = await context.newPage();
  await x.goto('https://x.com/feed');
  await x.waitForTimeout(900);
  let n = await hiddenCount(x);
  check(await processed(x) === 5, `all 5 tweets scanned (got ${await processed(x)})`);
  check(n === 3, `3 hidden at threshold 3 (got ${n}): slop thread, "Made with AI" label, late-loaded corporate slop`);
  const ph = await placeholders(x);
  check(ph.some(t => /labelled AI/.test(t)), 'label placeholder present');
  check(ph.some(t => /reads like AI slop/.test(t)), 'heuristic placeholder present');
  check(await x.evaluate(() => { const a = Array.from(document.querySelectorAll('article')).find(a => a.innerText.includes('Asahi kernel')); return a && getComputedStyle(a).display !== 'none'; }), 'human tweet still visible');
  await x.waitForTimeout(200);
  check(await badge(x) === '3', `toolbar badge shows 3 (got ${await badge(x)})`);
  // Reveal the first hidden post and remember its score as the page renders it.
  const shownText = await x.evaluate(() => document.querySelector('.antislop-hidden [data-testid="tweetText"]').innerText);
  const shownScore = S.score(shownText).points;
  await x.click('.antislop-placeholder .antislop-show');
  await x.waitForTimeout(200);
  n = await hiddenCount(x);
  check(n === 2, `Show restores one post, hidden now ${n}`);
  check(await badge(x) === '2', `badge follows: 2 (got ${await badge(x)})`);
  let tot = await total();
  check(tot.totalHidden === 3, `all-time total counts first-time hides only: 3 (got ${tot.totalHidden})`);

  // =============== LinkedIn classic ===============
  console.log('\nLinkedIn classic markup (3 posts)');
  const li = await context.newPage();
  await li.goto('https://www.linkedin.com/feed');
  await li.waitForTimeout(600);
  n = await hiddenCount(li);
  check(n === 1, `1 of 3 hidden (got ${n})`);
  check(await processed(li) === 3, `nested wrappers counted once (processed ${await processed(li)})`);

  // =============== LinkedIn 2026 ===============
  console.log('\nLinkedIn 2026 server-driven markup (3 posts, one with a slop comment)');
  const li2 = await context.newPage();
  await li2.goto('https://www.linkedin.com/feed/foryou/');
  await li2.waitForTimeout(600);
  check(await processed(li2) === 3, `3 posts recognised via componentkey (got ${await processed(li2)})`);
  n = await hiddenCount(li2);
  check(n === 1, `only the broetry post hidden (got ${n}); the slop COMMENT on the council post must not hide it`);
  check(await badge(li2) === '1', `badge shows 1 (got ${await badge(li2)})`);

  // =============== TikTok ===============
  console.log('\nTikTok (3 videos)');
  const tt = await context.newPage();
  await tt.goto('https://www.tiktok.com/feed');
  await tt.waitForTimeout(600);
  n = await hiddenCount(tt);
  check(n === 2, `2 of 3 hidden (got ${n}): labelled + slop caption`);
  tot = await total();
  check(tot.totalHidden === 7, `all-time total across tabs so far: 7 (got ${tot.totalHidden})`);
  check(tot.bySite.x === 3 && tot.bySite.linkedin === 2 && tot.bySite.tiktok === 2, `per-site totals x=3 linkedin=2 tiktok=2 (got ${JSON.stringify(tot.bySite)})`);

  // =============== Instagram ===============
  console.log('\nInstagram (4 posts: human + slop comment, "AI info" label, slop reel caption, long caption behind "more")');
  const ig = await context.newPage();
  await ig.goto('https://www.instagram.com/');
  await ig.waitForTimeout(1200);
  const igs = await ig.evaluate(() => Array.from(document.querySelectorAll('article')).map(a => ({
    id: a.querySelector('a[href*="/p/"], a[href*="/reel/"]').getAttribute('href'),
    hidden: a.classList.contains('antislop-hidden'),
    why: a.querySelector('.antislop-placeholder')?.innerText.replace(/\s+/g, ' ').slice(0, 60) || '',
    expanded: !!a.dataset.expanded,
  })));
  const igBy = Object.fromEntries(igs.map(p => [p.id, p]));
  check(await processed(ig) === 4, `4 posts recognised (got ${await processed(ig)})`);
  check(!igBy['/p/AAA111/'].hidden, 'human caption stays visible even though a COMMENT under it is slop');
  check(igBy['/p/BBB222/'].hidden && /labelled/.test(igBy['/p/BBB222/'].why), `Meta "AI info" label hides the post (${igBy['/p/BBB222/'].why})`);
  check(igBy['/reel/CCC333/'].hidden && /slop/.test(igBy['/reel/CCC333/'].why), 'slop reel caption hidden');
  check(igBy['/p/DDD444/'].expanded && igBy['/p/DDD444/'].hidden, 'borderline long caption: text "more" button pressed, full text hidden');
  check(await badge(ig) === '3', `badge shows 3 (got ${await badge(ig)})`);

  console.log('\nInstagram Reels (4 reels, no <article>: human caption, slop caption, "AI info" label, no caption)');
  const REEL = 'main div[aria-busy] > div:has(video)';
  const igr = await context.newPage();
  await igr.goto('https://www.instagram.com/reels/RRR111/');
  await igr.waitForTimeout(1200);
  const reels = await igr.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map(r => ({
    id: r.querySelector('a[href*="/reel/"]').getAttribute('href'),
    key: r.dataset.antislopKey || '',
    hidden: r.classList.contains('antislop-hidden'),
    why: r.querySelector('.antislop-placeholder')?.innerText.replace(/\s+/g, ' ').slice(0, 60) || '',
  })), REEL);
  const rBy = Object.fromEntries(reels.map(p => [p.id, p]));
  check(await processed(igr) === 4, `4 reels recognised without <article> (got ${await processed(igr)})`);
  check(reels.every(r => r.key.startsWith('/reel/')), 'each reel keyed by its own /reel/ link');
  check(!rBy['/reel/RRR111/'].hidden, 'human reel caption stays visible');
  check(rBy['/reel/RRR222/'].hidden && /slop/.test(rBy['/reel/RRR222/'].why), `slop reel caption hidden (${rBy['/reel/RRR222/'].why})`);
  check(rBy['/reel/RRR333/'].hidden && /labelled/.test(rBy['/reel/RRR333/'].why), `"AI info" label hides the reel (${rBy['/reel/RRR333/'].why})`);
  check(!rBy['/reel/RRR444/'].hidden, 'reel with no caption stays visible');
  check(await badge(igr) === '2', `badge shows 2 (got ${await badge(igr)})`);

  // =============== Threshold sweep ===============
  console.log('\nThreshold sweep 1..10: hidden on each page must equal label hits + texts scoring >= t');
  const pages = [
    { name: 'x', page: x, post: 'article[data-testid="tweet"]', sel: '[data-testid="tweetText"]', labels: 1, shownScore },  // one post was revealed via Show
    { name: 'linkedin', page: li, post: 'div.feed-shared-update-v2', sel: '.update-components-text', labels: 0 },
    { name: 'linkedin-2026', page: li2, post: '[componentkey^="update-card-focus"]', sel: '[data-testid="expandable-text-box"]', labels: 0 },
    { name: 'tiktok', page: tt, post: '[data-e2e="recommend-list-item-container"]', sel: '[data-e2e="video-desc"]', labels: 1 },
    { name: 'instagram', page: ig, post: 'article', sel: 'span._aacu[dir="auto"]', labels: 1 },
    { name: 'ig-reels', page: igr, post: 'main div[aria-busy] > div:has(video)', sel: 'span.xuxw1ft', labels: 1 },
  ];
  const totalBefore = (await total()).totalHidden;
  const hiddenAtStart = {};
  for (const p of pages) hiddenAtStart[p.name] = await hiddenCount(p.page);
  let firstTimeHides = 0;
  for (let t = 1; t <= 10; t++) {
    await setSetting({ threshold: t });
    await tt.waitForTimeout(350);
    let line = `t=${t}:`, ok = true;
    for (const p of pages) {
      const got = await hiddenCount(p.page);
      let exp = await expectHidden(p.page, p.post, p.sel, t) + p.labels;
      if (p.shownScore && t <= p.shownScore) exp -= 1;
      line += `  ${p.name} ${got}/${exp}`;
      if (got !== exp) ok = false;
      // Lowering to 1 hides low-scoring posts for the first time; those (and only those) may join the all-time total.
      if (t === 1) firstTimeHides += Math.max(0, got - hiddenAtStart[p.name]);
    }
    check(ok, line);
  }
  const totalAfter = (await total()).totalHidden;
  check(totalAfter === totalBefore + firstTimeHides, `all-time total grew only by the ${firstTimeHides} posts first hidden at threshold 1 (${totalBefore} → ${totalAfter})`);
  check(await badge(tt) === '1', `badge on TikTok at threshold 10 shows just the labelled video (got ${await badge(tt)})`);

  // =============== Modes and switches ===============
  console.log('\nModes and switches');
  await setSetting({ threshold: 3, mode: 'remove' });
  await tt.waitForTimeout(400);
  check(await tt.evaluate(() => Array.from(document.querySelectorAll('.antislop-hidden')).every(e => getComputedStyle(e).display === 'none')), 'remove mode hides the whole post with no placeholder');
  await setSetting({ labels: false });
  await tt.waitForTimeout(400);
  n = await hiddenCount(tt);
  check(n === 1, `labels off: only the slop caption stays hidden on TikTok (got ${n})`);
  await setSetting({ labels: true, signals: { not_x_but_y: false, em_dash: false, profound: false, closers: false } });
  await tt.waitForTimeout(400);
  n = await hiddenCount(tt);
  check(n === 1, `switching off four signals drops the TikTok caption under the threshold (got ${n}, only the label remains)`);
  await setSetting({ signals: {}, sites: { x: true, linkedin: true, tiktok: false } });
  await tt.waitForTimeout(400);
  check(await hiddenCount(tt) === 0 && await hiddenCount(x) > 0, 'per-site switch: TikTok off, X still filtering');
  await setSetting({ sites: { x: true, linkedin: true, tiktok: true, instagram: true }, enabled: false });
  await tt.waitForTimeout(400);
  check(await hiddenCount(tt) === 0 && await hiddenCount(x) === 0 && await hiddenCount(li2) === 0, 'master switch off restores everything');
  check(await badge(x) === '', `badge clears when nothing is hidden (got "${await badge(x)}")`);
  await setSetting({ enabled: true, mode: 'collapse' });
  await tt.waitForTimeout(400);
  check(await hiddenCount(tt) === 2, 'master switch back on re-hides');
  check((await total()).totalHidden === totalAfter, 'toggling on/off does not inflate the all-time total');

  // =============== Peek behind "Show more" ===============
  console.log('\nPeek behind "Show more" (3 long X posts cut at 280 chars)');
  const xm = await context.newPage();
  await xm.goto('https://x.com/more');
  await xm.waitForTimeout(1500);
  const st = await xm.evaluate(() => Array.from(document.querySelectorAll('article')).map(a => ({
    id: a.querySelector('a[href*="/status/"]').getAttribute('href').slice(-4),
    expanded: !!a.dataset.expanded,
    button: !!a.querySelector('[data-testid="tweet-text-show-more-link"]'),
    hidden: a.closest('[data-testid="cellInnerDiv"]').classList.contains('antislop-hidden'),
  })));
  const by = Object.fromEntries(st.map(s => [s.id, s]));
  check(by['2001'].expanded && by['2001'].hidden, `borderline preview (1 pt) was expanded and the full slop text (7 pts) hidden` + (by['2001'].hidden ? '' : ' :: ' + JSON.stringify(await xm.evaluate(() => { const a = document.querySelector('a[href*="2001"]').closest('article'); return { ds: Object.assign({}, a.dataset), len: a.querySelector('[data-testid="tweetText"]').innerText.length }; }))));
  check(by['2002'].expanded && !by['2002'].hidden, `borderline human preview was expanded, full text (1 pt) stays visible`);
  check(!by['2003'].expanded && by['2003'].button, `0-pt preview is left alone, "Show more" untouched`);
  await setSetting({ peek: false });
  await xm.reload();
  await xm.waitForTimeout(800);
  const st2 = await xm.evaluate(() => ({ expanded: document.querySelectorAll('article[data-expanded]').length, hidden: document.querySelectorAll('.antislop-hidden').length }));
  check(st2.expanded === 0 && st2.hidden === 0, `peek off: nothing expanded, nothing hidden (expanded ${st2.expanded}, hidden ${st2.hidden})`);
  await setSetting({ peek: true });
  await xm.waitForTimeout(600);
  // +2: the peeked post was hidden once on first load and once more after the reload when peek was switched back on.
  // A reload is a fresh page load, so re-hiding there counts again (same as the user refreshing a feed).
  const totalPeek = (await total()).totalHidden;
  check(totalPeek === totalAfter + 2, `the peeked slop post added one per page load to the all-time total (${totalAfter} → ${totalPeek})`);

  // =============== Keywords ===============
  console.log('\nKeywords');
  await setSetting({ keywords: ['asahi'] });
  await x.waitForTimeout(500);
  const kw = await x.evaluate(() => { const a = Array.from(document.querySelectorAll('article')).find(a => a.innerText.includes('Asahi kernel')); const c = a.closest('[data-testid="cellInnerDiv"]'); return { hidden: c.classList.contains('antislop-hidden'), text: c.querySelector('.antislop-placeholder')?.innerText.replace(/\s+/g, ' ') }; });
  check(kw.hidden && /keyword/i.test(kw.text || ''), `keyword "asahi" hides the matching human tweet with a keyword placeholder (${kw.text})`);
  await setSetting({ keywords: [] });
  await x.waitForTimeout(500);
  check(!(await x.evaluate(() => Array.from(document.querySelectorAll('article')).find(a => a.innerText.includes('Asahi kernel')).closest('[data-testid="cellInnerDiv"]').classList.contains('antislop-hidden'))), 'removing the keyword restores the tweet');

  // =============== Scorecard history ===============
  console.log('\nScorecard history');
  const hist = await sw.evaluate(() => new Promise(r => chrome.storage.local.get({ events: [], active: {}, totalHidden: 0 }, r)));
  check(hist.events.length === hist.totalHidden, `one event logged per first-time hide (${hist.events.length} events, total ${hist.totalHidden})`);
  check(hist.events.some(e => e.kind === 'label') && hist.events.some(e => e.kind === 'signal') && hist.events.some(e => e.kind === 'keyword'), 'events carry the reason kind (signal, label, keyword all present)');
  check(new Set(hist.events.map(e => e.site)).size === 4, 'events carry the site (4 sites seen)');

  // =============== Popup renders ===============
  console.log('\nPopup');
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 600 });  // the real popup size
  await popup.goto('chrome-extension://' + extId + '/popup.html');
  await popup.waitForTimeout(400);

  // ----- telemetry: first-run notice, tally, opt-out -----
  const local = (keys) => sw.evaluate((k) => new Promise(r => chrome.storage.local.get(k, r)), keys);
  const syncGet = () => sw.evaluate(() => new Promise(r => chrome.storage.sync.get(null, r)));
  check(await popup.locator('#notice').isVisible(), 'first open shows the "Before you start" notice');
  check(/Don't share my counts/.test(await popup.locator('#notice').innerText()), 'notice offers a "Don\'t share my counts" tick box');
  await popup.waitForTimeout(350);
  await popup.screenshot({ path: path.join(__dirname, 'popup-notice.png'), fullPage: true });
  const today = await sw.evaluate(() => dayKey(Date.now()));
  let tl = (await local({ tally: {} })).tally;
  const tallyToday = Object.values(tl[today] || {}).reduce((a, b) => a + b, 0);
  check(tallyToday > 0 && Object.keys(tl[today]).every(k => /^(x|linkedin|tiktok|instagram)\|(signal|label|keyword)$/.test(k)),
    `telemetry tally holds only site|reason counts for today (${JSON.stringify(tl[today])})`);
  await popup.locator('#noticeOptOut').check();
  await popup.locator('#noticeOk').click();
  await popup.waitForTimeout(400);
  check(!(await popup.locator('#notice').isVisible()), 'Continue closes the notice');
  check((await syncGet()).telemetry === false && !(await popup.locator('#telemetry').isChecked()), 'ticking "Don\'t share" turns sharing off and the Behaviour switch follows');
  check(!('tally' in (await local(['tally']))), 'opting out deletes the unsent tally');
  await popup.reload(); await popup.waitForTimeout(400);
  check(!(await popup.locator('#notice').isVisible()), 'notice is shown only once');
  await popup.locator('#whatSent').click(); await popup.waitForTimeout(350);
  check(await popup.locator('#noticeOptOut').isChecked(), '"What\'s sent?" reopens the notice with the current choice ticked');
  await popup.locator('#noticeOptOut').uncheck(); await popup.locator('#noticeOk').click(); await popup.waitForTimeout(350);
  check((await syncGet()).telemetry === true, 'unticking turns sharing back on');

  // ----- telemetry: sending to a real Worker (needs `wrangler dev` on 127.0.0.1:8787; skipped otherwise) -----
  const workerUp = await fetch('http://127.0.0.1:8787/').then(r => r.ok, () => false);
  if (workerUp) {
    const statsNow = () => fetch('http://127.0.0.1:8787/v1/stats?days=30', { headers: { Authorization: 'Bearer local-test-token' } }).then(r => r.json());
    const before = (await statsNow()).totals.hidden;
    const yday = await sw.evaluate(() => dayKey(Date.now() - 86400000));
    await sw.evaluate(([y, t]) => new Promise(r => chrome.storage.local.set({ tally: { [y]: { 'x|signal': 4, 'instagram|label': 1 }, [t]: { 'x|signal': 2 } } }, r)), [yday, today]);
    await sw.evaluate(async () => { self.ANTISLOP_TEST_URL = 'http://127.0.0.1:8787/v1/collect'; await flush(); self.ANTISLOP_TEST_URL = ''; });
    const after = (await statsNow()).totals.hidden;
    tl = (await local({ tally: {} })).tally;
    check(after - before === 5, `finished day sent to the Worker: +5 hidden in its stats (got +${after - before})`);
    check(!tl[yday] && tl[today] && tl[today]['x|signal'] === 2, 'sent day is forgotten; today is kept until it is over');
  } else {
    console.log('  - skipped Worker send test: run `wrangler dev` in worker/ to include it');
  }
  check(await popup.locator('.sig').count() === S.SIGNALS.length, `popup lists all ${S.SIGNALS.length} signals`);
  check(await popup.locator('#resetTotal').count() === 0, 'no all-time reset button');
  await popup.locator('details.group', { hasText: 'Keywords' }).locator('summary').click();
  await popup.fill('#kwInput', 'giveaway');
  await popup.locator('#kwForm .add').click();
  await popup.waitForTimeout(300);
  const kws = await sw.evaluate(() => new Promise(r => chrome.storage.sync.get({ keywords: [] }, d => r(d.keywords))));
  check(kws.includes('giveaway'), `keyword added from the popup is saved (${JSON.stringify(kws)})`);
  await popup.locator('.kw button').first().click();
  await popup.waitForTimeout(400);
  check((await sw.evaluate(() => new Promise(r => chrome.storage.sync.get({ keywords: [] }, d => r(d.keywords))))).length === 0, 'keyword chip × removes it');
  await popup.screenshot({ path: path.join(__dirname, 'popup-filter.png'), fullPage: true });
  await popup.locator('.seg[data-view="score"]').click();
  await popup.waitForTimeout(900);
  const sc = await popup.evaluate(() => ({ total: document.getElementById('scTotal').textContent, bars: document.querySelectorAll('#scSites .bar').length, days: document.querySelectorAll('#scDays .day').length, visible: !document.getElementById('view-score').hidden }));
  check(sc.visible && sc.total === String(hist.events.length + 0) || sc.total === String(hist.events.length), `scorecard "Today" shows ${hist.events.length} redacted (got ${sc.total})`);
  check(sc.bars === 4 && sc.days === 7, 'scorecard has 4 site bars and 7 day columns');
  await popup.locator('#rangeSeg .seg[data-range="all"]').click();
  await popup.waitForTimeout(700);
  await popup.screenshot({ path: path.join(__dirname, 'popup-score.png'), fullPage: true });
  const totalNow = (await total()).totalHidden;
  check(totalNow === totalPeek + 1, `the keyword hide added one more to the all-time total (${totalPeek} → ${totalNow})`);
  check((await popup.locator('#hiddenTotal').innerText()) === String(totalNow), `popup all-time counter shows ${totalNow}`);

  // ----- review reminder -----
  await popup.locator('.seg[data-view="filter"]').click();
  check(!(await popup.locator('#review').isVisible()), 'no review card for an unpacked install or a new user');
  const realTotal = (await total()).totalHidden;
  await sw.evaluate((t) => new Promise(r => chrome.storage.local.set({ reviewTest: true, installedAt: Date.now() - 8 * 86400000, totalHidden: Math.max(t, 60), review: {} }, r)), realTotal);
  await popup.reload(); await popup.waitForTimeout(500);
  check(await popup.locator('#review').isVisible(), 'review card appears after a week and 50+ hidden posts');
  await popup.screenshot({ path: path.join(__dirname, 'popup-review.png'), fullPage: true });
  await popup.locator('#reviewLater').click(); await popup.waitForTimeout(300);
  let rv = (await local({ review: {} })).review;
  check(rv.snoozed && rv.askAfter > Date.now() + 29 * 86400000, '"Not now" snoozes it for 30 days');
  await popup.reload(); await popup.waitForTimeout(400);
  check(!(await popup.locator('#review').isVisible()), 'snoozed card stays hidden');
  await sw.evaluate(() => new Promise(r => chrome.storage.local.get({ review: {} }, d => chrome.storage.local.set({ review: Object.assign(d.review, { askAfter: 0 }) }, r))));
  await popup.reload(); await popup.waitForTimeout(400);
  await popup.locator('#reviewLater').click(); await popup.waitForTimeout(300);
  check((await local({ review: {} })).review.state === 'never', 'second "Not now" means never ask again');
  await sw.evaluate((t) => new Promise(r => chrome.storage.local.set({ reviewTest: false, totalHidden: t }, r)), realTotal);
  await x.screenshot({ path: path.join(__dirname, 'x-feed.png'), fullPage: true });

  await context.close();
  fs.rmSync(USER_DATA, { recursive: true, force: true });
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
