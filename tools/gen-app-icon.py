#!/usr/bin/env python3
"""Draws the Harfiyen app icon and splash image in the design's look: navy night sky,
the ring of letter bubbles and a big H in the middle.

Writes app/assets/icon.png (1024, opaque, iOS), splash-icon.png (transparent, shown on
the #0a0d1f splash background) and the Android adaptive icon layers. Needs Pillow and the
Barlow fonts from app/node_modules (run `npm ci` in app/ first):

    uv run --with pillow python3 tools/gen-app-icon.py
"""
import math, os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'app', 'assets')
FONTS = os.path.join(ROOT, 'app', 'node_modules', '@expo-google-fonts')
DISPLAY = os.path.join(FONTS, 'barlow-condensed', '800ExtraBold', 'BarlowCondensed_800ExtraBold.ttf')

BG, BG_EDGE, GLOW = (10, 13, 31), (6, 8, 20), (36, 56, 150)
PENDING, PENDING_TOP = (38, 67, 209), (79, 120, 255)
GREEN, YELLOW, RED, WHITE = (34, 180, 94), (242, 189, 44), (229, 72, 77), (255, 255, 255)
LETTERS = 'ABCÇDEFGHIİJKLMNOÖPRSŞTUÜVYZ'
# A few answered bubbles so it reads as a game in progress, like the design's ring.
STATE = {'A': GREEN, 'B': GREEN, 'C': GREEN, 'Ç': YELLOW, 'D': GREEN, 'E': RED, 'F': GREEN, 'G': YELLOW, 'H': WHITE}
SS = 4  # supersampling factor for smooth edges


def font(px):
    return ImageFont.truetype(DISPLAY, px)


def background(size):
    img = Image.new('RGB', (size, size), BG_EDGE)
    d = ImageDraw.Draw(img)
    steps = 120
    for i in range(steps):
        t = i / steps
        r = int(size * 0.75 * (1 - t))
        c = tuple(int(BG_EDGE[k] + (GLOW[k] * 0.55 + BG[k] * 0.45 - BG_EDGE[k]) * t ** 1.6) for k in range(3))
        d.ellipse((size / 2 - r, size * 0.5 - r, size / 2 + r, size * 0.5 + r), fill=c)
    return img.filter(ImageFilter.GaussianBlur(size / 60))


def ring(size, scale):
    """The letter ring on a transparent layer; scale is the ring's share of the canvas."""
    big = size * SS
    layer = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    glow = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d, g = ImageDraw.Draw(layer), ImageDraw.Draw(glow)
    cx = cy = big / 2
    radius = big * 0.40 * scale
    bubble = math.pi * 2 * radius / len(LETTERS) * 0.44
    f = font(int(bubble * 1.15))
    for i, ch in enumerate(LETTERS):
        a = -math.pi / 2 + i * 2 * math.pi / len(LETTERS)
        x, y = cx + radius * math.cos(a), cy + radius * math.sin(a)
        fill = STATE.get(ch, PENDING)
        g.ellipse((x - bubble * 1.5, y - bubble * 1.5, x + bubble * 1.5, y + bubble * 1.5), fill=fill + (90 if fill == WHITE else 50,))
        d.ellipse((x - bubble, y - bubble, x + bubble, y + bubble), fill=fill, outline=WHITE if fill != WHITE else BG, width=int(bubble * 0.12))
        if fill == PENDING:
            d.chord((x - bubble * 0.8, y - bubble * 0.85, x + bubble * 0.8, y + bubble * 0.2), 180, 360, fill=PENDING_TOP)
        d.text((x, y + bubble * 0.04), ch, font=f, fill=BG if fill == WHITE else WHITE, anchor='mm')
    # Inner disc (the "face" of the host in the app) and the big H.
    inner = radius - bubble * 1.9
    g.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=GLOW + (120,))
    d.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=(20, 26, 54), outline=(60, 86, 200), width=int(bubble * 0.14))
    d.text((cx, cy + inner * 0.04), 'H', font=font(int(inner * 1.45)), fill=WHITE, anchor='mm')
    glow = glow.filter(ImageFilter.GaussianBlur(bubble * 0.9))
    out = Image.alpha_composite(glow, layer)
    return out.resize((size, size), Image.LANCZOS)


def main():
    icon = background(1024).convert('RGBA')
    icon = Image.alpha_composite(icon, ring(1024, 1.0)).convert('RGB')
    icon.save(os.path.join(ASSETS, 'icon.png'))
    ring(1024, 1.0).save(os.path.join(ASSETS, 'splash-icon.png'))
    # Android adaptive icon: content must sit inside the middle ~66% safe zone.
    ring(1024, 0.66).save(os.path.join(ASSETS, 'android-icon-foreground.png'))
    background(1024).save(os.path.join(ASSETS, 'android-icon-background.png'))
    mono = ring(1024, 0.66).split()[3]
    Image.merge('RGBA', (mono, mono, mono, mono)).save(os.path.join(ASSETS, 'android-icon-monochrome.png'))
    fav = icon.resize((48, 48), Image.LANCZOS)
    fav.save(os.path.join(ASSETS, 'favicon.png'))


if __name__ == '__main__':
    main()
