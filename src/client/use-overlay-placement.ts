import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'
import {
  computeOverlayPlacement,
  type Insets,
  type OverlayPlacement,
  type RectLike,
} from './overlay-placement.ts'

export const DEFAULT_AVOID_SELECTORS = [
  '[data-dsh-side-chat-avoid]',
  '[data-dsh-shutdown-float] button',
  '[data-dsh-better-sidebar] button',
] as const

export interface OverlayPlacementOptions {
  avoidSelectors?: readonly string[]
  desiredWidth?: number
  minWidth?: number
  safeMargin?: number
  enabled?: boolean
}

export interface OverlayGeometry {
  frame: RectLike
  viewport: RectLike
  safeArea: Insets
  occupied: RectLike[]
  compute(): OverlayPlacement
}

export type OverlayPlacementStyle = CSSProperties & Record<string, string | number | undefined>

declare global {
  interface Window {
    /** Optional best-effort selectors for body portals outside shell.overlay. */
    __DSH_SIDE_CHAT_AVOID_SELECTORS__?: readonly string[]
  }
}

const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
const FALLBACK_WIDTH = 1280
const FALLBACK_HEIGHT = 800

function toRect(rect: DOMRect | DOMRectReadOnly): RectLike {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

function positiveRect(element: Element | null): RectLike | null {
  if (element === null) return null
  const rect = element.getBoundingClientRect()
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)
    || rect.width <= 0 || rect.height <= 0) return null
  const style = getComputedStyle(element)
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return null
  return toRect(rect)
}

function isOwnedBySideChat(element: Element, root: HTMLElement): boolean {
  return element === root || root.contains(element) || element.matches('[data-dsh-side-chat-root]')
}

function pane(frame: HTMLElement, name: 'sidebar' | 'details'): HTMLElement | null {
  const marked = frame.querySelector<HTMLElement>(':scope > [data-pane="' + name + '"]')
  if (marked !== null) return marked
  const byClass = [...frame.children].find(element =>
    element instanceof HTMLElement && element.className.includes(name === 'sidebar' ? 'sidebarCol' : 'detailsCol'),
  )
  if (byClass instanceof HTMLElement) return byClass

  // Core rc.8 has no semantic column markers. Its stable AppFrame order is
  // sidebar, conversation, details, overlay, handles; use this only as a final
  // compatibility fallback and validate that the candidate precedes overlay.
  const overlayIndex = [...frame.children].findIndex(element => element.matches('[data-shell-overlay]'))
  if (overlayIndex < 3) return null
  const candidate = name === 'sidebar' ? frame.children[0] : frame.children[overlayIndex - 1]
  return candidate instanceof HTMLElement ? candidate : null
}

function configuredSelectors(options: OverlayPlacementOptions): string[] {
  const values = [
    ...DEFAULT_AVOID_SELECTORS,
    ...(options.avoidSelectors ?? []),
    ...(typeof window === 'undefined' ? [] : (window.__DSH_SIDE_CHAT_AVOID_SELECTORS__ ?? [])),
  ]
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].slice(0, 32)
}

function safeQueryAll(selector: string): Element[] {
  try {
    return [...document.querySelectorAll(selector)]
  } catch {
    return []
  }
}

function safeInsets(root: HTMLElement): Insets {
  const probe = root.querySelector<HTMLElement>('[data-dsh-side-chat-safe-area]')
  if (probe === null) return ZERO_INSETS
  const style = getComputedStyle(probe)
  const parse = (value: string): number => {
    const parsed = Number.parseFloat(value)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }
  return {
    top: parse(style.paddingTop),
    right: parse(style.paddingRight),
    bottom: parse(style.paddingBottom),
    left: parse(style.paddingLeft),
  }
}

