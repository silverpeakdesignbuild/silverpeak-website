(function(){var h=document.getElementById('siteHeader')||document.querySelector('.site-header');if(!h)return;function u(){h.classList.toggle('is-scrolled',window.scrollY>18)}u();window.addEventListener('scroll',u,{passive:true});})();

(function(){
  const header = document.getElementById('siteHeader');
  const views = document.querySelectorAll('[data-service-view]');
  const links = document.querySelectorAll('[data-service-target]');
  const cards = document.querySelectorAll('.service-overview-card');
  const dropdown = document.querySelector('.service-dropdown');
  const valid = new Set(Array.from(views).map(v => v.getAttribute('data-service-view')));

  function activeViewId(){
    const active = document.querySelector('[data-service-view].is-active');
    return active ? active.getAttribute('data-service-view') : 'overview';
  }

  function showView(id, shouldScroll=true){
    const target = valid.has(id) ? id : 'overview';
    views.forEach(view => view.classList.toggle('is-active', view.getAttribute('data-service-view') === target));
    links.forEach(link => link.classList.toggle('is-active', link.getAttribute('data-service-target') === target));
    if (header) header.classList.toggle('subpage-active', target !== 'overview');
    if (history.replaceState) history.replaceState(null, '', '#' + target);
    if (shouldScroll) window.scrollTo({top:0, behavior:'smooth'});
  }

  function updateHeader(){
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 20);
    header.classList.toggle('subpage-active', activeViewId() !== 'overview');
  }

  links.forEach(link => {
    link.addEventListener('click', function(e){
      const id = this.getAttribute('data-service-target');
      if (!id || !valid.has(id)) return;
      e.preventDefault();
      showView(id, true);
      if (dropdown) dropdown.classList.remove('is-open');
    });
  });

  cards.forEach(card => {
    card.addEventListener('click', function(){
      const id = this.getAttribute('data-service-target');
      showView(id, true);
    });
  });

  if (dropdown) {
    let closeTimer;
    const open = () => { clearTimeout(closeTimer); dropdown.classList.add('is-open'); };
    const close = () => { clearTimeout(closeTimer); closeTimer = setTimeout(() => dropdown.classList.remove('is-open'), 160); };
    dropdown.addEventListener('mouseenter', open);
    dropdown.addEventListener('mouseleave', close);
    dropdown.addEventListener('focusin', open);
    dropdown.addEventListener('focusout', e => { if (!dropdown.contains(e.relatedTarget)) close(); });
  }

  window.addEventListener('scroll', updateHeader, {passive:true});

  /* The header dropdown links are plain anchors to /services/#<service>. On a
     fresh page load the hash is read below, but clicking one while already on
     this page only changes the hash - which fires no click handler here and
     previously left the panel unchanged. Reacting to hashchange also makes the
     browser Back and Forward buttons switch panels. */
  window.addEventListener('hashchange', function(){
    showView((location.hash || '#overview').slice(1), true);
  });

  const initial = (location.hash || '#overview').slice(1);
  showView(initial, false);
  updateHeader();

  document.querySelectorAll('.faq-question').forEach((button) => {
    button.addEventListener('click', function(){
      const item = this.closest('.faq-item');
      const answer = item ? item.querySelector('.faq-answer') : null;
      const isOpen = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!isOpen));
      if (answer) answer.hidden = isOpen;
      if (item) item.classList.toggle('is-open', !isOpen);
    });
  });

})();

(function(){
  const header=document.getElementById('siteHeader');
  const menu=document.querySelector('.main-nav');
  const menuToggle=document.querySelector('.menu-toggle');
  const dropdown=document.querySelector('.service-dropdown');
  const trigger=dropdown ? dropdown.querySelector('.nav-dropdown-trigger') : null;

  if(menuToggle && menu){
    menuToggle.addEventListener('click', function(e){
      e.preventDefault();
      const open=menu.classList.toggle('open');
      this.setAttribute('aria-expanded', String(open));
      this.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
      document.body.classList.toggle('menu-open', open);
    });
  }
  if(trigger && dropdown){
    trigger.addEventListener('click', function(e){
      if(window.matchMedia('(max-width:1180px)').matches){
        e.preventDefault();
        dropdown.classList.toggle('is-open');
      }
    });
  }
  document.querySelectorAll('.main-nav a:not(.nav-dropdown-trigger)').forEach(function(a){
    a.addEventListener('click', function(){
      if(window.matchMedia('(max-width:1180px)').matches && menu){
        menu.classList.remove('open');
        document.body.classList.remove('menu-open');
        menuToggle?.setAttribute('aria-expanded','false');
        menuToggle?.setAttribute('aria-label','Open navigation');
      }
    });
  });

  const revealTargets=document.querySelectorAll(
    '[data-service-view="overview"] .section-head, .service-overview-card, '+
    '.service-hero-copy, .service-hero-image, .service-dark-card, .service-copy-panel, '+
    '.mini-process-grid article, .service-faq-wrap > .eyebrow, .service-faq-wrap > h2, .faq-item, .cta-shell'
  );
  revealTargets.forEach(function(el){ el.classList.add('sp-reveal'); });

  if('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    const io=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){ entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    },{threshold:.08,rootMargin:'0px 0px -40px 0px'});
    revealTargets.forEach(function(el){ io.observe(el); });
  }else{
    revealTargets.forEach(function(el){ el.classList.add('is-visible'); });
  }

  /* Keep active service views from inheriting hidden animation state after navigation. */
  document.querySelectorAll('[data-service-target]').forEach(function(link){
    link.addEventListener('click', function(){
      requestAnimationFrame(function(){
        const active=document.querySelector('[data-service-view].is-active');
        if(active){
          active.querySelectorAll('.sp-reveal').forEach(function(el){
            const r=el.getBoundingClientRect();
            if(r.top < window.innerHeight * .95){ el.classList.add('is-visible'); }
          });
        }
      });
    });
  });

  if(header){
    const sync=function(){ header.classList.toggle('is-scrolled', window.scrollY > 18); };
    sync();
    window.addEventListener('scroll',sync,{passive:true});
  }
})();
