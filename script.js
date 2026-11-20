// Interactive journey checklist: selecting a step marks it and the earlier steps complete.
const journeySteps = [...document.querySelectorAll('.journey-step')];
journeySteps.forEach((step, index) => {
  step.addEventListener('click', () => {
    journeySteps.forEach((item, itemIndex) => {
      const complete = itemIndex <= index;
      item.classList.toggle('is-complete', complete);
      item.setAttribute('aria-pressed', String(itemIndex === index));
    });
  });
});

// Responsive navigation menu, including Escape and outside-click support.
const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('.primary-nav');
function closeMenu() {
  if (!menuToggle || !primaryNav) return;
  primaryNav.classList.remove('is-open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation menu');
}
if (menuToggle && primaryNav) {
  menuToggle.addEventListener('click', () => {
    const isOpen = primaryNav.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
  });
  primaryNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
  document.addEventListener('click', (event) => {
    if (!primaryNav.contains(event.target) && !menuToggle.contains(event.target)) closeMenu();
  });
}

// Smoothly reveal elements marked for scroll animation if more sections are added.
const revealItems = document.querySelectorAll('.reveal-on-scroll');
if ('IntersectionObserver' in window && revealItems.length) {
  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (entry.target.classList.contains('service-row')) {
        entry.target.classList.toggle('is-visible', entry.isIntersecting);
        return;
      }
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

// Keep the Services section pinned while native page scrolling moves its content.
const servicesSection = document.querySelector('.how-it-works-section');
const servicesViewport = servicesSection?.querySelector('.services-sticky-viewport');
const servicesContent = servicesSection?.querySelector('.services-scroll-content');
const siteHeader = document.querySelector('.site-header');
const reduceMotionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
if (servicesSection && servicesViewport && servicesContent && !reduceMotionPreference.matches) {
  let servicesScrollDistance = 0;
  let servicesStickyTop = 0;
  let servicesSectionTop = 0;
  let servicesFramePending = false;

  function updateServicesScroll() {
    servicesFramePending = false;
    const scrollProgress = servicesScrollDistance > 0
      ? Math.min(1, Math.max(0, (window.scrollY - (servicesSectionTop - servicesStickyTop)) / servicesScrollDistance))
      : 0;
    servicesContent.style.transform = `translate3d(0, ${-servicesScrollDistance * scrollProgress}px, 0)`;
  }

  function scheduleServicesScrollUpdate() {
    if (servicesFramePending) return;
    servicesFramePending = true;
    window.requestAnimationFrame(updateServicesScroll);
  }

  function measureServicesScrollTrack() {
    servicesSectionTop = servicesSection.getBoundingClientRect().top + window.scrollY;
    servicesStickyTop = siteHeader ? siteHeader.getBoundingClientRect().height : 0;
    const viewportHeight = Math.max(1, window.innerHeight - servicesStickyTop);
    servicesSection.style.setProperty('--services-sticky-top', `${servicesStickyTop}px`);
    servicesSection.style.setProperty('--services-viewport-height', `${viewportHeight}px`);

    servicesScrollDistance = Math.max(0, servicesContent.scrollHeight - viewportHeight);
    servicesSection.style.height = `${viewportHeight + servicesScrollDistance}px`;
    scheduleServicesScrollUpdate();
  }

  servicesSection.classList.add('is-scroll-controlled');
  measureServicesScrollTrack();
  window.addEventListener('scroll', scheduleServicesScrollUpdate, { passive: true });
  window.addEventListener('resize', measureServicesScrollTrack);
  window.addEventListener('load', measureServicesScrollTrack, { once: true });

  if ('ResizeObserver' in window) {
    const servicesResizeObserver = new ResizeObserver(measureServicesScrollTrack);
    servicesResizeObserver.observe(servicesContent);
    if (siteHeader) servicesResizeObserver.observe(siteHeader);
  }

  if (document.fonts) document.fonts.ready.then(measureServicesScrollTrack);
}

// Mark the current in-page navigation link as active while scrolling.
const sectionLinks = [...document.querySelectorAll('.primary-nav a[href^="#"]')];
const linkedSections = sectionLinks
  .map((link) => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);
let smoothScrollFrame = null;
let restoreScrollBehavior = null;

function cancelSmoothScroll() {
  if (smoothScrollFrame !== null) {
    window.cancelAnimationFrame(smoothScrollFrame);
    smoothScrollFrame = null;
  }
  if (restoreScrollBehavior) {
    restoreScrollBehavior();
    restoreScrollBehavior = null;
  }
}

function scrollToAnchor(target) {
  cancelSmoothScroll();

  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  restoreScrollBehavior = () => { root.style.scrollBehavior = previousScrollBehavior; };

  const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().height || 0;
  const targetMargin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const startY = window.scrollY;
  const endY = Math.max(0, startY + target.getBoundingClientRect().top - Math.max(headerHeight, targetMargin));
  const distance = endY - startY;

  if (Math.abs(distance) < 1) {
    cancelSmoothScroll();
    return;
  }

  const duration = Math.min(1000, Math.max(450, Math.abs(distance) * 0.35));
  let startTime;
  const animate = (time) => {
    if (startTime === undefined) startTime = time;
    const progress = Math.min(1, (time - startTime) / duration);
    const easedProgress = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    window.scrollTo(0, startY + distance * easedProgress);
    if (progress < 1) {
      smoothScrollFrame = window.requestAnimationFrame(animate);
    } else {
      smoothScrollFrame = null;
      restoreScrollBehavior();
      restoreScrollBehavior = null;
    }
  };

  smoothScrollFrame = window.requestAnimationFrame(animate);
}

['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach((eventName) => {
  window.addEventListener(eventName, cancelSmoothScroll, { passive: true });
});
document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const link = event.target.closest('a[href*="#"]');
  if (!link) return;

  const destination = new URL(link.href, window.location.href);
  if (destination.origin !== window.location.origin ||
      destination.pathname !== window.location.pathname ||
      destination.search !== window.location.search ||
      !destination.hash) return;

  const target = document.getElementById(decodeURIComponent(destination.hash.slice(1)));
  if (!target) return;

  event.preventDefault();
  if (window.location.hash !== destination.hash) {
    window.history.pushState(null, '', destination.hash);
  }
  scrollToAnchor(target);
});
sectionLinks.forEach((link) => {
  link.addEventListener('click', () => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;

    target.classList.remove('nav-arriving');
    void target.offsetWidth;
    target.classList.add('nav-arriving');
    window.setTimeout(() => target.classList.remove('nav-arriving'), 700);
  });
});
if ('IntersectionObserver' in window && linkedSections.length) {
  const activeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      sectionLinks.forEach((link) => {
        const active = link.getAttribute('href') === `#${entry.target.id}`;
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    });
  }, { rootMargin: '-25% 0px -60% 0px' });
  linkedSections.forEach((section) => activeObserver.observe(section));
}

