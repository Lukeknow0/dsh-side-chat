from __future__ import annotations

from pathlib import Path
import random
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs" / "assets"
BOARD = Image.open(ASSETS / "brand-board.png").convert("RGB")

INK = "#0B0D0E"
PAPER = "#F2F0E8"
MINT = "#B7E85B"
CORAL = "#E9705B"
LINE = "#333938"
MUTED = "#969B98"
DIN = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
SF = "/System/Library/Fonts/SFNS.ttf"
MONO = "/System/Library/Fonts/SFNSMono.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size=size)


def add_noise(image: Image.Image, amount: int = 7, seed: int = 41) -> None:
    rng = random.Random(seed)
    px = image.load()
    width, height = image.size
    for _ in range(width * height // 32):
        x = rng.randrange(width)
        y = rng.randrange(height)
        r, g, b = px[x, y]
        delta = rng.randint(-amount, amount)
        px[x, y] = tuple(max(0, min(255, c + delta)) for c in (r, g, b))


def rail_mark(draw: ImageDraw.ImageDraw, x: int, y: int, scale: int = 1) -> None:
    white = 11 * scale
    gap = 18 * scale
    radius = 6 * scale
    draw.rounded_rectangle((x, y, x + 240 * scale, y + white), radius=radius, fill=PAPER)
    draw.rounded_rectangle((x, y + gap, x + 136 * scale, y + gap + white), radius=radius, fill=PAPER)
    draw.rounded_rectangle((x + 128 * scale, y + gap, x + 188 * scale, y + gap + 68 * scale), radius=28 * scale, fill=MINT)
    draw.rounded_rectangle((x + 180 * scale, y + gap + 57 * scale, x + 240 * scale, y + gap + 68 * scale), radius=radius, fill=MINT)


def crop_surface() -> Image.Image:
    # The upper-right brand-board panel contains the art-directed product concept.
    panel = BOARD.crop((432, 0, 1024, 678))
    panel = ImageEnhance.Contrast(panel).enhance(1.06)
    return panel


def render_hero(size: tuple[int, int], output: str) -> None:
    width, height = size
    image = Image.new("RGB", size, INK)
    draw = ImageDraw.Draw(image)
    margin = round(width * 0.045)
    divider = round(width * 0.43)

    add_noise(image, amount=5)
    draw.rectangle((0, 0, width - 1, height - 1), outline=LINE, width=max(1, width // 1200))
    draw.line((divider, 0, divider, height), fill=LINE, width=max(1, width // 1600))

    unit = width / 2400
    rail_mark(draw, margin, round(110 * unit), max(1, round(unit)))
    draw.text((margin, round(245 * unit)), "DSH", font=font(DIN, round(184 * unit)), fill=PAPER)
    draw.text((margin + round(275 * unit), round(276 * unit)), "SIDE CHAT", font=font(MONO, round(49 * unit)), fill=PAPER, spacing=4)

    draw.text((margin, round(515 * unit)), "ASK ASIDE.", font=font(DIN, round(116 * unit)), fill=PAPER)
    draw.text((margin, round(618 * unit)), "STAY ON TRACK.", font=font(DIN, round(116 * unit)), fill=MINT)
    draw.ellipse((margin + round(680 * unit), round(693 * unit), margin + round(702 * unit), round(715 * unit)), fill=CORAL)

    body = "Codex-style temporary side conversations for DeepSeek Harness."
    draw.text((margin, round(805 * unit)), body, font=font(SF, round(31 * unit)), fill=MUTED)
    draw.text((margin, round(852 * unit)), "Inherit context. Keep the parent running. Close to discard.", font=font(SF, round(26 * unit)), fill=PAPER)

    command_y = round(1010 * unit)
    draw.rounded_rectangle((margin, command_y, divider - round(66 * unit), command_y + round(104 * unit)), radius=round(12 * unit), outline="#49504E", width=max(1, round(2 * unit)), fill="#111514")
    draw.text((margin + round(26 * unit), command_y + round(26 * unit)), "$  dsh plugin --profile web add dsh-side-chat", font=font(MONO, round(24 * unit)), fill=MINT)

    tags = ["READ-ONLY FORK", "PARENT STAYS LIVE", "BILINGUAL UI"]
    tx = margin
    ty = height - round(92 * unit)
    for label in tags:
        box = draw.textbbox((0, 0), label, font=font(MONO, round(18 * unit)))
        tw = box[2] - box[0]
        draw.text((tx, ty), label, font=font(MONO, round(18 * unit)), fill=PAPER)
        tx += tw + round(54 * unit)
        if label != tags[-1]:
            draw.ellipse((tx - round(29 * unit), ty + round(7 * unit), tx - round(19 * unit), ty + round(17 * unit)), fill=MINT)

    panel = crop_surface()
    target_w = width - divider - round(100 * unit)
    target_h = height - round(120 * unit)
    scale = min(target_w / panel.width, target_h / panel.height)
    panel = panel.resize((round(panel.width * scale), round(panel.height * scale)), Image.Resampling.LANCZOS)
    px = divider + (width - divider - panel.width) // 2
    py = (height - panel.height) // 2
    shadow = Image.new("RGBA", (panel.width + 80, panel.height + 80), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((40, 40, panel.width + 40, panel.height + 40), radius=24, fill=(0, 0, 0, 145))
    shadow = shadow.filter(ImageFilter.GaussianBlur(26))
    image.paste(shadow, (px - 40, py - 30), shadow)
    image.paste(panel, (px, py))

    image.save(ASSETS / output, optimize=True)


def render_crops() -> None:
    crop_surface().save(ASSETS / "concept-surface.png", optimize=True)
    BOARD.crop((432, 678, 1024, 1046)).save(ASSETS / "campaign-statement.png", optimize=True)
    BOARD.crop((0, 1046, 432, 1536)).save(ASSETS / "symbol-construction.png", optimize=True)


if __name__ == "__main__":
    ASSETS.mkdir(parents=True, exist_ok=True)
    render_hero((2400, 1350), "hero.png")
    render_hero((1200, 630), "social-card.png")
    render_crops()
    print("Rendered hero.png, social-card.png, and supporting brand crops")
