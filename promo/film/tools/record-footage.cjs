// Records real footage of the Anti-Slop extension for the promo film.
//   promo/assets/feed-fold.mp4    the demo feed with the extension off, then switched on: slop folds away
//   promo/assets/feed-scroll.mp4  a slow scroll down the cleaned feed
//   promo/assets/x-fold.mp4       an X-style timeline, off then on: slop folds
//   promo/assets/feed-show.mp4    a folded post, then "Show" is clicked and the post comes back
//   promo/assets/popup-slider.mp4 the popup (760x1080): the live count, then the strictness slider dragged 3 -> 8
// How: Playwright drives system Chromium with the unpacked extension loaded; frames come from the
// DevTools screencast at 1920x1080 (960x540 CSS px at 2x), then ffmpeg rebuilds them as 30 fps video
// using each frame's real timestamp. Telemetry is switched off and the Worker address is blocked.
// Run: node promo/film/tools/record-footage.cjs
'use strict';
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const PW_ROOT = path.join(process.env.HOME, '.local/share/mise/installs/npm-playwright-cli/latest/node_modules/.mise');
const pwDir = fs.readdirSync(PW_ROOT).find(d => /^playwright@/.test(d));
const { chromium } = require(path.join(PW_ROOT, pwDir, 'node_modules', 'playwright'));

const ROOT = path.resolve(__dirname, '..', '..', '..');
const EXT = path.join(ROOT, 'extension');
const OUT = path.join(ROOT, 'promo', 'film', 'assets');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Screencast recorder: keeps every frame with its timestamp, then encodes a constant 30 fps MP4.
async function recorder(page, name, size = '1920:1080') {
  const cdp = await page.context().newCDPSession(page);
  const dir = fs.mkdtempSync('/tmp/antislop-frames-');
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(dir, String(frames.length).padStart(5, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  const t0 = Date.now() / 1000;   // wall clock; screencast timestamps are epoch seconds too
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1920, maxHeight: 1120, everyNthFrame: 1 });
  return async function stop() {
    await cdp.send('Page.stopScreencast');
    // Hold each frame until the next one arrived; the last frame holds 0.5 s.
    // The screencast only sends a frame when the screen changes, so still stretches have no frames:
    // the first frame covers from the start of recording, the last until it stopped.
    const tEnd = Date.now() / 1000;
    const list = frames.map((f, i) => {
      const from = i === 0 ? Math.min(t0, f.t) : f.t, to = frames[i + 1] ? frames[i + 1].t : tEnd;
      return `file '${f.file}'\nduration ${(to - from).toFixed(4)}`;
    }).join('\n');
    const listFile = path.join(dir, 'list.txt');
    fs.writeFileSync(listFile, list + `\nfile '${frames[frames.length - 1].file}'\n`);
    const out = path.join(OUT, name);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
      '-vf', `scale=${size}:flags=lanczos,fps=30,format=yuv420p`, '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-movflags', '+faststart', out]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(name, frames.length, 'frames');
  };
}

