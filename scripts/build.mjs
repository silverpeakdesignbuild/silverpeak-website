import { readFile, writeFile, mkdir, rm, cp, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { minify as minifyHtml } from 'html-minifier-terser';
import CleanCSS from 'clean-css';
import { minify as minifyJs } from 'terser';

const ROOT   = path.resolve(import.meta.dirname, '..');
const SRC    = path.join(ROOT, 'src');
const DIST   = path.join(ROOT, 'dist');
const DOMAIN = 'https://silverpeakdesignbuild.com';

/* --------------------------------------------------------------------------
 * Deploy target.
 *   BASE_PATH      "/repo-name" when served from user.github.io/repo-name,
 *                  "" when served from a domain root. Supplied automatically
 *                  by actions/configure-pages.
 *   SITE_ORIGIN    "https://user.github.io" or the custom domain.
 *   CUSTOM_DOMAIN  "1" once DNS points at Pages -> ships CNAME, allows
 *                  indexing. Anything else = preview: no CNAME, noindex.
 * ------------------------------------------------------------------------ */
let BASE = (process.env.BASE_PATH || '').trim().replace(/\/+$/, '');
if (BASE === '/') BASE = '';
if (BASE && !BASE.startsWith('/')) BASE = '/' + BASE;
const CUSTOM  = process.env.CUSTOM_DOMAIN === '1';
const ORIGIN  = (process.env.SITE_ORIGIN || DOMAIN).trim().replace(/\/+$/, '');
const PREVIEW = !CUSTOM;

const PAGES = [
  { dir: '',                     url: '/',                     priority: '1.0', changefreq: 'monthly' },
  { dir: 'services',             url: '/services/',            priority: '0.9', changefreq: 'monthly' },
  { dir: 'our-work',             url: '/our-work/',            priority: '0.9', changefreq: 'monthly' },
  { dir: 'about-us',             url: '/about-us/',            priority: '0.7', changefreq: 'yearly'  },
  { dir: 'start-project-review', url: '/start-project-review/',priority: '0.8', changefreq: 'yearly'  },
  { dir: 'contact-us',           url: '/contact-us/',          priority: '0.8', changefreq: 'yearly'  },
  { dir: 'faqs',                 url: '/faqs/',                priority: '0.6', changefreq: 'yearly'  },
  { dir: 'blogs',                url: '/blogs/',               priority: '0.6', changefreq: 'weekly'  },
  { dir: 'privacy-policy',       url: '/privacy-policy/',      priority: '0.3', changefreq: 'yearly'  },
];

/* Legacy URLs -> their new home.
 *
 * Verified against https://silverpeakdesignbuild.com/sitemap-1.xml on
 * 2026-09-18: the live WordPress site has exactly six live URLs, listed
 * below. The canonical tags in the original export claimed /blogs.html,
 * /faqs.html, /start-project-review.html and /portfolio — all of which 404
 * on the live site. They were never real, so no redirect is written for them.
 *
 *   live                new                 handled by
 *   /                   /                   same path
 *   /services/          /services/          same path
 *   /about/             /about-us/          about/index.html
 *   /contact/           /contact-us/        contact/index.html
 *   /portfolio/         /our-work/          portfolio/index.html
 *   /service-listing/   /services/          service-listing/index.html
 *
 * The bare .html twins cover any hand-written link that omits the slash.
 */
const REDIRECTS = {
  'about/index.html':           '/about-us/',
  'contact/index.html':         '/contact-us/',
  'portfolio/index.html':       '/our-work/',
  'service-listing/index.html': '/services/',
  'about.html':                 '/about-us/',
  'contact.html':               '/contact-us/',
  'portfolio.html':             '/our-work/',
  'service-listing.html':       '/services/',
};

const log = (...a) => console.log(' ', ...a);
const hash8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);
let bytesIn = 0, bytesOut = 0;

