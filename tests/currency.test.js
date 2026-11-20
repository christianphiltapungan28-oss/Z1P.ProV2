const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const Cur = require('../currency');
const Pricing = require('../pricing-config');
const ratesHandler = require('../api/rates');
const countryHandler = require('../api/country');

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  ratesHandler.resetCache();
  delete process.env.EXCHANGE_RATE_API_KEY;
});

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

// A provider answer: 1 PHP is worth these amounts.
const SAMPLE_RATES = { PHP: 1, USD: 0.0171, JPY: 2.62, KWD: 0.00525, EUR: 0.0148, CAD: 0.0239, AUD: 0.0262, XOF: 9.7 };
function providerAnswer(overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ result: 'success', time_last_update_unix: Math.floor(Date.now() / 1000), rates: SAMPLE_RATES, ...overrides })
  };
}

// ---- automatic detection ----

test('detects the currency for the Philippines, the United States and Japan from the country header', async () => {
  const expected = { PH: 'PHP', US: 'USD', JP: 'JPY' };
  for (const [country, currency] of Object.entries(expected)) {
    const response = createResponse();
    countryHandler({ method: 'GET', headers: { 'x-vercel-ip-country': country } }, response);
    assert.equal(response.body.country, country);
    assert.equal(Cur.detectCurrency({ country: response.body.country }).currency, currency);
  }
});

test('falls back to the browser locale region when there is no country header', () => {
  assert.deepEqual(Cur.detectCurrency({ country: null, locales: ['en-PH'] }), { currency: 'PHP', source: 'locale' });
  assert.deepEqual(Cur.detectCurrency({ country: null, locales: ['en-US', 'en'] }), { currency: 'USD', source: 'locale' });
  assert.deepEqual(Cur.detectCurrency({ country: null, locales: ['ja-JP'] }), { currency: 'JPY', source: 'locale' });
  // Skips a locale with no region and uses the next one.
  assert.equal(Cur.detectCurrency({ locales: ['en', 'fr-CA'] }).currency, 'CAD');
});

test('the country header takes priority over the browser locale', () => {
  assert.equal(Cur.detectCurrency({ country: 'JP', locales: ['en-US'] }).currency, 'JPY');
});

test('defaults to PHP when the country or currency cannot be determined', () => {
  for (const input of [{}, { country: null, locales: [] }, { country: 'XX' }, { country: 'ZZ', locales: ['en'] }, { country: 12 }, { locales: ['not a locale'] }]) {
    assert.deepEqual(Cur.detectCurrency(input), { currency: 'PHP', source: 'default' });
  }
});

test('the country endpoint ignores unknown and malformed values', () => {
  for (const value of [undefined, '', 'XX', 'T1', 'usa', '1', 'P']) {
    const response = createResponse();
    countryHandler({ method: 'GET', headers: value === undefined ? {} : { 'x-vercel-ip-country': value } }, response);
    assert.equal(response.body.country, null, `header ${JSON.stringify(value)}`);
  }
  const lower = createResponse();
  countryHandler({ method: 'GET', headers: { 'x-vercel-ip-country': 'jp' } }, lower);
  assert.equal(lower.body.country, 'JP');
  assert.equal(lower.headers['Cache-Control'], 'private, no-store');
});

// ---- saved choice ----

test('a saved manual choice overrides automatic detection', () => {
  assert.deepEqual(Cur.detectCurrency({ saved: 'EUR', country: 'JP', locales: ['en-US'] }), { currency: 'EUR', source: 'saved' });
  assert.equal(Cur.detectCurrency({ saved: 'PHP', country: 'JP' }).currency, 'PHP');
  // A saved value that is not an active currency is ignored.
  assert.equal(Cur.detectCurrency({ saved: 'BGN', country: 'JP' }).currency, 'JPY');
  assert.equal(Cur.detectCurrency({ saved: 'not-a-code', country: 'JP' }).currency, 'JPY');
});

// ---- currency list ----