function visualViewportRect(): RectLike {
  const visual = window.visualViewport
  if (visual != null) {
    return {
      left: visual.offsetLeft,
      top: visual.offsetTop,
      width: visual.width,
      height: visual.height,
    }
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

function geometryElements(root: HTMLElement, options: OverlayPlacementOptions): {
  overlay: HTMLElement | null
  frame: HTMLElement | null
  nativePanes: HTMLElement[]
  siblingEntries: HTMLElement[]
  explicitAvoid: Element[]
  slotHost: HTMLElement | null
} {
  const overlay = root.closest<HTMLElement>('[data-shell-overlay]')
  const frame = overlay?.parentElement ?? null
  const nativePanes = frame === null
    ? []
    : [pane(frame, 'sidebar'), pane(frame, 'details')].filter((value): value is HTMLElement => value !== null)
  const slotHost = root.closest<HTMLElement>('[data-slot="shell.overlay"]')
  const siblingEntries = slotHost === null
    ? []
    : [...slotHost.children].filter((element): element is HTMLElement =>
      element instanceof HTMLElement && !isOwnedBySideChat(element, root),
    )
  const explicitAvoid = configuredSelectors(options)
    .flatMap(safeQueryAll)
    .filter(element => !isOwnedBySideChat(element, root))
  return { overlay, frame, nativePanes, siblingEntries, explicitAvoid, slotHost }
}

function isFullFrameClickThrough(element: HTMLElement, rect: RectLike, frame: RectLike): boolean {
  if (getComputedStyle(element).pointerEvents !== 'none') return false
  const tolerance = 4
  return rect.left <= frame.left + tolerance
    && rect.top <= frame.top + tolerance
    && rect.left + rect.width >= frame.left + frame.width - tolerance
    && rect.top + rect.height >= frame.top + frame.height - tolerance
}

function dedupeRects(rects: readonly RectLike[]): RectLike[] {
  const seen = new Set<string>()
  const result: RectLike[] = []
  for (const rect of rects) {
    const key = [rect.left, rect.top, rect.width, rect.height].map(value => value.toFixed(2)).join(':')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(rect)
  }
  return result
}

export function collectOverlayGeometry(
  root: HTMLElement,
  options: OverlayPlacementOptions = {},
): OverlayGeometry {
  const elements = geometryElements(root, options)
  const overlayRect = positiveRect(elements.overlay)
  const frameRect = overlayRect ?? positiveRect(elements.frame) ?? visualViewportRect()
  const measured = (element: Element): RectLike[] => {
    const rect = positiveRect(element)
    return rect === null ? [] : [rect]
  }
  const siblingRects = elements.siblingEntries.flatMap(element => {
    const rect = positiveRect(element)
    if (rect === null || isFullFrameClickThrough(element, rect, frameRect)) return []
    return [rect]
  })
  const occupied = dedupeRects([
    ...elements.nativePanes.flatMap(measured),
    ...siblingRects,
    ...elements.explicitAvoid.flatMap(measured),
  ])
  const viewport = visualViewportRect()
  const safeArea = safeInsets(root)
  const desiredWidth = options.desiredWidth ?? 448
  const minWidth = options.minWidth ?? 360
  const safeMargin = options.safeMargin ?? 12

  return {
    frame: frameRect,
    viewport,
    safeArea,
    occupied,
    compute: () => computeOverlayPlacement({
      frame: frameRect,
      viewport,
      desiredWidth,
      minWidth,
      safeMargin,
      safeArea,
      occupied,
    }),
  }
}

function fallbackPlacement(options: OverlayPlacementOptions): OverlayPlacement {
  const width = typeof window === 'undefined' ? FALLBACK_WIDTH : Math.max(1, window.innerWidth)
  const height = typeof window === 'undefined' ? FALLBACK_HEIGHT : Math.max(1, window.innerHeight)
  const frame = { left: 0, top: 0, width, height }
  return computeOverlayPlacement({
    frame,
    viewport: frame,
    desiredWidth: options.desiredWidth ?? 448,
    minWidth: options.minWidth ?? 360,
    safeMargin: options.safeMargin ?? 12,
    safeArea: ZERO_INSETS,
    occupied: [],
  })
}

function samePlacement(first: OverlayPlacement, second: OverlayPlacement): boolean {
  return first.mode === second.mode
    && first.left === second.left
    && first.top === second.top
    && first.right === second.right
    && first.bottom === second.bottom
    && first.width === second.width
    && first.height === second.height
    && first.degraded === second.degraded
    && first.reason === second.reason
}

export function useOverlayPlacement(
  rootRef: RefObject<HTMLElement | null>,
  options: OverlayPlacementOptions = {},
): OverlayPlacement {
  const [placement, setPlacement] = useState(() => fallbackPlacement(options))
  const selectorKey = options.avoidSelectors?.join('\n') ?? ''
  const desiredWidth = options.desiredWidth ?? 448
  const minWidth = options.minWidth ?? 360
  const safeMargin = options.safeMargin ?? 12
  const enabled = options.enabled ?? true

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!enabled || root === null) return

    const stableOptions: OverlayPlacementOptions = {
      desiredWidth,
      minWidth,
      safeMargin,
      avoidSelectors: selectorKey === '' ? [] : selectorKey.split('\n'),
    }
    let frameRequest: number | null = null
    let disposed = false
    const observed = new Set<Element>()
    const resizeObserver = new ResizeObserver(() => { schedule() })

    const observeCurrentElements = (): ReturnType<typeof geometryElements> => {
      const elements = geometryElements(root, stableOptions)
      const targets: Element[] = [
        elements.overlay,
        elements.frame,
        ...elements.nativePanes,
        ...elements.siblingEntries,
        ...elements.explicitAvoid,
      ].filter((value): value is Element => value !== null && !isOwnedBySideChat(value, root))
      for (const target of targets) {
        if (observed.has(target)) continue
        observed.add(target)
        resizeObserver.observe(target)
      }
      return elements
    }

    const measure = (): void => {
      frameRequest = null
      if (disposed) return
      observeCurrentElements()
      const next = collectOverlayGeometry(root, stableOptions).compute()
      setPlacement(current => samePlacement(current, next) ? current : next)
    }
    function schedule(): void {
      if (disposed || frameRequest !== null) return
      frameRequest = requestAnimationFrame(measure)
    }

    const initial = observeCurrentElements()
    const mutationObserver = new MutationObserver(records => {
      const externalChange = records.some(record => {
        if (!(record.target instanceof Node) || !root.contains(record.target)) return true
        return [...record.addedNodes, ...record.removedNodes].some(node =>
          !(node instanceof Node) || !root.contains(node),
        )
      })
      if (externalChange) schedule()
    })
    if (initial.frame !== null) {
      mutationObserver.observe(initial.frame, {
        attributes: true,
        attributeFilter: ['style', 'class', 'data-sidebar-collapsed', 'data-details-collapsed', 'data-dragging'],
        childList: true,
      })
    }
    if (initial.slotHost !== null) {
      mutationObserver.observe(initial.slotHost, { childList: true, subtree: true })
    }
    // Portals are normally direct body children. Avoid observing the complete
    // document subtree: conversation streaming should not trigger layout work.
    mutationObserver.observe(document.body, { childList: true })
    for (const target of initial.explicitAvoid) {
      mutationObserver.observe(target, { attributes: true, childList: true, subtree: true })
    }

    const visual = window.visualViewport
    window.addEventListener('resize', schedule, { passive: true })
    visual?.addEventListener('resize', schedule, { passive: true })
    visual?.addEventListener('scroll', schedule, { passive: true })
    schedule()

    return () => {
      disposed = true
      if (frameRequest !== null) cancelAnimationFrame(frameRequest)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', schedule)
      visual?.removeEventListener('resize', schedule)
      visual?.removeEventListener('scroll', schedule)
    }
  }, [desiredWidth, enabled, minWidth, rootRef, safeMargin, selectorKey])

  return placement
}

export function overlayPlacementStyle(placement: OverlayPlacement): OverlayPlacementStyle {
  return {
    '--side-chat-left': String(placement.left) + 'px',
    '--side-chat-top': String(placement.top) + 'px',
    '--side-chat-right': String(placement.right) + 'px',
    '--side-chat-bottom': String(placement.bottom) + 'px',
    '--side-chat-width': String(placement.width) + 'px',
    '--side-chat-height': String(placement.height) + 'px',
    '--side-chat-max-height': String(placement.maxHeight) + 'px',
  }
}