// Mascots: each one waves and shows its speech bubble when it appears. The Zion | Zita
// switch under them swaps who is on stage; the newcomer waves right after the swap.
const mascotStage = document.querySelector('.mascot-stage');
const mascots = [...document.querySelectorAll('.robot-mascot')];
const mascotSwitch = document.querySelector('.mascot-switch');
const mascotButtons = [...document.querySelectorAll('.mascot-switch-btn')];
if (mascotStage && mascots.length && 'IntersectionObserver' in window) {
  const findMascot = (name) => mascots.find((item) => item.dataset.mascot === name);
  const playWave = (mascot) => {
    mascot.classList.remove('is-waving');
    void mascot.offsetWidth;
    mascot.classList.add('is-waving');
  };
  let currentMascot = 'zion';
  let switchTimer = null;
  mascots.forEach((item) => item.classList.add('wave-ready'));

  const placeMascotThumb = () => {
    if (!mascotSwitch) return;
    const active = mascotButtons.find((button) => button.classList.contains('is-active'));
    if (!active) return;
    mascotSwitch.style.setProperty('--thumb-x', active.offsetLeft + 'px');
    mascotSwitch.style.setProperty('--thumb-w', active.offsetWidth + 'px');
  };

  const chooseMascot = (name) => {
    if (name === currentMascot) return;
    const previous = findMascot(currentMascot);
    const next = findMascot(name);
    if (!previous || !next) return;
    currentMascot = name;
    mascotObserver.disconnect();
    mascotButtons.forEach((button) => {
      const active = button.dataset.mascot === name;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    placeMascotThumb();
    previous.classList.remove('is-active', 'is-waving');
    previous.setAttribute('aria-hidden', 'true');
    next.classList.add('is-active');
    next.removeAttribute('aria-hidden');
    window.clearTimeout(switchTimer);
    switchTimer = window.setTimeout(() => playWave(next), reduceMotionPreference.matches ? 0 : 400);
  };

  // First time the stage scrolls into view, the mascot on it waves.
  const mascotObserver = new IntersectionObserver((entries, observer) => {
    if (!entries[0].isIntersecting) return;
    playWave(findMascot(currentMascot));
    observer.disconnect();
  }, { threshold: 0.5 });
  mascotObserver.observe(mascotStage);

  mascotButtons.forEach((button) => button.addEventListener('click', () => chooseMascot(button.dataset.mascot)));
  placeMascotThumb();
  if (mascotSwitch) mascotSwitch.classList.add('has-thumb');
  window.addEventListener('resize', placeMascotThumb);
  if (document.fonts) document.fonts.ready.then(placeMascotThumb);
}

// Give in-page CTAs a small press response without blocking normal anchor navigation.
document.querySelectorAll('.header-cta, .outline-button').forEach((button) => {
  button.addEventListener('pointerdown', () => button.classList.add('is-pressed'));
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
    button.addEventListener(eventName, () => button.classList.remove('is-pressed'));
  });
});

