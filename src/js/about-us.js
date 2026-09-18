const siteHeader=document.getElementById('siteHeader');
const syncHeader=()=>{if(!siteHeader)return;siteHeader.classList.toggle('is-scrolled', window.scrollY > 18);};
syncHeader();window.addEventListener('scroll', syncHeader, {passive:true});


const toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('.main-nav');
toggle?.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');document.body.classList.toggle('menu-open',open)});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');document.body.classList.remove('menu-open');toggle?.setAttribute('aria-expanded','false')}));
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

(function(){
  const views=[...document.querySelectorAll('[data-about-view]')];
  const links=[...document.querySelectorAll('[data-about-target]')];
  const header=document.getElementById('siteHeader');
  const nav=document.querySelector('.main-nav');
  const toggle=document.querySelector('.menu-toggle');
  const valid=new Set(views.map(v=>v.dataset.aboutView));

  function showView(target, opts={}){
    if(!valid.has(target)) target='about-us';
    views.forEach(v=>v.classList.toggle('is-active',v.dataset.aboutView===target));
    links.forEach(a=>a.classList.toggle('is-active',a.dataset.aboutTarget===target));
    header?.classList.toggle('subpage-active',target!=='about-us');
    if(opts.updateHash!==false){ history.replaceState(null,'','#'+target); }
    if(opts.scroll!==false){ window.scrollTo({top:0,behavior:opts.smooth?'smooth':'auto'}); }
    nav?.classList.remove('open');
    document.body.classList.remove('menu-open');
    toggle?.setAttribute('aria-expanded','false');
  }

  links.forEach(link=>link.addEventListener('click',e=>{
    const target=link.dataset.aboutTarget;
    if(!target) return;
    e.preventDefault();
    showView(target,{smooth:false});
  }));

  const initial=location.hash.replace('#','');
  showView(valid.has(initial)?initial:'about-us',{updateHash:!!initial,scroll:false});
  window.addEventListener('hashchange',()=>{
    const target=location.hash.replace('#','');
    if(valid.has(target)) showView(target,{updateHash:false,scroll:false});
  });
})();
