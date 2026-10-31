const { sendWaitlistEmail } = require('../lib/waitlist-email');

const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)+$/i;
const SIGNUP_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['email'],
  properties: {
    full_name: { type: ['string', 'null'], minLength: 1, maxLength: 120 },
    email: { type: 'string', maxLength: 320, format: 'email' },
    topic: { type: ['string', 'null'], maxLength: 1000 },
    website: { type: ['string', 'null'] } // honeypot: real users leave this empty
  }
};

const MAX_REQUEST_BYTES = 8 * 1024;
const UPSTREAM_TIMEOUT_MS = 5000;

// Best-effort per-IP rate limit. In-memory, so it is per serverless instance; the honeypot and
// the database unique index cover the rest.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const rateLimitHits = new Map();

function isRateLimited(request) {
  const forwarded = request.headers['x-forwarded-for'];
  const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || 'unknown';
  const now = Date.now();
  for (const [key, entry] of rateLimitHits) {
    if (entry.resetAt <= now) rateLimitHits.delete(key);
  }
  const entry = rateLimitHits.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  entry.count += 1;
  rateLimitHits.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

function resolveSiteUrl(request) {
  const configured = process.env.SITE_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch {
      console.error('SITE_URL is not a valid URL; falling back to the request host.');
    }
  }
  // Vercel's production domain; follows a custom domain automatically once one is added.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `https://${request.headers.host}`;
}

async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const contentType = request.headers['content-type'] || '';
  if (contentType.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
    return response.status(415).json({ error: 'Content-Type must be application/json.' });
  }

  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin) {
    let originUrl;
    try {
      originUrl = new URL(origin);
    } catch {
      return response.status(403).json({ error: 'Request origin is not allowed.' });
    }

    const isLocalDevelopment = originUrl.protocol === 'http:' &&
      (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1');
    if ((!isLocalDevelopment && originUrl.protocol !== 'https:') || !host || originUrl.host !== host) {
      return response.status(403).json({ error: 'Request origin is not allowed.' });
    }
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Early-access API is missing Supabase environment configuration.');
    return response.status(503).json({ error: 'Signup service is not configured.' });
  }

  let supabaseEndpoint;
  try {
    const projectUrl = new URL(supabaseUrl);
    if (projectUrl.protocol !== 'https:' || projectUrl.username || projectUrl.password ||
        projectUrl.search || projectUrl.hash || projectUrl.pathname !== '/') {
      throw new Error('Invalid Supabase project URL configuration.');
    }
    supabaseEndpoint = `${projectUrl.origin}/rest/v1/early_access_signups`;
  } catch (error) {
    console.error('Early-access API has an invalid Supabase URL configuration:', error);
    return response.status(503).json({ error: 'Signup service is not configured.' });
  }

  if (isRateLimited(request)) {
    response.setHeader('Retry-After', String(RATE_LIMIT_WINDOW_MS / 1000));
    return response.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const body = request.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return response.status(400).json({ error: 'Invalid signup data.' });
  }

  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > MAX_REQUEST_BYTES) {
    return response.status(413).json({ error: 'Signup data is too large.' });
  }

  const allowedFields = Object.keys(SIGNUP_BODY_SCHEMA.properties);
  const hasUnknownFields = Object.keys(body).some((field) => !allowedFields.includes(field));
  const hasRequiredFields = SIGNUP_BODY_SCHEMA.required.every((field) =>
    Object.prototype.hasOwnProperty.call(body, field)
  );
  if (hasUnknownFields || !hasRequiredFields) {
    return response.status(400).json({ error: 'Please check the signup fields and try again.' });
  }

  // Honeypot filled in => bot. Pretend it worked so it learns nothing; save and send nothing.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return response.status(200).json({ ok: true, status: 'created' });
  }

  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : '';
  const nameIsValid = body.full_name === undefined || body.full_name === null || typeof body.full_name === 'string';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  const topicIsValid = body.topic === undefined || body.topic === null || typeof body.topic === 'string';

  if (!topicIsValid ||
      !nameIsValid ||
      fullName.length > SIGNUP_BODY_SCHEMA.properties.full_name.maxLength ||
      email.length > SIGNUP_BODY_SCHEMA.properties.email.maxLength || !EMAIL_PATTERN.test(email) ||
      topic.length > SIGNUP_BODY_SCHEMA.properties.topic.maxLength) {
    return response.status(400).json({ error: 'Please check the signup fields and try again.' });
  }

  try {
    const upstream = await fetch(
      `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/early_access_signups`,
      {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        body: JSON.stringify({
          full_name: fullName || null,
          email,
          topic: topic || null
        })
      }
    );

    if (upstream.ok) {
      // Await the send: serverless functions may be frozen once the response goes out.
      // A mail failure must never fail the signup, which is already saved.
      let emailSent = true;
      try {
        await sendWaitlistEmail({ to: email, name: fullName, siteUrl: resolveSiteUrl(request) });
      } catch (error) {
        emailSent = false;
        console.error('Could not send the waitlist confirmation email:', error);
      }
      return response.status(200).json({ ok: true, status: 'created', emailSent });
    }

    console.error('Supabase rejected an early-access signup with status:', upstream.status);
    if (upstream.status === 404) {
      return response.status(503).json({ error: 'Signup service is not configured.' });
    }
    if (upstream.status === 409) {
      // Unique index on lower(email): this address is already on the waitlist. Send no email.
      return response.status(200).json({ ok: true, status: 'duplicate' });
    }
    if (upstream.status === 401 || upstream.status === 403) {
      return response.status(502).json({ error: 'Signup service rejected the request.' });
    }
    return response.status(502).json({ error: 'Signup service could not save the request.' });
  } catch (error) {
    console.error('Could not reach Supabase for an early-access signup:', error);
    return response.status(502).json({ error: 'Signup service could not be reached.' });
  }
}

handler.resetRateLimit = () => rateLimitHits.clear();
module.exports = handler;
