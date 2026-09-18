import { readFile, readdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const errors = [], warnings = [];

let BASE = (process.env.BASE_PATH || '').trim().replace(/\/+$/, '');
if (BASE === '/') BASE = '';
if (BASE && !BASE.startsWith('/')) BASE = '/' + BASE;
const CUSTOM = process.env.CUSTOM_DOMAIN === '1';

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

/** Does a site-absolute URL resolve to a real file in dist? */
function resolves(url) {
  let clean = url.split('#')[0].split('?')[0];
  if (!clean.startsWith('/')) return true;             // external / protocol-relative
  if (BASE) {
    if (clean === BASE) clean = '/';
    else if (clean.startsWith(BASE + '/')) clean = clean.slice(BASE.length);
    else { errors.push(`reference missing base path ${BASE}: ${url}`); return false; }
  }
  const p = path.join(DIST, decodeURIComponent(clean));
  if (existsSync(p) && statSync(p).isFile()) return true;
  if (existsSync(p) && statSync(p).isDirectory())
    return existsSync(path.join(p, 'index.html'));
  if (existsSync(p + '.html')) return true;            // GitHub Pages extension-less
  return false;
}

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

const files = await walk(DIST);
const html = files.filter(f => f.endsWith('.html'));
let linkCount = 0, imgCount = 0;

for (const f of html) {
  const rel = '/' + path.relative(DIST, f).replaceAll(path.sep, '/');
  const src = await readFile(f, 'utf8');

  for (const m of src.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    linkCount++;
    if (!resolves(m[1])) errors.push(`${rel}: dead reference -> ${m[1]}`);
  }
  for (const m of src.matchAll(/srcset="([^"]+)"/g)) {
    for (const cand of m[1].split(',')) {
      const url = cand.trim().split(/\s+/)[0];
      imgCount++;
      if (url.startsWith('/') && !resolves(url))
        errors.push(`${rel}: dead srcset entry -> ${url}`);
    }
  }
  if (rel.endsWith('/index.html') || rel === '/index.html') {
    const canon = [...src.matchAll(/rel="canonical"/g)].length;
    if (canon === 0) warnings.push(`${rel}: no canonical`);
    if (canon > 1)  errors.push(`${rel}: ${canon} canonical tags`);
    if (!/<title>[^<]{5,}<\/title>/.test(src)) errors.push(`${rel}: missing/empty <title>`);
    if (!/name="description"/.test(src))       warnings.push(`${rel}: no meta description`);
    const dt = [...src.matchAll(/<!doctype/gi)].length;
    if (dt !== 1) errors.push(`${rel}: ${dt} doctype declarations`);
    for (const m of src.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); } catch (e) { errors.push(`${rel}: invalid JSON-LD (${e.message})`); }
    }
    for (const m of src.matchAll(/<img\b[^>]*>/g)) {
      const t = m[0];
      if (!/\bwidth=/.test(t) || !/\bheight=/.test(t))
        warnings.push(`${rel}: <img> without width/height — ${(/src="([^"]*)"/.exec(t) || [,'?'])[1]}`);
      if (/fetchpriority="high"/.test(t) && /loading="lazy"/.test(t))
        errors.push(`${rel}: image is both high-priority and lazy`);
      if (!/\balt=/.test(t)) errors.push(`${rel}: <img> without alt`);
    }
  }
}


/* CSS url() references */
let cssRefs = 0;
for (const f of files.filter(f => f.endsWith('.css'))) {
  const rel = '/' + path.relative(DIST, f).replaceAll(path.sep, '/');
  const src = await readFile(f, 'utf8');
  for (const m of src.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    const u = m[1].trim();
    if (!u.startsWith('/')) continue;
    cssRefs++;
    if (!resolves(u)) errors.push(`${rel}: dead css url() -> ${u}`);
  }
}
console.log(`checked ${files.filter(f => f.endsWith('.css')).length} stylesheets, ${cssRefs} url() refs`);

const sm = path.join(DIST, 'sitemap.xml');
if (!existsSync(sm)) errors.push('sitemap.xml missing');
else for (const m of (await readFile(sm, 'utf8')).matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const u = new URL(m[1]).pathname;
  if (!resolves(u)) errors.push(`sitemap.xml: ${m[1]} does not resolve`);
}
for (const f of ['robots.txt', '404.html', '.nojekyll'])
  if (!existsSync(path.join(DIST, f))) errors.push(`${f} missing from dist/`);
if (CUSTOM && !existsSync(path.join(DIST, 'CNAME')))
  errors.push('CNAME missing from dist/ (CUSTOM_DOMAIN=1)');
if (!CUSTOM && existsSync(path.join(DIST, 'CNAME')))
  errors.push('CNAME present in preview build — would hijack the github.io URL');

console.log(`base path: ${BASE || '(none)'}   mode: ${CUSTOM ? 'production' : 'preview'}`);
console.log(`checked ${html.length} pages, ${linkCount} links, ${imgCount} srcset entries`);
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 15)) console.log('  -', w);
  if (warnings.length > 15) console.log(`  ... and ${warnings.length - 15} more`);
}
if (errors.length) {
  console.error(`\n${errors.length} ERROR(S):`);
  for (const e of errors.slice(0, 25)) console.error('  !', e);
  process.exit(1);
}
console.log('\nAll checks passed.');
