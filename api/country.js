// Tells the page which country the visitor is in, using the hosting platform's header.
// Vercel sets x-vercel-ip-country (an ISO 3166-1 alpha-2 code). Not cacheable: it differs per visitor.
function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    return response.status(405).json({ error: 'Method not allowed.' });
  }
  const raw = request.headers['x-vercel-ip-country'];
  const value = (Array.isArray(raw) ? raw[0] : raw || '').toString().trim().toUpperCase();
  // "XX" (unknown) and "T1" (Tor) are not real countries.
  const country = /^[A-Z]{2}$/.test(value) && value !== 'XX' && value !== 'T1' ? value : null;
  return response.status(200).json({ country });
}

module.exports = handler;
