// Evaluation: every signal, one at a time.
// For each signal: a text that must trigger it (with the expected points) and a
// text that must not. Each case runs with ONLY that signal switched on, so a hit
// from a different signal cannot mask a failure.
// Run: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../extension/signals.js');

// Filler so every sample clears the 8-word minimum without adding tells.
const PAD = ' We met on Tuesday at the usual place and talked about the garden for a while.';

const CASES = {
  not_x_but_y: {
    hits: [
      ["It's not about the money. It's about the freedom." + PAD, 2],
      ['This is not just a tool, but a way of working.' + PAD, 2],
      ['We chose it not because it was cheap but because it worked.' + PAD, 2],
      ["Most people think it's talent. It's not. It's consistency." + PAD, 2],
      ['We prefer walking rather than driving when the weather is fine.' + PAD, 1],
    ],
    miss: ['I did not go to the shop because it was raining and I was tired.' + PAD],
  },
  em_dash: {
    hits: [
      ['The plan — such as it was — fell apart quickly.' + PAD, 1],
      ['One — two — three — four, all in a row.' + PAD, 2],
      ['Trains -- buses -- bikes -- all late today.' + PAD, 2],
    ],
    miss: ['A well-known, long-term problem with a hyphenated-compound answer.' + PAD],
  },
  ai_vocab: {
    hits: [
      ['We delve into the tapestry of this problem.' + PAD, 1],
      ['A pivotal, seamless, robust and game-changing launch that will elevate everything.' + PAD, 2],
    ],
    miss: ['The landscape outside the window was mostly fields and a few sheep.' + PAD],
  },
  closers: {
    hits: [
      ['They cut the budget by half and shipped early. Let that sink in.' + PAD, 2],
      ['It took three years. Every. Single. Day.' + PAD, 2],
      ["That's the real win here." + PAD, 2],
    ],
    miss: ['The sink is full again and the dishwasher is still broken.' + PAD],
  },
  openers: {
    hits: [
      ["Here's the thing about remote work: it needs trust." + PAD, 1],
      ['Unpopular opinion: standing desks are overrated.' + PAD, 1],
      ["Let's dive in." + PAD, 1],
    ],
    miss: ['The thing in the garden turned out to be a hedgehog.' + PAD],
  },
  profound: {
    hits: [
      ['The real question is whether anyone reads these.' + PAD, 1],
      ['Attention is the new oil.' + PAD, 1],
      ['Trust is the currency of every team.' + PAD, 1],
    ],
    miss: ['The real reason the bus was late was roadworks on the high street.' + PAD],
  },
  strawman: {
    hits: [
      ["I'm not saying meetings are useless, but most could be an email." + PAD, 1],
      ['Most people think productivity is about hours.' + PAD, 1],
      ["Don't get me wrong, the food was fine." + PAD, 1],
    ],
    miss: ['Some people at the party knew each other from school.' + PAD],
  },
  rhetorical_qa: {
    hits: [
      ['We shipped it in a week. The result? Nothing broke.' + PAD, 1],
      ['Why? Because nobody checked the config.' + PAD, 1],
      ['Sound familiar?' + PAD, 1],
    ],
    miss: ['What time does the result come out? Around six, I think.' + PAD],
  },
  emoji_bullets: {
    hits: [
      ['Three rules:\n✅ Show up\n✅ Be kind\nThat is all.' + PAD, 1],
      ['🚀 Launch\n💡 Learn\n✅ Ship\n👉 Repeat\nDone.' + PAD, 2],
      ['Calendar → trap. Meetings → waste. No → superpower.' + PAD, 1],
    ],
    miss: ['Had a great day at the beach 🏖️ and then pizza 🍕 for tea.' + PAD],
  },
  unicode_bold: {
    hits: [['𝗕𝗶𝗴 𝗻𝗲𝘄𝘀 today for the whole team.' + PAD, 1]],
    miss: ['Big news today for the whole team, in plain letters.' + PAD],
  },
  bold_labels: {
    hits: [
      ['Problem: too many tools.\nCause: nobody owns them.\nFix: pick one.\nResult: calm.' + PAD, 1],
      ['**Step one** then **step two** and finally **step three**.' + PAD, 1],
    ],
    miss: ['Note: the shop shuts at five on Sundays.' + PAD],
  },
  rule_of_three: {
    hits: [
      ['Simple. Fast. Reliable.' + PAD, 1],
      ['We need better tools, clearer goals, and more time. They want faster wins, lower costs, and fewer meetings.' + PAD, 1],
    ],
    miss: ['We bought bread, milk and eggs on the way home.' + PAD],
  },
  broetry: {
    hits: [['I failed.\nI tried again.\nI failed again.\nThen it clicked.\nNow I teach it.\nThat is the whole story.\nNothing more.', 1]],
    miss: ['One long paragraph about a walk in the hills that goes on for a good while without any line breaks at all, mentioning the weather, the mud and the pub at the end.'],
  },
  hashtag_stack: {
    hits: [['Morning run done #running #fitness #health #motivation #sunrise' + PAD, 1]],
    miss: ['Morning run done #running #fitness' + PAD],
  },
  engagement_bait: {
    hits: [
      ['Agree? Drop a comment below.' + PAD, 1],
      ["Comment 'GUIDE' and I'll send it over." + PAD, 1],
      ['Repost if this helped you.' + PAD, 1],
    ],
    miss: ['I agree with the review, the sequel was better than the original.' + PAD],
  },
  inflated: {
    hits: [
      ['This is a testament to what the team can do.' + PAD, 1],
      ["In today's fast-paced world this is a game changer and a paradigm shift." + PAD, 2],
    ],
    miss: ['The game changed at half time when the rain started.' + PAD],
  },
  trailing_ing: {
    hits: [
      ['We moved the deadline, ensuring everyone had time.' + PAD, 1],
      ['We moved the deadline, ensuring everyone had time, highlighting how flexible the plan was.' + PAD, 2],
    ],
    miss: ['We were ensuring the gate was shut before leaving.' + PAD],
  },
  chatbot_residue: {
    hits: [
      ['I hope this helps with your draft.' + PAD, 2],
      ["Here's a concise LinkedIn post you can use:" + PAD, 2],
      ['Excited to join [Company] as an analyst.' + PAD, 2],
    ],
    miss: ['Hope this rain stops before the weekend.' + PAD],
  },
  hedging: {
    hits: [
      ['As of my last update, the office was still in Leeds.' + PAD, 2],
      ['Based on available information the firm has two offices.' + PAD, 2],
    ],
    miss: ['Based on the map, the office is two streets away.' + PAD],
  },
  summary_markers: {
    hits: [
      ['In summary, the trip was worth it.' + PAD, 1],
      ['TL;DR the trip was worth it.' + PAD, 1],
      ['Key takeaways: pack less, leave earlier.' + PAD, 1],
    ],
    miss: ['The summary of the match was printed on page four.' + PAD],
  },
  curly_quotes: {
    hits: [['She said “no” and then “maybe” and then “fine”.' + PAD, 1]],
    miss: ['She said "no" and then "maybe" and then "fine".' + PAD],
  },
  vague_authority: {
    hits: [
      ['Experts agree that this is the right call.' + PAD, 1],
      ['Studies show people read less than they think.' + PAD, 1],
    ],
    miss: ['The expert from the council said the bridge would reopen in May.' + PAD],
  },
};

