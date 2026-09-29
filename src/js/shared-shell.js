document.querySelectorAll('.site-header .nav-dropdown').forEach((dropdown)=>{
  const trigger=dropdown.querySelector('.nav-dropdown-trigger');
  if(!trigger)return;
  const setExpanded=(expanded)=>trigger.setAttribute('aria-expanded',String(expanded));
  setExpanded(false);
  dropdown.addEventListener('mouseenter',()=>setExpanded(true));
  dropdown.addEventListener('mouseleave',()=>setExpanded(false));
  dropdown.addEventListener('focusin',()=>setExpanded(true));
  dropdown.addEventListener('focusout',(event)=>{if(!dropdown.contains(event.relatedTarget))setExpanded(false)});
});

/* Each page script opens and closes .main-nav its own way. This mirrors the
   result onto the toggle (the X icon keys off aria-expanded) and the body
   scroll lock, and closes the menu on Escape or when the window widens past
   the mobile breakpoint, which otherwise left the page locked at desktop size. */
(()=>{
  const nav=document.querySelector('.site-header .main-nav');
  const toggle=document.querySelector('.site-header .menu-toggle');
  if(!nav||!toggle)return;
  const sync=()=>{
    const open=nav.classList.contains('open');
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'Close navigation':'Open navigation');
    document.body.classList.toggle('menu-open',open);
  };
  new MutationObserver(sync).observe(nav,{attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown',(event)=>{
    if(event.key!=='Escape'||!nav.classList.contains('open'))return;
    nav.classList.remove('open');
    toggle.focus();
  });
  window.matchMedia('(max-width:1180px)').addEventListener('change',(event)=>{if(!event.matches)nav.classList.remove('open')});
})();

/* In the mobile menu, About Us, Services and Our Work start closed. The arrow
   button added beside each one opens or closes its links; the section name
   itself still links to its page. The button is hidden on desktop, where the
   links open on hover, and every section closes again with the menu. The
   class is is-expanded because services.js already uses is-open for hover. */
(()=>{
  const nav=document.querySelector('.site-header .main-nav');
  if(!nav)return;
  const setters=[];
  nav.querySelectorAll('.nav-dropdown').forEach((dropdown,index)=>{
    const trigger=dropdown.querySelector('.nav-dropdown-trigger');
    const menu=dropdown.querySelector('.nav-dropdown-menu');
    if(!trigger||!menu)return;
    if(!menu.id)menu.id=`nav-submenu-${index+1}`;
    const label=trigger.textContent.trim();
    const button=document.createElement('button');
    button.type='button';
    button.className='nav-submenu-toggle';
    button.setAttribute('aria-controls',menu.id);
    const setOpen=(open)=>{
      dropdown.classList.toggle('is-expanded',open);
      button.setAttribute('aria-expanded',String(open));
      button.setAttribute('aria-label',`${open?'Hide':'Show'} ${label} links`);
    };
    setOpen(false);
    button.addEventListener('click',()=>setOpen(!dropdown.classList.contains('is-expanded')));
    trigger.after(button);
    dropdown.classList.add('has-submenu-toggle');
    setters.push(setOpen);
  });
  new MutationObserver(()=>{
    if(!nav.classList.contains('open'))setters.forEach((setOpen)=>setOpen(false));
  }).observe(nav,{attributes:true,attributeFilter:['class']});
})();
