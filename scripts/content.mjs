import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/* --------------------------------------------------------------------------
 * Editable wording.
 *
 * Pages listed in CONTENT_FILES take their wording from a JSON file under
 * content/, which the editor at /admin/ (Decap CMS) writes. In the page HTML:
 *
 *   data-cms="hero.title"         element whose inside is replaced by that
 *                                 field (plain text, HTML-escaped)
 *   <!-- cms:faqs -->…<!-- /cms:faqs -->
 *                                 region rebuilt from a list by LISTS below
 *
 * Every marker must find its field, and every field must be non-empty, so a
 * broken edit fails the build instead of publishing a blank page.
 * ------------------------------------------------------------------------ */

export const CONTENT_FILES = {
  '': 'content/home.json',
  services: 'content/services/',
  'our-work': 'content/our-work/',
  'our-work/whole-house-project-renovation': 'content/whole-house-project.json',
  'about-us': 'content/about-us.json',
  'start-project-review': 'content/start-project-review.json',
  'contact-us': 'content/contact-us.json',
  faqs: 'content/faqs.json',
  blogs: 'content/blogs.json',
  'privacy-policy': 'content/privacy-policy.json',
};

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

/** Undo the escaping the editor's markdown writer may add. */
function unescapeMarkdown(s) {
  return s
    .replace(/&#x26;|&#38;|&amp;/g, '&').replace(/&#x3C;|&lt;/g, '<').replace(/&#x3E;|&gt;/g, '>')
    .replace(/&nbsp;|&#xA0;/g, ' ');
}

/** Markdown with bold, italic and links only -> inline HTML. */
function inlineMarkdown(md, linkClass) {
  const slots = [];
  const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = unescapeMarkdown(md)
    .replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, (_, c) => keep(escapeHtml(c)));
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, url) => {
    if (!/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url)) throw new Error(`link "${text}" has an unsupported address: ${url}`);
    const external = /^https?:\/\//i.test(url);
    const attrs = [
      linkClass ? `class="${linkClass}"` : '',
      `href="${escapeAttr(url)}"`,
      external ? 'rel="noopener noreferrer" target="_blank"' : '',
    ].filter(Boolean).join(' ');
    return keep(`<a ${attrs}>`) + text + keep('</a>');
  });
  s = escapeHtml(s)
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
    .replace(/(\*|_)(?=\S)([\s\S]*?\S)\1/g, '<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[i]);
}

/** One paragraph of markdown -> inline HTML. A line ending in "\" or two spaces is a hard break; any other newline is a space. */
const paragraphMarkdown = (para, linkClass) => para.split('\n').map((line, i, lines) => {
  const text = inlineMarkdown(line.trim().replace(/\\$/, ''), linkClass);
  const last = i === lines.length - 1;
  return last ? text : text + (/(\\|\s{2,})$/.test(line) ? '<br>' : ' ');
}).join('');

/** Paragraphs separated by blank lines -> <p> blocks. */
const blockMarkdown = (md, linkClass) =>
  md.trim().split(/\n\s*\n/).map((para) => `<p>${paragraphMarkdown(para, linkClass)}</p>`).join('');

/** Rich text inside one element (a heading, paragraph or list item): extra paragraphs become line breaks. */
const richMarkdown = (md, linkClass) =>
  md.trim().split(/\n\s*\n/).map((para) => paragraphMarkdown(para, linkClass)).join('<br>');

/** Plain text of rendered HTML, for structured data. */
const plainText = (html) => html.replace(/<br>/g, ' ').replace(/<\/p><p>/g, ' ').replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();

const LISTS = {
  faqs: (items) => items.map(({ question, answer }) =>
    `<details class="faq-item reveal"><summary>${escapeHtml(question.trim())}<span aria-hidden="true">+</span></summary>` +
    `<div class="faq-answer">${blockMarkdown(answer, 'faq-verify-link')}</div></details>`).join(''),
};

function field(data, key, file) {
  const value = key.split('.').reduce((o, k) => (o == null ? o : o[k]), data);
  if (value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length))
    throw new Error(`${file}: "${key}" is empty or missing`);
  return value;
}

async function readJson(root, file) {
  if (!existsSync(path.join(root, file))) throw new Error(`missing ${file}`);
  try {
    return JSON.parse(await readFile(path.join(root, file), 'utf8'));
  } catch (e) {
    throw new Error(`${file}: ${e.message}`);
  }
}

/** Fill one page's editable wording. Returns html unchanged for pages without a content file. */
export async function applyContent(root, dir, html) {
  const source = CONTENT_FILES[dir];
  if (!source) return html;
  // One file, or a folder (ending in "/") for a page split into several files;
  // a folder's files are read as data[<file name without .json>].
  let data = {};
  if (!source.endsWith('/')) data = await readJson(root, source);
  else {
    if (!existsSync(path.join(root, source))) throw new Error(`missing ${source}`);
    for (const name of (await readdir(path.join(root, source))).filter((n) => n.endsWith('.json')).sort())
      data[name.slice(0, -5)] = await readJson(root, source + name);
  }
  const file = source;

  let fields = 0;
  html = html.replace(/<(\w+)([^>]*?)\sdata-cms="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g, (_, tag, before, key, after) => {
    fields++;
    const value = field(data, key, file);
    if (typeof value !== 'string') throw new Error(`${file}: "${key}" is not text`);
    const rich = /\sdata-cms-rich="([^"]*)"/.exec(before + after);
    const attrs = (before + after).replace(/\sdata-cms-rich="[^"]*"/, '');
    let inner;
    try {
      inner = rich ? richMarkdown(value, rich[1]) : escapeHtml(value.trim());
    } catch (e) {
      throw new Error(`${file}: "${key}": ${e.message}`);
    }
    return `<${tag}${attrs}>${inner}</${tag}>`;
  });

  for (const [name, render] of Object.entries(LISTS)) {
    if (dir !== name) continue;
    const re = new RegExp(`<!-- cms:${name} -->[\\s\\S]*?<!-- /cms:${name} -->`);
    if (!re.test(html)) throw new Error(`${dir}: no <!-- cms:${name} --> region for ${file}`);
    const items = field(data, name, file);
    items.forEach((item, i) => {
      for (const k of Object.keys(item)) if (!String(item[k] ?? '').trim()) throw new Error(`${file}: ${name} #${i + 1} has an empty ${k}`);
    });
    html = html.replace(re, render(items));
    fields++;
  }

  if (dir === 'faqs') html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g, (all, open, json, close) => {
    const graph = JSON.parse(json);
    const page = (graph['@graph'] || [graph]).find((n) => n['@type'] === 'FAQPage');
    if (!page) return all;
    page.mainEntity = data.faqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question.trim(),
      acceptedAnswer: { '@type': 'Answer', text: plainText(blockMarkdown(answer)) },
    }));
    return `${open}\n${JSON.stringify(graph, null, 2)}\n${close}`;
  });

  if (/data-cms="/.test(html)) throw new Error(`${dir}: a data-cms marker was not filled`);
  console.log(`  content: ${dir} filled ${fields} fields from ${file}`);
  return html;
}
