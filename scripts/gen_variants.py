import os, sys, time, glob
from PIL import Image

AS = os.path.expanduser('~/mnt/silverpeak/site/src/assets')
WIDTHS = [400, 640, 960, 1280, 1920]
SKIP = ('favicon', 'apple-touch-icon', 'silver-peak-design-build-logo')
BUDGET = float(sys.argv[1]) if len(sys.argv) > 1 else 150.0

originals = [f for f in sorted(os.listdir(AS))
             if f.endswith('.webp')
             and not any(f.startswith(s) for s in SKIP)
             and not any(f.endswith(f'-{w}w.webp') for w in WIDTHS)]

todo = []
for f in originals:
    src = os.path.join(AS, f)
    with Image.open(src) as im:
        ow = im.width
    for w in WIDTHS:
        if w >= ow:          # never upscale
            continue
        out = os.path.join(AS, f'{f[:-5]}-{w}w.webp')
        if not os.path.exists(out):
            todo.append((src, out, w))

t0 = time.time(); done = 0
for src, out, w in todo:
    if time.time() - t0 > BUDGET:
        break
    with Image.open(src) as im:
        im = im.convert('RGB')
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(out, 'WEBP', quality=80, method=4)
    done += 1

print(f'generated {done} this run, {len(todo)-done} remaining ({len(originals)} originals)')
