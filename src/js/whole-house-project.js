(function () {
  'use strict';

  const body = document.body;
  const header = document.getElementById('siteHeader') || document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');

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
})();
