"""Make a page's wording editable in the website editor (/admin/).

    python scripts/cms-extract.py services

One-time step per page. It reads src/<page>/index.html and:

  1. marks every piece of wording inside <main> with data-cms="<key>",
  2. writes that wording to content/<page>.json (or one file per view for
     pages split into views, such as Services and Our Work),
  3. writes the matching editor fields into src/admin/config.yml between
     "# >>> <page>" and "# <<< <page>" lines.

Then add the page to CONTENT_FILES in scripts/content.mjs and confirm the built
page is unchanged. Photos, links, page titles and the site header and footer
are not touched.

Wording that mixes in bold, italics, links or line breaks becomes a rich-text
field (markdown). Text with no letters (icons, step numbers) and anything
hidden from screen readers is left alone.
"""
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# dir -> (content name, editor label, attribute that splits the page into views)
PAGES = {
    '': ('home', 'Home page', None),
    'services': ('services', 'Services', 'data-service-view'),  # views are labelled by VIEW_LABELS
    'our-work': ('our-work', 'Our Work', 'data-portfolio-view'),
    'our-work/whole-house-project-renovation': ('whole-house-project', 'Our Work: whole house project page', None),
    'about-us': ('about-us', 'About Us', None),
    'start-project-review': ('start-project-review', 'Start Project Review', None),
    'contact-us': ('contact-us', 'Contact Us', None),
    'blogs': ('blogs', 'Blog', None),
    'privacy-policy': ('privacy-policy', 'Privacy Policy', None),
}

# Editor names for views; views not listed are named after their first heading.
VIEW_LABELS = {
    'services': {'overview': 'Overview tab', 'whole-house': 'Whole House', 'additions': 'Additions', 'adu-dadu': 'DADU & ADU',
                 'basements': 'Basements', 'kitchens': 'Kitchens', 'bathrooms': 'Bathrooms', 'exteriors': 'Exteriors',
                 'porches': 'Porches & Entries', 'damage-restoration': 'Damage Restoration', 'carpentry-tiling': 'Carpentry & Tiling'},
    'our-work': {'overview': 'Top of page and project list'},
}

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
TEXT_TAGS = {'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'figcaption', 'blockquote', 'dt', 'dd', 'td', 'th',
             'span', 'strong', 'em', 'b', 'small', 'label', 'div', 'a', 'button', 'cite'}
RICH_KIDS = {'strong', 'b', 'em', 'i', 'a', 'br'}
SKIP_INSIDE = {'script', 'style', 'noscript', 'svg', 'template', 'select', 'textarea', 'head'}
CONTAINERS = {'section', 'article', 'details', 'aside'}


class Node:
    def __init__(self, tag, attrs, start, start_end, parent):
        self.tag, self.attrs, self.start, self.start_end, self.parent = tag, dict(attrs), start, start_end, parent
        self.end = None          # offset where the end tag starts
        self.content = []        # ('text', raw) | ('el', Node)

    def kids(self):
        return [c for k, c in self.content if k == 'el']

    def ancestors(self):
        n = self.parent
        while n:
            yield n
            n = n.parent


class Tree(HTMLParser):
    def __init__(self, src):
        super().__init__(convert_charrefs=False)
        self.src = src
        self.line_starts = [0] + [m.end() for m in re.finditer('\n', src)]
        self.root = Node('#root', [], 0, 0, None)
        self.stack = [self.root]
        self.feed(src)
        self.close()

    def abs_pos(self):
        line, col = self.getpos()
        return self.line_starts[line - 1] + col

    def handle_starttag(self, tag, attrs):
        start = self.abs_pos()
        node = Node(tag, attrs, start, start + len(self.get_starttag_text()), self.stack[-1])
        self.stack[-1].content.append(('el', node))
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        start = self.abs_pos()
        node = Node(tag, attrs, start, start + len(self.get_starttag_text()), self.stack[-1])
        node.end = node.start_end
        self.stack[-1].content.append(('el', node))

    def handle_endtag(self, tag):
        if not any(n.tag == tag for n in self.stack[1:]):
            return
        pos = self.abs_pos()
        while len(self.stack) > 1:
            n = self.stack.pop()
            if n.tag == tag:
                n.end = pos
                break

    def handle_data(self, data):
        self.stack[-1].content.append(('text', data))

    def handle_entityref(self, name):
        self.stack[-1].content.append(('text', f'&{name};'))

    def handle_charref(self, name):
        self.stack[-1].content.append(('text', f'&#{name};'))


