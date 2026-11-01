# -*- coding: utf-8 -*-
"""Draw the app icon (generic fairy-tale castle, not a Disney logo) -> ../icons/icon-192.png, icon-512.png"""
import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.path.dirname(HERE), "icons")
os.makedirs(OUT, exist_ok=True)

S = 1024
img = Image.new("RGB", (S, S), "#24165a")
d = ImageDraw.Draw(img)
for y in range(S):  # night-sky vertical gradient
    t = y / S
    r = int(0x16 + (0x6a - 0x16) * t); g = int(0x0f + (0x2e - 0x0f) * t); b = int(0x3d + (0x9c - 0x3d) * t)
    d.line([(0, y), (S, y)], fill=(r, g, b))
glow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([212, 260, 812, 900], fill=(245, 196, 81, 90))
img.paste(glow.filter(ImageFilter.GaussianBlur(80)), (0, 0), glow.filter(ImageFilter.GaussianBlur(80)))
d = ImageDraw.Draw(img)
gold, gold2, night = (245, 196, 81), (255, 232, 163), (36, 22, 90)
u = S / 240.0  # castle drawn in the same 240x120 box as the header SVG, scaled and centred
ox, oy = 103, 290
def P(pts): return [(ox + x * u, oy + y * u) for x, y in pts]
castle = [(20,120),(20,70),(34,70),(34,62),(40,48),(46,62),(46,70),(56,70),(56,56),(65,32),(74,56),(74,70),(82,70),(82,44),(96,8),(110,44),
          (110,70),(118,70),(118,56),(127,32),(136,56),(136,70),(146,70),(146,62),(152,48),(158,62),(158,70),(172,70),(172,120)]
castle = [(x + 0, y) for x, y in castle]
d.polygon(P(castle), fill=gold)
d.polygon(P([(96,8),(96,0),(106,4)]), fill=gold2)
d.rounded_rectangle(P([(88,96),(104,120)]), radius=int(8 * u), fill=night)
for (x, y) in [(37,76),(62,64),(93,42),(124,64),(149,76),(76,86),(110,86)]:
    d.rounded_rectangle(P([(x,y),(x+5,y+9)]), radius=int(2.5 * u), fill=night)
for (x, y, rr) in [(150, 150, 10), (860, 210, 14), (780, 120, 7), (120, 330, 8), (900, 400, 9), (250, 90, 6)]:
    d.polygon([(x, y - rr * 2), (x + rr * .5, y - rr * .5), (x + rr * 2, y), (x + rr * .5, y + rr * .5), (x, y + rr * 2), (x - rr * .5, y + rr * .5), (x - rr * 2, y), (x - rr * .5, y - rr * .5)], fill=gold2)
for size in (512, 192):
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"icon-{size}.png"), optimize=True)
print("icons written to", OUT)
