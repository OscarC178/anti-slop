// The Anti-Slop icon, drawn once here and used everywhere:
//   extension/icons/icon.svg          the popup header loads this file directly
//   extension/icons/{16,48,128}.png   toolbar and extensions page (128 has the 16 px clear margin Google asks for)
//   store/assets/icon-128.png         the Chrome Web Store listing icon (a copy of icons/128.png)
//   docs/img/icon.png                 the Pages site
// Because every copy comes from this one drawing, the store icon and the installed icon cannot drift apart.
// Run on its own:  node tools/make-icons.js     (tools/make-store-assets.js also calls it)
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');

// Playwright ships inside the playwright-cli mise install; reuse it (same as tests/e2e.js).
function loadChromium() {
  const PW_ROOT = path.join(process.env.HOME, '.local/share/mise/installs/npm-playwright-cli/latest/node_modules/.mise');
  const pwDir = fs.readdirSync(PW_ROOT).find(d => /^playwright@/.test(d));
  return require(path.join(PW_ROOT, pwDir, 'node_modules', 'playwright')).chromium;
}

const f2 = (n) => +n.toFixed(2);

// Superellipse outline ("squircle"): the continuous-corner shape of an Apple app icon.
// A plain rounded rectangle has a visible kink where the straight edge meets the arc; this does not.
function squircle(x, y, s, n = 5) {
  const a = s / 2, cx = x + a, cy = y + a, pts = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * 2 * Math.PI, c = Math.cos(t), sn = Math.sin(t);
    pts.push(f2(cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n)) + ' ' + f2(cy + a * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / n)));
  }
  return 'M' + pts.join('L') + 'Z';
}

// Four-point sparkle with soft, slightly filled-in sides (r = tip distance from the centre).
function sparkle(cx, cy, r) {
  const k = r * 0.11;
  return `M${f2(cx)} ${f2(cy - r)}Q${f2(cx + k)} ${f2(cy - k)} ${f2(cx + r)} ${f2(cy)}Q${f2(cx + k)} ${f2(cy + k)} ${f2(cx)} ${f2(cy + r)}` +
         `Q${f2(cx - k)} ${f2(cy + k)} ${f2(cx - r)} ${f2(cy)}Q${f2(cx - k)} ${f2(cy - k)} ${f2(cx)} ${f2(cy - r)}Z`;
}

// The mark, on a 24-unit grid: a filter funnel catching AI sparkles.
// Small sizes (toolbar, 16 px) drop to one centred sparkle so the shape stays readable.
const FUNNEL = 'M3.2 10.4h17.6l-6.9 6.9v4.3l-3.8-1.9v-2.4z';
function mark(small) {
  const stars = small ? sparkle(12, 4.4, 4.6) : sparkle(7.4, 5.1, 4.1) + sparkle(16.3, 3.6, 2.7);
  // bbox centre of the mark on the 24 grid, used to centre it optically in the tile
  const cy = small ? (-0.2 + 22.2) / 2 : (0.9 + 22.2) / 2;
  return { stars, cx: 12, cy };
}

/**
 * size: canvas in px. art: the tile's side in px (smaller than size leaves a clear margin).
 * opts.plain: no gradient or highlight (for placing the mark on a coloured promo background).
 */
function iconSvg(size, art, opts = {}) {
  const pad = (size - art) / 2;
  const small = art < 32;
  const m = mark(small);
  const scale = art * (small ? 0.74 : 0.62) / 24;
  const tx = f2(pad + art / 2 - m.cx * scale), ty = f2(pad + art / 2 - m.cy * scale);
  const tile = squircle(pad, pad, art);
  const uid = 'as' + size + (opts.plain ? 'p' : '');
  const glyph = `<g transform="translate(${tx} ${ty}) scale(${f2(scale)})"${small || opts.plain ? '' : ` filter="url(#${uid}s)"`}>` +
    `<path d="${m.stars}" fill="#fff"/><path d="${FUNNEL}" fill="#fff" stroke="#fff" stroke-width="1.3" stroke-linejoin="round"/></g>`;
  if (opts.plain) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      `<path d="${tile}" fill="rgba(255,255,255,.18)"/>${glyph}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<defs>
<linearGradient id="${uid}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff6a5e"/><stop offset="1" stop-color="#ee2b22"/></linearGradient>
<linearGradient id="${uid}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="${uid}s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="${f2(art * 0.012)}" stdDeviation="${f2(art * 0.018)}" flood-color="#8a0d06" flood-opacity=".28"/></filter>
</defs>
<path d="${tile}" fill="url(#${uid}g)"/>
<path d="${tile}" fill="url(#${uid}h)"/>
${glyph}
</svg>`;
}

// Renders the PNG sizes with the given Playwright browser and writes every copy of the icon.
async function writeIcons(browser) {
  fs.writeFileSync(path.join(EXT, 'icons', 'icon.svg'), iconSvg(128, 128) + '\n');
  const page = await browser.newPage();
  for (const [size, art] of [[16, 16], [48, 48], [128, 96]]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${iconSvg(size, art)}</body></html>`);
    await page.screenshot({ path: path.join(EXT, 'icons', size + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  }
  await page.close();
  const big = path.join(EXT, 'icons', '128.png');
  fs.mkdirSync(path.join(ROOT, 'store', 'assets'), { recursive: true });
  fs.copyFileSync(big, path.join(ROOT, 'store', 'assets', 'icon-128.png'));
  fs.copyFileSync(big, path.join(ROOT, 'docs', 'img', 'icon.png'));
}

module.exports = { iconSvg, writeIcons, loadChromium };

if (require.main === module) {
  (async () => {
    const browser = await loadChromium().launch({ executablePath: '/usr/bin/chromium', headless: true });
    await writeIcons(browser);
    await browser.close();
    console.log('icons written: extension/icons/{icon.svg,16,48,128.png}, store/assets/icon-128.png, docs/img/icon.png');
  })().catch((e) => { console.error(e); process.exit(1); });
}
