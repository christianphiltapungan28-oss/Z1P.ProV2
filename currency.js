/*
 * Currency data and pure helpers for the pricing section. Works in the browser
 * (window.Z1PCurrency) and in Node (require), so the same code is tested and shipped.
 *
 * CURRENCY_COUNTRIES lists every ACTIVE official currency (ISO 4217) with the countries
 * that use it. Funds, precious metals, test codes and retired currencies are left out.
 * Recent changes already applied: Bulgaria joined the euro (BGN retired, 2026), Croatia
 * joined the euro (HRK retired, 2023), the Caribbean guilder (XCG) replaced the
 * Netherlands Antillean guilder, Zimbabwe Gold (ZWG) replaced ZWL, and the new Sierra
 * Leonean leone (SLE) replaced SLL.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Z1PCurrency = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const BASE_CURRENCY = 'PHP';

  // currency code -> space-separated ISO 3166-1 alpha-2 country codes that officially use it.
  const CURRENCY_COUNTRIES = {
    AED: 'AE', AFN: 'AF', ALL: 'AL', AMD: 'AM', AOA: 'AO', ARS: 'AR', AUD: 'AU CC CX HM KI NF NR TV',
    AWG: 'AW', AZN: 'AZ', BAM: 'BA', BBD: 'BB', BDT: 'BD', BHD: 'BH', BIF: 'BI', BMD: 'BM', BND: 'BN',
    BOB: 'BO', BRL: 'BR', BSD: 'BS', BTN: 'BT', BWP: 'BW', BYN: 'BY', BZD: 'BZ', CAD: 'CA', CDF: 'CD',
    CHF: 'CH LI', CLP: 'CL', CNY: 'CN', COP: 'CO', CRC: 'CR', CUP: 'CU', CVE: 'CV', CZK: 'CZ',
    DJF: 'DJ', DKK: 'DK FO GL', DOP: 'DO', DZD: 'DZ', EGP: 'EG', ERN: 'ER', ETB: 'ET',
    EUR: 'AD AT AX BE BG BL CY DE EE ES FI FR GF GP GR HR IE IT LT LU LV MC ME MF MQ MT NL PM PT RE SI SK SM TF VA XK YT',
    FJD: 'FJ', FKP: 'FK', GBP: 'GB GG GS IM JE', GEL: 'GE', GHS: 'GH', GIP: 'GI', GMD: 'GM', GNF: 'GN',
    GTQ: 'GT', GYD: 'GY', HKD: 'HK', HNL: 'HN', HTG: 'HT', HUF: 'HU', IDR: 'ID', ILS: 'IL PS',
    INR: 'IN', IQD: 'IQ', IRR: 'IR', ISK: 'IS', JMD: 'JM', JOD: 'JO', JPY: 'JP', KES: 'KE', KGS: 'KG',
    KHR: 'KH', KMF: 'KM', KPW: 'KP', KRW: 'KR', KWD: 'KW', KYD: 'KY', KZT: 'KZ', LAK: 'LA', LBP: 'LB',
    LKR: 'LK', LRD: 'LR', LSL: 'LS', LYD: 'LY', MAD: 'MA EH', MDL: 'MD', MGA: 'MG', MKD: 'MK', MMK: 'MM',
    MNT: 'MN', MOP: 'MO', MRU: 'MR', MUR: 'MU', MVR: 'MV', MWK: 'MW', MXN: 'MX', MYR: 'MY', MZN: 'MZ',
    NAD: 'NA', NGN: 'NG', NIO: 'NI', NOK: 'NO SJ BV', NPR: 'NP', NZD: 'NZ CK NU PN TK', OMR: 'OM',
    PAB: 'PA', PEN: 'PE', PGK: 'PG', PHP: 'PH', PKR: 'PK', PLN: 'PL', PYG: 'PY', QAR: 'QA', RON: 'RO',
    RSD: 'RS', RUB: 'RU', RWF: 'RW', SAR: 'SA', SBD: 'SB', SCR: 'SC', SDG: 'SD', SEK: 'SE', SGD: 'SG',
    SHP: 'SH', SLE: 'SL', SOS: 'SO', SRD: 'SR', SSP: 'SS', STN: 'ST', SYP: 'SY', SZL: 'SZ', THB: 'TH',
    TJS: 'TJ', TMT: 'TM', TND: 'TN', TOP: 'TO', TRY: 'TR', TTD: 'TT', TWD: 'TW', TZS: 'TZ', UAH: 'UA',
    UGX: 'UG', USD: 'US AS BQ EC FM GU IO MH MP PR PW SV TC TL UM VG VI', UYU: 'UY', UZS: 'UZ', VED: '',
    VES: 'VE', VND: 'VN', VUV: 'VU', WST: 'WS', XAF: 'CF CG CM GA GQ TD', XCD: 'AG AI DM GD KN LC MS VC',
    XCG: 'CW SX', XOF: 'BF BJ CI GW ML NE SN TG', XPF: 'NC PF WF', YER: 'YE', ZAR: 'ZA', ZMW: 'ZM', ZWG: 'ZW'
  };

  // Names for codes that older browsers' Intl.DisplayNames may not know yet.
  const FALLBACK_NAMES = {
    XCG: 'Caribbean Guilder', ZWG: 'Zimbabwe Gold', SLE: 'Sierra Leonean Leone',
    VED: 'Venezuelan Digital Bolívar', STN: 'São Tomé & Príncipe Dobra', MRU: 'Mauritanian Ouguiya'
  };

  // Currencies with no free-market rate, so any quote for them would be unreliable.
  const NO_RELIABLE_RATE = ['KPW', 'CUP', 'VED'];

  const ACTIVE_CURRENCIES = Object.keys(CURRENCY_COUNTRIES).sort();

  const COUNTRY_TO_CURRENCY = {};
  for (const code of ACTIVE_CURRENCIES) {
    for (const country of CURRENCY_COUNTRIES[code].split(' ').filter(Boolean)) COUNTRY_TO_CURRENCY[country] = code;
  }

  const ACTIVE_SET = new Set(ACTIVE_CURRENCIES);

  function isActiveCurrency(code) {
    return typeof code === 'string' && ACTIVE_SET.has(code);
  }

  function currencyForCountry(country) {
    if (typeof country !== 'string') return null;
    return COUNTRY_TO_CURRENCY[country.trim().toUpperCase()] || null;
  }

  // Region of a browser locale tag such as "en-US" or "ja-JP"; null when it has none.
  function regionOfLocale(tag) {
    if (typeof tag !== 'string' || !tag) return null;
    try {
      const region = new Intl.Locale(tag).region;
      return region ? region.toUpperCase() : null;
    } catch {
      return null;
    }
  }

  /*
   * Pick the currency to show. Priority:
   *   1. the visitor's saved manual choice
   *   2. the country reported by the hosting platform's header
   *   3. the region of the browser's locale(s)
   *   4. PHP
   */
  function detectCurrency({ saved, country, locales } = {}) {
    if (isActiveCurrency(saved)) return { currency: saved, source: 'saved' };
    const fromCountry = currencyForCountry(country);
    if (fromCountry) return { currency: fromCountry, source: 'country' };
    for (const tag of Array.isArray(locales) ? locales : []) {
      const fromLocale = currencyForCountry(regionOfLocale(tag));
      if (fromLocale) return { currency: fromLocale, source: 'locale' };
    }
    return { currency: BASE_CURRENCY, source: 'default' };
  }

  // Keep only usable rates for currencies we list: finite, positive, and not on the no-rate list.
  function normalizeRates(raw) {
    const rates = { [BASE_CURRENCY]: 1 };
    if (!raw || typeof raw !== 'object') return rates;
    for (const code of ACTIVE_CURRENCIES) {
      if (NO_RELIABLE_RATE.includes(code)) continue;
      const rate = Number(raw[code]);
      if (Number.isFinite(rate) && rate > 0) rates[code] = rate;
    }
    return rates;
  }

  // PHP amount -> amount in `currency`, or null when there is no reliable rate.
  function convertFromPHP(amountPHP, currency, rates) {
    if (!Number.isFinite(amountPHP) || amountPHP < 0) return null;
    if (amountPHP === 0) return 0; // free stays free in every currency
    if (currency === BASE_CURRENCY) return amountPHP;
    const rate = rates && rates[currency];
    if (!Number.isFinite(rate) || rate <= 0) return null;
    return amountPHP * rate;
  }

  // Intl picks the right number of decimals per currency (JPY 0, USD 2, KWD 3).
  function formatMoney(amount, currency, locale) {
    return new Intl.NumberFormat(locale || undefined, { style: 'currency', currency }).format(amount);
  }

  function fractionDigits(currency) {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  }

  /*
   * What to show for one plan price.
   *   state "base"        the selected currency is PHP: the original price, nothing extra
   *   state "free"        a free plan, shown as 0 in the selected currency
   *   state "approx"      a converted price (label "Approx.", original PHP shown smaller)
   *   state "unavailable" no reliable rate: the original PHP price plus "Conversion unavailable"
   */
  function priceView(amountPHP, currency, rates, locale) {
    // The original peso price is shown as written on the site: whole pesos, no ".00".
    const original = new Intl.NumberFormat(locale || undefined, { style: 'currency', currency: BASE_CURRENCY, maximumFractionDigits: Number.isInteger(amountPHP) ? 0 : 2 }).format(amountPHP);
    if (currency === BASE_CURRENCY) return { state: 'base', text: original, original };
    const converted = convertFromPHP(amountPHP, currency, rates);
    if (converted === null) return { state: 'unavailable', text: original, original };
    if (amountPHP === 0) return { state: 'free', text: formatMoney(0, currency, locale), original };
    return { state: 'approx', text: formatMoney(converted, currency, locale), original };
  }

  function currencyName(code, locale) {
    try {
      const name = new Intl.DisplayNames(locale || 'en', { type: 'currency' }).of(code);
      if (name && name !== code) return name;
    } catch {
      // fall through to the built-in names
    }
    return FALLBACK_NAMES[code] || code;
  }

  function currencySymbol(code, locale) {
    try {
      const part = new Intl.NumberFormat(locale || undefined, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
        .formatToParts(0)
        .find((p) => p.type === 'currency');
      return part ? part.value : code;
    } catch {
      return code;
    }
  }

  function normalizeText(value) {
    return String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  const searchIndexCache = new Map();

  // Lower-cased text a currency can be found by: code, name and the countries that use it.
  function searchText(code, locale) {
    const key = code + '|' + (locale || '');
    if (searchIndexCache.has(key)) return searchIndexCache.get(key);
    let regions = [];
    try {
      const display = new Intl.DisplayNames(locale || 'en', { type: 'region' });
      regions = CURRENCY_COUNTRIES[code].split(' ').filter(Boolean).map((c) => display.of(c) || c);
    } catch {
      regions = [];
    }
    const text = normalizeText([code, currencyName(code, locale), ...regions].join(' '));
    searchIndexCache.set(key, text);
    return text;
  }

  // Filter and rank currencies for the selector. An empty query returns the full list.
  function searchCurrencies(query, locale) {
    const q = normalizeText(query || '').trim();
    if (!q) return ACTIVE_CURRENCIES.slice();
    const scored = [];
    for (const code of ACTIVE_CURRENCIES) {
      const lowerCode = code.toLowerCase();
      const name = normalizeText(currencyName(code, locale));
      let rank = -1;
      if (lowerCode === q) rank = 0;
      else if (lowerCode.startsWith(q)) rank = 1;
      else if (name.startsWith(q)) rank = 2;
      else if (name.includes(q)) rank = 3;
      else if (searchText(code, locale).includes(q)) rank = 4;
      if (rank >= 0) scored.push({ code, rank });
    }
    scored.sort((a, b) => a.rank - b.rank || a.code.localeCompare(b.code));
    return scored.map((entry) => entry.code);
  }

  return {
    BASE_CURRENCY, CURRENCY_COUNTRIES, COUNTRY_TO_CURRENCY, ACTIVE_CURRENCIES, NO_RELIABLE_RATE,
    isActiveCurrency, currencyForCountry, regionOfLocale, detectCurrency, normalizeRates, convertFromPHP,
    formatMoney, fractionDigits, priceView, currencyName, currencySymbol, searchCurrencies
  };
});
