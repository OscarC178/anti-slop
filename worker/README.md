# Anti-Slop telemetry Worker

A Cloudflare Worker plus a D1 database that keeps **daily totals of hidden posts** and nothing else.

| Route | Who | What |
|---|---|---|
| `POST /v1/collect` | the extension | adds a day's totals (or one install ping) to the database |
| `GET /v1/stats?days=30` | you, with the stats token | totals as JSON |
| `GET /` | you | a small stats dashboard; asks for the token |

Stored rows are `(day, site, reason) → number`, `(day, version) → installs` and `(day, version) → installs that reported`.
No IDs, IP addresses, URLs or post text are stored. Payload rules are in `src/validate.js`; anything else is rejected.
The write side cannot have a secret (anyone can unpack the extension), so it is protected by strict validation,
a per-IP limit of 10 requests a minute, and a cap of 5,000 per number.

## Deploy (one-off, about 10 minutes)

Wrangler is installed with mise (`npm:wrangler`). Run these from this folder.

1. `wrangler login`: opens the browser to sign in to Cloudflare (free plan is enough).
2. `wrangler d1 create anti-slop-telemetry`: copy the `database_id` it prints into `wrangler.toml`.
3. `wrangler d1 execute anti-slop-telemetry --remote --file=schema.sql`: creates the tables.
4. `wrangler secret put STATS_TOKEN`: paste a long random password; it unlocks the stats page.
5. `wrangler deploy`: prints the address, e.g. `https://anti-slop-telemetry.<account>.workers.dev`.
6. Put `<that address>/v1/collect` into `TELEMETRY_URL` at the top of `extension/background.js`.
7. Open the address in a browser and enter the token to see the dashboard.

## Test locally

```
node --test test/                                            # payload rules
printf 'STATS_TOKEN=local-test-token\n' > .dev.vars
wrangler d1 execute anti-slop-telemetry --local --file=schema.sql
wrangler dev --port 8787 --ip 127.0.0.1                      # then run ../tests/e2e.js: it includes a real send
```

## Cost
On Cloudflare's free plan, D1 allows 100,000 rows written a day
(https://developers.cloudflare.com/d1/platform/pricing/) and Workers allow 100,000 requests a day.
One daily report writes one row per site-and-reason with posts, plus one: usually 3 to 6 rows, at most 13.
So the free plan covers roughly 15,000 to 30,000 reporting installs a day. Past that, the Workers paid
plan costs $5 a month. The Worker stops writing when the free limit is hit, and the extension retries
the next day for up to a week.
