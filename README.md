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

The build targets whatever URL it is given, via three environment variables:

| Variable | Set by | Meaning |
|---|---|---|
| `BASE_PATH` | `actions/configure-pages` | `/repo-name` on a project URL, empty on a domain root. Rewrites every `href`, `src`, `srcset` and `url()`. |
| `SITE_ORIGIN` | `actions/configure-pages` | Origin used in `sitemap.xml`. |
| `CUSTOM_DOMAIN` | you, in `deploy.yml` | `"1"` = live: ship `CNAME`, allow indexing. Anything else = preview: no `CNAME`, `noindex,nofollow`, `robots.txt` disallows everything. |

### Phase 1 — preview on the GitHub URL

`CUSTOM_DOMAIN: "0"` (the default in `deploy.yml`).

1. Push this repo to GitHub.
2. **Settings -> Pages -> Source: GitHub Actions**.
3. Wait for the **Actions** tab to go green. The site is at
   `https://<user>.github.io/<repo>/`.

The preview is deliberately `noindex` — it will not be found in search and
cannot compete with the live site.

### Phase 2 — go live on silverpeakdesignbuild.com

1. Point DNS at GitHub Pages:
   - apex `A` records: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `www` `CNAME` -> `<user>.github.io`
2. **Settings -> Pages -> Custom domain**: `silverpeakdesignbuild.com`, save.
3. Edit `.github/workflows/deploy.yml` and set `CUSTOM_DOMAIN: "1"`. Commit and push.
4. Once the certificate is issued, tick **Enforce HTTPS**.

Step 3 is what removes `noindex` and restores `robots.txt`. Do not skip it, and
do not do it before the domain resolves.

### Building locally

`npm run build` defaults to preview mode at the domain root. To reproduce a
particular deploy, set the variables yourself:

```bash
# what the github.io preview looks like
BASE_PATH=/your-repo SITE_ORIGIN=https://you.github.io npm run build
BASE_PATH=/your-repo npm run check
BASE_PATH=/your-repo npm run serve     # http://localhost:4173/your-repo/

# what production looks like
CUSTOM_DOMAIN=1 npm run build
```

On Windows PowerShell use `$env:BASE_PATH="/your-repo"; npm run build`.

`src/CNAME` is only copied into `dist/` when `CUSTOM_DOMAIN=1`, so a preview
deploy can never hijack your custom domain.

## Known limits

- GitHub Pages caps `Cache-Control` at 10 minutes and offers no custom headers, so hashed filenames buy less than they would elsewhere. Moving to Cloudflare Pages (same repo, add `_headers` and `_redirects`) would allow 1-year immutable asset caching and real 301s.
- The contact page loads a HubSpot form from `js.hsforms.net`, a third-party script outside this build's control.
- `our-work` carries 265 images. They are all lazy-loaded, but it remains the heaviest page by a wide margin.
