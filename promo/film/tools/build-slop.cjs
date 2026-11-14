// Writes compositions/slop.html: the hook card, the pull-back to a wall of slop posts,
// the redaction bars and the "Slop is slop." reveal. The cards are static HTML so Studio can edit them.
// Run: node tools/build-slop.cjs
'use strict';
const fs = require('fs');
const path = require('path');

// Invented posts written in the AI-slop style the extension detects. Card 5 (row 1, col 1) is the hook,
// the same post the real demo feed uses later, so the film's footage continues it.
const HOOK = { name: 'Priya Lal', role: 'Head of Operations · 3h', av: '#8fb8de', lines: [
  "I'm thrilled to announce that I've joined a new team.",
  "It's not just a job. It's a calling.",
  "In today's fast-paced, ever-evolving landscape, I'm excited to leverage my passion.",
  'Let that sink in. 🚀',
  'Agree? 👇',
] };
const OTHERS = [
  ['Mark Ellis', 'Founder', '#c9b6e4', ["Here's the thing nobody tells you about leadership.", "It's not about the title. It's about the impact.", 'Read that again.']],
  ['Dana Whitfield', 'Growth Lead', '#f2c48d', ['5 lessons I learned from failing forward:', '→ Embrace the journey', '→ Unlock your potential', 'Which one resonates? 👇']],
  ['Studio Nova', 'Design studio', '#9fd8c4', ['A testament to the ever-evolving landscape of creativity. ✨', 'The future is here.']],
  ['Leo Brandt', 'Coach', '#e7a1a1', ["Most people won't read this.", "But the ones who do will change everything.", 'Let that sink in.']],
  ['Ruth Adeyemi', 'Thought Leader', '#a9c7a4', ["It's not about working harder.", "It's about working smarter.", 'Game-changer. 🚀']],
  ['Kai Morgan', 'CEO', '#b3c6e8', ['I asked AI to describe my morning routine.', 'The result? Absolutely mind-blowing. 🤯', 'Agree?']],
  ['Ines Varga', 'Marketing', '#f0b7c9', ['In a world of noise, be the signal.', 'Delve deeper. Foster connection.', 'Thoughts? 💭']],
  ['Tom Ashby', 'Investor', '#d6c39a', ["Here's why this matters more than ever:", 'The landscape is shifting.', 'Are you ready? 👇']],
  ['Nadia Faris', 'Recruiter', '#9cc3d5', ["I'm humbled and honoured to share some exciting news.", 'Grateful for the journey. 🙏']],
  ['Sam Ortiz', 'Founder', '#c4d79b', ['Unpopular opinion:', 'Consistency beats talent.', 'Every. Single. Time.']],
  ['Elle Park', 'Creator', '#e2b4f0', ['Stop scrolling.', 'This is your sign to start.', 'Repost ♻️ if you agree.']],
  ['James Kerr', 'Sales Director', '#a6b8c8', ["It's not just a product. It's a movement.", 'Let that sink in. 🚀']],
  ['Maya Chen', 'Strategist', '#f3c7a0', ['Navigating the complexities of modern work.', 'Seamless. Scalable. Synergy.', 'Agree? 👇']],
  ['Owen Price', 'Speaker', '#b9e0c9', ['Your network is your net worth.', 'Read that twice.']],
  ['Zara Hussain', 'Consultant', '#d9b3a3', ['I used to think success was about hustle.', 'I was wrong.', 'Here’s what I learned 🧵']],
];

const COLS = 4, ROWS = 4, CW = 1400, GAPX = 200, GAPY = 120, ROWH = 720;
const HOOK_AT = { c: 1, r: 1 };
let cards = '', o = 0;
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const isHook = r === HOOK_AT.r && c === HOOK_AT.c;
  // Every other card is an X-style post (@handle, Reply/Repost/Like), the rest LinkedIn-style.
  const d = isHook ? HOOK : (() => { const x = OTHERS[o++ % OTHERS.length]; const hrs = (2 + (o * 3) % 20) + 'h';
    return o % 2 ? { name: x[0], role: '@' + x[0].toLowerCase().replace(/[^a-z]/g, '') + ' · ' + hrs, av: x[2], lines: x[3], foot: 'Reply · Repost · Like · Views' }
                 : { name: x[0], role: x[1] + ' · ' + hrs, av: x[2], lines: x[3] }; })();
  const x = c * (CW + GAPX), y = r * (ROWH + GAPY);
  cards += `
      <article class="card${isHook ? ' hook' : ''}" ${isHook ? 'id="slop-hook"' : ''} style="left:${x}px;top:${y}px">
        <header><span class="av" style="background:${d.av}"></span><span><b>${d.name}</b><i>${d.role}</i></span></header>
        ${d.lines.map((l, i) => `<p class="ln${isHook ? ' h' + i : ''}"><span class="bar"></span>${l}</p>`).join('\n        ')}
        <footer>${d.foot || 'Like · Comment · Repost'}</footer>
      </article>`;
}
const STAGE_W = COLS * CW + (COLS - 1) * GAPX, STAGE_H = ROWS * ROWH + (ROWS - 1) * GAPY;
const hookX = HOOK_AT.c * (CW + GAPX), hookY = HOOK_AT.r * (ROWH + GAPY);
const wall = Math.min(1920 / STAGE_W, 1080 / STAGE_H) * 0.98;

