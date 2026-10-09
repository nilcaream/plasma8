"""Makes the site's icons in public/ from assets/icon-source.png (Pillow: python3 -I scripts/make-icons.py).

The source is a hexagon tunnel on a transparent background, 1024 x 1025; the hexagon spans rows 2 to 1024, so the square
used is rows 1 to 1024, and the favicon and the 192 and 512 icons keep the transparency. The apple-touch icon and the maskable icon get the app's background colour behind it: iOS draws the
transparent pixels of an apple-touch icon black, and a maskable icon has to be opaque
(https://web.dev/articles/maskable-icon). The maskable icon is the picture scaled to MASKABLE_SCALE so the outer
hexagon sits inside the safe zone, the circle of 40% of the icon's width (the same article).
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "icon-source.png"
OUT = ROOT / "public"
BACKGROUND = (0, 0, 0, 255)  # the page's background, #000 (src/style.css, body)
# the outer hexagon's corners are 0.499 of the width from its centre; times this it is 0.399, inside the 0.4 safe circle
MASKABLE_SCALE = 0.8


def square() -> Image.Image:
    return Image.open(SOURCE).convert("RGBA").crop((0, 1, 1024, 1025))


def sized(image: Image.Image, size: int) -> Image.Image:
    return image.resize((size, size), Image.LANCZOS)


def on_background(image: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", image.size, BACKGROUND)
    canvas.alpha_composite(image)
    return canvas


def maskable(image: Image.Image, size: int) -> Image.Image:
    inner = round(size * MASKABLE_SCALE)
    canvas = Image.new("RGBA", (size, size), BACKGROUND)
    offset = round((size - inner) / 2)
    canvas.alpha_composite(sized(image, inner), (offset, offset))
    return canvas


def main() -> None:
    OUT.mkdir(exist_ok=True)
    image = square()
    on_background(sized(image, 180)).save(OUT / "apple-touch-icon.png")
    sized(image, 192).save(OUT / "icon-192.png")
    sized(image, 512).save(OUT / "icon-512.png")
    maskable(image, 512).save(OUT / "icon-maskable-512.png")
    sized(image, 256).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


main()