// Switch everything off except one signal.
function only(id) {
  const on = {};
  for (const s of S.SIGNALS) on[s.id] = s.id === id;
  return on;
}

test('every signal in signals.js has an evaluation case', () => {
  for (const s of S.SIGNALS) assert.ok(CASES[s.id], 'missing case for ' + s.id);
  for (const id of Object.keys(CASES)) assert.ok(S.SIGNALS.find(s => s.id === id), 'case for unknown signal ' + id);
});

for (const sig of S.SIGNALS) {
  const c = CASES[sig.id];
  if (!c) continue;
  test(`${sig.id} — fires with the expected points`, () => {
    for (const [text, expected] of c.hits) {
      const r = S.score(text, only(sig.id));
      const hit = r.hits.find(h => h.id === sig.id);
      assert.ok(hit, `${sig.id} did not fire on: ${text.slice(0, 60)}`);
      assert.strictEqual(hit.points, expected, `${sig.id} gave ${hit.points} pts, expected ${expected} on: ${text.slice(0, 60)} (${hit.evidence})`);
      assert.ok(hit.points <= sig.weight, `${sig.id} exceeded its weight`);
    }
  });
  test(`${sig.id} — stays quiet on a look-alike`, () => {
    for (const text of c.miss) {
      const r = S.score(text, only(sig.id));
      assert.strictEqual(r.points, 0, `${sig.id} fired on: ${text.slice(0, 60)} (${r.hits.map(h => h.evidence).join('; ')})`);
    }
  });
}