const html = `<template>
  <style>
    #root { position: absolute; inset: 0; background: #f3f2ef; overflow: hidden; font-family: Inter, sans-serif; color: #1d1d1f; }
    #slop-stage { position: absolute; left: 0; top: 0; width: ${STAGE_W}px; height: ${STAGE_H}px; transform-origin: 0 0; }
    .card { position: absolute; width: ${CW}px; min-height: 560px; background: #fff; border-radius: 28px; padding: 44px 56px 36px;
            box-shadow: 0 0 0 2px rgba(0,0,0,.06); }
    .card header { display: flex; gap: 22px; align-items: center; margin-bottom: 30px; }
    .card .av { width: 84px; height: 84px; border-radius: 50%; flex: none; }
    .card b { display: block; font-weight: 700; font-size: 38px; }
    .card i { display: block; font-style: normal; color: #6e6e73; font-size: 30px; }
    .ln { position: relative; font-size: 52px; line-height: 1.32; margin: 0 0 26px; }
    .bar { position: absolute; left: -10px; right: -10px; top: 2px; bottom: 2px; background: #111; border-radius: 8px; transform-origin: 0 50%; }
    .card footer { color: #6e6e73; font-size: 30px; border-top: 2px solid #eee; padding-top: 22px; margin-top: 10px; }
    #slop-title { position: absolute; left: 160px; top: 330px; font-weight: 900; font-size: 170px; letter-spacing: -0.03em; line-height: 1; }
    #slop-title em { font-style: normal; background: linear-gradient(135deg, #ff6b5e, #e5302a); -webkit-background-clip: text; background-clip: text; color: transparent; }
    #slop-sub { position: absolute; left: 166px; top: 560px; font-size: 56px; font-weight: 400; color: #1d1d1f; }
    #slop-sub b { font-weight: 900; }
  </style>
  <div id="root" data-composition-id="slop" data-width="1920" data-height="1080">
    <div id="slop-stage" data-layout-ignore>${cards}
    </div>
    <h1 id="slop-title" class="clip" data-start="10.9" data-duration="3.1">Slop is <em>slop.</em></h1>
    <p id="slop-sub" class="clip" data-start="11.6" data-duration="2.4"><b>Anti-Slop</b> folds it out of your feed.</p>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    const S = '#slop-stage';
    // Hook: the hook card fills the frame; its first line is there on frame 0, the rest arrive.
    tl.fromTo(S, { x: ${160 - hookX}, y: ${110 - hookY}, scale: 1 }, { x: ${160 - hookX}, y: ${110 - hookY}, scale: 1, duration: 0.01 }, 0);
    tl.fromTo('.card:not(.hook)', { opacity: 1 }, { opacity: 1, duration: 0.01 }, 0);
    tl.fromTo('#slop-hook .ln:not(.h0)', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power3.out', stagger: 0.7 }, 0.5);
    // Tension: pull back to the wall of slop, then the wall drifts up like a feed.
    tl.fromTo(S, { x: ${160 - hookX}, y: ${110 - hookY}, scale: 1 },
      { x: ${Math.round((1920 - STAGE_W * wall) / 2)}, y: ${Math.round((1080 - STAGE_H * wall) / 2) + 40}, scale: ${wall.toFixed(4)}, duration: 1.6, ease: 'power2.inOut' }, 3.8);
    tl.fromTo(S, { y: ${Math.round((1080 - STAGE_H * wall) / 2) + 40} }, { y: ${Math.round((1080 - STAGE_H * wall) / 2) - 60}, duration: 3.6, ease: 'none' }, 5.4);
    // Reveal: black bars slam over every slop line.
    tl.fromTo('.bar', { scaleX: 0 }, { scaleX: 1, duration: 0.18, ease: 'expo.out', stagger: { each: 0.022, from: 'center' } }, 9.0);
    // Push in a little, then the wall gives way to the grey ground for the line.
    tl.fromTo(S, { scale: ${wall.toFixed(4)} }, { scale: ${(wall * 1.25).toFixed(4)}, duration: 1.8, ease: 'power2.in' }, 9.0);
    tl.fromTo(S, { opacity: 1 }, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 10.6);
    tl.fromTo('#slop-title', { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'expo.out' }, 10.9);
    tl.fromTo('#slop-sub', { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power3.out' }, 11.6);
    window.__timelines["slop"] = tl;
  </script>
</template>
`;
fs.mkdirSync(path.join(__dirname, '..', 'compositions'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'compositions', 'slop.html'), html);
console.log('wrote compositions/slop.html', { STAGE_W, STAGE_H, wall: wall.toFixed(3) });