// Store early-access signups through the server-side API route.
const earlyAccessForm = document.querySelector('#earlyAccessForm');
if (earlyAccessForm) {
  const earlyAccessStatus = document.querySelector('#earlyAccessStatus');
  const submitButton = earlyAccessForm.querySelector('button[type="submit"]');
  const defaultButtonText = submitButton.textContent;

  earlyAccessForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    earlyAccessStatus.textContent = '';
    earlyAccessStatus.dataset.state = '';

    const formData = new FormData(earlyAccessForm);
    const payload = {
      email: String(formData.get('emailAddress') || '').trim(),
      website: String(formData.get('website') || '')
    };

    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';
    earlyAccessStatus.textContent = 'Submitting your request...';

    try {
      const response = await fetch('/api/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.error('Early-access API request failed with status:', response.status);
        if (response.status === 429) {
          earlyAccessStatus.textContent = 'Too many attempts. Please wait a few minutes and try again.';
        } else if (response.status === 503) {
          earlyAccessStatus.textContent = 'The signup service is not configured yet. Please try again later.';
        } else {
          earlyAccessStatus.textContent = 'We could not submit your request. Please try again in a moment.';
        }
        earlyAccessStatus.dataset.state = 'error';
        return;
      }

      const result = await response.json().catch(() => ({}));
      earlyAccessForm.reset();
      if (result.status === 'duplicate') {
        earlyAccessStatus.textContent = "You're already in the waitlist!";
      } else if (result.emailSent === false) {
        earlyAccessStatus.textContent = "You're on the waitlist! We couldn't send the confirmation email, but we'll still be in touch.";
      } else {
        earlyAccessStatus.textContent = "You're on the waitlist! Check your inbox.";
      }
      earlyAccessStatus.dataset.state = 'success';
    } catch (error) {
      console.error('Could not reach the signup service:', error);
      earlyAccessStatus.textContent = 'We could not reach the signup service. Check your connection and try again.';
      earlyAccessStatus.dataset.state = 'error';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = defaultButtonText;
    }
  });
}

