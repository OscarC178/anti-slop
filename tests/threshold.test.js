// Evaluation: the threshold slider.
// A graded corpus of posts with known scores. For every slider value 1..10 we
// check which posts would be hidden, that raising the slider only ever hides
// fewer posts, and that the counts at each level are what we expect.
// Run: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../extension/signals.js');

// Each entry: label, text, expected points at default signal settings.
const CORPUS = [
  ['human-short', 'just missed the train again. third time this week lol', 0],
  ['human-news', 'The council voted 7-4 last night to approve the cycle lane on Mill Road, despite objections from traders who say loading access will be worse. Work starts in March.', 0],
  ['human-dash', "Ran 10k this morning – slow, but done. Legs felt heavy after yesterday's hill session so I kept it easy and enjoyed the sunrise.", 1],
  ['mild-opener', "Here's the thing about the new office: the coffee machine is on the wrong floor and everyone keeps getting lost looking for it.", 1],
  ['mild-two', "Here's the thing — the coffee machine is on the wrong floor and everyone keeps getting lost looking for it.", 2],
  ['medium-contrast', "It's not about the coffee. It's about the walk. The result? Everyone is late to the ten o'clock.", 3],
  ['heavy-tiktok', "This isn't luck — it's strategy 🚀 The real question is: are you ready? #fyp #motivation #hustle #mindset #success #grindset", 5],
  ['heavy-corporate', "Thrilled to share that our team has reached a pivotal milestone, underscoring our commitment to innovation. This isn't just a product launch, it's a testament to what's possible when passionate people come together. We're leveraging cutting-edge technology to unlock seamless experiences, ensuring our customers stay ahead in today's fast-paced landscape. Grateful to everyone who made this happen — we're just getting started.", 9],
  ['heavy-broetry', `I got rejected from 47 jobs last year.

Today I'm a Director.

Here's the thing — nobody talks about the rejection. They only show the highlight reel.

It's not about talent. It's about persistence.

✅ Show up every day
✅ Learn from every "no"
✅ Keep building

Every. Single. Day.

The result? A career I'm proud of.

Agree? ♻️ Repost if this resonates.

#Leadership #Growth #Mindset #Career #Success`, 11],
];

test('corpus scores are exactly as expected (change this table on purpose only)', () => {
  for (const [label, text, expected] of CORPUS) {
    const r = S.score(text);
    assert.strictEqual(r.points, expected, `${label}: got ${r.points}, expected ${expected} (${r.hits.map(h => h.id + ':' + h.points).join(', ')})`);
  }
});

test('raising the slider never hides more posts', () => {
  let prev = Infinity;
  for (let t = 1; t <= 10; t++) {
    const hidden = CORPUS.filter(([, text]) => S.score(text).points >= t).length;
    assert.ok(hidden <= prev, `threshold ${t} hid ${hidden}, more than ${prev} at ${t - 1}`);
    prev = hidden;
  }
});

test('hidden counts per slider value', () => {
  const expectedCounts = { 1: 7, 2: 5, 3: 4, 4: 3, 5: 3, 6: 2, 7: 2, 8: 2, 9: 2, 10: 1 };
  for (let t = 1; t <= 10; t++) {
    const hidden = CORPUS.filter(([, text]) => S.score(text).points >= t).map(([l]) => l);
    assert.strictEqual(hidden.length, expectedCounts[t], `threshold ${t}: hid ${hidden.length} (${hidden.join(', ')})`);
  }
});

test('human posts survive at the default threshold and above', () => {
  for (let t = 3; t <= 10; t++) {
    for (const [label, text] of CORPUS.filter(([l]) => l.startsWith('human'))) {
      assert.ok(S.score(text).points < t, `${label} hidden at threshold ${t}`);
    }
  }
});

test('the three heavy posts are hidden at every threshold up to 5', () => {
  for (let t = 1; t <= 5; t++) {
    for (const [label, text] of CORPUS.filter(([l]) => l.startsWith('heavy'))) {
      assert.ok(S.score(text).points >= t, `${label} visible at threshold ${t}`);
    }
  }
});
