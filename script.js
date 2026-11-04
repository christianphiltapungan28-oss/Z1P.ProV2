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

// Zion waves once (and his speech bubble pops in) the first time he scrolls into view.
const robotMascot = document.querySelector('.robot-mascot');
if (robotMascot && 'IntersectionObserver' in window) {
  robotMascot.classList.add('wave-ready');
  const waveObserver = new IntersectionObserver((entries, observer) => {
    if (!entries[0].isIntersecting) return;
    robotMascot.classList.add('is-waving');
    observer.disconnect();
  }, { threshold: 0.5 });
  waveObserver.observe(robotMascot);
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

// Pricing: switch between Personal and Student plans.
const pricingToggleButtons = [...document.querySelectorAll('.pricing-toggle-btn')];
const pricingPanel = document.querySelector('#pricing-cards');
if (pricingToggleButtons.length && pricingPanel) {
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
    document.querySelectorAll('[data-groups]').forEach((item) => {
      item.hidden = !item.dataset.groups.split(' ').includes(group);
    });
    pricingPanel.classList.remove('is-switching');
    void pricingPanel.offsetWidth;
    pricingPanel.classList.add('is-switching');
  };
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
}