/** Prefix every root-absolute URL with BASE. No-op when BASE is "". */
function rebaseHtml(html) {
  if (!BASE) return html;
  html = html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${BASE}/`);
  html = html.replace(/\b(srcset|imagesrcset)="([^"]+)"/g, (_, attr, val) =>
    `${attr}="${val.split(',').map(s => s.trim().replace(/^\/(?!\/)/, BASE + '/')).join(', ')}"`);
  html = html.replace(/url\(\s*(['"]?)\/(?!\/)/g, `url($1${BASE}/`);
  return html;
}
const rebaseCss = (css) => BASE ? css.replace(/url\(\s*(['"]?)\/(?!\/)/g, `url($1${BASE}/`) : css;

/** In preview, force noindex so the github.io copy never competes in search. */
function applyRobots(html) {
  if (!PREVIEW) return html;
  const tag = '<meta content="noindex,nofollow" name="robots"/>';
  return /<meta\b[^>]*name="robots"[^>]*>/i.test(html)
    ? html.replace(/<meta\b[^>]*name="robots"[^>]*>/i, tag)
    : html.replace(/<head>/i, '<head>\n' + tag);
}

async function build() {
  const t0 = Date.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  log(`target: ${ORIGIN}${BASE || ''}  ${PREVIEW ? '(preview — noindex, no CNAME)' : '(production)'}`);

  /* 1. CSS + JS ---------------------------------------------------------- */
  const assetRename = new Map();
  for (const kind of ['css', 'js']) {
    const dir = path.join(SRC, kind);
    if (!existsSync(dir)) continue;
    await mkdir(path.join(DIST, kind), { recursive: true });
    for (const f of await readdir(dir)) {
      const raw = await readFile(path.join(dir, f), 'utf8');
      bytesIn += Buffer.byteLength(raw);
      let out;
      if (kind === 'css') {
        const r = new CleanCSS({ level: 2 }).minify(raw);
        if (r.errors.length) throw new Error(`CSS ${f}: ${r.errors.join(', ')}`);
        out = rebaseCss(r.styles);
      } else {
        out = (await minifyJs(raw, { compress: true, mangle: true })).code;
      }
      bytesOut += Buffer.byteLength(out);
      const ext  = path.extname(f);
      const name = `${path.basename(f, ext)}.${hash8(out)}${ext}`;
      assetRename.set(`/${kind}/${f}`, `/${kind}/${name}`);
      await writeFile(path.join(DIST, kind, name), out);
    }
  }
  log(`css+js: ${assetRename.size} files minified & hashed`);

  /* 2. images ------------------------------------------------------------ */
  await cp(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  log(`assets: ${(await readdir(path.join(DIST, 'assets'))).length} files copied`);

  /* 3. pages ------------------------------------------------------------- */
  let n = 0;
  for (const { dir } of PAGES) {
    const srcFile = path.join(SRC, dir, 'index.html');
    if (!existsSync(srcFile)) { console.warn(`  ! missing ${srcFile}`); continue; }
    let html = await readFile(srcFile, 'utf8');
    bytesIn += Buffer.byteLength(html);
    for (const [from, to] of assetRename) html = html.split(`"${from}"`).join(`"${to}"`);
    html = applyRobots(html);
    html = await minifyHtml(html, {
      collapseWhitespace: true, removeComments: true, removeRedundantAttributes: false,
      minifyCSS: true, minifyJS: true, sortAttributes: true, sortClassName: true,
      useShortDoctype: true,
    });
    html = rebaseHtml(html);
    bytesOut += Buffer.byteLength(html);
    await mkdir(path.join(DIST, dir), { recursive: true });
    await writeFile(path.join(DIST, dir, 'index.html'), html);
    n++;
  }
  log(`pages: ${n} minified`);

  /* 4. legacy redirect stubs --------------------------------------------- */
  for (const [from, to] of Object.entries(REDIRECTS)) {
    const dest = `${BASE}${to}`;
    const stub = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Redirecting&hellip;</title><link rel="canonical" href="${DOMAIN}${to}">
<meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0; url=${dest}">
<script>location.replace(${JSON.stringify(dest)}+location.hash);</script>
</head><body><p>This page has moved to <a href="${dest}">${DOMAIN}${to}</a>.</p></body></html>`;
    const out = path.join(DIST, from);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, stub);
  }
  log(`redirects: ${Object.keys(REDIRECTS).length} legacy URLs stubbed`);

  /* 5. sitemap + robots --------------------------------------------------- */
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(path.join(DIST, 'sitemap.xml'),
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(p => `  <url>
    <loc>${ORIGIN}${BASE}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>
`);
  await writeFile(path.join(DIST, 'robots.txt'), PREVIEW
    ? 'User-agent: *\nDisallow: /\n'
    : `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}${BASE}/sitemap.xml\n`);
  log(`sitemap: ${PAGES.length} urls   robots: ${PREVIEW ? 'Disallow /' : 'Allow /'}`);

  /* 6. 404, CNAME, .nojekyll ---------------------------------------------- */
  if (existsSync(path.join(SRC, '404.html'))) {
    let h = await readFile(path.join(SRC, '404.html'), 'utf8');
    h = rebaseHtml(applyRobots(h));
    await writeFile(path.join(DIST, '404.html'), h);
  }
  await writeFile(path.join(DIST, '.nojekyll'), '');
  if (CUSTOM && existsSync(path.join(SRC, 'CNAME'))) {
    await cp(path.join(SRC, 'CNAME'), path.join(DIST, 'CNAME'));
    log('CNAME: shipped (custom domain mode)');
  } else {
    log('CNAME: skipped (preview mode)');
  }

  const saved = (100 * (1 - bytesOut / bytesIn)).toFixed(1);
  log(`text: ${(bytesIn / 1024).toFixed(0)}KB -> ${(bytesOut / 1024).toFixed(0)}KB (-${saved}%)`);
  console.log(`\nBuild complete in ${((Date.now() - t0) / 1000).toFixed(1)}s -> dist/`);
}

build().catch(e => { console.error(e); process.exit(1); });
