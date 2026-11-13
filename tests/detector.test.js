// Unit tests for the signal scorer. Run: node --test tests/
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const S = require('../extension/signals.js');

const THRESHOLD = 3; // the default in the extension

// ---- texts that should be caught at the default threshold ----
const SLOP = {
  linkedinBroetry: `I got rejected from 47 jobs last year.

Today I'm a Director.

Here's the thing — nobody talks about the rejection. They only show the highlight reel.

It's not about talent. It's about persistence.

✅ Show up every day
✅ Learn from every "no"
✅ Keep building

Every. Single. Day.

The result? A career I'm proud of.

Agree? ♻️ Repost if this resonates.

#Leadership #Growth #Mindset #Career #Success`,

  xThread: `Most people think productivity is about doing more. It's not. It's about doing less — but better.

Here's what nobody tells you:

→ Your calendar is a trap
→ Meetings are the enemy of deep work
→ Saying no is a superpower

Let that sink in.`,

  corporate: `Thrilled to share that our team has reached a pivotal milestone, underscoring our commitment to innovation. This isn't just a product launch, it's a testament to what's possible when passionate people come together. We're leveraging cutting-edge technology to unlock seamless experiences, ensuring our customers stay ahead in today's fast-paced landscape. Grateful to everyone who made this happen — we're just getting started.`,

  chatbotPaste: `Here's a concise LinkedIn post you can use:

Excited to announce that I've joined [Company] as a Senior Analyst! Looking forward to delving into new challenges and fostering meaningful connections. I hope this helps — let me know if you'd like a shorter version.`,

  tiktokCaption: `This isn't luck — it's strategy 🚀 The real question is: are you ready? #fyp #motivation #hustle #mindset #success #grindset #ai`,
};

// ---- ordinary human writing that must NOT be caught ----
const HUMAN = {
  short: `just missed the train again. third time this week lol`,
  rant: `Honestly the new Hyprland update broke my keybinds and I spent two hours figuring out it was the config file ordering. Anyway it works now, if anyone hits the same thing the fix is to move the source line to the bottom.`,
  news: `The council voted 7-4 last night to approve the cycle lane on Mill Road, despite objections from traders who say loading access will be worse. Work starts in March and should take about four months according to the report.`,
  casualLong: `We went to that new Thai place on the corner, the one that used to be the dry cleaner. Food was good but they've clearly not sorted staffing yet, we waited 40 minutes for mains and the pad thai was lukewarm. Would still go back though because the green curry was genuinely one of the better ones I've had round here, and it's cheap.`,
  techQuestion: `Does anyone know whether the Asahi kernel supports the Thunderbolt dock properly yet? Mine shows up in lsusb but the ethernet port never gets an address. I've tried two different docks and a fresh install, same result both times.`,
  dashUser: `Ran 10k this morning – slow, but done. Legs felt heavy after yesterday's hill session so I kept it easy and just enjoyed the sunrise over the reservoir.`,
};

test('slop samples cross the default threshold', () => {
  for (const [name, text] of Object.entries(SLOP)) {
    const r = S.score(text);
    assert.ok(r.points >= THRESHOLD, `${name}: ${r.points} pts (${r.hits.map(h => h.id).join(',')})`);
  }
});

test('human samples stay under the default threshold', () => {
  for (const [name, text] of Object.entries(HUMAN)) {
    const r = S.score(text);
    assert.ok(r.points < THRESHOLD, `${name}: ${r.points} pts (${r.hits.map(h => h.id + ':' + h.evidence).join(', ')})`);
  }
});

test('very short text never scores', () => {
  assert.strictEqual(S.score('not this — but that.').points, 0);
});

test('individual signals fire on their own patterns', () => {
  const ids = (t) => S.score(t).hits.map(h => h.id);
  const pad = ' one two three four five six seven eight nine ten.';
  assert.ok(ids("It's not about the money. It's about the freedom." + pad).includes('not_x_but_y'));
  assert.ok(ids('We delve into the tapestry of pivotal moments.' + pad).includes('ai_vocab'));
  assert.ok(ids('Read that again.' + pad).includes('closers'));
  assert.ok(ids("Here's the thing about remote work." + pad).includes('openers'));
  assert.ok(ids('I hope this helps with your draft.' + pad).includes('chatbot_residue'));
  assert.ok(ids('Simple. Fast. Reliable.' + pad).includes('rule_of_three'));
  assert.ok(ids('𝗕𝗶𝗴 𝗻𝗲𝘄𝘀 today everyone' + pad).includes('unicode_bold'));
  assert.ok(ids('a — b — c — d' + pad).includes('em_dash'));
  assert.ok(ids('Thoughts? Drop a comment below.' + pad).includes('engagement_bait'));
});

test('signals can be switched off', () => {
  const text = 'a — b — c — d — e one two three four five six seven eight nine ten.';
  assert.ok(S.score(text).points > 0);
  assert.strictEqual(S.score(text, { em_dash: false }).points, 0);
});

test('platform labels and disclosures are detected', () => {
  assert.ok(S.labelled('Made with AI · 2h', 'a nice sunset'));
  assert.ok(S.labelled('Creator labeled as AI-generated', ''));
  assert.ok(S.labelled('', 'look at this #aiart I made'));
  assert.ok(S.labelled('', 'generated with Sora, pretty wild'));
  assert.strictEqual(S.labelled('Jane Doe · 3h', 'I think AI labels are a good idea'), null);
});
