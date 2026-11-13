# Anti-Slop

A Chromium extension that cleans AI slop out of your X, LinkedIn, TikTok and Instagram feeds.
Filtering runs inside the browser: no AI model, no cost, and no post ever leaves the device.
The only network call is an optional daily total of hidden posts (see [Telemetry](#telemetry)).

Two levels:

1. **Labelled content.** Posts the platform marks as AI ("Made with AI" on X, "AI-generated" /
   "Creator labeled as AI-generated" on TikTok, "AI info" on Instagram, C2PA "Content credentials"
   on LinkedIn) and posts
   that disclose it themselves (#aiart, #madewithai, "generated with Sora", and so on).
2. **Reads like AI.** 22 codified writing signals, each worth 1 point (the strongest up to 2).
   A post is hidden when its total reaches the threshold you set in the popup (default 3).

Plus your own **keywords**: any post whose text or author line contains one is hidden.

Hidden posts collapse to a grey bar that says why ("Not X, but Y · Dashes as glue · Emoji bullets")
with a **Show** button. Or pick "remove entirely" and they vanish. The toolbar badge shows how many
posts were redacted on the current tab.

The popup has two views. **Filter** holds the sensitivity slider and collapsible groups for
behaviour, keywords, signals and recently hidden posts. **Scorecard** shows posts redacted today,
over 7 or 30 days, or all time, split by site and by reason, with a per-minute rate against time
spent on feed tabs and a last-7-days chart. History is kept on this device (last 5,000 hides).

## Install (Chromium on this machine)

1. Open `chrome://extensions` in Chromium.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this folder:
   `/home/oscar/Work/anti-slop/extension`
4. Open x.com, linkedin.com or tiktok.com. The broom icon in the toolbar shows the count.

After any change to the code, go back to `chrome://extensions` and click the reload arrow on the
Anti-Slop card.

On this machine it is installed the way Omarchy loads its own extensions: the folder is on the
`--load-extension=` line in `~/.config/chromium-flags.conf`, so it loads on every Chromium start.
After a code change, restart Chromium (or reload the card on `chrome://extensions`). Note that
`omarchy refresh chromium` resets that file and drops the line.

## Telemetry

On by default, with a clear opt-out. The first time the popup opens, a "Before you start" sheet shows
exactly what is sent, with a **Don't share my counts** tick box. The same choice lives under
Behaviour → Share anonymous counts, and "What's sent?" reopens the sheet.

- **Sent:** once a day, the previous day's totals: `{day, site, reason, number}` plus the extension version.
  One `install` ping on first install. Nothing else: no ID, URL, text or account.
- **Where:** a Cloudflare Worker with a D1 database, in `worker/` (deploy steps in `worker/README.md`).
  While `TELEMETRY_URL` at the top of `extension/background.js` is empty, nothing is sent.
- **Opting out** deletes any totals not yet sent.
- Public privacy policy: `docs/privacy.html`.

## Review reminder

An inline card in the popup, never on top of a feed. It appears only for copies installed from the
Chrome Web Store, after 7 days and 50 hidden posts. "Rate Anti-Slop" opens the store's review page.
"Not now" waits 30 days and asks once more. The ×, or a second "Not now", stops it for good.
Everyone is sent to the store. There is no "are you happy?" filter, which Google could read as
manipulating ratings.

## Publishing

- `store/listing.md`: copy-ready text for every Chrome Web Store dashboard field, permission
  justifications and data-use answers.
- `node tools/make-store-assets.js`: rebuilds the icons, five 1280×800 screenshots and two promo tiles
  from the real extension running on an invented demo feed (`store/demo-feed.html`).
- `tools/package.sh`: runs the tests and builds `dist/anti-slop-<version>.zip`. It refuses to build
  while the telemetry address is empty, unless you pass `--no-telemetry`.
- `docs/`: the GitHub Pages site (landing page and privacy policy).

## Long posts behind "Show more"

X cuts posts at 280 characters behind a "Show more" button and LinkedIn cuts some at about 200
behind "…more"; the rest is not in the page until the button is pressed. With **Peek** on (the
default) the extension presses that button itself when the preview is already borderline (at
least threshold minus 2 points), then scores the full text. The cost is that borderline posts
appear expanded. Posts whose preview scores nothing are left alone.

## Video posts

Video posts on X and LinkedIn are ordinary posts with a caption, so they are scored like any
other. TikTok's For You feed is scored on the caption. A video with no caption can only be
caught by a platform AI label. LinkedIn's separate video tab is not available on desktop web.

## Tuning

- **Slider** in the popup: minimum points before hiding. 1–2 is aggressive, 3 is the default,
  5+ only catches the obvious stuff.
- **Signals**: untick any signal that keeps catching people you want to read.
- **Recently hidden** in the popup shows the last 12 hides on the page with their points and
  signals, so you can see what a given threshold is doing.

## Layout

```
extension/
  manifest.json   Manifest V3
  signals.js      the codified signal list and scorer (also used by the tests)
  sites.js        per-site DOM selectors for X, LinkedIn, TikTok, Instagram
  content.js      watches the feed, scores posts, hides them, keeps counts
  content.css     the collapsed-post bar
  background.js   toolbar badge, all-time counter, scorecard history, daily telemetry send
  popup.*         the control panel, first-run privacy sheet, review reminder
tests/
  detector.test.js      sanity: slop samples hidden, human samples kept     (node --test tests/)
  signals.each.test.js  every signal alone: must fire with the right points, must stay quiet on a look-alike
  threshold.test.js     graded corpus swept over slider values 1..10; counts per level are pinned
  e2e.js                real extension in Chromium against fixture feeds: counts, badge, all-time total,
                        slider sweep, Show button, modes, per-site and per-signal switches (node tests/e2e.js)
  fixtures/             fake X (plus a "Show more" variant), LinkedIn (classic and 2026 markup), TikTok and Instagram pages
tools/make-store-assets.js  icons, store screenshots and promo tiles
tools/make-icons.js         old icon generator, superseded (do not run)
tools/package.sh            tests + upload zip
store/                      listing copy, demo feed, generated assets
docs/                       GitHub Pages site and privacy policy
worker/                     Cloudflare Worker + D1 for the daily totals (own tests and README)
```

## The signals

| Signal | Points | What it catches | Source |
|---|---|---|---|
| Not X, but Y | 2 | "It's not X, it's Y", "not just… but", "rather than" | H1, W3.3, G |
| Dashes as glue | 1–2 | em dashes / spaced dashes joining clauses | H8, W13, P |
| AI vocabulary | 1–2 | delve, tapestry, testament, pivotal, leverage, seamless, unlock… | W3.1, H12 |
| Dramatic one-liners | 2 | "Let that sink in", "Read that again", "every. single. day." | H2 |
| Staged run-up | 1 | "Here's the thing", "Hot take:", "Let's dive in" | H4 |
| Sayings that sound deep | 1 | "The real question is", "X is the new Y" | H3 |
| Arguing with no one | 1 | "I'm not saying", "Most people think" | H5 |
| Question-then-answer | 1 | "The result?", "Why? Because" | H2, P |
| Emoji bullets and arrows | 1–2 | ✅ 🚀 → lines | H20, W4 |
| Fake bold letters | 1 | 𝗕𝗼𝗹𝗱 Unicode maths letters | H19, W4 |
| Label: text bullets | 1 | "Label: explanation" rows, leaked markdown | H19, W4, W6 |
| Rule of three | 1 | "A, B, and C" triads, "Simple. Fast. Reliable." | H6, W3.5 |
| One-line paragraphs | 1 | six-plus short lines (LinkedIn "broetry") | H2, H7 |
| Hashtag stack | 1 | five or more hashtags | H20 |
| Engagement bait | 1 | "Agree?", "Repost if", "Comment X and I'll send" | H17, P |
| Inflated significance | 1–2 | "a testament to", "in today's fast-paced world", "game changer" | H13, W2.1 |
| Trailing -ing phrases | 1–2 | ", ensuring…", ", fostering…" | H15, W2.3 |
| Chatbot residue | 2 | "I hope this helps", "Here's a concise post", "[insert name]" | H22, W5 |
| Knowledge-limit hedges | 2 | "As of my last update" | H23, W5 |
| Summary markers | 1 | "In conclusion", "TL;DR", "Key takeaways" | W5, H24 |
| Curly quotes (off by default) | 1 | typographic quotes; phones add these, so noisy | H21, W4 |
| Borrowed authority | 1 | "Experts argue", "studies show" | H17, W2.5 |

Posts under 8 words are never scored. Deliberately **not** used: perfect grammar, formal tone,
transition words on their own. Wikipedia lists those as ineffective indicators.

## Sources

- W: Wikipedia, *Signs of AI writing* (WikiProject AI Cleanup):
  https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
- H: blader/humanizer skill, 26 patterns: https://github.com/blader/humanizer
- G: Graphite Growth "corrective framing" findings as reported by Gizmodo:
  https://gizmodo.com/this-matters-researchers-identify-thousands-of-new-tells-in-ai-writing-2000820447
- P: Pangram, *9 signs of AI writing*: https://www.pangram.com/signs-of-ai-writing
- X "Made with AI" label rollout: https://techweez.com/2026/03/02/x-rolls-out-made-with-ai-label/
- LinkedIn C2PA labels and "Seems like AI slop" button:
  https://www.socialmediatoday.com/news/linkedin-labels-ai-generated-content/716674/ ,
  https://ia.acs.org.au/article/2026/linkedin-adds--seems-like-ai-slop--button.html
- TikTok AI-generated labels:
  https://www.socialmediatoday.com/news/tiktok-officially-launches-new-in-stream-labels-for-ai-generated-content/694154/

## Known limits

- It is a heuristic. It will hide some human posts that happen to write like this, and miss AI
  posts that don't. The threshold and per-signal switches are there for exactly that.
- The platforms rename their markup now and then. If posts stop being hidden on one site, the
  selectors in `sites.js` are the first place to look. LinkedIn switched to a server-driven feed
  with obfuscated class names in 2026; the stable hooks are `componentkey^="update-card-focus"`
  for the post and `data-testid="expandable-text-box"` for its text (checked live 2026-11-13).
- A post hidden at exactly the threshold is a judgement call. A recruiter's "🎉 CONGRATULATIONS…
  and that's why…" post scores 3 and is hidden at the default; move the slider to 4 if that is
  too keen.
- The toolbar badge only shows if the Anti-Slop icon is pinned: click the puzzle-piece icon in
  the toolbar and pin it.
- Instagram home feed was checked live on 13 Nov 2026: posts are `article`s and the caption is a
  `span._aacu[dir=auto]` (the old `h1` is kept as a fallback). `_aacu` is one of Instagram's
  generated class names, so it may change without warning. The "AI info" label and the Reels tab
  have not yet been seen live.
- Label detection reads the text of the post chrome, so a label that is only an icon with no
  accessible text will be missed.
