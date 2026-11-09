#!/usr/bin/env python3
"""(T)rustyShelf's logo: the rusty stocked rack (icon) and the (T)RUSTYSHELF wordmark, as standalone SVG files.

The wordmark's letters are outlines (Lexend ExtraBold, the app's own face, SIL OFL), so it looks the same wherever it's
shown, fonts or not.   python3 -I scripts/make-logo.py renderer/fonts/lexend-latin-800-normal.woff2 renderer/brand
Then the PNGs (app icon, Android launcher and splash images) are rendered from these SVGs (see scripts/make-icons.sh).
"""
import os
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

FONT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

SLATE = "#27323e"
RUST_TOP, RUST_MID, RUST_LOW, RUST_DARK, RUST_EDGE = "#cf6a2d", "#b04a21", "#8d3417", "#66240f", "#de8a43"


def drip(x, y, h=24):
    """a rust drip hanging from an edge at (x, y)"""
    return f'<path d="M{x - 5} {y} C{x - 5} {y + h * .45} {x - 7} {y + h * .7} {x} {y + h} C{x + 7} {y + h * .7} {x + 5} {y + h * .45} {x + 5} {y} Z" fill="{RUST_LOW}"/>'


def rack(simple=False):
    """the icon on a 512 grid: grey steel, eaten by rust"""
    p = [f'<rect width="512" height="512" rx="112" fill="{SLATE}"/>',
         '<defs><linearGradient id="st" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#aeb8c1"/><stop offset="1" stop-color="#7f8a95"/></linearGradient></defs>']
    if simple:  # 16-32 px: the rack's shape, mostly rust, nothing finer
        p += [f'<rect x="100" y="88" width="50" height="340" rx="22" fill="{RUST_MID}"/>', f'<rect x="362" y="88" width="50" height="340" rx="22" fill="{RUST_MID}"/>',
              '<rect x="100" y="88" width="50" height="110" rx="22" fill="#9aa5b0"/>', '<rect x="362" y="88" width="50" height="70" rx="22" fill="#9aa5b0"/>']
        p += [f'<rect x="150" y="{y}" width="212" height="40" fill="{c}"/>' for y, c in ((156, "#9aa5b0"), (246, RUST_MID), (336, RUST_MID))]
        p += [f'<rect x="230" y="156" width="132" height="40" fill="{RUST_MID}"/>', '<rect x="166" y="96" width="34" height="60" fill="#e8e1d3"/>', '<rect x="208" y="104" width="30" height="52" fill="#5d8fb2"/>']
        return "\n".join(p)
    # uprights: steel, with rust climbing up from the floor and spreading in patches; slots; pits bitten out of the edges
    for x, up in ((112, 210), (374, 160)):
        p.append(f'<rect x="{x}" y="92" width="26" height="330" rx="13" fill="url(#st)"/>')
        p.append(f'<path d="M{x} {up} q7 -14 13 -2 q7 -16 13 2 V409 a13 13 0 0 1 -26 0 Z" fill="{RUST_MID}"/>')
        p += [f'<rect x="{x + 10}" y="{y}" width="6" height="18" rx="3" fill="{SLATE}"/>' for y in (118, 178, 238, 298, 358)]
    p += [f'<path d="M112 128 q10 -8 20 0 q2 12 -8 16 q-10 2 -12 -6 Z" fill="{RUST_MID}"/>',
          f'<path d="M374 112 q12 -2 16 8 q-2 10 -12 8 q-6 -6 -4 -16 Z" fill="{RUST_MID}"/>',
          f'<path d="M112 300 q10 -6 18 2 q4 14 -6 22 q-9 4 -12 -4 Z" fill="{RUST_DARK}"/>',
          f'<path d="M376 330 q10 -4 16 6 q2 12 -10 16 q-8 0 -6 -10 Z" fill="{RUST_DARK}"/>',
          f'<circle cx="112" cy="262" r="5" fill="{SLATE}"/><circle cx="400" cy="226" r="5" fill="{SLATE}"/><circle cx="138" cy="372" r="4" fill="{SLATE}"/>']
    # game cases: three on the top board (one leaning), two on the middle one
    p += ['<rect x="150" y="110" width="24" height="58" rx="3" fill="#e8e1d3"/>',
          '<rect x="178" y="118" width="22" height="50" rx="3" fill="#5d8fb2"/>',
          '<g transform="rotate(16 228 168)"><rect x="210" y="114" width="22" height="54" rx="3" fill="#e3b54a"/></g>',
          '<rect x="302" y="216" width="24" height="56" rx="3" fill="#e8e1d3"/>',
          '<rect x="330" y="222" width="22" height="50" rx="3" fill="#6f9c74"/>']
    # boards: steel with rust eating in from the ends, dark pits, rust running down
    rust_runs = (((236, 374),), ((138, 300),), ((138, 374),))   # where each board has rusted through
    for i, y in enumerate((168, 272, 376)):
        p.append(f'<rect x="138" y="{y}" width="236" height="22" fill="url(#st)"/><rect x="138" y="{y}" width="236" height="4" fill="#cdd5dc"/>')
        for a, b in rust_runs[i]:
            p.append(f'<path d="M{a} {y} q10 6 4 12 q-6 6 2 10 H{b} V{y} Z" fill="{RUST_MID}"/>' if a > 138 else
                     f'<path d="M{a} {y} H{b} q-10 6 -4 12 q6 6 -2 10 H{a} Z" fill="{RUST_MID}"/>' if b < 374 else
                     f'<rect x="{a}" y="{y}" width="{b - a}" height="22" fill="{RUST_MID}"/>')
        patch_x = (300, 190, 270)[i]
        p.append(f'<path d="M{patch_x} {y + 7} q14 -4 30 2 q4 8 -6 12 q-16 2 -24 -4 Z" fill="{RUST_DARK}"/>')
        p += [drip(x, y + 22, h) for x, h in ((((262, 26), (344, 18)), ((206, 30), (276, 18)), ((182, 22), (318, 28)))[i])]
    return "\n".join(p)


