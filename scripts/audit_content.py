#!/usr/bin/env python3
"""
Content quality audit: finds mechanical defects that indicate machine-generated
filler ("AI slop") in the site's body copy and structured data.

Deliberately separates:
  MECHANICAL  - duplication, repetition. Objectively wrong. Safe to fix.
  STYLISTIC   - filler phrasing, uniform rhythm. A judgement call for a human.

Industry vocabulary normal for a design-build contractor (craftsmanship,
attention to detail, peace of mind) is NOT treated as slop.
"""
import json, os, re, sys, glob, statistics
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from bs4 import BeautifulSoup

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src')

# Strong tells: language that rarely appears in copy a tradesperson wrote.
HIGH = ["when it comes to", "in today's", "fast-paced", "look no further",
        "at the end of the day", "it's important to note", "it is important to note",
        "rest assured", "delve into", "tapestry", "testament to", "in the realm of",
        "unlock the", "elevate your", "transform your space", "cutting-edge",
        "state-of-the-art", "top-notch", "myriad", "plethora", "navigate the complexities",
        "we understand that", "whether you're looking", "not only", "furthermore",
        "moreover", "ultimately", "seamless", "holistic", "leverage", "boasts",
        "nestled", "robust solution", "comprehensive solution", "tailored to your unique"]

# Hollow but plausible. Flag only if unusually dense.
MEDIUM = ["comprehensive", "ensuring", "additionally", "meticulous", "meticulously",
          "seamlessly", "expertise", "dedicated to", "committed to", "wide range of",
          "high-quality", "exceptional", "unparalleled", "bespoke", "curated"]

# Normal trade vocabulary. Never flagged.
ALLOWED = {"craftsmanship", "attention to detail", "peace of mind", "design-build",
           "permitting", "site assessment", "scope", "punch list"}

SENT_RE = re.compile(r'(?<=[.!?])\s+(?=[A-Z"“])')
MIN_LEN = 45          # ignore fragments; headings and labels are not prose


def page_text(path):
    soup = BeautifulSoup(open(path, encoding='utf-8').read(), 'lxml')
    main = soup.find('main')
    if main is None:
        return '', []
    for bad in main(['script', 'style', 'noscript']):
        bad.decompose()
    blocks = []
    for el in main.find_all(['p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote']):
        t = re.sub(r'\s+', ' ', el.get_text(' ', strip=True)).strip()
        if t:
            blocks.append((el.name, t))
    return ' '.join(b[1] for b in blocks), blocks


def sentences(text):
    return [s.strip() for s in SENT_RE.split(text) if len(s.strip()) >= MIN_LEN]


def jsonld_blocks(path):
    soup = BeautifulSoup(open(path, encoding='utf-8').read(), 'lxml')
    out = []
    for tag in soup.find_all('script', attrs={'type': 'application/ld+json'}):
        try:
            out.append(json.loads(tag.string))
        except Exception as e:
            out.append({'__parse_error__': str(e)})
    return out


def walk_strings(obj, path='$'):
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from walk_strings(v, f'{path}.{k}')
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_strings(v, f'{path}[{i}]')
    elif isinstance(obj, str):
        yield path, obj


