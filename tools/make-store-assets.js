// Builds the Chrome Web Store assets from the real extension, with no extra dependencies:
//   the icon in every size and place (drawn in tools/make-icons.js)
//   store/assets/screenshot-{1..5}.png  1280x800
//   store/assets/promo-small.png 440x280, promo-marquee.png 1400x560
// Run: node tools/make-store-assets.js
'use strict';
const path = require('path');
const fs = require('fs');

const { iconSvg, writeIcons, loadChromium } = require('./make-icons.js');   // the one icon drawing
const chromium = loadChromium();

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'store', 'assets');
fs.mkdirSync(OUT, { recursive: true });

const b64 = (file) => 'data:image/png;base64,' + fs.readFileSync(file).toString('base64');

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
function slide({ title, sub, imgs, bg = 'linear-gradient(140deg,#fff5f4 0%,#f2f2f7 55%,#eef3ff 100%)' }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:1280px;height:800px;overflow:hidden;background:${bg};font-family:${FONT};color:#1c1c1e;display:flex;align-items:center}
    .txt{width:400px;padding:0 0 0 72px;flex:none}
    .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px;margin-bottom:28px}
    h1{font-size:46px;line-height:1.08;letter-spacing:-.02em;margin:0 0 18px}
    p{font-size:20px;line-height:1.45;color:#3a3a3c;margin:0}
    .imgs{flex:1;position:relative;height:800px}
    .imgs img{position:absolute;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08)}
  </style></head><body>
    <div class="txt"><div class="brand">${iconSvg(36, 36)}Anti-Slop</div><h1>${title}</h1><p>${sub}</p></div>
    <div class="imgs">${imgs}</div></body></html>`;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });

  // ---- icons ----
  await writeIcons(browser);   // icon.svg, 16/48/128 PNGs, store and site copies
  await browser.close();

  // ---- real extension: demo feed + popup states ----
  const userData = fs.mkdtempSync('/tmp/antislop-assets-');
  const ctx = await chromium.launchPersistentContext(userData, {
    executablePath: '/usr/bin/chromium', headless: true, deviceScaleFactor: 1,
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox'],
  });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u === 'https://www.linkedin.com/feed/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(ROOT, 'store', 'demo-feed.html'), 'utf8') });
    if (u.startsWith('chrome-extension:')) return route.continue();
    return route.fulfill({ status: 204, body: '' });
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  // Mark the notice as seen for the feed shots, and give the scorecard a believable week of history.
  await sw.evaluate(() => new Promise(r => {
    const now = Date.now(), events = [], active = {};
    const sites = ['linkedin', 'linkedin', 'linkedin', 'x', 'x', 'instagram', 'tiktok'];
    for (let d = 6; d >= 0; d--) {
      const n = [9, 14, 6, 17, 11, 21, 12][6 - d];
      for (let i = 0; i < n; i++) events.push({ t: now - d * 86400000 - i * 600000, site: sites[i % sites.length], kind: i % 6 === 0 ? 'label' : i % 9 === 0 ? 'keyword' : 'signal', points: 4 });
      const day = dayKey(now - d * 86400000);
      for (const s of ['linkedin', 'x', 'instagram', 'tiktok']) { active[s] = active[s] || {}; active[s][day] = { linkedin: 900, x: 600, instagram: 420, tiktok: 300 }[s]; }
    }
    chrome.storage.local.set({ events, active, totalHidden: events.length, noticeSeen: true }, r);
  }));

  const feed = await ctx.newPage();
  await feed.setViewportSize({ width: 680, height: 800 });
  await feed.goto('https://www.linkedin.com/feed/');
  await feed.waitForTimeout(1500);
  const hidden = await feed.evaluate(() => document.querySelectorAll('.antislop-hidden').length);
  if (hidden !== 3) throw new Error('demo feed should have 3 hidden posts, got ' + hidden);
  const feedPng = path.join(OUT, '_feed.png');
  await feed.screenshot({ path: feedPng, clip: { x: 40, y: 0, width: 600, height: 800 } });

  // The popup asks the active tab for page stats; keep the feed tab in front by opening the popup in its own window size.
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 380, height: 600 });
  const shots = {};
  async function popupShot(name, prep) {
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForTimeout(500);
    if (prep) await prep();
    await popup.waitForTimeout(700);
    shots[name] = path.join(OUT, `_popup-${name}.png`);
    await popup.screenshot({ path: shots[name] });
  }
  // In a real popup the stats come from the active tab; here the popup is its own tab, so ask the demo feed tab directly.
  const feedStats = async () => {
    await popup.evaluate(() => new Promise((resolve) => {
      for (let i = 1; i < 500; i++) clearInterval(i);   // stop the popup polling its own (non-feed) tab
      // No "tabs" permission, so tabs cannot be filtered by URL: ask every tab, the feed tab is the one that answers.
      chrome.tabs.query({}, (tabs) => {
        let left = tabs.length;
        for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'antislop:stats' }, (res) => {
          void chrome.runtime.lastError;
          if (res) renderStats(res);
          if (--left === 0) resolve();
        });
      });
    }));
  };
  await popupShot('filter', feedStats);
  await popupShot('signals', async () => {
    await popup.evaluate(() => { document.querySelector('details.group[open]')?.removeAttribute('open'); });
    await popup.locator('details.group', { hasText: 'Signals' }).locator('summary').click();
  });
  await popupShot('score', async () => { await popup.locator('.seg[data-view="score"]').click(); await popup.locator('#rangeSeg .seg[data-range="7"]').click(); });
  await sw.evaluate(() => new Promise(r => chrome.storage.local.set({ noticeSeen: false }, r)));
  await popup.evaluate(() => localStorage.setItem('antislop.view', 'filter'));
  await popupShot('notice');
  await ctx.close();

  // ---- compose 1280x800 screenshots and promo tiles ----
  const page = await (await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true })).newPage();
  async function render(file, html, w = 1280, h = 800) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(html);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, file) });
  }
  const img = (f, css) => `<img src="${b64(f)}" style="${css}">`;
  await render('screenshot-1.png', slide({ title: 'Hide AI slop from your feed', sub: 'Posts that read like AI writing, or carry an AI label, fold away. Real posts stay put.',
    imgs: img(feedPng, 'left:0;top:40px;width:440px') + img(shots.filter, 'left:400px;top:130px;width:380px') }));
  await render('screenshot-2.png', slide({ title: 'See why each post was hidden', sub: 'Every hidden post says what gave it away. One click on Show brings it back.',
    imgs: img(feedPng, 'left:40px;top:40px;width:600px;height:auto') }));
  await render('screenshot-3.png', slide({ title: 'You set how strict it is', sub: 'A sensitivity slider, 22 writing signals you can switch on or off, and your own keywords.',
    imgs: img(shots.signals, 'left:150px;top:100px;width:380px') }));
  await render('screenshot-4.png', slide({ title: 'Your slop scorecard', sub: 'How much was hidden today, this week or all time, by site and by reason.',
    imgs: img(shots.score, 'left:150px;top:100px;width:380px') }));
  await render('screenshot-5.png', slide({ title: 'Your posts never leave your device', sub: 'Filtering runs in your browser. The only thing shared is a daily total of hidden posts, and you can turn that off.',
    imgs: img(shots.notice, 'left:150px;top:100px;width:380px') }));

  const promo = (w, h, big) => `<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;width:${w}px;height:${h}px;overflow:hidden;font-family:${FONT};display:flex;align-items:center;justify-content:center;gap:${big ? 48 : 18}px;
      background:linear-gradient(135deg,#ff6b5e 0%,#e5302a 100%);color:#fff}
    .name{font-size:${big ? 88 : 40}px;font-weight:800;letter-spacing:-.03em;line-height:1}
    .tag{font-size:${big ? 34 : 17}px;opacity:.92;margin-top:${big ? 14 : 8}px;font-weight:500}
  </style></head><body>${iconSvg(big ? 220 : 96, big ? 220 : 96, { plain: true })}<div><div class="name">Anti-Slop</div><div class="tag">Hide AI slop from your feed</div></div></body></html>`;
  await render('promo-small.png', promo(440, 280, false), 440, 280);
  await render('promo-marquee.png', promo(1400, 560, true), 1400, 560);
  await page.context().browser().close();
  for (const f of fs.readdirSync(OUT)) if (f.startsWith('_')) fs.unlinkSync(path.join(OUT, f));
  console.log('assets written to', OUT, fs.readdirSync(OUT));
})().catch((e) => { console.error(e); process.exit(1); });
