import { readFile, writeFile, mkdir, rm, cp, readdir, stat } from 'node:fs/promises';
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

/* Pages: source dir -> public URL. '' is the site root. */
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

/* Legacy URLs from the previous live site -> their new home. */
const REDIRECTS = {
  'portfolio.html':            '/our-work/',
  'portfolio/index.html':      '/our-work/',
  'blogs.html':                '/blogs/',
  'contact.html':              '/contact-us/',
  'contact/index.html':        '/contact-us/',
  'faqs.html':                 '/faqs/',
  'services.html':             '/services/',
  'start-project-review.html': '/start-project-review/',
  'about.html':                '/about-us/',
};

const log = (...a) => console.log(' ', ...a);
let bytesIn = 0, bytesOut = 0;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

const hash8 = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 8);

async function build() {
  const t0 = Date.now();
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  /* ---------- 1. CSS + JS: minify, then hash for cache-busting ---------- */
  const assetRename = new Map();   // /css/home.css -> /css/home.a1b2c3d4.css

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
        out = r.styles;
      } else {
        const r = await minifyJs(raw, { compress: true, mangle: true });
        out = r.code;
      }
      bytesOut += Buffer.byteLength(out);
      const ext  = path.extname(f);
      const name = `${path.basename(f, ext)}.${hash8(out)}${ext}`;
      assetRename.set(`/${kind}/${f}`, `/${kind}/${name}`);
      await writeFile(path.join(DIST, kind, name), out);
    }
  }
  log(`css+js: ${assetRename.size} files minified & hashed`);

  /* ---------- 2. images: copied verbatim (already optimised webp) ------- */
  await cp(path.join(SRC, 'assets'), path.join(DIST, 'assets'), { recursive: true });
  const imgs = await readdir(path.join(DIST, 'assets'));
  log(`assets: ${imgs.length} files copied`);

  /* ---------- 3. HTML: rewrite hashed refs, then minify ----------------- */
  let pageCount = 0;
  for (const { dir } of PAGES) {
    const srcFile = path.join(SRC, dir, 'index.html');
    if (!existsSync(srcFile)) { console.warn(`  ! missing ${srcFile}`); continue; }
    let html = await readFile(srcFile, 'utf8');
    bytesIn += Buffer.byteLength(html);

    for (const [from, to] of assetRename) html = html.split(`"${from}"`).join(`"${to}"`);

    html = await minifyHtml(html, {
      collapseWhitespace: true,
      removeComments: true,
      removeRedundantAttributes: false,
      minifyCSS: true,
      minifyJS: true,
      sortAttributes: true,
      sortClassName: true,
      useShortDoctype: true,
    });
    bytesOut += Buffer.byteLength(html);
    await mkdir(path.join(DIST, dir), { recursive: true });
    await writeFile(path.join(DIST, dir, 'index.html'), html);
    pageCount++;
  }
  log(`pages: ${pageCount} minified`);

  /* ---------- 4. legacy redirect stubs --------------------------------- */
  for (const [from, to] of Object.entries(REDIRECTS)) {
    const stub = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Redirecting&hellip;</title><link rel="canonical" href="${DOMAIN}${to}">
<meta name="robots" content="noindex,follow">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)}+location.hash);</script>
</head><body><p>This page has moved to <a href="${to}">${DOMAIN}${to}</a>.</p></body></html>`;
    const dest = path.join(DIST, from);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, stub);
  }
  log(`redirects: ${Object.keys(REDIRECTS).length} legacy URLs stubbed`);

  /* ---------- 5. sitemap.xml + robots.txt ------------------------------ */
  const today = new Date().toISOString().slice(0, 10);
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map(p => `  <url>
    <loc>${DOMAIN}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(DIST, 'sitemap.xml'), sitemap);
  await writeFile(path.join(DIST, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml\n`);
  log(`sitemap: ${PAGES.length} urls`);

  /* ---------- 6. static passthrough (CNAME, 404, favicon) -------------- */
  for (const f of ['CNAME', '404.html', '.nojekyll']) {
    const p = path.join(SRC, f);
    if (existsSync(p)) await cp(p, path.join(DIST, f));
  }

  const dur = ((Date.now() - t0) / 1000).toFixed(1);
  const saved = (100 * (1 - bytesOut / bytesIn)).toFixed(1);
  log(`text: ${(bytesIn / 1024).toFixed(0)}KB -> ${(bytesOut / 1024).toFixed(0)}KB (-${saved}%)`);
  console.log(`\nBuild complete in ${dur}s -> dist/`);
}

build().catch(e => { console.error(e); process.exit(1); });