def main():
    pages = [('home', f'{ROOT}/index.html')] + [
        (os.path.basename(os.path.dirname(p)), p)
        for p in sorted(glob.glob(f'{ROOT}/*/index.html'))]

    findings = {'mechanical': [], 'stylistic': []}
    all_sents = defaultdict(list)     # sentence -> [pages]
    stats = {}

    for name, path in pages:
        text, blocks = page_text(path)
        sents = sentences(text)
        stats[name] = {'words': len(text.split()), 'sentences': len(sents), 'blocks': len(blocks)}

        # --- MECHANICAL: exact duplicates inside one page --------------------
        seen = Counter(sents)
        for s, n in seen.items():
            if n > 1:
                findings['mechanical'].append(
                    (name, 'duplicate sentence', f'x{n}', s))

        # --- MECHANICAL: near-duplicates inside one page ---------------------
        uniq = list(dict.fromkeys(sents))
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                a, b = uniq[i], uniq[j]
                if abs(len(a) - len(b)) > 60:
                    continue
                r = SequenceMatcher(None, a, b).ratio()
                if 0.88 <= r < 1.0:
                    findings['mechanical'].append(
                        (name, 'near-duplicate', f'{r:.0%} similar', f'{a}  ||  {b}'))

        for s in set(sents):
            all_sents[s].append(name)

        # --- MECHANICAL: JSON-LD duplicated sentences ------------------------
        for block in jsonld_blocks(path):
            if '__parse_error__' in block:
                findings['mechanical'].append(
                    (name, 'JSON-LD parse error', '', block['__parse_error__']))
                continue
            for jpath, val in walk_strings(block):
                if len(val) < 80:
                    continue
                parts = [p.strip() for p in SENT_RE.split(val) if p.strip()]
                if len(parts) != len(set(parts)):
                    dupe = next(p for p in parts if parts.count(p) > 1)
                    findings['mechanical'].append(
                        (name, 'JSON-LD duplicated sentence', jpath, dupe[:130]))

        # --- STYLISTIC: filler phrases ---------------------------------------
        low = text.lower()
        for phrase in HIGH:
            n = low.count(phrase)
            if n:
                findings['stylistic'].append((name, 'filler (strong)', f'x{n}', phrase))
        wc = max(len(text.split()), 1)
        for phrase in MEDIUM:
            n = low.count(phrase)
            if n and (n / wc) * 1000 > 1.2:      # >1.2 per 1000 words
                findings['stylistic'].append(
                    (name, 'overused', f'x{n} ({n/wc*1000:.1f}/1k words)', phrase))

        # --- STYLISTIC: repeated sentence openers ----------------------------
        openers = Counter(' '.join(s.split()[:3]).lower() for s in sents)
        for op, n in openers.items():
            if n >= 3:
                findings['stylistic'].append((name, 'repeated opener', f'x{n}', op + ' ...'))

        # --- STYLISTIC: uniform sentence length ------------------------------
        if len(sents) >= 8:
            lens = [len(s.split()) for s in sents]
            cv = statistics.pstdev(lens) / statistics.mean(lens)
            stats[name]['cv'] = cv
            if cv < 0.38:
                findings['stylistic'].append(
                    (name, 'uniform rhythm', f'CV {cv:.2f}',
                     f'mean {statistics.mean(lens):.0f} words — little variation'))

    # --- MECHANICAL: same sentence reused across pages -----------------------
    for s, pgs in all_sents.items():
        if len(pgs) > 1:
            findings['mechanical'].append(
                ('/'.join(sorted(set(pgs))), 'cross-page duplicate', f'{len(set(pgs))} pages', s))

    # ---------------------------------------------------------------- report
    print('=' * 78)
    print('CONTENT AUDIT'.center(78))
    print('=' * 78)
    print(f"\n{'page':<22}{'words':>8}{'sentences':>11}{'rhythm CV':>12}")
    print('-' * 53)
    for n, s in stats.items():
        cv = f"{s['cv']:.2f}" if 'cv' in s else '-'
        print(f"{n:<22}{s['words']:>8}{s['sentences']:>11}{cv:>12}")

    for bucket, label in [('mechanical', 'MECHANICAL DEFECTS  (objectively wrong)'),
                          ('stylistic', 'STYLISTIC FLAGS  (human judgement)')]:
        items = findings[bucket]
        print(f'\n\n{label}  —  {len(items)} finding(s)')
        print('=' * 78)
        if not items:
            print('  none')
            continue
        by_kind = defaultdict(list)
        for f in items:
            by_kind[f[1]].append(f)
        for kind, rows in sorted(by_kind.items(), key=lambda kv: -len(kv[1])):
            print(f'\n  {kind}  ({len(rows)})')
            for page, _, meta, detail in rows[:12]:
                d = detail if len(detail) <= 150 else detail[:147] + '...'
                print(f'    [{page}] {meta}')
                print(f'      {d}')
            if len(rows) > 12:
                print(f'    ... and {len(rows) - 12} more')

    total_mech = len(findings['mechanical'])
    print('\n' + '=' * 78)
    print(f'{total_mech} mechanical defect(s), {len(findings["stylistic"])} stylistic flag(s)')
    return 1 if total_mech else 0


if __name__ == '__main__':
    sys.exit(main())
