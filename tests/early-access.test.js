const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const handler = require('../api/early-access');

const originalFetch = global.fetch;
const originalCreateTransport = nodemailer.createTransport;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

afterEach(() => {
  global.fetch = originalFetch;
  nodemailer.createTransport = originalCreateTransport;
  handler.resetRateLimit();
  for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL', 'SMTP_FROM_NAME', 'SITE_URL']) delete process.env[key];
  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;
  if (originalSupabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
  else process.env.SUPABASE_PUBLISHABLE_KEY = originalSupabaseKey;
});

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function createRequest(body, overrides = {}) {
  const { headers = {}, ...requestOverrides } = overrides;
  return {
    method: 'POST',
    headers: {
      host: 'example.com',
      origin: 'https://example.com',
      'content-type': 'application/json',
      ...headers
    },
    body,
    ...requestOverrides
  };
}

function configureSupabase() {
  process.env.SUPABASE_URL = 'https://project-ref.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
}

test('rejects non-POST requests without calling Supabase', async () => {
  const response = createResponse();
  await handler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('rejects non-JSON and cross-origin requests', async () => {
  configureSupabase();
  const contentTypeResponse = createResponse();
  await handler(createRequest({}, { headers: { 'content-type': 'text/plain' } }), contentTypeResponse);
  assert.equal(contentTypeResponse.statusCode, 415);

  const originResponse = createResponse();
  await handler(createRequest({}, { headers: { origin: 'https://attacker.example' } }), originResponse);
  assert.equal(originResponse.statusCode, 403);
});

test('rejects oversized signup payloads', async () => {
  configureSupabase();
  const response = createResponse();
  await handler(createRequest({ full_name: 'A', email: 'a@example.com', topic: 'x'.repeat(9000) }), response);
  assert.equal(response.statusCode, 413);
});

test('validates signup data before making an upstream request', async () => {
  configureSupabase();
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    return { ok: true };
  };
  const response = createResponse();
  await handler(createRequest({ full_name: '', email: 'not-an-email' }), response);
  assert.equal(response.statusCode, 400);
  assert.equal(fetchCalled, false);
});

test('sends validated signup data to Supabase with a bounded request timeout', async () => {
  configureSupabase();
  let upstreamRequest;
  global.fetch = async (url, options) => {
    upstreamRequest = { url, options };
    return { ok: true };
  };
  const response = createResponse();
  await handler(createRequest({ full_name: 'Ada Lovelace', email: 'ada@example.com', topic: 'Career' }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(upstreamRequest.url, 'https://project-ref.supabase.co/rest/v1/early_access_signups');
  assert.equal(upstreamRequest.options.headers.Authorization, `Bearer ${process.env.SUPABASE_PUBLISHABLE_KEY}`);
  assert.ok(upstreamRequest.options.signal instanceof AbortSignal);
  assert.equal(JSON.parse(upstreamRequest.options.body).full_name, 'Ada Lovelace');
});

function configureSmtp() {
  Object.assign(process.env, {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    SMTP_FROM_EMAIL: 'hello@example.com',
    SMTP_FROM_NAME: 'Z1P.Pro',
    SITE_URL: 'https://example.com'
  });
}

function stubMail(sent, options = {}) {
  nodemailer.createTransport = (config) => {
    sent.config = config;
    return {
      sendMail: async (message) => {
        if (options.fail) throw new Error('smtp down');
        sent.messages.push(message);
      }
    };
  };
}

test('sends a confirmation email over STARTTLS for a new signup', async () => {
  configureSupabase();
  configureSmtp();
  const sent = { messages: [] };
  stubMail(sent);
  global.fetch = async () => ({ ok: true });
  const response = createResponse();
  await handler(createRequest({ full_name: 'Ada Lovelace', email: 'ada@example.com' }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'created');
  assert.equal(sent.messages.length, 1);
  assert.equal(sent.config.secure, false);
  assert.equal(sent.config.requireTLS, true);
  const [message] = sent.messages;
  assert.equal(message.to, 'ada@example.com');
  assert.equal(message.subject, "You're on the waitlist! 🎉");
  assert.match(message.text, /^Hi Ada,/);
  assert.match(message.html, /Hi Ada,/);
  assert.match(message.html, /https:\/\/example\.com/);
});

test('uses implicit TLS on port 465 and escapes names in the HTML', async () => {
  configureSupabase();
  configureSmtp();
  process.env.SMTP_PORT = '465';
  const sent = { messages: [] };
  stubMail(sent);
  global.fetch = async () => ({ ok: true });
  await handler(createRequest({ full_name: '<script>x</script>', email: 'a@example.com' }), createResponse());
  assert.equal(sent.config.secure, true);
  assert.ok(!sent.messages[0].html.includes('<script>'));
});

test('does not send another email when the address is already on the waitlist', async () => {
  configureSupabase();
  configureSmtp();
  const sent = { messages: [] };
  stubMail(sent);
  global.fetch = async () => ({ ok: false, status: 409 });
  const response = createResponse();
  await handler(createRequest({ full_name: 'Ada', email: 'ada@example.com' }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'duplicate');
  assert.equal(sent.messages.length, 0);
});

test('keeps the signup successful when the email fails to send', async () => {
  configureSupabase();
  configureSmtp();
  stubMail({ messages: [] }, { fail: true });
  global.fetch = async () => ({ ok: true });
  const response = createResponse();
  await handler(createRequest({ full_name: 'Ada', email: 'ada@example.com' }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'created');
});

test('ignores honeypot submissions without saving or emailing', async () => {
  configureSupabase();
  configureSmtp();
  const sent = { messages: [] };
  stubMail(sent);
  let fetchCalled = false;
  global.fetch = async () => { fetchCalled = true; return { ok: true }; };
  const response = createResponse();
  await handler(createRequest({ full_name: 'Bot', email: 'bot@example.com', website: 'http://spam.example' }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(fetchCalled, false);
  assert.equal(sent.messages.length, 0);
});

test('rate limits repeated requests from one IP', async () => {
  configureSupabase();
  global.fetch = async () => ({ ok: true });
  let last;
  for (let i = 0; i < 6; i += 1) {
    last = createResponse();
    await handler(createRequest({ full_name: 'Ada', email: 'ada@example.com' }, { headers: { 'x-forwarded-for': '203.0.113.9' } }), last);
  }
  assert.equal(last.statusCode, 429);
});

test('accepts an email-only signup and greets with "Hi there"', async () => {
  configureSupabase();
  configureSmtp();
  const sent = { messages: [] };
  stubMail(sent);
  let saved;
  global.fetch = async (url, options) => { saved = JSON.parse(options.body); return { ok: true }; };
  const response = createResponse();
  await handler(createRequest({ email: 'new@example.com' }), response);
  assert.equal(response.statusCode, 200);
  assert.equal(saved.full_name, null);
  assert.match(sent.messages[0].text, /^Hi there,/);
});

test('embeds the logo as an inline attachment', async () => {
  configureSupabase();
  configureSmtp();
  const sent = { messages: [] };
  stubMail(sent);
  global.fetch = async () => ({ ok: true });
  await handler(createRequest({ email: 'logo@example.com' }), createResponse());
  const [message] = sent.messages;
  assert.match(message.html, /src="cid:z1p-logo"/);
  assert.equal(message.attachments[0].cid, 'z1p-logo');
  assert.ok(message.attachments[0].content.length > 1000);
});
