# Unified Parallel Side Branch Sign Design

**Status:** Approved in chat on 2026-08-21
**Scope:** Entire `dsh-side-chat` project identity and product UI

## Problem

The current project uses several related but visibly different marks. The dark README hero contains a rail-and-circle symbol, the light README visual contains a sharper folded rail, and the product UI uses three vertical bars. These variants weaken recognition and make the identity look generated per asset rather than governed by one system.

## Objective

Create one canonical sign that communicates the product action: the main task continues on its path while a temporary side conversation branches away without writing back. The same geometry must work on light and dark backgrounds, at campaign scale and at small UI-icon scale.

## Core Concept

The sign is named **Parallel Side Branch**.

- The upper rail remains straight from start to finish: the parent task stays live.
- The lower rail initially runs in parallel, then bends downward into a short secondary lane: a focused side conversation.
- The branch changes to acid mint at the divergence point: the temporary context is distinct but related.
- The two rails never reconnect visually, avoiding any implication that side-chat output writes back into the parent conversation.

No node, circle, arrowhead, speech bubble, gradient, shadow, or third color is part of the sign.

## Canonical Geometry

Use a `48 × 24` coordinate system with a `4` unit stroke width.

- Upper rail: `M4 6 H44`
- Lower rail centerline: `M4 14 H25 C29 14 30 20 35 20 H44`
- Stroke line caps: round
- Stroke line joins: round
- Neutral-to-mint transition: a hard color boundary at `x = 25`, implemented by clipping the mint overlay to the branch portion rather than using a gradient
- Minimum clear space: one stroke width on every side
- Default aspect ratio: `2:1`

All applications must preserve these paths and proportions. Scaling is uniform; stretching, redrawing, and generative reinterpretation are prohibited.

## Color Variants

### On light

- Neutral rails: near-black `#0B0D0E`
- Branch: acid mint `#B7E85B`

### On dark

- Neutral rails: warm white `#F2F0E8`
- Branch: acid mint `#B7E85B`

Coral `#E9705B` remains available as a campaign punctuation accent, but it never appears inside the sign.

## Lockups and Typography

The sign is an independent asset. Wordmarks and labels sit beside or below it and must not be fused into its geometry.

- Product name: `dsh-side-chat`
- Compact UI label: `SIDE CHAT`
- Campaign lockups may use `DSH SIDE CHAT`, but the sign retains its standard proportions and clear space.
- Typography can adapt by surface; the sign cannot.

## Application Scope

### Canonical vector assets

Create two SVG exports from the same geometry:

- `docs/assets/sign-on-light.svg`
- `docs/assets/sign-on-dark.svg`

Both files must use the same view box and path data. Only the neutral color differs.

### Product UI

Replace the current three-bar `.railMark` with an inline SVG component using the canonical paths. Apply it to the drawer header, empty state, loading/identity surfaces where the brand mark appears, and any future compact sign use.

### Documentation and campaign assets

Replace only the inconsistent sign regions while preserving all other approved content and layout:

- `docs/assets/hero-dark.png` and legacy alias `docs/assets/hero.png`
- `docs/assets/installed-overview-en.png` and legacy alias `docs/assets/installed.png`
- `docs/assets/brand-board.png`
- `docs/assets/symbol-construction.png`
- `docs/assets/social-card.png`
- Any additional active campaign or product-surface asset containing an older sign variant

The raster assets must use a rendered canonical SVG; the sign must not be regenerated independently by an image model.

## Implementation Boundaries

- No product behavior, side-chat lifecycle, permissions, localization, or API contracts change.
- No official DeepSeek or OpenAI logo is introduced.
- Existing user-owned unrelated working-tree changes remain untouched.
- README image URLs remain cache-safe and continue to work in both English and Chinese documentation.

## Verification

1. Compare the SVG view boxes and path data; they must be identical across light and dark variants.
2. Render the sign at `16`, `24`, `32`, and `64` pixels on both backgrounds and visually inspect separation, curve clarity, and color boundaries.
3. Inspect every active documentation image at full size and README display size to confirm the same silhouette.
4. Build and test the plugin after replacing the UI mark.
5. Open the live GitHub README and verify the dark hero remains first while the English overview visual remains in the installed section.
6. Confirm only intended brand and UI files are included in the final commit.

## Success Criteria

- One recognizable Parallel Side Branch silhouette appears throughout the project.
- Light and dark forms differ only in their neutral color.
- The mark remains legible at UI scale.
- No circle variant, sharp-fold variant, or three-vertical-bar variant remains in an active asset or UI surface.
- Both README versions display the correct images without stale-cache ambiguity.