def squash(s):
    return re.sub(r'\s+', ' ', html.unescape(s))


def own_text(node):
    return ''.join(c for k, c in node.content if k == 'text')


def escape_md(s):
    return re.sub(r'([\\`*_\[\]])', r'\\\1', s)


def to_markdown(node):
    """Inline HTML (bold, italic, links, line breaks) -> markdown, or None if it has anything else."""
    out = []
    for kind, c in node.content:
        if kind == 'text':
            out.append(escape_md(squash(c)))
            continue
        if c.tag == 'br':
            out.append('\\\n')
            continue
        if c.tag not in RICH_KIDS or c.kids():
            return None
        inner = squash(own_text(c))
        lead, core, trail = re.match(r'^(\s*)(.*?)(\s*)$', inner, re.S).groups()
        core = escape_md(core)
        if c.tag in ('strong', 'b'):
            out.append(f'{lead}**{core}**{trail}')
        elif c.tag in ('em', 'i'):
            out.append(f'{lead}*{core}*{trail}')
        else:
            href = c.attrs.get('href')
            if not href or set(c.attrs) - {'href', 'class', 'rel', 'target'}:
                return None
            out.append(f'{lead}[{core}]({href}){trail}')
    md = ''.join(out)
    md = re.sub(r' *\\\n *', '\\\n', md)
    return md.strip()


def link_class(node):
    classes = {c.attrs.get('class', '') for c in node.kids() if c.tag == 'a'}
    if len(classes) > 1:
        return None
    return classes.pop() if classes else ''


def hidden(node):
    return any(n.attrs.get('aria-hidden') == 'true' or n.tag in SKIP_INSIDE for n in [node, *node.ancestors()])


class Field:
    def __init__(self, node, value, rich, cls):
        self.node, self.value, self.rich, self.cls = node, value, rich, cls
        self.key = self.label = self.widget = None


class Group:
    def __init__(self, node, parent):
        self.node, self.parent = node, parent
        self.items = []          # Field | Group, in page order
        self.key = self.label = None


def collect(node, group, fields):
    """Walk the tree, attaching fields to the nearest container group."""
    for kind, c in node.content:
        if kind != 'el' or c.tag in SKIP_INSIDE or c.attrs.get('aria-hidden') == 'true':
            continue
        if 'data-cms' in c.attrs:
            sys.exit(f'{c.tag} at offset {c.start} already has data-cms: this page was converted before')
        if c.tag in CONTAINERS:
            g = Group(c, group)
            group.items.append(g)
            collect(c, g, fields)
            continue
        if c.tag in TEXT_TAGS and c.end is not None and not hidden(c):
            kids = c.kids()
            text = squash(own_text(c)).strip()
            if not kids and re.search(r'[A-Za-z]', text):
                if c.tag == 'a' and re.match(r'(mailto|tel):', c.attrs.get('href', '')):
                    continue  # the visible address must match the link, so it stays fixed
                f = Field(c, text, False, None)
                group.items.append(f)
                fields.append(f)
                continue
            if kids and all(k.tag in RICH_KIDS for k in kids) and (text or any(k.tag == 'br' for k in kids)):
                md, cls = to_markdown(c), link_class(c)
                if md is not None and cls is not None and re.search(r'[A-Za-z]', md):
                    f = Field(c, md, True, cls)
                    group.items.append(f)
                    fields.append(f)
                    continue
        collect(c, group, fields)


def prune(group):
    """Drop empty groups; a group holding only one group is replaced by it."""
    items = []
    for it in group.items:
        if isinstance(it, Group):
            prune(it)
            if not it.items:
                continue
            if len(it.items) == 1 and isinstance(it.items[0], Group):
                inner = it.items[0]
                inner.parent = group
                if not inner.node.attrs.get('id') and it.node.attrs.get('id'):
                    inner.node.attrs['id'] = it.node.attrs['id']
                it = inner
        items.append(it)
    group.items = items


def has_class(node, name):
    return name in node.attrs.get('class', '').split()