def svg(w, h, body, label):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{label}">\n{body}\n</svg>\n'


# ---------- the wordmark's letters as outlines ----------
font = TTFont(FONT)
gs, cmap, hmtx, upm = font.getGlyphSet(), font.getBestCmap(), font["hmtx"], font["head"].unitsPerEm


def word_paths(text, size, x0, base, track=0.03):
    """[(char, svg path d, advance)] with the letters set left to right from x0 on the baseline"""
    out, x, s = [], x0, size / upm
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (s, 0, 0, -s, x, base)))
        out.append((ch, pen.getCommands()))
        x += hmtx[g][0] * s + size * track
    return out, x - size * track - x0


def wordmark(size, x0, base, steel, rust):
    letters, width = word_paths("(T)RUSTYSHELF", size, x0, base)
    body = "".join(f'<path d="{d}" fill="{rust if 3 <= i <= 7 else steel}"/>' for i, (ch, d) in enumerate(letters))
    return body, width


files = {}
files["trustyshelf-icon.svg"] = svg(512, 512, rack(), "(T)rustyShelf")
files["trustyshelf-icon-small.svg"] = svg(512, 512, rack(simple=True), "(T)rustyShelf")
# Android's adaptive icon: the rack alone (the launcher draws the slate background and its own mask), inside the safe zone
fg = rack().split("\n", 1)[1]
files["trustyshelf-icon-foreground.svg"] = svg(512, 512, f'<g transform="translate(256 256) scale(.62) translate(-256 -256)">{fg}</g>', "(T)rustyShelf")
for theme, steel, rust in (("dark", "#dde4ea", "#d4522c"), ("light", "#34424f", "#a93c1b")):
    body, width = wordmark(96, 0, 96, steel, rust)
    files[f"trustyshelf-wordmark-{theme}.svg"] = svg(int(width) + 2, 124, body, "(T)RUSTYSHELF")
    icon = f'<svg x="0" y="0" width="160" height="160" viewBox="0 0 512 512">{rack()}</svg>'
    body2, width2 = wordmark(78, 188, 108, steel, rust)
    files[f"trustyshelf-logo-{theme}.svg"] = svg(int(188 + width2) + 4, 160, icon + body2, "(T)RUSTYSHELF")
for name, text in files.items():
    open(os.path.join(OUT, name), "w").write(text)
    print(name, len(text))
