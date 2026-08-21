# Unified Parallel Side Branch Sign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every active `dsh-side-chat` identity mark with one canonical Parallel Side Branch sign across vector assets, the product UI, README visuals, and campaign materials.

**Architecture:** Define the sign as fixed `48 × 24` SVG geometry, enforce the geometry with a Vitest contract, and render the same paths through a dedicated React component and the existing deterministic Pillow brand renderer. Preserve approved raster layouts by replacing only sign regions, retain cache-safe README paths, and keep legacy image aliases byte-identical to their active counterparts.

**Tech Stack:** React 18, TypeScript 6, SVG, CSS Modules, Vitest, Python 3, Pillow, pnpm, macOS image inspection tools

## Global Constraints

- Canonical view box: `0 0 48 24`.
- Canonical upper path: `M4 6H44`.
- Canonical lower path: `M4 14H25C29 14 30 20 35 20H44`.
- Stroke width: `4`; line caps and joins: `round`.
- The neutral-to-mint boundary is a hard clip at `x = 25`; no gradient.
- Light neutral: `#0B0D0E`; dark neutral: `#F2F0E8`; branch: `#B7E85B`.
- No node, circle, arrowhead, speech bubble, shadow, coral, or third color inside the sign.
- Sign and typography remain independent assets.
- Product behavior, lifecycle, permissions, localization, and APIs do not change.
- Preserve unrelated working-tree changes, especially the pre-existing `lib/client.js` diff and untracked plan files.
- Active README order remains dark hero first and English overview in the installed section.

---

### Task 1: Establish the canonical SVG sign contract

**Files:**
- Create: `src/client/SideChatSign.tsx`
- Create: `docs/assets/sign-on-light.svg`
- Create: `docs/assets/sign-on-dark.svg`
- Create: `tests/sign-contract.spec.ts`

**Interfaces:**
- Produces: `SIDE_CHAT_SIGN_VIEW_BOX`, `SIDE_CHAT_SIGN_UPPER_PATH`, `SIDE_CHAT_SIGN_LOWER_PATH`, `SIDE_CHAT_SIGN_CLIP_X`, and `SideChatSign({ className?, title? })`
- Consumes: React `useId()` for collision-free clip-path identifiers

- [ ] **Step 1: Write the failing vector contract test**

Create `tests/sign-contract.spec.ts`:

```ts
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  SIDE_CHAT_SIGN_CLIP_X,
  SIDE_CHAT_SIGN_LOWER_PATH,
  SIDE_CHAT_SIGN_UPPER_PATH,
  SIDE_CHAT_SIGN_VIEW_BOX,
} from '../src/client/SideChatSign.tsx'

const assetUrl = (name: string) => new URL(`../docs/assets/${name}`, import.meta.url)

function pathData(svg: string): string[] {
  return [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1] ?? '')
}

describe('Parallel Side Branch sign contract', () => {
  it.each([
    ['sign-on-light.svg', '#0B0D0E'],
    ['sign-on-dark.svg', '#F2F0E8'],
  ])('keeps canonical geometry in %s', async (name, neutral) => {
    const svg = await readFile(assetUrl(name), 'utf8')
    expect(svg).toContain(`viewBox="${SIDE_CHAT_SIGN_VIEW_BOX}"`)
    expect(svg).toContain(`x="${SIDE_CHAT_SIGN_CLIP_X}"`)
    expect(svg).toContain(`stroke="${neutral}"`)
    expect(svg).toContain('stroke="#B7E85B"')
    expect(pathData(svg)).toEqual([
      SIDE_CHAT_SIGN_UPPER_PATH,
      SIDE_CHAT_SIGN_LOWER_PATH,
      SIDE_CHAT_SIGN_LOWER_PATH,
    ])
  })
})
```

- [ ] **Step 2: Run the test and verify the missing module/assets failure**

Run:

```bash
pnpm vitest run tests/sign-contract.spec.ts
```

Expected: FAIL because `src/client/SideChatSign.tsx` and the two SVG assets do not exist.

- [ ] **Step 3: Implement the canonical React sign**

Create `src/client/SideChatSign.tsx`:

```tsx
import { useId } from 'react'

export const SIDE_CHAT_SIGN_VIEW_BOX = '0 0 48 24'
export const SIDE_CHAT_SIGN_UPPER_PATH = 'M4 6H44'
export const SIDE_CHAT_SIGN_LOWER_PATH = 'M4 14H25C29 14 30 20 35 20H44'
export const SIDE_CHAT_SIGN_CLIP_X = 25

export interface SideChatSignProps {
  className?: string
  title?: string
}

export function SideChatSign({ className, title }: SideChatSignProps) {
  const clipId = `dsh-side-chat-sign-${useId().replaceAll(':', '')}`
  return (
    <svg
      className={className}
      viewBox={SIDE_CHAT_SIGN_VIEW_BOX}
      fill="none"
      role={title === undefined ? undefined : 'img'}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={SIDE_CHAT_SIGN_CLIP_X} y="0" width="23" height="24" />
        </clipPath>
      </defs>
      <path d={SIDE_CHAT_SIGN_UPPER_PATH} stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d={SIDE_CHAT_SIGN_LOWER_PATH} stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={SIDE_CHAT_SIGN_LOWER_PATH} stroke="#B7E85B" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" clipPath={`url(#${clipId})`} />
    </svg>
  )
}
```

- [ ] **Step 4: Create the light and dark SVG exports**

Create both SVGs with identical view boxes, clip rectangles, and path data. `sign-on-light.svg` uses `#0B0D0E` for the first two paths; `sign-on-dark.svg` uses `#F2F0E8`. Both use `#B7E85B` for the clipped lower-path overlay.

- [ ] **Step 5: Run the focused test and typecheck**

Run:

