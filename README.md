# Silver Peak Design Build

Static marketing site for **silverpeakdesignbuild.com**, built for GitHub Pages.

## Quick start

```bash
npm install
npm run build     # -> dist/
npm run check     # verifies links, images, schema, sitemap
npm run dev       # build + serve at http://localhost:4173
```

## Layout

```
src/
  index.html               /                     (home)
  services/index.html      /services/
  our-work/index.html      /our-work/
  about-us/index.html      /about-us/
  start-project-review/    /start-project-review/
  contact-us/index.html    /contact-us/
  faqs/index.html          /faqs/
  blogs/index.html         /blogs/
  privacy-policy/          /privacy-policy/
  404.html                 served by GitHub Pages on any miss
  assets/                  all images, shared across pages (270 originals + 771 variants)
  css/                     one stylesheet per page + shared-shell.css
  js/                      one script per page + shared-shell.js
  CNAME                    silverpeakdesignbuild.com
scripts/
  build.mjs                minify, hash, generate sitemap/robots/redirects -> dist/
  check.mjs                fail-the-build verification
  serve.mjs                local static server with Pages-style URL resolution
```

`dist/` and `node_modules/` are generated and git-ignored. **Never edit `dist/` by hand.**

## What the build does

1. Minifies and content-hashes every CSS/JS file (`home.a1b2c3d4.css`) and rewrites the HTML references.
2. Copies `assets/` verbatim — images are already optimised webp.
3. Minifies each page's HTML.
4. Writes redirect stubs for the previous site's URLs (see below).
5. Generates `sitemap.xml` and `robots.txt` from the page list in `build.mjs`.

## Adding or changing a page

Edit the file in `src/`, then add it to the `PAGES` array in `scripts/build.mjs` so it lands in the sitemap. Run `npm run check` before pushing.

## Images

Each photo has `-400w`, `-640w`, `-960w`, `-1280w`, `-1920w` variants alongside the original, wired up with `srcset`/`sizes`. Full-bleed CSS backgrounds swap size by media query at 700px and 1240px.

To add a new photo: drop the original in `src/assets/`, then run

```bash
python3 scripts/gen_variants.py
```

and reference it with a `srcset` matching the pattern used by its neighbours.

## Legacy URL redirects

The previous site used inconsistent paths. `build.mjs` emits a stub at each old URL that canonicals and redirects to the new one:

| Old | New |
|---|---|
| `/portfolio`, `/portfolio.html` | `/our-work/` |
| `/blogs.html` | `/blogs/` |
| `/contact.html`, `/contact/` | `/contact-us/` |
| `/faqs.html` | `/faqs/` |
| `/services.html` | `/services/` |
| `/start-project-review.html` | `/start-project-review/` |
| `/about.html` | `/about-us/` |

These are meta-refresh + canonical stubs, not true 301s — GitHub Pages cannot issue server redirects. Add or remove entries in the `REDIRECTS` map in `build.mjs`.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds, runs `npm run check`, and publishes `dist/` to GitHub Pages.

One-time setup:

1. Push this repo to GitHub.
2. **Settings → Pages → Source: GitHub Actions**.
3. Point DNS for `silverpeakdesignbuild.com` at GitHub Pages:
   - `A` records for the apex: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` for `www` → `<user>.github.io`
4. **Settings → Pages → Custom domain**: `silverpeakdesignbuild.com`, then tick **Enforce HTTPS** once the certificate is issued.

`src/CNAME` is copied into `dist/` on every build, so the custom domain survives redeploys.

## Known limits

- GitHub Pages caps `Cache-Control` at 10 minutes and offers no custom headers, so hashed filenames buy less than they would elsewhere. Moving to Cloudflare Pages (same repo, add `_headers` and `_redirects`) would allow 1-year immutable asset caching and real 301s.
- The contact page loads a HubSpot form from `js.hsforms.net`, a third-party script outside this build's control.
- `our-work` carries 265 images. They are all lazy-loaded, but it remains the heaviest page by a wide margin.