def is_question(node):
    return node.tag == 'summary' or any(a.tag == 'summary' or has_class(a, 'faq-question') for a in node.ancestors())


def is_answer(node):
    return any(has_class(a, 'faq-answer') for a in node.ancestors())


def is_heading(f):
    return f.node.tag in ('h1', 'h2', 'h3', 'h4', 'h5') or is_question(f.node)


def first_heading(group):
    """The group's own first heading, else the first heading inside it."""
    for it in group.items:
        if isinstance(it, Field) and is_heading(it):
            return re.sub(r'[*\\]', '', it.value)
    for it in group.items:
        if isinstance(it, Group):
            h = first_heading(it)
            if h:
                return h
    return None


def shorten(s, n=70):
    s = s.replace('\\\n', ' ').replace('\n', ' ')
    return s if len(s) <= n else s[:n - 1].rstrip() + '…'


KINDS = [
    (lambda n: n.tag == 'h1', 'title', 'Main heading'),
    (lambda n: n.tag == 'h2', 'heading', 'Heading'),
    (lambda n: n.tag == 'h3', 'subheading', 'Subheading'),
    (lambda n: n.tag in ('h4', 'h5', 'h6'), 'small_heading', 'Small heading'),
    (is_question, 'question', 'Question'),
    (lambda n: has_class(n, 'eyebrow'), 'label', 'Small label'),
    (lambda n: n.tag == 'p' and is_answer(n), 'answer', 'Answer'),
    (lambda n: n.tag == 'p', 'text', 'Paragraph'),
    (lambda n: n.tag == 'li', 'item', 'List item'),
    (lambda n: n.tag == 'figcaption', 'caption', 'Photo caption'),
    (lambda n: n.tag in ('a', 'button'), 'button', 'Button or link text'),
    (lambda n: n.tag == 'blockquote', 'quote', 'Quote'),
    (lambda n: True, 'short', 'Short text'),
]


def name_items(group, label_hint):
    """Give fields and groups keys and labels, numbering repeats within a group."""
    kinds = {}
    for it in group.items:
        if isinstance(it, Field):
            key, label = next((k, l) for test, k, l in KINDS if test(it.node))
            it.key, it.label = key, label
            kinds.setdefault(key, []).append(it)
            long = len(it.value) > 80 or key in ('text', 'answer', 'item', 'caption', 'quote')
            it.widget = 'markdown' if it.rich else ('text' if long else 'string')
    for key, its in kinds.items():
        if len(its) > 1:
            for i, it in enumerate(its, 1):
                it.key, it.label = f'{key}{i}', f'{it.label} {i}'
    used, n = set(f.key for f in group.items if isinstance(f, Field)), 0
    for it in group.items:
        if isinstance(it, Group):
            n += 1
            raw = re.sub(r'[^a-z0-9]+', '_', (it.node.attrs.get('id') or '').lower()).strip('_')
            key = raw if raw and raw not in used and raw != 'faqs' else f'part{n}'
            while key in used:
                key += '_'
            used.add(key)
            it.key = key
            it.label = shorten(first_heading(it) or it.node.attrs.get('data-portfolio-title') or it.node.attrs.get('aria-label')
                               or (raw.replace('_', ' ').capitalize() if raw else f'Part {n}'))
            name_items(it, None)


def assign_paths(group, prefix, out):
    for it in group.items:
        path = f'{prefix}.{it.key}' if prefix else it.key
        if isinstance(it, Field):
            out.append((path, it))
        else:
            assign_paths(it, path, out)


def to_data(group):
    return {it.key: (it.value if isinstance(it, Field) else to_data(it)) for it in group.items}


def q(s):
    return json.dumps(s, ensure_ascii=False)


def to_yaml(group, indent):
    pad = ' ' * indent
    lines = []
    for it in group.items:
        if isinstance(it, Field):
            extra = ''
            if it.widget == 'markdown':
                extra = ', modes: [rich_text], buttons: [bold, italic, link], editor_components: []'
            lines.append(f'{pad}- {{ label: {q(it.label)}, name: {it.key}, widget: {it.widget}{extra} }}')
        else:
            lines.append(f'{pad}- label: {q(it.label)}')
            lines.append(f'{pad}  name: {it.key}')
            lines.append(f'{pad}  widget: object')
            lines.append(f'{pad}  collapsed: true')
            lines.append(f'{pad}  fields:')
            lines.extend(to_yaml(it, indent + 4))
    return lines


