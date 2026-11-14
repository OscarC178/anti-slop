// Writes the five footage/end scenes and index.html for the Anti-Slop promo.
const fs = require('fs');
const CUR = (id) => `<svg id="${id}" class="cursor" viewBox="0 0 24 24" width="72" height="72"><path d="M4 2.5v17.2l4.6-4.3 3 6.6 3-1.4-3-6.4 6.3-.4z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const BASE = `#root { position:absolute; inset:0; background:#f3f2ef; overflow:hidden; font-family: Inter, sans-serif; color:#1d1d1f; }
    .cap { position:absolute; font-weight:900; letter-spacing:-0.02em; line-height:1.02; }
    .chip { position:absolute; left:110px; bottom:100px; background:#1d1d1f; color:#fff; border-radius:22px; padding:26px 40px; font-weight:700; font-size:56px; letter-spacing:-0.01em; }
    .cursor { position:absolute; left:0; top:0; }`;
const scene = (id, style, body, script) => `<template>
  <style>
    ${BASE}
    ${style}
  </style>
  <div id="root" data-composition-id="${id}" data-width="1920" data-height="1080">
${body}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
${script}
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;
const W = (f, s) => fs.writeFileSync('compositions/' + f, s);

// ---- fold: real footage, switched on, slop folds (fold at 2.47 s with media-start 0.6) ----
W('fold.html', scene('fold', `
    #fold-frame { position:absolute; left:500px; top:150px; width:1382px; height:778px; border-radius:26px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.12), 0 0 0 2px rgba(0,0,0,.05); }
    #fold-video { position:absolute; left:0; top:0; width:1382px; height:778px; object-fit:cover; }
    #fold-a, #fold-b { left:110px; top:380px; width:360px; font-size:84px; }`, `
    <div id="fold-frame"><video id="fold-video" class="clip" src="assets/feed-fold.mp4" data-start="0" data-duration="8.5" data-media-start="0.6" muted playsinline></video></div>
    <h2 id="fold-a" class="cap clip" data-start="0" data-duration="2.45">Switch it on.</h2>
    <h2 id="fold-b" class="cap clip" data-start="2.45" data-duration="6.05">Slop folds away.</h2>`, `
    tl.fromTo('#fold-frame', { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' }, 0);
    tl.fromTo('#fold-a', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out' }, 0.2);
    tl.fromTo('#fold-b', { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'expo.out' }, 2.45);`));

// ---- xfold: the same on an X-style timeline, mirrored layout (fold at 1.87 s with media-start 1.2) ----
W('xfold.html', scene('xfold', `
    #xf-frame { position:absolute; left:40px; top:150px; width:1382px; height:778px; border-radius:26px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.12), 0 0 0 2px rgba(0,0,0,.05); }
    #xf-video { position:absolute; left:0; top:0; width:1382px; height:778px; object-fit:cover; }
    #xf-a, #xf-b { left:1480px; top:380px; width:380px; font-size:76px; }`, `
    <div id="xf-frame"><video id="xf-video" class="clip" src="assets/x-fold.mp4" data-start="0" data-duration="6" data-media-start="1.2" muted playsinline></video></div>
    <h2 id="xf-a" class="cap clip" data-start="0" data-duration="1.85">And on X.</h2>
    <h2 id="xf-b" class="cap clip" data-start="1.85" data-duration="4.15">Threads and AI art fold too.</h2>`, `
    tl.fromTo('#xf-frame', { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.5, ease: 'power3.out' }, 0);
    tl.fromTo('#xf-a', { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out' }, 0.15);
    tl.fromTo('#xf-b', { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'expo.out' }, 1.85);`));

// ---- show: punch in on the fold's reason, cursor clicks Show (click at 2.13 s with media-start 0.5) ----
W('show.html', scene('show', `
    #show-zoom { position:absolute; left:0; top:0; width:1920px; height:1080px; transform-origin:960px 135px; }
    #show-video { position:absolute; left:0; top:0; width:1920px; height:1080px; }
    #show-a, #show-b { white-space:nowrap; }`, `
    <div id="show-zoom"><video id="show-video" class="clip" src="assets/feed-show.mp4" data-start="0" data-duration="6" data-media-start="0.5" muted playsinline></video></div>
    <div id="show-a" class="chip clip" data-start="0.3" data-duration="1.9">Every fold says why.</div>
    <div id="show-b" class="chip clip" data-start="2.2" data-duration="3.8">One click brings it back.</div>
    ${CUR('show-cursor')}`, `
    tl.fromTo('#show-zoom', { scale: 1 }, { scale: 1.25, duration: 0.9, ease: 'power2.inOut' }, 0);
    tl.fromTo('#show-a', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0.3);
    tl.fromTo('#show-b', { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power1.out' }, 2.2);
    // Cursor enters from bottom right, lands on Show (frame 1725,135), clicks as the post returns.
    tl.fromTo('#show-cursor', { x: 2000, y: 900, scale: 1 }, { x: 1712, y: 120, duration: 0.7, ease: 'power2.inOut' }, 1.2);
    tl.fromTo('#show-cursor', { scale: 1 }, { scale: 0.85, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.inOut' }, 2.06);
    tl.fromTo('#show-cursor', { x: 1712, y: 120 }, { x: 2000, y: 700, duration: 0.6, ease: 'power2.in' }, 4.6);`));

// ---- control: the real popup, cursor drags strictness 3 -> 8 (drag 1.57-2.85 s with media-start 0.8) ----
W('control.html', scene('control', `
    #ctl-frame { position:absolute; left:1020px; top:40px; width:704px; height:1000px; border-radius:30px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.14), 0 0 0 2px rgba(0,0,0,.05); }
    #ctl-video { position:absolute; left:0; top:0; width:704px; height:1000px; object-fit:cover; object-position:top; }
    #ctl-a { left:140px; top:350px; width:780px; font-size:104px; }
    #ctl-b { position:absolute; left:144px; top:600px; width:760px; font-size:46px; line-height:1.3; color:#6e6e73; }`, `
    <div id="ctl-frame"><video id="ctl-video" class="clip" src="assets/popup-slider.mp4" data-start="0" data-duration="5.5" data-media-start="0.8" muted playsinline></video></div>
    <h2 id="ctl-a" class="cap clip" data-start="0" data-duration="5.5">You choose how strict.</h2>
    <p id="ctl-b" class="clip" data-start="0.6" data-duration="4.9">From 1, catch everything, to 10, only the obvious.</p>
    ${CUR('ctl-cursor')}`, `
    tl.fromTo('#ctl-frame', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' }, 0);
    tl.fromTo('#ctl-a', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out' }, 0.1);
    tl.fromTo('#ctl-b', { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out' }, 0.6);
    tl.fromTo('#ctl-cursor', { x: 1900, y: 1000 }, { x: 1203, y: 625, duration: 0.6, ease: 'power2.inOut' }, 0.85);
    tl.fromTo('#ctl-cursor', { x: 1203 }, { x: 1516, duration: 1.28, ease: 'none' }, 1.57);
    tl.fromTo('#ctl-cursor', { x: 1516, y: 625 }, { x: 1900, y: 1000, duration: 0.6, ease: 'power2.in' }, 4.4);`));

// ---- clean: the cleaned feed scrolls ----
W('clean.html', scene('clean', `
    #clean-video { position:absolute; left:0; top:0; width:1920px; height:1080px; }
    #clean-a { bottom:200px; }
    #clean-b { bottom:100px; background:#fff; color:#1d1d1f; font-size:44px; font-weight:600; padding:20px 34px; box-shadow:0 0 0 2px rgba(0,0,0,.08); }`, `
    <video id="clean-video" class="clip" src="assets/feed-scroll.mp4" data-start="0" data-duration="6" data-media-start="0.3" muted playsinline></video>
    <div id="clean-a" class="chip clip" data-start="0.5" data-duration="5.5">Your feed, written by people.</div>
    <div id="clean-b" class="chip clip" data-start="2.4" data-duration="3.6">On X, LinkedIn, TikTok and Instagram</div>`, `
    tl.fromTo('#clean-a', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0.5);
    tl.fromTo('#clean-b', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 2.4);`));

// ---- end: claim, then a bar becomes the icon, name, call to action ----
W('end.html', scene('end', `
    #end-c1 { left:160px; top:330px; font-size:130px; }
    #end-c2 { position:absolute; left:166px; top:500px; font-size:60px; font-weight:400; }
    #end-mark { position:absolute; left:590px; top:340px; width:160px; height:160px; background:#111; border-radius:8px; }
    #end-icon { position:absolute; left:563px; top:313px; width:214px; height:214px; }
    #end-name { position:absolute; left:790px; top:352px; font-weight:900; font-size:120px; letter-spacing:-0.03em; line-height:1.1; }
    #end-cta { position:absolute; left:594px; top:600px; display:flex; align-items:center; gap:36px; }
    #end-btn { background:linear-gradient(135deg,#ff6b5e,#e5302a); color:#fff; font-weight:800; font-size:50px; padding:24px 44px; border-radius:20px; }
    #end-url { font-size:46px; color:#1d1d1f; font-weight:600; }`, `
    <h2 id="end-c1" class="cap clip" data-start="0" data-duration="2.4">No AI model.</h2>
    <p id="end-c2" class="clip" data-start="0.5" data-duration="1.9">Post text never leaves your device.</p>
    <div id="end-mark" class="clip" data-start="2.5" data-duration="3.5"></div>
    <img id="end-icon" class="clip" src="assets/icon.png" alt="" data-start="3.05" data-duration="2.95">
    <div id="end-name" class="clip" data-start="3.2" data-duration="2.8">Anti-Slop</div>
    <div id="end-cta" class="clip" data-start="3.7" data-duration="2.3"><span id="end-btn" data-var-text="cta">Free for Chrome</span><span id="end-url" data-var-text="url">oscarc178.github.io/anti-slop</span></div>`, `
    tl.fromTo('#end-c1', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out' }, 0);
    tl.fromTo('#end-c2', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, ease: 'power3.out' }, 0.5);
    tl.fromTo(['#end-c1', '#end-c2'], { opacity: 1 }, { opacity: 0, duration: 0.25, ease: 'power1.in' }, 2.1);
    // A redaction bar slams in, then turns into the icon.
    tl.fromTo('#end-mark', { scaleX: 0, width: 760, borderRadius: 8, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.2, ease: 'expo.out' }, 2.5);
    tl.fromTo('#end-mark', { width: 760, backgroundColor: '#111111', borderRadius: 8 }, { width: 160, backgroundColor: '#ef4a3d', borderRadius: 36, duration: 0.45, ease: 'power3.inOut' }, 2.65);
    tl.fromTo('#end-icon', { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'none' }, 3.05);
    tl.fromTo('#end-name', { clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)', duration: 0.45, ease: 'power3.out' }, 3.2);
    tl.fromTo('#end-cta', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }, 3.7);`));

// ---- root ----
const scenes = [['slop', 0, 14], ['fold', 14, 8.5], ['xfold', 22.5, 6], ['show', 28.5, 6], ['control', 34.5, 5.5], ['clean', 40, 6], ['end', 46, 6]];
fs.writeFileSync('index.html', `<!doctype html>
<html lang="en-GB" data-composition-variables='[{"id":"cta","type":"string","label":"Button","default":"Free for Chrome"},{"id":"url","type":"string","label":"Web address","default":"oscarc178.github.io/anti-slop"}]'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #f3f2ef; }
      #root { width: 100%; height: 100%; position: relative; background: #f3f2ef; font-family: Inter, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="52" data-width="1920" data-height="1080">
${scenes.map(([id, s, d], i) => `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${s}" data-duration="${d}" data-track-index="${i % 2}" data-track-kind="graphics" data-width="1920" data-height="1080"></div>`).join('\n')}
      <audio id="music-bed" src="assets/music-bed.wav" data-start="0" data-duration="52" data-track-index="2" data-volume="0.85"></audio>
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`);
console.log('scenes written');
