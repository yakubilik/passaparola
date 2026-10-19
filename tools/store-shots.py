#!/usr/bin/env python3
"""Turns the raw simulator screenshots (iPhone 17 Pro Max, 1320x2868) into App Store sets:

    uv run --with pillow python3 tools/store-shots.py <raw dir> docs/store/screenshots

<out>/6.9/<name>.png is the screenshot as taken; <out>/6.5/<name>.png is it scaled to
1284 wide and centre-cropped to 2778 high (the 6.5" size; the aspect ratios differ by
under half a percent). Both are saved as RGB, since App Store Connect rejects alpha.
"""
import os, sys
from PIL import Image

SIZES = {'6.9': (1320, 2868), '6.5': (1284, 2778)}


def main(raw, out):
    shots = sorted(f for f in os.listdir(raw) if f.endswith('.png'))
    if not shots:
        sys.exit(f'no screenshots in {raw}')
    for size, (w, h) in SIZES.items():
        os.makedirs(os.path.join(out, size), exist_ok=True)
        for f in shots:
            im = Image.open(os.path.join(raw, f)).convert('RGB')
            if im.size != SIZES['6.9']:
                sys.exit(f'{f} is {im.size}, expected {SIZES["6.9"]}')
            if (w, h) != im.size:
                sh = round(im.height * w / im.width)
                im = im.resize((w, sh), Image.LANCZOS)
                top = (sh - h) // 2
                im = im.crop((0, top, w, top + h))
            im.save(os.path.join(out, size, f), optimize=True)
            print(f'{size}/{f} {im.size}')


if __name__ == '__main__':
    main(*sys.argv[1:3])
