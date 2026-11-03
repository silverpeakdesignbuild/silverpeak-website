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
  admin/                   /admin/ website editor (Decap CMS)
content/                   page wording, written by the website editor
  <page>.json              one file per page
  services/, our-work/     one file per tab or project
cms-auth/
  worker.js                GitHub sign-in for the editor (Cloudflare Worker)
scripts/
  build.mjs                minify, hash, generate sitemap/robots/redirects -> dist/
  content.mjs              fills pages from content/*.json
  cms-extract.py           makes a page's wording editable (one-time, per page)
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

## Website editor

Every page's wording lives in `content/`, so editors can change it at `/admin/` without touching HTML. `CONTENT_FILES` in `scripts/content.mjs` maps each page to its file. Services and Our Work are split into one file per tab or project, under `content/services/` and `content/our-work/`.

- **Change wording in the JSON file, not the HTML.** The build overwrites it. In the page HTML, `data-cms="part2.heading"` marks an element filled from that field. `data-cms-rich` marks one that allows bold, italics, links and line breaks, written as markdown. `<!-- cms:faqs -->…<!-- /cms:faqs -->` marks the FAQs list.
- These stay in the HTML: photos and alt text, link addresses, email and phone links, page titles and descriptions, and the site header and footer.
- A missing or empty field fails the build, so a bad edit never publishes a blank page.
- Editors sign in with their own GitHub account (repo collaborator). Saves are drafts; **Publish** commits to `main` and redeploys.
- New page or new section: run `python scripts/cms-extract.py <page>` on the HTML before it has any markers. It marks the wording, writes the JSON, and writes the editor fields into `src/admin/config.yml`. Then add the page to `CONTENT_FILES` and confirm the built page is unchanged. To add a section to a page that already has markers, add the field to its JSON, mark the element, and add the field in `config.yml` by hand.
- Sign-in setup (one time): [cms-auth/README.md](cms-auth/README.md).

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
