// GET  /api/ratings -> approved testimonials (public, cached briefly)
// POST /api/ratings -> save a new rating as "pending"; it only goes public once you approve it in Supabase.
const MAX_REQUEST_BYTES = 4 * 1024;
const UPSTREAM_TIMEOUT_MS = 5000;
const NAME_MAX = 60;
const COMMENT_MAX = 500;
const LIST_LIMIT = 12;
const ALLOWED_FIELDS = ['rating', 'name', 'comment', 'website']; // website = honeypot

// Best-effort per-IP limit (in memory, per serverless instance); the honeypot and length limits cover the rest.
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateLimitHits = new Map();

function isRateLimited(request) {
  const forwarded = request.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || 'unknown';
  const now = Date.now();
  for (const [key, entry] of rateLimitHits) if (entry.resetAt <= now) rateLimitHits.delete(key);
  const entry = rateLimitHits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  entry.count += 1;
  rateLimitHits.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

// Strip control characters and collapse runs of whitespace (comments keep their line breaks).
function cleanText(value, { multiline = false } = {}) {
  let text = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  text = multiline ? text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : text.replace(/\s+/g, ' ');
  return text.trim();
}

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  try {
    const project = new URL(url);
    if (project.protocol !== 'https:' || project.username || project.password || project.search || project.hash || project.pathname !== '/') return null;
    return { endpoint: `${project.origin}/rest/v1/testimonials`, key };
  } catch {
    return null;
  }
}

function originAllowed(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  let originUrl;
  try { originUrl = new URL(origin); } catch { return false; }
  const local = originUrl.protocol === 'http:' && (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1');
  return (local || originUrl.protocol === 'https:') && Boolean(request.headers.host) && originUrl.host === request.headers.host;
}

async function listApproved(response) {
  const config = supabaseConfig();
  if (!config) return response.status(503).json({ error: 'Reviews are not configured.', testimonials: [] });
  try {
    const query = `?select=display_name,rating,comment,created_at&status=eq.approved&order=created_at.desc&limit=${LIST_LIMIT}`;
    const upstream = await fetch(config.endpoint + query, {
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)
    });
    if (!upstream.ok) {
      console.error('Supabase rejected a testimonials read with status:', upstream.status);
      return response.status(502).json({ error: 'Reviews could not be loaded.', testimonials: [] });
    }
    const rows = await upstream.json();
    const testimonials = (Array.isArray(rows) ? rows : []).map((row) => ({
      name: String(row.display_name || ''),
      rating: Number(row.rating) || 0,
      comment: row.comment ? String(row.comment) : '',
      date: row.created_at
    }));
    response.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return response.status(200).json({ testimonials });
  } catch (error) {
    console.error('Could not reach Supabase for testimonials:', error);
    return response.status(502).json({ error: 'Reviews could not be loaded.', testimonials: [] });
  }
}

async function submitRating(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const contentType = request.headers['content-type'] || '';
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return response.status(415).json({ error: 'Content-Type must be application/json.' });
  }
  if (!originAllowed(request)) return response.status(403).json({ error: 'Request origin is not allowed.' });

  const config = supabaseConfig();
  if (!config) {
    console.error('Ratings API is missing or has an invalid Supabase configuration.');
    return response.status(503).json({ error: 'Reviews are not configured.' });
  }
  if (isRateLimited(request)) {
    response.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_MS / 1000));
    return response.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response.status(400).json({ error: 'Invalid review data.' });
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_REQUEST_BYTES) return response.status(413).json({ error: 'Review is too large.' });
  if (Object.keys(body).some((field) => !ALLOWED_FIELDS.includes(field))) return response.status(400).json({ error: 'Please check your review and try again.' });

  // Honeypot filled in => bot. Pretend it worked, save nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') return response.status(200).json({ ok: true, status: 'pending' });

  const invalid = () => response.status(400).json({ error: 'Please check your review and try again.' });
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) return invalid();
  if (typeof body.name !== 'string') return invalid();
  const name = cleanText(body.name);
  if (name.length < 1 || name.length > NAME_MAX) return invalid();
  if (body.comment !== undefined && body.comment !== null && typeof body.comment !== 'string') return invalid();
  const comment = typeof body.comment === 'string' ? cleanText(body.comment, { multiline: true }) : '';
  if (comment.length > COMMENT_MAX) return invalid();

  try {
    const upstream = await fetch(config.endpoint, {
      method: 'POST',
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      body: JSON.stringify({ display_name: name, rating: body.rating, comment: comment || null })
    });
    if (upstream.ok) return response.status(200).json({ ok: true, status: 'pending' });
    console.error('Supabase rejected a rating with status:', upstream.status);
    if (upstream.status === 404) return response.status(503).json({ error: 'Reviews are not configured.' });
    return response.status(502).json({ error: 'Your review could not be saved.' });
  } catch (error) {
    console.error('Could not reach Supabase for a rating:', error);
    return response.status(502).json({ error: 'Your review could not be saved.' });
  }
}

async function handler(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method === 'GET') return listApproved(response);
  if (request.method === 'POST') return submitRating(request, response);
  response.setHeader('Allow', 'GET, POST');
  response.setHeader('Cache-Control', 'no-store');
  return response.status(405).json({ error: 'Method not allowed.' });
}

handler.resetRateLimit = () => rateLimitHits.clear();
module.exports = handler;