```bash
pnpm vitest run tests/sign-contract.spec.ts
pnpm run typecheck
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit the canonical sign**

```bash
git add src/client/SideChatSign.tsx docs/assets/sign-on-light.svg docs/assets/sign-on-dark.svg tests/sign-contract.spec.ts
git commit -m "feat: add canonical side-branch sign"
```

### Task 2: Replace the product UI mark

**Files:**
- Modify: `src/client/SideChatDrawer.tsx`
- Modify: `src/client/side-chat.module.css`
- Modify: `tests/sign-contract.spec.ts`
- Regenerate: `lib/client.js`

**Interfaces:**
- Consumes: `SideChatSign` from Task 1
- Produces: canonical sign instances in the drawer header, empty state, and loading state

- [ ] **Step 1: Add a failing UI integration contract**

Append to `tests/sign-contract.spec.ts`:

```ts
it('uses the canonical component on all drawer identity surfaces', async () => {
  const drawer = await readFile(new URL('../src/client/SideChatDrawer.tsx', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../src/client/side-chat.module.css', import.meta.url), 'utf8')
  expect(drawer).toContain("import { SideChatSign } from './SideChatSign.tsx'")
  expect(drawer.match(/<SideChatSign\b/g)).toHaveLength(3)
  expect(drawer).not.toContain('function RailMark')
  expect(styles).not.toContain('.railMark > span')
  expect(styles).not.toContain('.loadingRails span')
})
```

- [ ] **Step 2: Run the test and verify it fails on the old three-bar mark**

Run:

```bash
pnpm vitest run tests/sign-contract.spec.ts
```

Expected: FAIL because `SideChatDrawer.tsx` still defines `RailMark` and the CSS still styles three spans.

- [ ] **Step 3: Integrate `SideChatSign` in the drawer**

In `src/client/SideChatDrawer.tsx`:

- Import `SideChatSign` from `./SideChatSign.tsx`.
- Remove the local `RailMark` function.
- Replace the header and empty-state `<RailMark />` instances with `<SideChatSign className={css.railMark} />`.
- Replace the three loading spans with `<SideChatSign className={css.loadingMark} />`.

- [ ] **Step 4: Replace span-based CSS with SVG sizing**

In `src/client/side-chat.module.css`:

```css
.railMark {
  display: block;
  width: 28px;
  height: 28px;
  flex: none;
  box-sizing: border-box;
  padding: 6px;
  border: 1px solid color-mix(in srgb, #b7e85b 30%, var(--dsw-alias-border-l1));
  border-radius: 8px;
  background: color-mix(in srgb, #b7e85b 8%, transparent);
  color: var(--dsw-alias-label-tertiary);
}

.emptyState .railMark {
  width: 42px;
  height: 42px;
  margin-bottom: 22px;
  padding: 8px;
  border-radius: 12px;
}

.loadingMark {
  display: block;
  width: 48px;
  height: 24px;
  color: var(--dsw-alias-label-tertiary);
  animation: sign-pulse 900ms ease-in-out infinite alternate;
}

@keyframes sign-pulse {
  from { opacity: .32; transform: scale(.92); }
  to { opacity: 1; transform: scale(1); }
}
```

Remove the old `.railMark > span`, `.loadingRails`, `.loadingRails span`, and `@keyframes rail-pulse` rules. Update the reduced-motion selector from `.loadingRails span` to `.loadingMark`.

- [ ] **Step 5: Run focused and full code checks**

Run:

```bash
pnpm vitest run tests/sign-contract.spec.ts
pnpm run lint
pnpm run typecheck
pnpm run build
```

Expected: all commands exit 0; `lib/client.js` contains the new SVG paths and no generated three-span `RailMark` markup.

- [ ] **Step 6: Commit UI integration without unrelated files**

Inspect the pre-existing `lib/client.js` diff before staging. Stage only the source, test, and the regenerated bundle that corresponds to the canonical sign.

```bash
git add src/client/SideChatDrawer.tsx src/client/SideChatSign.tsx src/client/side-chat.module.css tests/sign-contract.spec.ts lib/client.js
git commit -m "feat: unify side chat UI sign"
```

### Task 3: Make the brand renderer use canonical geometry

**Files:**
- Modify: `scripts/render-brand-assets.py`
- Regenerate: `docs/assets/brand-board.png`
- Regenerate: `docs/assets/hero-dark.png`
- Regenerate: `docs/assets/hero.png`
- Regenerate: `docs/assets/social-card.png`
- Regenerate: `docs/assets/symbol-construction.png`

**Interfaces:**
- Consumes: the exact geometry and color constants from the approved design
- Produces: deterministic dark campaign assets with no circle or sharp-fold variants

- [ ] **Step 1: Add canonical renderer constants and curve sampling**

Replace the current rectangle-based `rail_mark()` implementation with normalized geometry:

```py
SIGN_WIDTH = 48
SIGN_HEIGHT = 24
SIGN_STROKE = 4


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
    point = lambda px, py: (x + px * scale, y + py * scale)
    top = [point(4, 6), point(44, 6)]
    lower_neutral = [point(4, 14), point(25, 14)]
    lower_mint = [point(*cubic_point(index / 24)) for index in range(25)]
    lower_mint.append(point(44, 20))
    draw.line(top, fill=neutral, width=stroke)
    draw.line(lower_neutral, fill=neutral, width=stroke)
    draw.line(lower_mint, fill=MINT, width=stroke, joint='curve')
    round_cap(draw, top[0], stroke, neutral)
    round_cap(draw, top[-1], stroke, neutral)
    round_cap(draw, lower_neutral[0], stroke, neutral)
    round_cap(draw, lower_mint[-1], stroke, MINT)
```

Use `draw_sign(..., neutral=PAPER)` in dark campaign assets. Remove the old oversized rounded rectangles that create the circle-like form.

- [ ] **Step 2: Render the active hero first, then copy the legacy alias**

Update the script entry point so `hero-dark.png` is the primary dark hero and `hero.png` is copied byte-for-byte from it after rendering. Continue rendering `social-card.png` from the same function and geometry.

- [ ] **Step 3: Render the construction panel from the normalized geometry**

Replace the old board crop for `symbol-construction.png` with a deterministic panel that uses `draw_sign()`, the `48 × 24` guide grid, the labels `X / 2X / X`, and this caption verbatim:

```text
Two parallel lanes. One short branch.
Context diverges briefly; the parent keeps moving.
```

Patch the brand board deterministically: repaint only its large sign region `(58, 200, 402, 355)` with `INK`, call `draw_sign(draw, 68, 220, 296, PAPER)`, and paste the regenerated `432 × 490` construction panel at `(0, 1046)`. Preserve every other board panel.

- [ ] **Step 4: Regenerate and inspect the dark assets**

Run:

```bash
python3 scripts/render-brand-assets.py
sips -g pixelWidth -g pixelHeight docs/assets/brand-board.png docs/assets/hero-dark.png docs/assets/hero.png docs/assets/social-card.png docs/assets/symbol-construction.png
cmp docs/assets/hero-dark.png docs/assets/hero.png
```

Expected: the renderer exits 0; both hero files are `2400 × 1350` and byte-identical; the social card is `1200 × 630`; the construction crop uses the same silhouette.

Open all four files with `view_image`. Confirm there is no lime circle and no sharp elbow.

- [ ] **Step 5: Commit the deterministic campaign assets**

```bash
git add scripts/render-brand-assets.py docs/assets/brand-board.png docs/assets/hero-dark.png docs/assets/hero.png docs/assets/social-card.png docs/assets/symbol-construction.png
git commit -m "docs: render campaign assets with unified sign"
```

### Task 4: Apply the light sign and preserve README placement

**Files:**
- Modify: `scripts/render-brand-assets.py`
- Regenerate: `docs/assets/installed-overview-en.png`
- Regenerate: `docs/assets/installed.png`
- Verify: `README.md`
- Verify: `README.zh.md`
- Modify: `tests/sign-contract.spec.ts`

**Interfaces:**
- Consumes: `draw_sign(..., neutral=INK)` from Task 3
- Produces: identical active and legacy light overview files with the canonical sign at the upper-left identity position

- [ ] **Step 1: Add a failing README and alias contract**

Append to `tests/sign-contract.spec.ts`:

```ts
it('regenerates the light overview and keeps README aliases stable', async () => {
  const [readme, readmeZh, renderer, hero, heroAlias, overview, overviewAlias] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../README.zh.md', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/render-brand-assets.py', import.meta.url), 'utf8'),
    readFile(assetUrl('hero-dark.png')),
    readFile(assetUrl('hero.png')),
    readFile(assetUrl('installed-overview-en.png')),
    readFile(assetUrl('installed.png')),
  ])
  for (const source of [readme, readmeZh]) {
    expect(source.indexOf('docs/assets/hero-dark.png')).toBeLessThan(source.indexOf('docs/assets/installed-overview-en.png'))
  }
  expect(renderer).toContain('def render_installed_overview()')
  expect(renderer).toContain('draw_sign(draw, 100, 165, 120, INK)')
  expect(heroAlias.equals(hero)).toBe(true)
  expect(overviewAlias.equals(overview)).toBe(true)
})
```

- [ ] **Step 2: Run the test and verify the legacy-alias assertion fails after Task 3**

Run:

```bash
pnpm vitest run tests/sign-contract.spec.ts
```

Expected: FAIL because `render_installed_overview()` and its canonical `draw_sign()` call do not exist.

- [ ] **Step 3: Add deterministic light-overview sign replacement**

Add `render_installed_overview()` to open `installed-overview-en.png`, sample the background at `(80, 140)`, repaint only `(80, 140, 240, 245)`, call `draw_sign(draw, 100, 165, 120, INK)`, save the active file, and copy it byte-for-byte to `installed.png`. Preserve all typography, product UI, feature cards, and English text.

The replacement box must remain left of the existing vertical divider; do not repaint or move the `DEEPSEEK HARNESS PLUGIN` label.

- [ ] **Step 4: Regenerate, inspect, and run contracts**

Run:

```bash
python3 scripts/render-brand-assets.py
cmp docs/assets/installed-overview-en.png docs/assets/installed.png
pnpm vitest run tests/sign-contract.spec.ts
```

Expected: all commands exit 0. Inspect the overview at full size and README scale with `view_image`; the light sign must match the dark sign silhouette exactly.

- [ ] **Step 5: Commit the light overview and contract**

```bash
git add scripts/render-brand-assets.py docs/assets/installed-overview-en.png docs/assets/installed.png tests/sign-contract.spec.ts
git commit -m "docs: unify light overview sign"
```

### Task 5: Run full verification and publish the unified system

**Files:**
- Verify: all files changed in Tasks 1–4
- Verify: `README.md`
- Verify: `README.zh.md`

**Interfaces:**
- Consumes: completed vector, UI, renderer, and raster changes
- Produces: a verified branch ready to fast-forward `origin/main`

- [ ] **Step 1: Run the full project check**

Run:

```bash
pnpm run check
```

Expected: lint, typecheck, all Vitest tests, build, smoke, and publint exit 0.

- [ ] **Step 2: Verify asset geometry and dimensions**

Run:

```bash
pnpm vitest run tests/sign-contract.spec.ts
cmp docs/assets/hero-dark.png docs/assets/hero.png
cmp docs/assets/installed-overview-en.png docs/assets/installed.png
sips -g pixelWidth -g pixelHeight docs/assets/hero-dark.png docs/assets/installed-overview-en.png docs/assets/social-card.png
```

Expected: the contract passes; aliases are identical; both README images are `2400 × 1350`; the social card is `1200 × 630`.

- [ ] **Step 3: Perform visual QA**

Open the following with `view_image`:

```text
docs/assets/sign-on-light.svg
docs/assets/sign-on-dark.svg
docs/assets/hero-dark.png
docs/assets/installed-overview-en.png
docs/assets/brand-board.png
docs/assets/symbol-construction.png
docs/assets/social-card.png
```

Check the same curve, transition point, round caps, and proportions on every active surface at normal display scale.

- [ ] **Step 4: Audit the final diff**

Run:

```bash
git status --short
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
```

Expected: only the approved design spec, implementation plan, canonical sign, UI integration, renderer, tests, generated bundle, and brand assets are present. No unrelated working-tree file appears.

- [ ] **Step 5: Push and verify GitHub rendering**

Push the completed descendant branch to `origin/main`, open the repository through `ego-browser`, and verify the README image `src` values and visible order. Use new filenames if any GitHub image cache still serves an old asset.

Expected: the original dark hero appears first; the English overview remains below the introduction; both carry the same Parallel Side Branch sign.

### Task 6: Replace every embedded legacy raster sign

**Files:**
- Modify: `scripts/render-brand-assets.py`
- Modify: `tests/sign-contract.spec.ts`
- Regenerate: `docs/assets/brand-board.png`
- Regenerate: `docs/assets/hero-dark.png`, `docs/assets/hero.png`, `docs/assets/social-card.png`
- Regenerate: `docs/assets/installed-overview-en.png`, `docs/assets/installed.png`

**Purpose:** The final visual review found old sharp-fold variants inside the product-surface screenshots and the UI-system panel. Replace each of those embedded marks with the same canonical `draw_sign()` silhouette, then regenerate every README-facing derivative.

- [x] **Step 1: Add a failing embedded-surface contract**

Extend `tests/sign-contract.spec.ts` to require named deterministic raster patch routines for the product-surface signs, the UI-system/chip/app-icon signs, and all overview screenshot signs. The contract must also require that `crop_surface()` reads the freshly patched board, so Hero and social card cannot retain stale embedded marks.

- [x] **Step 2: Patch brand-board embedded signs**

Use only deterministic rectangular repaint regions and `draw_sign()`. Replace the old sharp-fold signs in the `PRODUCT SURFACE` drawer/header and assistant identity, plus the `UI SYSTEM` chip and app-icon treatments. Preserve all non-sign copy, layout, controls, and colour swatches. Every branch must remain visibly mint; where a mint tile would hide the branch, use a local neutral backing treatment while preserving the panel’s composition.

- [x] **Step 3: Patch light-overview embedded signs**

Replace the legacy signs inside the light product screenshot (toolbar button, drawer title, and assistant identity) in addition to the already-correct upper-left lockup. Preserve English text, controls, and layout; copy the active overview byte-for-byte to `installed.png` after rendering.

- [x] **Step 4: Regenerate all derivatives and prove consistency**

Run `python3 scripts/render-brand-assets.py`, then verify both aliases with `cmp`, inspect `brand-board.png`, `hero-dark.png`, `social-card.png`, and `installed-overview-en.png` at normal display scale, and run the focused contract. Confirm no old sharp-fold/circle/blob variant is still visible.

- [x] **Step 5: Commit the exhaustive raster rollout**

```bash
git add docs/superpowers/plans/2026-08-21-unified-sign.md scripts/render-brand-assets.py tests/sign-contract.spec.ts \
  docs/assets/brand-board.png docs/assets/hero-dark.png docs/assets/hero.png docs/assets/social-card.png \
  docs/assets/installed-overview-en.png docs/assets/installed.png
