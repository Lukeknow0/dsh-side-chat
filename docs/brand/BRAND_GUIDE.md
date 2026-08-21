# Side Chat visual identity

## Idea

Two parallel rails represent the parent and side conversations. One rail bends away for a short distance, then ends cleanly. The symbol should always feel directional, calm, and technical.

## Campaign line

**ASK ASIDE. STAY ON TRACK.**

Chinese product line: **临时问一句，主任务不跑偏。**

## Palette

| Role | Hex |
| --- | --- |
| Near-black field | `#0B0D0E` |
| Warm off-white type | `#F2F0E8` |
| Branch accent | `#B7E85B` |
| Attention accent | `#E9705B` |

Mint is the single functional accent. Coral is reserved for one small point of emphasis, error rules, or campaign punctuation.

## Typography

Use a condensed sans display face for campaign headlines, a neutral system sans for product copy, and a restrained monospace face for technical labels. Avoid generic purple AI gradients, mascots, glossy 3D, and decorative fake dashboards.

## Product surface

The shipped drawer follows DSH design tokens. Brand expression comes from the rail mark, mint branch accent, editorial empty state, and compact mono labels. Structural panels use a 16 px radius, content surfaces use 12 px, and circular controls remain pill-shaped.

## Assets

- `hero.png`: 2400 × 1350 README and launch hero
- `social-card.png`: 1200 × 630 social sharing artwork
- `installed.png`: verified installed-state screenshot
- `brand-board.png`: complete identity board
- `concept-surface.png`: art-directed product concept
- `symbol-construction.png`: logo geometry

Run `python3 scripts/render-brand-assets.py` to reproduce the derived campaign assets from the identity board.

Every platform verifies the complete tracked PNG manifest and committed SHA-256 hashes without invoking Python. The macOS CI leg installs the Pillow version pinned in `requirements-brand-assets.txt`, renders all nine assets twice in a temporary directory, and requires the second temporary render to match the first. It never writes to `docs/assets`.

Strict committed-byte equality is an authoring check, not a CI invariant. GitHub Actions job `96862052959` on `macos-26-arm64` produced different `brand-board.png` bytes with Pillow 12.2.0 because the renderer uses Apple system fonts and native rasterization varies across macOS environments. Before publishing regenerated images, run `DSH_SIDE_CHAT_STRICT_ASSET_BYTES=1 env CI=true pnpm vitest run tests/sign-contract.spec.ts` on the approved authoring Mac; this opt-in contract compares the first temporary render with all nine committed outputs.