// Pricing: switch between Personal and Student plans. The white pill glides to the chosen
// button, the current cards fade out, then the new ones rise in one after another.
const pricingToggle = document.querySelector('.pricing-toggle');
const pricingToggleButtons = [...document.querySelectorAll('.pricing-toggle-btn')];
const pricingPanel = document.querySelector('#pricing-cards');
const pricingContainer = document.querySelector('.pricing-container');
if (pricingToggle && pricingToggleButtons.length && pricingPanel && pricingContainer) {
  let currentGroup = 'personal';
  let swapTimer = null;

  const moveThumb = () => {
    const active = pricingToggleButtons.find((button) => button.classList.contains('is-active'));
    if (!active) return;
    pricingToggle.style.setProperty('--thumb-x', active.offsetLeft + 'px');
    pricingToggle.style.setProperty('--thumb-w', active.offsetWidth + 'px');
  };

  const applyGroup = (group) => {
    document.querySelectorAll('[data-groups]').forEach((item) => {
      item.hidden = !item.dataset.groups.split(' ').includes(group);
    });
  };

  const showPlans = (group, focus) => {
    pricingToggleButtons.forEach((button) => {
      const active = button.dataset.group === group;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      if (active) {
        pricingPanel.setAttribute('aria-labelledby', button.id);
        if (focus) button.focus();
      }
    });
    moveThumb();
    if (group === currentGroup) return;

    // Which way the cards slide: toward Student is "next", back to Personal is "prev".
    const order = pricingToggleButtons.map((button) => button.dataset.group);
    pricingContainer.dataset.dir = order.indexOf(group) > order.indexOf(currentGroup) ? 'next' : 'prev';
    currentGroup = group;

    window.clearTimeout(swapTimer);
    pricingCleanup();
    // The pill stretches a little as it slides, then settles.
    pricingToggle.classList.remove('is-sliding');
    void pricingToggle.offsetWidth;
    pricingToggle.classList.add('is-sliding');
    window.setTimeout(() => pricingToggle.classList.remove('is-sliding'), 260);
    pricingContainer.classList.add('is-leaving');
    pricingPanel.classList.add('is-leaving');
    swapTimer = window.setTimeout(() => {
      pricingContainer.classList.remove('is-leaving');
      pricingPanel.classList.remove('is-leaving');
      applyGroup(group);
      pricingContainer.classList.add('is-entering');
      pricingPanel.classList.add('is-entering');
      swapTimer = window.setTimeout(pricingCleanup, 800);
    }, 200);
  };

  function pricingCleanup() {
    ['is-leaving', 'is-entering'].forEach((name) => {
      pricingContainer.classList.remove(name);
      pricingPanel.classList.remove(name);
    });
  }

  pricingToggleButtons.forEach((button, index) => {
    button.addEventListener('click', () => showPlans(button.dataset.group));
    button.addEventListener('keydown', (event) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = pricingToggleButtons[(index + step + pricingToggleButtons.length) % pricingToggleButtons.length];
      showPlans(next.dataset.group, true);
    });
  });

  // Place the pill without animating it the first time, then let later moves glide.
  moveThumb();
  pricingToggle.classList.add('has-thumb');
  window.addEventListener('resize', moveThumb);
  if (document.fonts) document.fonts.ready.then(moveThumb);
}

// Download section: Zion's speech bubble pops up first, then Zita's answers. After that they keep chatting with random,
// encouraging exchanges (Zion speaks, Zita replies) for as long as the section is on screen. Without JavaScript (or with
// reduced motion) the two intro bubbles are simply shown and nothing rotates.
const downloadWrap = document.querySelector('.download-wrap');
if (downloadWrap && 'IntersectionObserver' in window && !reduceMotionPreference.matches) {
  const zionBubble = downloadWrap.querySelector('.dl-zion .dl-bubble');
  const zetaBubble = downloadWrap.querySelector('.dl-zeta .dl-bubble');
  if (zionBubble && zetaBubble) {
    const introLines = [zionBubble.textContent, zetaBubble.textContent];
    // Keep every line short (about 32 characters) so a bubble never grows past two lines.
    const chatExchanges = [
      ['Ready to explore Z1P?', 'Tap here to get started!'],
      ['Think it through, step by step.', 'Then find your next move!'],
      ['Your life companion, on Android.', 'Download it and say hi!'],
      ['Got a big decision to make?', 'Z1P can help you work it out!'],
      ["Curious what's inside?", 'Download it and take a look!'],
      ["It's only a 98 MB download.", 'Quick to install. Try it today!'],
      ['Meet your thinking partner.', 'Get the Android app now!']
    ];
    const INTRO_MS = 6500;      // intro pops (0.3s and 1.9s) plus a pause before the first chat
    const REPLY_MS = 1900;      // Zita answers this long after Zion
    const GAP_MS = 5200;        // quiet time between exchanges
    let chatTimers = [];
    let lastExchange = -1;

    const later = (ms, fn) => chatTimers.push(window.setTimeout(fn, ms));
    const say = (bubble, text) => {
      bubble.classList.remove('is-popping');
      bubble.textContent = text;
      void bubble.offsetWidth;            // restart the pop animation
      bubble.classList.add('is-popping');
    };
    const nextExchange = () => {
      let pick;
      do { pick = Math.floor(Math.random() * chatExchanges.length); } while (pick === lastExchange && chatExchanges.length > 1);
      lastExchange = pick;
      say(zionBubble, chatExchanges[pick][0]);
      later(REPLY_MS, () => say(zetaBubble, chatExchanges[pick][1]));
      later(REPLY_MS + GAP_MS, nextExchange);
    };
    const startChat = () => { stopChat(); later(INTRO_MS, nextExchange); };
    const stopChat = () => {
      chatTimers.forEach((id) => window.clearTimeout(id));
      chatTimers = [];
      [zionBubble, zetaBubble].forEach((bubble, i) => { bubble.classList.remove('is-popping'); bubble.textContent = introLines[i]; });
    };

    downloadWrap.classList.add('dl-anim');
    new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        downloadWrap.classList.toggle('is-talking', entry.isIntersecting);
        if (entry.isIntersecting) startChat(); else stopChat();
      });
    }, { threshold: 0.35 }).observe(downloadWrap);
    window.dlChatDebug = { startChat, stopChat };   // handy for testing in the console
  }
}

