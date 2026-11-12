const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/ratings');

const originalFetch = global.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  handler.resetRateLimit();
  if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
});

function createResponse() {
  return {
    headers: {}, statusCode: 200,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
function post(body, headers = {}) {
  return { method: 'POST', headers: { host: 'example.com', origin: 'https://example.com', 'content-type': 'application/json', ...headers }, body };
}
function configure() {
  process.env.SUPABASE_URL = 'https://project-ref.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
}
const valid = { rating: 5, name: 'Mia', comment: 'Helps me think clearly.' };

test('rejects methods other than GET and POST', async () => {
  const res = createResponse();
  await handler({ method: 'DELETE', headers: {} }, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, POST');
});

test('saves a valid rating as a new row without choosing its status', async () => {
  configure();
  let call;
  global.fetch = async (url, options) => { call = { url, options }; return { ok: true, status: 201 }; };
  const res = createResponse();
  await handler(post(valid), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, status: 'pending' });
  assert.equal(call.url, 'https://project-ref.supabase.co/rest/v1/testimonials');
  assert.deepEqual(JSON.parse(call.options.body), { display_name: 'Mia', rating: 5, comment: 'Helps me think clearly.' });
  assert.equal('status' in JSON.parse(call.options.body), false);
});

test('a rating without a comment is stored with a null comment', async () => {
  configure();
  let sent;
  global.fetch = async (url, options) => { sent = JSON.parse(options.body); return { ok: true, status: 201 }; };
  const res = createResponse();
  await handler(post({ rating: 4, name: 'Leo' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.comment, null);
});

test('cleans control characters and extra whitespace', async () => {
  configure();
  let sent;
  global.fetch = async (url, options) => { sent = JSON.parse(options.body); return { ok: true, status: 201 }; };
  const res = createResponse();
  await handler(post({ rating: 5, name: '  Ana \u0000  Lee  ', comment: 'Great\u0007   app' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(sent.display_name, 'Ana Lee');
  assert.equal(sent.comment, 'Great app');
});

test('rejects bad ratings, names and comments without calling Supabase', async () => {
  configure();
  let called = false;
  global.fetch = async () => { called = true; return { ok: true }; };
  const cases = [
    { ...valid, rating: 0 }, { ...valid, rating: 6 }, { ...valid, rating: 4.5 }, { ...valid, rating: '5' }, { name: 'Mia' },
    { ...valid, name: '   ' }, { ...valid, name: 'x'.repeat(61) }, { ...valid, name: 42 },
    { ...valid, comment: 'x'.repeat(501) }, { ...valid, comment: { evil: true } },
    { ...valid, status: 'approved' }, { ...valid, id: 'abc' }
  ];
  for (const body of cases) {
    handler.resetRateLimit();
    const res = createResponse();
    await handler(post(body), res);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
  }
  assert.equal(called, false);
});

test('honeypot submissions look successful but save nothing', async () => {
  configure();
  let called = false;
  global.fetch = async () => { called = true; return { ok: true }; };
  const res = createResponse();
  await handler(post({ ...valid, website: 'http://spam.example' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(called, false);
});

test('rejects wrong content type and cross-origin posts', async () => {
  configure();
  global.fetch = async () => { throw new Error('should not be called'); };
  let res = createResponse();
  await handler(post(valid, { 'content-type': 'text/plain' }), res);
  assert.equal(res.statusCode, 415);
  res = createResponse();
  await handler(post(valid, { origin: 'https://evil.example' }), res);
  assert.equal(res.statusCode, 403);
});

test('rate limits repeated submissions from one IP', async () => {
  configure();
  global.fetch = async () => ({ ok: true, status: 201 });
  const codes = [];
  for (let i = 0; i < 5; i++) { const res = createResponse(); await handler(post(valid, { 'x-forwarded-for': '203.0.113.9' }), res); codes.push(res.statusCode); }
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test('returns 503 when Supabase is not configured', async () => {
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_PUBLISHABLE_KEY;
  const res = createResponse();
  await handler(post(valid), res);
  assert.equal(res.statusCode, 503);
});

test('GET lists only the approved rows and exposes only public fields', async () => {
  configure();
  let requested;
  global.fetch = async (url) => {
    requested = url;
    return { ok: true, json: async () => [{ display_name: 'Mia', rating: 5, comment: 'Loved it', created_at: '2026-11-01T00:00:00Z', email: 'secret@x.com', status: 'approved' }] };
  };
  const res = createResponse();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.match(requested, /status=eq\.approved/);
  assert.deepEqual(res.body.testimonials, [{ name: 'Mia', rating: 5, comment: 'Loved it', date: '2026-11-01T00:00:00Z' }]);
  assert.match(res.headers['Cache-Control'], /s-maxage=60/);
});

test('GET returns an empty list with a 502 when Supabase fails', async () => {
  configure();
  global.fetch = async () => ({ ok: false, status: 500 });
  const res = createResponse();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body.testimonials, []);
});
