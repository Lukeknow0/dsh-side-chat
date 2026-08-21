from __future__ import annotations

import os
from pathlib import Path
import random
import shutil
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(os.environ.get("DSH_SIDE_CHAT_TEST_ASSETS_DIR", ROOT / "docs" / "assets"))

RENDERED_ASSET_NAMES = (
    "brand-board.png",
    "hero-dark.png",
    "hero.png",
    "social-card.png",
    "installed-overview-en.png",
    "installed.png",
    "concept-surface.png",
    "campaign-statement.png",
    "symbol-construction.png",
)

INK = "#0B0D0E"
PAPER = "#F2F0E8"
MINT = "#B7E85B"
CORAL = "#E9705B"
LINE = "#333938"
MUTED = "#969B98"
DIN = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
SF = "/System/Library/Fonts/SFNS.ttf"
MONO = "/System/Library/Fonts/SFNSMono.ttf"

SIGN_WIDTH = 48
SIGN_HEIGHT = 24
SIGN_STROKE = 4


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


def cubic_point(t: float) -> tuple[float, float]:
    mt = 1 - t
    x = mt**3 * 25 + 3 * mt**2 * t * 29 + 3 * mt * t**2 * 30 + t**3 * 35
    y = mt**3 * 14 + 3 * mt**2 * t * 14 + 3 * mt * t**2 * 20 + t**3 * 20
    return x, y


def round_cap(draw: ImageDraw.ImageDraw, point: tuple[float, float], stroke: int, fill: str) -> None:
    radius = stroke / 2
    x, y = point
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)


def draw_sign(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, neutral: str) -> None:
    scale = width / SIGN_WIDTH
    stroke = max(2, round(SIGN_STROKE * scale))
    # ImageDraw leaves one-pixel seams between fractional curve segments. Snap
    # sampling coordinates to its integer raster grid before connecting them.
    point = lambda px, py: (round(x + px * scale), round(y + py * scale))
    top = [point(4, 6), point(44, 6)]
    lower_neutral = [point(4, 14), point(25, 14)]
    lower_mint = [point(*cubic_point(index / 24)) for index in range(25)]
    lower_mint.append(point(44, 20))
    draw.line(top, fill=neutral, width=stroke)
    draw.line(lower_neutral, fill=neutral, width=stroke)
    draw.line(lower_mint, fill=MINT, width=stroke, joint="curve")
    round_cap(draw, top[0], stroke, neutral)
    round_cap(draw, top[-1], stroke, neutral)
    round_cap(draw, lower_neutral[0], stroke, neutral)
    round_cap(draw, lower_mint[-1], stroke, MINT)


def repaint_sign_region(
    draw: ImageDraw.ImageDraw,
    region: tuple[int, int, int, int],
    background: str,
    sign: tuple[int, int, int],
    neutral: str,
) -> None:
    draw.rectangle(region, fill=background)
    draw_sign(draw, *sign, neutral)


def patch_product_surface_signs(board: Image.Image) -> None:
    draw = ImageDraw.Draw(board)
    product_background = "#0C0E0F"
    repaint_sign_region(draw, (800, 148, 830, 175), product_background, (802, 151, 28), PAPER)
    repaint_sign_region(draw, (800, 295, 826, 320), product_background, (801, 298, 25), PAPER)


def patch_ui_system_signs(board: Image.Image) -> None:
    draw = ImageDraw.Draw(board)
    panel_background = "#111416"
    repaint_sign_region(draw, (480, 1149, 535, 1187), panel_background, (484, 1154, 47), PAPER)
    repaint_sign_region(draw, (480, 1291, 558, 1345), panel_background, (486, 1297, 66), PAPER)
    # A dark local backing keeps the mint branch legible on the mint app tile.
    repaint_sign_region(draw, (621, 1297, 699, 1337), INK, (627, 1297, 66), PAPER)
    repaint_sign_region(draw, (761, 1291, 841, 1345), PAPER, (768, 1297, 66), INK)
    repaint_sign_region(draw, (902, 1291, 982, 1345), panel_background, (909, 1297, 66), PAPER)


def patch_installed_overview_signs(image: Image.Image) -> None:
    draw = ImageDraw.Draw(image)
    toolbar_background = "#FAFCF6"
    drawer_background = "#F7F7F7"
    repaint_sign_region(draw, (1378, 196, 1410, 219), toolbar_background, (1380, 198, 30), INK)
    repaint_sign_region(draw, (1890, 188, 1945, 237), drawer_background, (1896, 197, 43), INK)
    repaint_sign_region(draw, (1878, 545, 1905, 566), drawer_background, (1880, 547, 24), INK)