git commit -m "docs: unify embedded raster signs"
```

### Task 7: Commit and verify every derived brand asset

**Files:**
- Modify: `scripts/render-brand-assets.py`
- Modify: `tests/sign-contract.spec.ts`
- Regenerate: `docs/assets/concept-surface.png`
- Verify: every tracked renderer output, including `campaign-statement.png`

**Purpose:** `concept-surface.png` is an active asset named by `docs/brand/BRAND_GUIDE.md`. It must be committed after the product-surface patch and the renderer must be prevented from silently drifting any tracked output again.

- [x] **Step 1: Add a failing renderer-output idempotence contract**

Write a test that copies `docs/assets` into a temporary directory, invokes the renderer against that copy, and byte-compares every tracked output to the committed original: `brand-board.png`, `hero-dark.png`, `hero.png`, `social-card.png`, `installed-overview-en.png`, `installed.png`, `concept-surface.png`, `campaign-statement.png`, and `symbol-construction.png`.

- [x] **Step 2: Make the renderer testable outside the repository asset directory**

Allow a test-only asset-directory environment override while retaining the default `docs/assets` behavior. Keep every tracked output listed in one explicit constant so source and contract cannot drift.

- [x] **Step 3: Regenerate and stage the active concept surface**

Run the deterministic renderer and stage `concept-surface.png`. Confirm `campaign-statement.png` remains byte-identical if its crop does not depend on a patched area.

- [x] **Step 4: Run idempotence and full checks**

Run the new focused test, `pnpm run check`, both alias comparisons, and a second isolated render. Verify no tracked renderer output changes after the second render.

- [x] **Step 5: Commit the asset-completeness correction**

```bash
git add docs/superpowers/plans/2026-08-21-unified-sign.md scripts/render-brand-assets.py \
  tests/sign-contract.spec.ts docs/assets/concept-surface.png docs/assets/campaign-statement.png
