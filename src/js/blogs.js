(function(){var h=document.getElementById('siteHeader')||document.querySelector('.site-header');if(!h)return;function u(){h.classList.toggle('is-scrolled',window.scrollY>18)}u();window.addEventListener('scroll',u,{passive:true});})();

const siteHeader=document.getElementById('siteHeader');
const syncHeader=()=>{if(!siteHeader)return;siteHeader.classList.toggle('is-scrolled', window.scrollY > 18);};
syncHeader();window.addEventListener('scroll', syncHeader, {passive:true});


const toggle=document.querySelector('.menu-toggle'),nav=document.querySelector('.main-nav');
toggle?.addEventListener('click',()=>{const open=nav.classList.toggle('open');toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');document.body.classList.toggle('menu-open',open)});
nav?.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');document.body.classList.remove('menu-open');toggle?.setAttribute('aria-expanded','false')}));
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
