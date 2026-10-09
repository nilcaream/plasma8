"""Makes the site's icons in public/ from assets/icon-source.png (Pillow: python3 -I scripts/make-icons.py).

The source is a hexagon tunnel on near-black; it is 1024 x 1025, so its top 1024 rows are the square used.
The maskable icon is the picture scaled to MASKABLE_SCALE so the outer hexagon sits inside the safe zone (the circle of
40% of the icon's width, https://web.dev/articles/maskable-icon), the rest the background colour; the loose ends of the
spiral lines fade into it instead of stopping at an edge.
"""

import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "icon-source.png"
OUT = ROOT / "public"
BACKGROUND = (3, 12, 18, 255)  # the corners of the source, #030c12
# the outer hexagon's corners are 0.497 of the width from its centre; times this it is 0.398, inside the 0.4 safe circle
MASKABLE_SCALE = 0.8
FADE_FROM, FADE_TO = 0.40, 0.50  # as a share of the icon's width, from the centre


def square() -> Image.Image:
    return Image.open(SOURCE).convert("RGBA").crop((0, 0, 1024, 1024))


def sized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.LANCZOS)


def maskable(image: Image.Image, size: int) -> Image.Image:
    inner = round(size * MASKABLE_SCALE)
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    picture = sized(image, inner)
    # fade the picture to the background between FADE_FROM and FADE_TO of the width from the centre
    alpha = Image.new("L", (inner, inner))
    pixels = alpha.load()
    offset = (size - inner) / 2
    for y in range(inner):
        for x in range(inner):
            d = math.hypot(x + offset - size / 2, y + offset - size / 2) / size
            pixels[x, y] = round(255 * min(1, max(0, (FADE_TO - d) / (FADE_TO - FADE_FROM))))
    canvas.paste(picture, (round(offset), round(offset)), alpha)
    return canvas


def main() -> None:
    OUT.mkdir(exist_ok=True)
    image = square()
    sized(image, 180).save(OUT / "apple-touch-icon.png")
    sized(image, 192).save(OUT / "icon-192.png")
    sized(image, 512).save(OUT / "icon-512.png")
    maskable(image, 512).save(OUT / "icon-maskable-512.png")
    sized(image, 256).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


main()