git commit -m "docs: verify derived brand assets"
```

### Task 8: Scope brand asset verification by platform

**Files:**
- Modify: `tests/sign-contract.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Create: `requirements-brand-assets.txt`
- Modify: `docs/brand/BRAND_GUIDE.md`

**Purpose:** Keep the renderer manifest and committed raster hashes protected on every CI platform without requiring Pillow or Apple fonts on Ubuntu, while retaining the full byte-for-byte isolated rerender contract on macOS.

- [x] **Step 1: Add a failing macOS dependency-scope contract**

Require the CI workflow to install a fixed Pillow version only on macOS and keep the renderer dependency in a dedicated requirements file.

- [x] **Step 2: Split static and dynamic asset contracts**

Parse `RENDERED_ASSET_NAMES` as source text, compare it with every Git-tracked PNG, and verify every committed SHA-256 on all platforms without importing Python. Run the two-pass isolated renderer test only on Darwin.

- [x] **Step 3: Document the renderer environment**

Record that full byte-for-byte rerender verification depends on Apple system fonts and runs only on macOS, while the manifest/hash contract remains cross-platform.

- [x] **Step 4: Verify both CI paths**

Run the cross-platform static contract with a failing Python shim, then run the actual renderer contract on macOS. Run `env CI=true pnpm run check` and `git diff --check`.