test('the selector lists every active official currency, including shared ones', () => {
  const codes = Cur.ACTIVE_CURRENCIES;
  assert.equal(new Set(codes).size, codes.length, 'no duplicates');
  for (const code of ['PHP', 'USD', 'CAD', 'AUD', 'EUR', 'XOF', 'XAF', 'XCD', 'XPF', 'XCG', 'ZWG', 'SLE', 'JPY', 'KWD']) {
    assert.ok(codes.includes(code), `${code} is listed`);
  }
  // Retired currencies are not offered.
  for (const code of ['BGN', 'HRK', 'ANG', 'ZWL', 'SLL', 'CUC', 'XAU', 'XDR', 'XTS']) assert.ok(!codes.includes(code), `${code} is not listed`);
  assert.ok(codes.length >= 150, `expected the full ISO 4217 active set, got ${codes.length}`);
  assert.deepEqual(Cur.searchCurrencies('', 'en'), codes, 'an empty search shows every currency');
});

test('every listed currency is valid, named, and mapped to countries', () => {
  const seenCountries = new Map();
  for (const code of Cur.ACTIVE_CURRENCIES) {
    assert.match(code, /^[A-Z]{3}$/);
    assert.doesNotThrow(() => Cur.formatMoney(1, code, 'en'), `${code} formats`);
    assert.ok(Cur.currencyName(code, 'en').length > 3, `${code} has a name`);
    const countries = Cur.CURRENCY_COUNTRIES[code].split(' ').filter(Boolean);
    if (code !== 'VED') assert.ok(countries.length > 0, `${code} has a country`);
    for (const country of countries) {
      assert.match(country, /^[A-Z]{2}$/);
      assert.ok(!seenCountries.has(country), `${country} is mapped to both ${seenCountries.get(country)} and ${code}`);
      seenCountries.set(country, code);
    }
  }
  assert.ok(seenCountries.size >= 235, `country coverage: ${seenCountries.size}`);
  assert.equal(Cur.currencyForCountry('de'), 'EUR');
  assert.equal(Cur.currencyForCountry('SN'), 'XOF');
  assert.equal(Cur.currencyForCountry('BG'), 'EUR');
});

test('currencies that share a symbol can be told apart by name and code', () => {
  const names = ['USD', 'CAD', 'AUD'].map((code) => Cur.currencyName(code, 'en'));
  assert.equal(new Set(names).size, 3);
  assert.deepEqual(names, ['US Dollar', 'Canadian Dollar', 'Australian Dollar']);
});

test('search finds currencies by code, name or country', () => {
  assert.equal(Cur.searchCurrencies('jpy', 'en')[0], 'JPY');
  assert.ok(Cur.searchCurrencies('yen', 'en').includes('JPY'));
  assert.ok(Cur.searchCurrencies('senegal', 'en').includes('XOF'));
  assert.ok(Cur.searchCurrencies('côte', 'en').includes('XOF'), 'accents are ignored');
  const dollars = Cur.searchCurrencies('dollar', 'en');
  for (const code of ['USD', 'CAD', 'AUD']) assert.ok(dollars.includes(code));
  assert.deepEqual(Cur.searchCurrencies('zzzzzz', 'en'), []);
});

// ---- conversion and formatting ----

test('converted prices are calculated from the original PHP amounts', () => {
  const rates = Cur.normalizeRates(SAMPLE_RATES);
  for (const [id, plan] of Object.entries(Pricing.PLANS)) {
    assert.equal(Cur.convertFromPHP(plan.php, 'USD', rates), plan.php === 0 ? 0 : plan.php * SAMPLE_RATES.USD, id);
  }
  assert.equal(Pricing.SEMESTER_SAVING_PHP, 46);
});

test('free plans stay free in every currency', () => {
  const rates = Cur.normalizeRates(SAMPLE_RATES);
  for (const code of Cur.ACTIVE_CURRENCIES) {
    assert.equal(Cur.convertFromPHP(Pricing.PLANS.free.php, code, rates), 0, code);
    // Free stays free even when there is no rate at all.
    assert.equal(Cur.priceView(0, code, null, 'en').state, code === 'PHP' ? 'base' : 'free', code);
  }
  assert.equal(Cur.priceView(0, 'JPY', Cur.normalizeRates(SAMPLE_RATES), 'en').text, '¥0');
  assert.equal(Cur.priceView(0, 'USD', Cur.normalizeRates(SAMPLE_RATES), 'en').text, '$0.00');
});

