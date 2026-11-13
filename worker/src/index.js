/*
 * Anti-Slop telemetry Worker (Cloudflare Workers + D1).
 *
 *   POST /v1/collect   public, write-only. Accepts the two payloads in validate.js and adds them to daily totals.
 *   GET  /v1/stats     private. Needs "Authorization: Bearer <STATS_TOKEN>" (a Wrangler secret). Returns totals as JSON.
 *   GET  /             private dashboard page; asks for the token in the browser and calls /v1/stats.
 *
 * Privacy: nothing that identifies a person or a post is stored. Rows are (day, site, reason) -> number.
 * The rate limiter keys on the caller's IP for 60 seconds inside Cloudflare; the IP is never written to D1.
 */
import { validate, MAX_BODY } from './validate.js';
import DASHBOARD from './dashboard.html';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...extra } });

async function collect(request, env) {
  // Rate limit per IP: plenty for a real install (one or two calls a day), stops casual flooding.
  if (env.LIMITER) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const { success } = await env.LIMITER.limit({ key: ip });
    if (!success) return json({ ok: false, error: 'slow down' }, 429, CORS);
  }
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ ok: false, error: 'too large' }, 413, CORS);
  let body;
  try { body = JSON.parse(text); } catch { return json({ ok: false, error: 'bad json' }, 400, CORS); }
  const r = validate(body);
  if (!r.ok) return json({ ok: false, error: r.error }, 400, CORS);
  const p = r.value;

  if (p.type === 'install') {
    await env.DB.prepare(
      `INSERT INTO installs (day, ext, n) VALUES (?1, ?2, 1)
       ON CONFLICT(day, ext) DO UPDATE SET n = n + 1`).bind(p.day, p.ext).run();
  } else {
    const stmts = p.counts.map(c => env.DB.prepare(
      `INSERT INTO hidden (day, site, kind, n) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(day, site, kind) DO UPDATE SET n = n + excluded.n`).bind(p.day, c.site, c.kind, c.n));
    // One "report" per install per finished day: a rough count of active installs, with no ID needed.
    stmts.push(env.DB.prepare(
      `INSERT INTO reports (day, ext, n) VALUES (?1, ?2, 1)
       ON CONFLICT(day, ext) DO UPDATE SET n = n + 1`).bind(p.day, p.ext));
    await env.DB.batch(stmts);
  }
  return json({ ok: true }, 200, CORS);
}

// Constant-time comparison so the token cannot be guessed from response timing.
function sameToken(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function stats(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!env.STATS_TOKEN || !sameToken(auth.replace(/^Bearer\s+/i, ''), env.STATS_TOKEN)) {
    return json({ ok: false, error: 'unauthorised' }, 401);
  }
  const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('days') || '30', 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const [hidden, installs, reports] = await env.DB.batch([
    env.DB.prepare('SELECT day, site, kind, n FROM hidden WHERE day >= ?1 ORDER BY day').bind(since),
    env.DB.prepare('SELECT day, SUM(n) AS n FROM installs WHERE day >= ?1 GROUP BY day ORDER BY day').bind(since),
    env.DB.prepare('SELECT day, SUM(n) AS n FROM reports WHERE day >= ?1 GROUP BY day ORDER BY day').bind(since),
  ]);
  const totals = await env.DB.prepare(
    `SELECT (SELECT COALESCE(SUM(n),0) FROM hidden) AS hidden, (SELECT COALESCE(SUM(n),0) FROM installs) AS installs`).first();
  return json({ ok: true, since, totals, hidden: hidden.results, installs: installs.results, reports: reports.results },
    200, { 'Cache-Control': 'no-store' });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (pathname === '/v1/collect' && request.method === 'POST') return await collect(request, env);
      if (pathname === '/v1/stats' && request.method === 'GET') return await stats(request, env);
      if (pathname === '/' && request.method === 'GET') {
        return new Response(DASHBOARD, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' } });
      }
      return json({ ok: false, error: 'not found' }, 404);
    } catch (e) {
      return json({ ok: false, error: 'server error' }, 500, CORS);
    }
  },
};