(async () => {
  const userData = fs.mkdtempSync('/tmp/antislop-promo-');
  const ctx = await chromium.launchPersistentContext(userData, {
    executablePath: '/usr/bin/chromium', headless: true, deviceScaleFactor: 2, viewport: { width: 960, height: 540 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox'],
  });
  await ctx.route('**/*', (route) => {
    const u = route.request().url();
    if (u === 'https://www.linkedin.com/feed/') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(ROOT, 'store', 'demo-feed.html'), 'utf8') });
    if (u === 'https://x.com/home') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(ROOT, 'store', 'demo-x.html'), 'utf8') });
    if (u.startsWith('chrome-extension:')) return route.continue();
    return route.fulfill({ status: 204, body: '' });   // includes the telemetry Worker
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  // Start switched off with sharing off, so the first frames show the raw feed.
  await sw.evaluate(() => new Promise(r => chrome.storage.sync.set({ enabled: false, telemetry: false, threshold: 3 }, () => chrome.storage.local.set({ noticeSeen: true }, r))));

  const feed = await ctx.newPage();
  await feed.goto('https://www.linkedin.com/feed/');
  // Fill the frame with the feed column: zoom so the 600 px column is ~1500 px of the 1920 frame.
  await feed.addStyleTag({ content: 'html{zoom:1.25} body{background:#f3f2ef} .col{margin-top:18px}' });
  await sleep(1200);

  // ---- clip 1: off, then on: the slop folds away in place ----
  let stop = await recorder(feed, 'feed-fold.mp4');
  await sleep(3000);
  await sw.evaluate(() => new Promise(r => chrome.storage.sync.set({ enabled: true }, r)));
  await sleep(5000);
  await stop();
  const hidden = await feed.evaluate(() => document.querySelectorAll('.antislop-hidden').length);
  if (hidden !== 3) throw new Error('expected 3 hidden posts, got ' + hidden);

  // ---- clip: click "Show" on the first folded post, and it comes back ----
  stop = await recorder(feed, 'feed-show.mp4');
  await sleep(2500);
  const box = await feed.locator('.antislop-show').first().boundingBox();
  console.log('show button box (CSS px at zoom):', JSON.stringify(box));
  await feed.locator('.antislop-show').first().click();
  await sleep(3500);
  await stop();
  // Reload so all three are folded again for the scroll clip.
  await feed.reload(); await feed.addStyleTag({ content: 'html{zoom:1.25} body{background:#f3f2ef} .col{margin-top:18px}' }); await sleep(1500);

  // ---- clip 2: slow scroll down the cleaned feed ----
  stop = await recorder(feed, 'feed-scroll.mp4');
  await sleep(600);
  const max = await feed.evaluate(() => document.scrollingElement.scrollHeight - innerHeight);
  for (let i = 0; i <= 120; i++) {   // ~4 s, eased
    const p = i / 120, e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    await feed.evaluate((y) => scrollTo(0, y), Math.round(max * e));
    await sleep(33);
  }
  await sleep(800);
  await stop();

  // ---- clip: the same on an X-style timeline, off then on ----
  await sw.evaluate(() => new Promise(r => chrome.storage.sync.set({ enabled: false }, r)));
  const xp = await ctx.newPage();
  await xp.goto('https://x.com/home');
  await xp.addStyleTag({ content: 'html{zoom:1.25}' });
  await sleep(1200);
  stop = await recorder(xp, 'x-fold.mp4');
  await sleep(3000);
  await sw.evaluate(() => new Promise(r => chrome.storage.sync.set({ enabled: true }, r)));
  await sleep(4500);
  await stop();
  const xHidden = await xp.evaluate(() => document.querySelectorAll('.antislop-hidden').length);
  if (xHidden !== 3) throw new Error('expected 3 hidden X posts, got ' + xHidden);
  await xp.close();

  // ---- popup still with the feed's live stats ----
  const popup = await ctx.newPage();
  await popup.setViewportSize({ width: 380, height: 560 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await sleep(600);
  await popup.evaluate(() => new Promise((resolve) => {
    for (let i = 1; i < 500; i++) clearInterval(i);
    chrome.tabs.query({}, (tabs) => {
      let left = tabs.length;
      for (const t of tabs) chrome.tabs.sendMessage(t.id, { type: 'antislop:stats' }, (res) => {
        void chrome.runtime.lastError; if (res) renderStats(res); if (--left === 0) resolve();
      });
    });
  }));
  await popup.setViewportSize({ width: 380, height: 540 });
  await sleep(500);
  stop = await recorder(popup, 'popup-slider.mp4', '760:1080');
  await sleep(2000);
  const sl = await popup.locator('#threshold').boundingBox();
  console.log('slider box:', JSON.stringify(sl));
  const at = (v) => sl.x + 8 + (sl.width - 16) * (v - 1) / 9;
  await popup.mouse.move(at(3), sl.y + sl.height / 2); await popup.mouse.down();
  for (let i = 0; i <= 40; i++) { await popup.mouse.move(at(3 + 5 * i / 40), sl.y + sl.height / 2); await sleep(30); }
  await popup.mouse.up();
  await sleep(2500);
  await stop();
  await ctx.close();
  fs.rmSync(userData, { recursive: true, force: true });
})().catch(e => { console.error(e); process.exit(1); });