- [x] **Step 5: Commit the CI correction**

```bash
git add tests/sign-contract.spec.ts .github/workflows/ci.yml requirements-brand-assets.txt \
  docs/brand/BRAND_GUIDE.md docs/superpowers/plans/2026-08-21-unified-sign.md
git commit -m "ci: scope brand asset verification"
```

### Task 9: Stabilize the native asset contract

**Files:**
- Modify: `tests/sign-contract.spec.ts`
- Modify: `docs/brand/BRAND_GUIDE.md`

**Purpose:** GitHub Actions job `96862052959` on `macos-26-arm64` proved that Pillow 12.2.0 output can differ from the committed authoring bytes because Apple system fonts and native rasterization vary across macOS environments. CI must prove native renderer idempotence without treating cross-machine byte equality as portable.

- [x] **Step 1: Preserve the cross-platform static contract**

Keep the Python-free nine-output manifest, existence, and SHA-256 contract active on every platform.

- [x] **Step 2: Make macOS CI verify native idempotence**

Continue copying assets to a temporary directory and running the real renderer twice on Darwin. Compare all nine second-render outputs with the first render, clean the temporary directory, and never compare CI-rendered bytes with authoring-machine bytes.

- [x] **Step 3: Add an opt-in authoring byte contract**

When `DSH_SIDE_CHAT_STRICT_ASSET_BYTES=1` is set on Darwin, render into a temporary directory and compare the first render with all nine committed outputs. Keep this strict mode disabled by default in CI.

- [x] **Step 4: Document and verify all three policies**

Record the failed job and native-font root cause in the brand guide. Verify the Python-free static contract with a failing Python shim, the default macOS two-render contract, the strict local contract, `env CI=true pnpm run check`, and `git diff --check`.

- [x] **Step 5: Commit the native contract correction**

```bash
git add tests/sign-contract.spec.ts docs/brand/BRAND_GUIDE.md \
  docs/superpowers/plans/2026-08-21-unified-sign.md
git commit -m "ci: stabilize native asset contract"
```