// Pricing currency: show plan prices in the visitor's currency. PHP stays the base and the
// currency charged at checkout; other currencies are approximate conversions from
// pricing-config.js using rates served (and cached) by /api/rates.
(function () {
  const Pricing = window.Z1PPricing;
  const Cur = window.Z1PCurrency;
  const picker = document.querySelector('#currency-picker');
  if (!Pricing || !Cur || !picker) return;

  const button = document.querySelector('#currency-picker-btn');
  const buttonCode = document.querySelector('#currency-picker-code');
  const buttonName = document.querySelector('#currency-picker-name');
  const panel = document.querySelector('#currency-panel');
  const search = document.querySelector('#currency-search');
  const list = document.querySelector('#currency-list');
  const emptyMessage = document.querySelector('#currency-empty');
  const autoButton = document.querySelector('#currency-auto');
  const status = document.querySelector('#currency-status');
  const subtitle = document.querySelector('#pricing-subtitle');
  const cards = [...document.querySelectorAll('.pricing-card[data-plan]')];

  const STORAGE_KEY = 'z1p-currency';
  const locales = navigator.languages && navigator.languages.length ? [...navigator.languages] : [navigator.language || 'en'];
  const locale = locales[0];

  const readSaved = () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };
  const writeSaved = (code) => { try { localStorage.setItem(STORAGE_KEY, code); } catch { /* storage blocked: the choice lasts this visit only */ } };
  const clearSaved = () => { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } };

  let saved = Cur.isActiveCurrency(readSaved()) ? readSaved() : null;
  let serverCountry = null;
  let rates = null;                // normalized rates once loaded
  let ratesState = 'loading';      // 'loading' | 'ready' | 'failed'
  let currency = Cur.detectCurrency({ saved, country: null, locales }).currency;

  // Remember the original markup so choosing PHP restores the page exactly as written.
  const originals = cards.map((card) => {
    const price = card.querySelector('.plan-price');
    const note = card.querySelector('.plan-note');
    const period = price && price.querySelector('span');
    return { card, price, note, priceHTML: price ? price.innerHTML : '', noteText: note ? note.textContent : '', period: period ? period.textContent : '' };
  });
  const originalSubtitle = subtitle ? subtitle.textContent : '';
  const SUBTITLE_TAIL = " Plans don't renew automatically: when a paid period ends, the account returns to Free.";

  const nameCache = new Map();
  const symbolCache = new Map();
  const nameOf = (code) => { if (!nameCache.has(code)) nameCache.set(code, Cur.currencyName(code, locale)); return nameCache.get(code); };
  const symbolOf = (code) => { if (!symbolCache.has(code)) symbolCache.set(code, Cur.currencySymbol(code, locale)); return symbolCache.get(code); };
  const hasRate = (code) => code === Cur.BASE_CURRENCY || Boolean(rates && rates[code]);

  function makeEl(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function renderPrices() {
    const isBase = currency === Cur.BASE_CURRENCY;
    let longest = 0;
    for (const item of originals) {
      const { card, price, note } = item;
      if (!price) continue;
      card.querySelectorAll('.plan-price-note').forEach((el) => el.remove());
      price.className = 'plan-price';
      price.removeAttribute('aria-busy');
      if (note) note.textContent = item.noteText;

      const plan = Pricing.PLANS[card.dataset.plan];
      if (isBase || !plan) { price.innerHTML = item.priceHTML; continue; }

      const loading = ratesState === 'loading' && plan.php > 0;
      const view = Cur.priceView(plan.php, currency, ratesState === 'ready' ? rates : null, locale);
      const showOriginal = loading || view.state === 'unavailable';
      const amountText = showOriginal ? view.original : view.text;

      price.textContent = '';
      let label = null;
      if (!showOriginal && view.state === 'approx') label = 'Approx.';
      else if (view.state === 'free') label = 'Always free';
      if (label) price.append(makeEl('span', 'price-approx', label));
      price.append(document.createTextNode(amountText));
      if (item.period) price.append(makeEl('span', '', item.period));
      if (loading) price.setAttribute('aria-busy', 'true');

      let noteLine = '';
      if (loading) noteLine = 'Loading local price…';
      else if (view.state === 'unavailable') noteLine = 'Conversion unavailable · Charged in ' + Pricing.CHARGE_CURRENCY;
      else if (view.state === 'approx') noteLine = view.original + item.period + ' · Charged in ' + Pricing.CHARGE_CURRENCY;
      else if (view.state === 'free') noteLine = 'No charge in any currency';
      if (noteLine) {
        price.classList.add('has-note');
        price.after(makeEl('p', 'plan-price-note', noteLine));
      }

      longest = Math.max(longest, amountText.length);

      if (note && card.dataset.plan === 'semester' && view.state === 'approx') {
        const saving = Cur.convertFromPHP(Pricing.SEMESTER_SAVING_PHP, currency, rates);
        if (saving !== null) note.textContent = 'Paid per ' + Pricing.SEMESTER_MONTHS + '-month semester (save ' + Cur.formatMoney(saving, currency, locale) + ')';
      }
    }

    // One font size for every card, set by the longest amount, so the cards stay aligned.
    const sizeClass = longest > 14 ? 'price-xlong' : longest > 10 ? 'price-long' : '';
    if (sizeClass) originals.forEach((item) => item.price && item.price.classList.add(sizeClass));

    if (subtitle) {
      if (isBase || ratesState === 'loading') subtitle.textContent = originalSubtitle;
      else if (hasRate(currency)) {
        subtitle.textContent = 'Prices are approximate conversions into ' + nameOf(currency) + ' (' + currency + ') from Philippine pesos (₱), shown for reference. You are charged in ' + Pricing.CHARGE_CURRENCY + '.' + SUBTITLE_TAIL;
      } else {
        subtitle.textContent = 'Conversion to ' + nameOf(currency) + ' (' + currency + ') is unavailable, so prices are shown in Philippine pesos (₱).' + SUBTITLE_TAIL;
      }
    }
  }

  function renderButton() {
    buttonCode.textContent = currency;
    buttonName.textContent = nameOf(currency);
    autoButton.hidden = !saved;
  }

  // ----- selector -----
  let shown = [];
  let activeIndex = 0;
  const optionId = (code) => 'currency-option-' + code;

  function renderList(codes) {
    shown = codes;
    list.textContent = '';
    const fragment = document.createDocumentFragment();
    for (const code of codes) {
      const option = makeEl('li', 'currency-option');
      option.id = optionId(code);
      option.setAttribute('role', 'option');
      option.dataset.code = code;
      option.setAttribute('aria-selected', String(code === currency));
      option.append(makeEl('span', 'currency-option-code', code));
      const text = makeEl('span', 'currency-option-name', nameOf(code));
      if (ratesState === 'ready' && !hasRate(code)) text.append(makeEl('small', '', 'Conversion unavailable'));
      option.append(text);
      option.append(makeEl('span', 'currency-option-symbol', symbolOf(code)));
      fragment.append(option);
    }
    list.append(fragment);
    emptyMessage.hidden = codes.length > 0;
    list.hidden = codes.length === 0;
    setActive(Math.max(0, codes.indexOf(currency)), true);
  }

  function setActive(index, scroll) {
    if (!shown.length) { search.removeAttribute('aria-activedescendant'); return; }
    activeIndex = Math.min(Math.max(index, 0), shown.length - 1);
    list.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
    const el = document.getElementById(optionId(shown[activeIndex]));
    if (!el) return;
    el.classList.add('is-active');
    search.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  }

  function openPanel() {
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    search.value = '';
    renderList(Cur.searchCurrencies('', locale));
    search.focus();
  }

  function closePanel(returnFocus) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (returnFocus) button.focus();
  }

  function update() {
    renderButton();
    renderPrices();
  }

  function choose(code) {
    if (!Cur.isActiveCurrency(code)) return;
    saved = code;
    writeSaved(code);
    currency = code;
    update();
    status.textContent = 'Prices now shown in ' + nameOf(code) + ' (' + code + ').';
    closePanel(true);
  }

  button.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel(false)));
  search.addEventListener('input', () => renderList(Cur.searchCurrencies(search.value, locale)));
  search.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(activeIndex + 1, true); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(activeIndex - 1, true); }
    else if (event.key === 'Enter') { event.preventDefault(); if (shown[activeIndex]) choose(shown[activeIndex]); }
    else if (event.key === 'Escape') { event.preventDefault(); closePanel(true); }
  });
  list.addEventListener('click', (event) => {
    const option = event.target.closest('.currency-option');
    if (option) choose(option.dataset.code);
  });
  list.addEventListener('mousemove', (event) => {
    const option = event.target.closest('.currency-option');
    if (option) { const index = shown.indexOf(option.dataset.code); if (index !== activeIndex) setActive(index, false); }
  });
  autoButton.addEventListener('click', () => {
    saved = null;
    clearSaved();
    currency = Cur.detectCurrency({ country: serverCountry, locales }).currency;
    update();
    status.textContent = 'Using automatic detection: ' + nameOf(currency) + ' (' + currency + ').';
    closePanel(true);
  });
  picker.addEventListener('focusout', (event) => {
    if (event.relatedTarget && !picker.contains(event.relatedTarget)) closePanel(false);
  });
  document.addEventListener('click', (event) => { if (!picker.contains(event.target)) closePanel(false); });

  picker.hidden = false;
  update();

  // ----- data from the server -----
  const getJSON = (url) => fetch(url, { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));

  getJSON('/api/country')
    .then((data) => {
      serverCountry = data && data.country ? data.country : null;
      if (!saved) {
        const next = Cur.detectCurrency({ country: serverCountry, locales }).currency;
        if (next !== currency) { currency = next; update(); }
      }
    })
    .catch(() => { /* no country header (local preview): the browser locale is used */ });

  getJSON('/api/rates')
    .then((data) => {
      rates = Cur.normalizeRates(data && data.rates);
      ratesState = Object.keys(rates).length > 1 ? 'ready' : 'failed';
    })
    .catch(() => { ratesState = 'failed'; })
    .then(() => { update(); if (!panel.hidden) renderList(Cur.searchCurrencies(search.value, locale)); });
})();

