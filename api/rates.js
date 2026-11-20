// Server-side exchange rates, quoted per 1 Philippine peso (PHP).
// The provider is called here, never from the browser, and the result is cached so a page
// visit does not cost an upstream request. The optional API key stays in an environment
// variable (EXCHANGE_RATE_API_KEY); without it the keyless open.er-api.com feed is used.
const { normalizeRates } = require('../currency');

const CACHE_TTL_MS = 60 * 60 * 1000; // refresh at most once an hour per server instance
const MAX_RATE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // rates older than a week are not reliable
const FETCH_TIMEOUT_MS = 5000;

let cache = null; // { body, fetchedAt }

function providerRequest() {
  const key = process.env.EXCHANGE_RATE_API_KEY;
  if (key) return { url: `https://v6.exchangerate-api.com/v6/${encodeURIComponent(key)}/latest/PHP`, field: 'conversion_rates' };
  return { url: 'https://open.er-api.com/v6/latest/PHP', field: 'rates' };
}

async function fetchRates() {
  const { url, field } = providerRequest();
  const upstream = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!upstream.ok) throw new Error(`Rate provider answered ${upstream.status}`);
  const data = await upstream.json();
  if (data.result !== 'success' || !data[field]) throw new Error('Rate provider returned no rates');

  const updatedMs = Number(data.time_last_update_unix) * 1000;
  if (Number.isFinite(updatedMs) && Date.now() - updatedMs > MAX_RATE_AGE_MS) throw new Error('Rate provider data is stale');

  const rates = normalizeRates(data[field]);
  if (Object.keys(rates).length < 2) throw new Error('Rate provider returned no usable rates');
  return {
    base: 'PHP',
    rates,
    updatedAt: Number.isFinite(updatedMs) ? new Date(updatedMs).toISOString() : new Date().toISOString()
  };
}

async function handler(request, response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ error: 'Method not allowed.' });
  }

  const now = Date.now();
  if (!cache || now - cache.fetchedAt > CACHE_TTL_MS) {
    try {
      cache = { body: await fetchRates(), fetchedAt: now };
    } catch (error) {
      console.error('Could not refresh exchange rates:', error.message);
      if (!cache) {
        // Nothing cached: let the page fall back to PHP prices. Do not let the CDN keep the failure.
        response.setHeader('Cache-Control', 'no-store');
        return response.status(503).json({ error: 'Exchange rates are unavailable.' });
      }
      // Keep serving the last good rates rather than failing.
    }
  }

  // The CDN keeps the answer for an hour and may serve it a day longer while it refreshes.
  response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return response.status(200).json(cache.body);
}

handler.resetCache = () => { cache = null; };
module.exports = handler;
