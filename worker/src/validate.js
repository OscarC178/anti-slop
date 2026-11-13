/*
 * Anti-Slop telemetry — payload checks. Pure functions, shared by the Worker and the tests.
 *
 * The extension only ever sends two shapes (as text/plain JSON, so browsers skip the CORS preflight):
 *   counts:  {v:1, type:"counts", ext:"0.2.0", day:"2026-11-12", counts:[{site:"x", kind:"signal", n:14}, ...]}
 *   install: {v:1, type:"install", ext:"0.2.0"}
 * Nothing else is accepted: no IDs, no URLs, no post text. Anything unexpected is rejected outright.
 */
export const SITES = ['x', 'linkedin', 'tiktok', 'instagram'];
export const KINDS = ['signal', 'label', 'keyword'];
export const MAX_N = 5000;          // hides per site+reason per day from one install; generous
export const MAX_BODY = 2048;       // bytes
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXT_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function isoDay(d) { return d.toISOString().slice(0, 10); }

// Returns {ok:true, value} or {ok:false, error}. `now` is injectable for tests.
export function validate(body, now = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'not an object' };
  if (body.v !== 1) return { ok: false, error: 'bad version' };
  if (typeof body.ext !== 'string' || !EXT_RE.test(body.ext)) return { ok: false, error: 'bad ext' };

  if (body.type === 'install') {
    if (Object.keys(body).length !== 3) return { ok: false, error: 'unexpected fields' };
    return { ok: true, value: { type: 'install', ext: body.ext, day: isoDay(now) } };
  }

  if (body.type !== 'counts') return { ok: false, error: 'bad type' };
  if (Object.keys(body).length !== 5) return { ok: false, error: 'unexpected fields' };
  if (typeof body.day !== 'string' || !DAY_RE.test(body.day)) return { ok: false, error: 'bad day' };
  // Only the last 8 days, never today or the future (days are sent once finished; local time zones vary by a day).
  const day = new Date(body.day + 'T00:00:00Z');
  if (isNaN(day)) return { ok: false, error: 'bad day' };
  const ageDays = (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - day.getTime()) / 86400000;
  if (ageDays < -1 || ageDays > 8) return { ok: false, error: 'day out of range' };

  if (!Array.isArray(body.counts) || body.counts.length === 0 || body.counts.length > SITES.length * KINDS.length) {
    return { ok: false, error: 'bad counts' };
  }
  const seen = new Set();
  const counts = [];
  for (const c of body.counts) {
    if (!c || typeof c !== 'object' || Object.keys(c).length !== 3) return { ok: false, error: 'bad count entry' };
    if (!SITES.includes(c.site) || !KINDS.includes(c.kind)) return { ok: false, error: 'bad site or kind' };
    if (!Number.isInteger(c.n) || c.n < 1 || c.n > MAX_N) return { ok: false, error: 'bad n' };
    const k = c.site + '|' + c.kind;
    if (seen.has(k)) return { ok: false, error: 'duplicate entry' };
    seen.add(k);
    counts.push({ site: c.site, kind: c.kind, n: c.n });
  }
  return { ok: true, value: { type: 'counts', ext: body.ext, day: body.day, counts } };
}