def main(page_dir):
    if page_dir not in PAGES:
        sys.exit(f'unknown page "{page_dir}". Known: {", ".join(repr(k) for k in PAGES)}')
    name, label, split = PAGES[page_dir]
    src_file = ROOT / 'src' / page_dir / 'index.html'
    src = src_file.read_text(encoding='utf-8')
    tree = Tree(src)
    main_el = next((n for n in iter_nodes(tree.root) if n.tag == 'main'), None)
    if not main_el:
        sys.exit('no <main> element')

    root = Group(main_el, None)
    fields = []
    collect(main_el, root, fields)

    # Split pages: each container carrying the split attribute becomes its own file;
    # whatever is left goes to an "overview" file.
    files = []  # (file key, label, group)
    if split:
        views = []

        def pull(group):
            kept = []
            for it in group.items:
                if isinstance(it, Group) and it.node.attrs.get(split):
                    views.append(it)
                    continue
                if isinstance(it, Group):
                    pull(it)
                kept.append(it)
            group.items = kept
        pull(root)
        prune(root)
        if root.items:
            files.append(('shared', f'{label}: box at the bottom of every tab', root))
        # Several sections can belong to one view: they share a file, one part each.
        by_view = {}
        for v in views:
            prune(v)
            if v.items:
                by_view.setdefault(re.sub(r'[^a-z0-9]+', '-', v.node.attrs[split].lower()), []).append(v)
        for key, groups in by_view.items():
            if len(groups) == 1:
                files.append((key, None, groups[0]))
            else:
                g = Group(groups[0].node, None)
                g.items = groups
                files.append((key, None, g))
    else:
        prune(root)
        files.append((None, label, root))

    marks, entries, written = [], [], []
    for key, flabel, g in files:
        name_items(g, None)
        paths = []
        assign_paths(g, key or '', paths)
        for path, f in paths:
            marks.append((f, path))
        if flabel is None:
            flabel = f'{label}: {VIEW_LABELS.get(name, {}).get(key) or shorten(first_heading(g) or key.replace("-", " "), 60)}'
        rel = f'content/{name}.json' if key is None else f'content/{name}/{key}.json'
        out = ROOT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(to_data(g), ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline=chr(10))
        written.append((rel, len(paths)))
        entries.append([f'      - name: {q(name if key is None else f"{name}-{key}")}',
                        f'        label: {q(flabel)}',
                        f'        file: {rel}',
                        '        fields:', *to_yaml(g, 10)])

    # Mark the HTML, last offset first so earlier offsets stay valid.
    for f, path in sorted(marks, key=lambda m: -m[0].node.start):
        n = f.node
        tag_text = src[n.start:n.start_end]
        close = len(tag_text) - (2 if tag_text.endswith('/>') else 1)
        attr = f' data-cms="{path}"' + (f' data-cms-rich="{f.cls}"' if f.rich else '')
        src = src[:n.start + close] + attr + src[n.start + close:]
    src_file.write_text(src, encoding='utf-8', newline=chr(10))

    # Editor fields between this page's marker lines in config.yml.
    cfg_file = ROOT / 'src' / 'admin' / 'config.yml'
    cfg = cfg_file.read_text(encoding='utf-8')
    block = '\n'.join([f'      # >>> {name} (generated by scripts/cms-extract.py)', *[l for e in entries for l in e], f'      # <<< {name}'])
    region = re.compile(rf'      # >>> {re.escape(name)} .*?# <<< {re.escape(name)}', re.S)
    cfg = region.sub(lambda _: block, cfg) if region.search(cfg) else cfg.rstrip('\n') + '\n' + block + '\n'
    cfg_file.write_text(cfg, encoding='utf-8', newline=chr(10))

    for rel, count in written:
        print(f'  {rel}: {count} fields')
    print(f'  marked {len(marks)} elements in src/{page_dir + "/" if page_dir else ""}index.html')


def iter_nodes(node):
    for kind, c in node.content:
        if kind == 'el':
            yield c
            yield from iter_nodes(c)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1].strip('/'))
