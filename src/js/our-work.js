(function () {
  'use strict';

  const body = document.body;
  const header = document.getElementById('siteHeader') || document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  const views = Array.from(document.querySelectorAll('[data-portfolio-view]'));
  const validViews = new Set(views.map((section) => section.dataset.portfolioView));
  const pageTitle = 'Seattle Remodeling Portfolio | Silver Peak Design Build';

  function syncHeader() {
    if (header) header.classList.toggle('is-scrolled', window.scrollY > 18);
  }

  syncHeader();
  window.addEventListener('scroll', syncHeader, { passive: true });

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      body.classList.toggle('menu-open', open);
    });
    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', function () {
        if (window.innerWidth <= 1180) {
          nav.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
          body.classList.remove('menu-open');
        }
      });
    });
  }

  document.querySelectorAll('.portfolio-dropdown a[href]').forEach((link) => {
    const destination = new URL(link.href, window.location.href);
    if (destination.pathname === window.location.pathname && destination.hash) {
      link.dataset.portfolioTarget = decodeURIComponent(destination.hash.slice(1));
    }
  });

  const portfolioLinks = Array.from(document.querySelectorAll('[data-portfolio-target]'));

  document.querySelectorAll('.filter-btn').forEach((button) => {
    button.addEventListener('click', function () {
      const filter = button.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
      document.querySelectorAll('.project-card').forEach((card) => {
        card.hidden = filter !== 'all' && card.dataset.category !== filter;
      });
    });
  });

  function resolveLocation() {
    const raw = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!raw || raw === 'overview') return { view: 'overview', anchor: 'overview' };
    if (raw === 'projects') return { view: 'overview', anchor: 'projects' };
    if (raw.startsWith('gallery-')) {
      const project = raw.slice('gallery-'.length);
      if (validViews.has(project)) return { view: project, anchor: raw };
    }
    if (validViews.has(raw)) return { view: raw, anchor: raw };
    return { view: 'overview', anchor: 'overview' };
  }

  function showView(options, smooth) {
    const isOverview = options.view === 'overview';
    body.classList.add('portfolio-js-ready');
    body.classList.toggle('portfolio-subpage-active', !isOverview);
    if (header) header.classList.toggle('subpage-active', !isOverview);

    views.forEach((section) => {
      const active = section.dataset.portfolioView === options.view;
      section.classList.toggle('is-active', active);
      section.hidden = !active;
      section.setAttribute('aria-hidden', active ? 'false' : 'true');
    });

    portfolioLinks.forEach((link) => {
      const active = link.dataset.portfolioTarget === options.view;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    const activeSection = document.querySelector('[data-portfolio-view="' + options.view + '"]');
    const projectTitle = activeSection && activeSection.dataset.portfolioTitle;
    document.title = !isOverview && projectTitle ? projectTitle + ' | Silver Peak Design Build' : pageTitle;

    window.requestAnimationFrame(function () {
      const destination = document.getElementById(options.anchor) || activeSection;
      if (!destination) return;
      const offset = header ? header.offsetHeight + 18 : 0;
      const top = destination.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    });
  }

  portfolioLinks.forEach((link) => {
    link.addEventListener('click', function (event) {
      const target = link.dataset.portfolioTarget;
      if (!target || !validViews.has(target)) return;
      event.preventDefault();
      const nextHash = target === 'overview' ? '#overview' : '#' + target;
      if (window.location.hash === nextHash) showView(resolveLocation(), true);
      else window.location.hash = nextHash;
    });
  });

  window.addEventListener('hashchange', function () {
    showView(resolveLocation(), true);
  });
  showView(resolveLocation(), false);

  const reveals = Array.from(document.querySelectorAll('.sp-reveal'));
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -35px' });
    reveals.forEach((element) => observer.observe(element));
  } else {
    reveals.forEach((element) => element.classList.add('is-visible'));
  }
}());