def crop_surface() -> Image.Image:
    # The upper-right brand-board panel contains the art-directed product concept.
    board = Image.open(ASSETS / "brand-board.png").convert("RGB")
    panel = board.crop((432, 0, 1024, 678))
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
    draw_sign(draw, margin, round(104 * unit), round(240 * unit), PAPER)
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


def render_installed_overview() -> None:
    image = Image.open(ASSETS / "installed-overview-en.png").convert("RGB")
    draw = ImageDraw.Draw(image)
    background = image.getpixel((80, 140))
    draw.rectangle((80, 140, 240, 245), fill=background)
    draw_sign(draw, 100, 165, 120, INK)
    patch_installed_overview_signs(image)
    image.save(ASSETS / "installed-overview-en.png", optimize=True)
    shutil.copyfile(ASSETS / "installed-overview-en.png", ASSETS / "installed.png")


def render_construction_panel() -> Image.Image:
    width, height = 432, 490
    image = Image.new("RGB", (width, height), INK)
    add_noise(image, amount=4, seed=43)
    draw = ImageDraw.Draw(image)

    draw.text((38, 39), "SYMBOL CONSTRUCTION", font=font(MONO, 13), fill=PAPER)

    sign_x, sign_y, sign_width = 76, 149, 280
    scale = sign_width / SIGN_WIDTH
    grid_left = sign_x
    grid_x = (sign_x, sign_x + 12 * scale, sign_x + 36 * scale, sign_x + SIGN_WIDTH * scale)
    grid_top = sign_y
    grid_bottom = sign_y + SIGN_HEIGHT * scale
    guide = "#3C423F"
    dimension = "#687365"

    for guide_x in grid_x:
        draw.line((guide_x, grid_top, guide_x, grid_bottom), fill=guide, width=1)
    for guide_y in (grid_top, sign_y + 6 * scale, sign_y + 14 * scale, sign_y + 20 * scale, grid_bottom):
        draw.line((grid_left, guide_y, grid_x[-1], guide_y), fill=guide, width=1)

    dimension_y = sign_y - 16
    for start, end, label in zip(grid_x, grid_x[1:], ("X", "2X", "X")):
        draw.line((start, dimension_y, end, dimension_y), fill=dimension, width=1)
        draw.line((start, dimension_y - 4, start, dimension_y + 4), fill=dimension, width=1)
        draw.line((end, dimension_y - 4, end, dimension_y + 4), fill=dimension, width=1)
        box = draw.textbbox((0, 0), label, font=font(MONO, 13))
        draw.text(((start + end - (box[2] - box[0])) / 2, dimension_y - 25), label, font=font(MONO, 13), fill=MINT)

    draw_sign(draw, sign_x, sign_y, sign_width, PAPER)
    draw.text(
        (38, 382),
        "Two parallel lanes. One short branch.\nContext diverges briefly; the parent keeps moving.",
        font=font(MONO, 12),
        fill=PAPER,
        spacing=6,
    )
    return image


def patch_brand_board(construction: Image.Image) -> None:
    board = Image.open(ASSETS / "brand-board.png").convert("RGB")
    draw = ImageDraw.Draw(board)
    draw.rectangle((58, 200, 402, 355), fill=INK)
    draw_sign(draw, 68, 220, 296, PAPER)
    patch_product_surface_signs(board)
    patch_ui_system_signs(board)
    board.paste(construction, (0, 1046))
    board.save(ASSETS / "brand-board.png", optimize=True)


def render_crops(construction: Image.Image) -> None:
    board = Image.open(ASSETS / "brand-board.png").convert("RGB")
    crop_surface().save(ASSETS / "concept-surface.png", optimize=True)
    board.crop((432, 678, 1024, 1046)).save(ASSETS / "campaign-statement.png", optimize=True)
    construction.save(ASSETS / "symbol-construction.png", optimize=True)


if __name__ == "__main__":
    ASSETS.mkdir(parents=True, exist_ok=True)
    construction = render_construction_panel()
    patch_brand_board(construction)
    render_hero((2400, 1350), "hero-dark.png")
    shutil.copyfile(ASSETS / "hero-dark.png", ASSETS / "hero.png")
    render_hero((1200, 630), "social-card.png")
    render_installed_overview()
    render_crops(construction)
    print("Rendered hero-dark.png, hero.png, social-card.png, installed overviews, and supporting brand crops")