// FAQ: answers slide open and closed instead of jumping, and opening one
// closes the others. Without JavaScript the <details> still open and close.
(function () {
  const list = document.querySelector('.faq-list');
  if (!list || !Element.prototype.animate) return;
  list.classList.add('faq-js');
  const items = [...list.querySelectorAll('details')];
  const EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const running = new Map();

  const animateAnswer = (item, opening) => {
    const answer = item.querySelector('.faq-answer');
    if (!answer) { item.open = opening; return; }
    running.get(item)?.cancel();
    // A closed <details> can still report its answer's full height, so start from 0.
    const startHeight = item.open ? answer.getBoundingClientRect().height : 0;
    item.classList.toggle('is-open', opening);
    if (opening) item.open = true;
    const endHeight = opening ? answer.scrollHeight : 0;
    const animation = answer.animate(
      [
        { height: startHeight + 'px', opacity: opening ? 0 : 1 },
        { height: endHeight + 'px', opacity: opening ? 1 : 0 }
      ],
      { duration: opening ? 420 : 320, easing: EASE }
    );
    running.set(item, animation);
    animation.onfinish = () => {
      running.delete(item);
      if (!opening) item.open = false;
    };
  };

  items.forEach((item) => {
    if (item.open) item.classList.add('is-open');
    item.querySelector('summary').addEventListener('click', (event) => {
      event.preventDefault();
      const opening = !item.classList.contains('is-open');
      if (opening) items.forEach((other) => { if (other !== item && other.classList.contains('is-open')) animateAnswer(other, false); });
      animateAnswer(item, opening);
    });
  });
})();
