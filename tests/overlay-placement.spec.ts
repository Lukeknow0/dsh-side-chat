import { describe, expect, it } from 'vitest'
import {
  computeOverlayPlacement,
  rectsIntersect,
  type OverlayPlacementInput,
  type RectLike,
} from '../src/client/overlay-placement.ts'

const rect = (left: number, top: number, width: number, height: number): RectLike => ({
  left, top, width, height,
})

function input(
  width: number,
  height: number,
  occupied: readonly RectLike[] = [],
  safeArea: OverlayPlacementInput['safeArea'] = { top: 0, right: 0, bottom: 0, left: 0 },
): OverlayPlacementInput {
  return {
    viewport: rect(0, 0, width, height),
    frame: rect(0, 0, width, height),
    desiredWidth: 448,
    minWidth: 360,
    safeMargin: 12,
    safeArea,
    occupied,
  }
}

function expectClear(actual: RectLike, occupied: readonly RectLike[]): void {
  for (const obstacle of occupied) expect(rectsIntersect(actual, obstacle)).toBe(false)
}

describe('computeOverlayPlacement', () => {
  it('uses the full right drawer when no region is occupied', () => {
    const result = computeOverlayPlacement(input(1600, 900))

    expect(result).toMatchObject({
      mode: 'right', left: 1140, top: 12, right: 12, bottom: 12,
      width: 448, height: 876, maxHeight: 876, degraded: false,
    })
  })

  it('returns offsets relative to an inset AppFrame containing block', () => {
    const result = computeOverlayPlacement({
      ...input(1600, 900, [rect(100, 40, 280, 760)]),
      frame: rect(100, 40, 1200, 760),
    })

    expect(result).toMatchObject({
      mode: 'right', left: 740, top: 12, right: 12, bottom: 12, width: 448, height: 736,
    })
    expect(result.rect).toEqual(rect(840, 52, 448, 736))
  })

  it('moves left of a native right details panel', () => {
    const details = rect(1200, 0, 400, 900)
    const result = computeOverlayPlacement(input(1600, 900, [details]))

    expect(result).toMatchObject({ mode: 'right', left: 740, width: 448 })
    expect(result.rect.left + result.rect.width).toBe(1188)
    expectClear(result.rect, [details])
  })

  it('avoids a bottom-right floating control horizontally', () => {
    const control = rect(1532, 824, 48, 48)
    const result = computeOverlayPlacement(input(1600, 900, [control]))

    expect(result).toMatchObject({ mode: 'right', left: 1072, width: 448 })
    expect(result.rect.left + result.rect.width).toBe(1520)
    expectClear(result.rect, [control])
  })

  it('resolves multiple simultaneous occupied regions', () => {
    const occupied = [
      rect(0, 0, 280, 900),
      rect(1240, 0, 360, 900),
      rect(1100, 824, 48, 48),
    ]
    const result = computeOverlayPlacement(input(1600, 900, occupied))

    expect(result).toMatchObject({ mode: 'right', left: 640, width: 448 })
    expectClear(result.rect, occupied)
  })

  it('compresses to the compact width before using a bottom sheet', () => {
    const sidebar = rect(0, 0, 56, 700)
    const result = computeOverlayPlacement(input(800, 700, [sidebar]))

    expect(result).toMatchObject({ mode: 'compact-right', left: 388, width: 400 })
    expect(result.width).toBeGreaterThanOrEqual(360)
    expectClear(result.rect, [sidebar])
  })

  it('switches to a bottom sheet when the side lane is too narrow', () => {
    const occupied = [rect(0, 0, 56, 800), rect(572, 724, 48, 48)]
    const result = computeOverlayPlacement(input(640, 800, occupied))

    expect(result).toMatchObject({
      mode: 'bottom-sheet', left: 68, top: 416, right: 80, bottom: 12,
      width: 492, height: 372, degraded: false,
    })
    expectClear(result.rect, occupied)
  })

  it.each([
    [390, 844, 364],
    [375, 800, 348],
    [320, 640, 296],
  ] as const)('uses the safe viewport width at phone or high-zoom size %d×%d', (width, height, expectedWidth) => {
    const sidebar = rect(0, 0, 56, height)
    const control = rect(width - 68, height - 76, 48, 48)
    const result = computeOverlayPlacement(input(width, height, [sidebar, control]))

    expect(result.mode).toBe('bottom-sheet')
    expect(result.width).toBe(expectedWidth)
    expect(result.rect.left).toBeGreaterThanOrEqual(12)
    expect(result.rect.left + result.rect.width).toBeLessThanOrEqual(width - 12)
    expect(result.rect.top + result.rect.height).toBeLessThanOrEqual(control.top - 12)
    expect(rectsIntersect(result.rect, control)).toBe(false)
  })

  it('applies safe-area insets in addition to the twelve-pixel margin', () => {
    const result = computeOverlayPlacement(input(1600, 900, [], {
      top: 20, right: 30, bottom: 10, left: 5,
    }))

    expect(result).toMatchObject({
      mode: 'right', left: 1108, top: 32, right: 44, bottom: 24,
      width: 448, height: 844,
    })
  })

  it('is deterministic and independent of occupied-region enumeration order', () => {
    const occupied = [rect(0, 0, 280, 900), rect(1200, 0, 400, 900), rect(960, 824, 48, 48)]
    const first = computeOverlayPlacement(input(1600, 900, occupied))
    const second = computeOverlayPlacement(input(1600, 900, [...occupied].reverse()))

    expect(second).toEqual(first)
    for (let index = 0; index < 20; index += 1) {
      expect(computeOverlayPlacement(input(1600, 900, occupied))).toEqual(first)
    }
  })

  it.each([
    [1600, 900, 'right'],
    [1280, 800, 'right'],
    [1024, 768, 'compact-right'],
    [800, 700, 'compact-right'],
    [720, 800, 'compact-right'],
    [640, 800, 'bottom-sheet'],
  ] as const)('selects a stable responsive mode at %d×%d', (width, height, mode) => {
    const sidebarWidth = width < 1024 ? 56 : 280
    const result = computeOverlayPlacement(input(width, height, [rect(0, 0, sidebarWidth, height)]))

    expect(result.mode).toBe(mode)
    expect(result.left).toBeGreaterThanOrEqual(sidebarWidth + 12)
    expect(result.top).toBeGreaterThanOrEqual(12)
    expect(result.right).toBeGreaterThanOrEqual(12)
    expect(result.bottom).toBeGreaterThanOrEqual(12)
  })

  it.each([1280, 1024, 856])('remains valid for zoom-equivalent CSS viewport width %d', width => {
    const sidebarWidth = width < 1024 ? 56 : 280
    const result = computeOverlayPlacement(input(width, 800, [rect(0, 0, sidebarWidth, 800)]))

    expect(result.rect.width).toBeGreaterThanOrEqual(360)
    expect(result.rect.left).toBeGreaterThanOrEqual(sidebarWidth + 12)
    expect(result.degraded).toBe(false)
  })
})