test('JPY shows zero decimals and KWD shows three', () => {
  const rates = Cur.normalizeRates(SAMPLE_RATES);
  assert.equal(Cur.fractionDigits('JPY'), 0);
  assert.equal(Cur.fractionDigits('KWD'), 3);
  assert.equal(Cur.fractionDigits('USD'), 2);
  const yen = Cur.priceView(99, 'JPY', rates, 'en');
  assert.equal(yen.state, 'approx');
  assert.equal(yen.text, '¥259'); // 99 * 2.62 = 259.38
  const dinar = Cur.priceView(99, 'KWD', rates, 'en');
  assert.match(dinar.text, /^KWD\s?0\.520$/); // 99 * 0.00525 = 0.51975
  assert.equal(Cur.priceView(99, 'USD', rates, 'en').text, '$1.69');
});

test('the original PHP price is always available to show beside a converted one', () => {
  const view = Cur.priceView(199, 'USD', Cur.normalizeRates(SAMPLE_RATES), 'en');
  assert.equal(view.original, '₱199');
  assert.equal(Cur.priceView(199, 'PHP', null, 'en').state, 'base');
  assert.equal(Cur.priceView(199, 'PHP', null, 'en').text, '₱199');
});

test('a currency with no reliable rate falls back to the PHP price', () => {
  const rates = Cur.normalizeRates(SAMPLE_RATES);
  for (const code of ['ISK', 'VED', 'KPW', 'CUP']) {
    const view = Cur.priceView(99, code, rates, 'en');
    assert.equal(view.state, 'unavailable', code);
    assert.equal(view.text, '₱99');
  }
  // No rates at all (provider down) is the same fallback.
  assert.equal(Cur.priceView(99, 'USD', null, 'en').state, 'unavailable');
  assert.equal(Cur.priceView(99, 'USD', {}, 'en').text, '₱99');
});

test('unusable rates are discarded', () => {
  const rates = Cur.normalizeRates({ USD: 'abc', JPY: -2, EUR: 0, CAD: null, AUD: 0.026, KPW: 130, CUP: 24 });
  assert.deepEqual(Object.keys(rates).sort(), ['AUD', 'PHP']);
  assert.deepEqual(Cur.normalizeRates(null), { PHP: 1 });
});

// ---- server-side rates ----

test('rates are fetched on the server and cached between visits', async () => {
  let calls = 0;
  global.fetch = async (url) => { calls += 1; assert.match(String(url), /^https:\/\/open\.er-api\.com\/v6\/latest\/PHP$/); return providerAnswer(); };

  const first = createResponse();
  await ratesHandler({ method: 'GET', headers: {} }, first);
  const second = createResponse();
  await ratesHandler({ method: 'GET', headers: {} }, second);

  assert.equal(calls, 1, 'one upstream request serves both visits');
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.base, 'PHP');
  assert.equal(first.body.rates.USD, SAMPLE_RATES.USD);
  assert.equal(first.body.rates.PHP, 1);
  assert.match(first.headers['Cache-Control'], /s-maxage=3600/);
  assert.deepEqual(second.body, first.body);
});

test('the API key stays on the server', async () => {
  process.env.EXCHANGE_RATE_API_KEY = 'secret-key-123';
  let requested;
  global.fetch = async (url) => {
    requested = String(url);
    return { ok: true, status: 200, json: async () => ({ result: 'success', time_last_update_unix: Math.floor(Date.now() / 1000), conversion_rates: SAMPLE_RATES }) };
  };
  const response = createResponse();
  await ratesHandler({ method: 'GET', headers: {} }, response);
  assert.equal(requested, 'https://v6.exchangerate-api.com/v6/secret-key-123/latest/PHP');
  assert.equal(response.statusCode, 200);
  assert.ok(!JSON.stringify(response.body).includes('secret-key-123'));
  assert.ok(!JSON.stringify(response.headers).includes('secret-key-123'));
});

test('without a cache and with the provider down, the endpoint reports unavailable and is not cached', async () => {
  global.fetch = async () => { throw new Error('network down'); };
  const response = createResponse();
  await ratesHandler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('stale provider data is rejected', async () => {
  global.fetch = async () => providerAnswer({ time_last_update_unix: Math.floor(Date.now() / 1000) - 30 * 24 * 3600 });
  const response = createResponse();
  await ratesHandler({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 503);
});

test('the endpoint only allows GET and HEAD', async () => {
  const response = createResponse();
  await ratesHandler({ method: 'POST', headers: {} }, response);
  assert.equal(response.statusCode, 405);
});
