# Chrome Web Store listing — Anti-Slop 0.2.0

Copy-ready text for each field in the Developer Dashboard. UK English.
Sources for the rules are at the bottom.

---

## Store listing tab

**Name** (max 75 characters)
```
Anti-Slop: hide AI slop from your feed
```

**Summary** (comes from the manifest `description`, max 132 characters)
```
Hides AI-labelled and AI-sounding posts on X, LinkedIn, TikTok and Instagram. Runs on your device, no AI calls.
```

**Category**: Social Networking
**Language**: English (United Kingdom)

**Description**: paste the whole of `store/description.txt` (about 5,100 of the 16,000 characters).
It scores 0 points on Anti-Slop's own detector with all 22 signals on. Check it again after any edit:
`node -e "const S=require('./extension/signals.js');console.log(S.score(require('fs').readFileSync('store/description.txt','utf8')))"`

**Graphics** (all in `store/assets/`, made by `node tools/make-store-assets.js`)
| Field | File | Size |
|---|---|---|
| Store icon | `icon-128.png` | 128×128, 96 px artwork with 16 px clear margin |
| Screenshot 1 | `screenshot-1.png` | 1280×800 — Hide AI slop from your feed |
| Screenshot 2 | `screenshot-2.png` | 1280×800 — See why each post was hidden |
| Screenshot 3 | `screenshot-3.png` | 1280×800 — You set how strict it is |
| Screenshot 4 | `screenshot-4.png` | 1280×800 — Your slop scorecard |
| Screenshot 5 | `screenshot-5.png` | 1280×800 — Your posts never leave your device |
| Small promo tile | `promo-small.png` | 440×280 |
| Marquee promo tile | `promo-marquee.png` | 1400×560 |

The screenshots use an invented demo feed (made-up people and posts, no platform branding).

**Official URL / Homepage URL**: https://oscarc178.github.io/anti-slop/
**Support URL**: https://github.com/OscarC178/anti-slop/issues

---

## Privacy tab

**Single purpose**
```
Anti-Slop hides posts on social media feeds (X, LinkedIn, TikTok and Instagram) that are labelled as AI-generated or that read like AI-generated writing, according to rules the user can adjust.
```

**Permission justifications**
| Permission | Justification to paste |
|---|---|
| `storage` | Saves the user's settings (sensitivity, signals, keywords, sites) and the local scorecard history of hidden posts. |
| `alarms` | Wakes the background script every few hours to send the previous day's anonymous total of hidden posts, if the user has not opted out. |
| `webNavigation` | Clears the toolbar badge count when the user navigates to a new page, so the number always matches the current page. |
| Host access (content scripts on x.com, twitter.com, linkedin.com, tiktok.com, instagram.com) | The extension must read post text and labels on these feeds to decide which posts to hide, and add the "Hidden" note in their place. It runs on no other sites. |

**Remote code**: No, I am not using remote code. (All JavaScript is in the package; the only network call is a JSON POST of daily totals.)

**Data usage — what the extension collects**
Tick: **User activity**. The daily totals are counts of posts hidden on each site, which reflect use of those sites.
Leave every other box unticked: no personally identifiable information, health, financial, authentication, personal communications, location, web history or website content leaves the device.

**Certify all three statements:**
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**: https://oscarc178.github.io/anti-slop/privacy.html

---

## Distribution tab
- Free. All regions. Public.

## Test instructions tab
```
No account or login is needed to test the extension itself. Open https://x.com, https://www.linkedin.com/feed/ or https://www.instagram.com/ while signed in to any account; posts that read like AI writing are collapsed to a "Hidden: reads like AI slop" note with a Show button. The toolbar popup shows the count, the settings and a Scorecard tab. The first time the popup opens it explains the anonymous daily totals and offers an opt-out tick box.
```

---

## Sources
- Program policies, Limited Use: https://developer.chrome.com/docs/webstore/program-policies/limited-use
- Disclosure requirements: https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements
- Spam and abuse (ratings, reviews): https://developer.chrome.com/docs/webstore/program-policies/spam-and-abuse
- Publishing steps: https://developer.chrome.com/docs/webstore/publish
- Image sizes: https://developer.chrome.com/docs/webstore/images
- Developer registration: https://developer.chrome.com/docs/webstore/register
