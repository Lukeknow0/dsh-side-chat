// @vitest-environment happy-dom

import { act, useEffect, useRef, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SideChatDrawer } from '../src/client/SideChatDrawer.tsx'
import type { SideChatController, SideChatClientState } from '../src/client/controller.ts'
import { SideChatViewStore } from '../src/client/view-store.ts'
import { rectsIntersect } from '../src/client/overlay-placement.ts'
import {
  collectOverlayGeometry,
  useOverlayPlacement,
  type OverlayPlacementOptions,
} from '../src/client/use-overlay-placement.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, onClick, disabled }: {
    children?: ReactNode; onClick?: () => void; disabled?: boolean
  }) => (
    <button type="button" disabled={disabled} onClick={onClick}>{children}</button>
  ),
  IconCloseOutline16: () => <span />,
  IconLoadingOutline16: () => <span />,
  IconSendOutline16: () => <span />,
  IconStopFill16: () => <span />,
  MarkdownText: ({ text }: { text: string }) => <span>{text}</span>,
  Modal: ({ open, onClose, title, children, footer }: {
    open: boolean
    onClose: () => void
    title: string
    children?: ReactNode
    footer?: ReactNode
  }) => {
    useEffect(() => {
      if (!open) return
      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') onClose()
      }
      document.addEventListener('keydown', onKeyDown)
      return () => { document.removeEventListener('keydown', onKeyDown) }
    }, [onClose, open])
    return open ? <div role="dialog" aria-label={title}>{children}{footer}</div> : null
  },
}))

interface MutableBox { left: number; top: number; width: number; height: number }

function domRect(box: MutableBox): DOMRect {
  return {
    x: box.left,
    y: box.top,
    left: box.left,
    top: box.top,
    right: box.left + box.width,
    bottom: box.top + box.height,
    width: box.width,
    height: box.height,
    toJSON: () => ({ ...box }),
  }
}

function setRect(element: Element, box: MutableBox): void {
  element.getBoundingClientRect = () => domRect(box)
}

interface ShellFixture {
  mount: HTMLDivElement
  frame: HTMLDivElement
  sidebar: HTMLDivElement
  center: HTMLDivElement
  details: HTMLDivElement
  overlay: HTMLDivElement
  slot: HTMLDivElement
  portal: HTMLDivElement
  frameBox: MutableBox
  sidebarBox: MutableBox
  centerBox: MutableBox
  detailsBox: MutableBox
  overlayBox: MutableBox
}

function shell(width = 1600, height = 900): ShellFixture {
  document.body.innerHTML = ''
  const mount = document.createElement('div')
  const frame = document.createElement('div')
  const sidebar = document.createElement('div')
  const center = document.createElement('div')
  const details = document.createElement('div')
  const overlay = document.createElement('div')
  const slot = document.createElement('div')
  const portal = document.createElement('div')

  frame.dataset.dshFrame = ''
  sidebar.dataset.pane = 'sidebar'
  center.dataset.pane = 'conversation'
  details.dataset.pane = 'details'
  overlay.dataset.shellOverlay = 'true'
  slot.dataset.slot = 'shell.overlay'
  portal.dataset.testPortalAvoid = ''

  frame.append(sidebar, center, details, overlay)
  overlay.append(slot)
  mount.append(frame)
  document.body.append(mount, portal)

  const frameBox = { left: 0, top: 0, width, height }
  const sidebarBox = { left: 0, top: 0, width: width < 1024 ? 56 : 280, height }
  const detailsBox = { left: width, top: 0, width: 0, height }
  const centerBox = {
    left: sidebarBox.width,
    top: 0,
    width: width - sidebarBox.width - detailsBox.width,
    height,
  }
  const overlayBox = { ...frameBox }
  setRect(frame, frameBox)
  setRect(sidebar, sidebarBox)
  setRect(center, centerBox)
  setRect(details, detailsBox)
  setRect(overlay, overlayBox)
  setRect(portal, { left: width - 68, top: height - 76, width: 48, height: 48 })
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })

  return {
    mount, frame, sidebar, center, details, overlay, slot, portal,
    frameBox, sidebarBox, centerBox, detailsBox, overlayBox,
  }
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  readonly observe = vi.fn()
  readonly unobserve = vi.fn()
  readonly disconnect = vi.fn()
  constructor(readonly callback: ResizeObserverCallback) { FakeResizeObserver.instances.push(this) }
  trigger(): void { this.callback([], this as unknown as ResizeObserver) }
}

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = []
  readonly observe = vi.fn()
  readonly disconnect = vi.fn()
  readonly takeRecords = vi.fn(() => [])
  constructor(readonly callback: MutationCallback) { FakeMutationObserver.instances.push(this) }
  trigger(): void { this.callback([], this as unknown as MutationObserver) }
}

let rafQueue: FrameRequestCallback[]
let root: Root | undefined

function flushAnimationFrames(): void {
  while (rafQueue.length > 0) rafQueue.shift()?.(performance.now())
}

beforeEach(() => {
  FakeResizeObserver.instances = []
  FakeMutationObserver.instances = []
  rafQueue = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('MutationObserver', FakeMutationObserver)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    rafQueue.push(callback)
    return rafQueue.length
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})

afterEach(() => {
  if (root !== undefined) {
    act(() => { root?.unmount() })
    root = undefined
  }
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('overlay geometry measurement', () => {
  it('collects native panes and external avoid regions but excludes Side Chat itself', () => {
    const fixture = shell()
    const sideRoot = document.createElement('div')
    const ownDrawer = document.createElement('aside')
    const sibling = document.createElement('button')
    sideRoot.dataset.dshSideChatRoot = ''
    sideRoot.append(ownDrawer)
    fixture.slot.append(sideRoot, sibling)
    setRect(sideRoot, { left: 0, top: 0, width: 1600, height: 900 })
    setRect(ownDrawer, { left: 1140, top: 12, width: 448, height: 876 })
    setRect(sibling, { left: 1030, top: 24, width: 80, height: 40 })

    const measured = collectOverlayGeometry(sideRoot, {
      avoidSelectors: ['[data-test-portal-avoid]'],
    })

    expect(measured.frame).toEqual({ left: 0, top: 0, width: 1600, height: 900 })
    expect(measured.occupied).toContainEqual({ left: 0, top: 0, width: 280, height: 900 })
    expect(measured.occupied).toContainEqual({ left: 1030, top: 24, width: 80, height: 40 })
    expect(measured.occupied).toContainEqual({ left: 1532, top: 824, width: 48, height: 48 })
    expect(measured.occupied).not.toContainEqual({ left: 1140, top: 12, width: 448, height: 876 })
  })

  it('ignores a full-frame click-through overlay sibling at desktop width', () => {
    const fixture = shell(1600, 900)
    const sideRoot = document.createElement('div')
    const clickThrough = document.createElement('div')
    sideRoot.dataset.dshSideChatRoot = ''
    clickThrough.style.pointerEvents = 'none'
    fixture.slot.append(sideRoot, clickThrough)
    setRect(clickThrough, { left: 0, top: 0, width: 1600, height: 900 })

    const measured = collectOverlayGeometry(sideRoot)

    expect(measured.occupied).not.toContainEqual({ left: 0, top: 0, width: 1600, height: 900 })
    expect(measured.compute()).toMatchObject({ mode: 'right', width: 448, degraded: false })
  })

  it('still avoids an explicitly marked control inside a click-through overlay sibling', () => {
    const fixture = shell(1600, 900)
    const sideRoot = document.createElement('div')
    const clickThrough = document.createElement('div')
    const control = document.createElement('button')
    sideRoot.dataset.dshSideChatRoot = ''
    clickThrough.style.pointerEvents = 'none'
    control.dataset.dshSideChatAvoid = ''
    clickThrough.append(control)
    fixture.slot.append(sideRoot, clickThrough)
    setRect(clickThrough, { left: 0, top: 0, width: 1600, height: 900 })
    setRect(control, { left: 1532, top: 824, width: 48, height: 48 })

    const measured = collectOverlayGeometry(sideRoot)
    const placement = measured.compute()

    expect(measured.occupied).toContainEqual({ left: 1532, top: 824, width: 48, height: 48 })
    expect(rectsIntersect(placement.rect, { left: 1532, top: 824, width: 48, height: 48 })).toBe(false)
  })

  it('updates placement through ResizeObserver and disconnects every observer on unmount', () => {
    const fixture = shell()

    function Probe({ options }: { options: OverlayPlacementOptions }) {
      const sideRoot = useRef<HTMLDivElement>(null)
      const placement = useOverlayPlacement(sideRoot, options)
      return <div ref={sideRoot} data-dsh-side-chat-root data-mode={placement.mode} data-left={placement.left} />
    }

    root = createRoot(fixture.slot)
    act(() => {
      root?.render(<Probe options={{ avoidSelectors: ['[data-test-portal-avoid]'] }} />)
      flushAnimationFrames()
    })
    expect(fixture.slot.querySelector('[data-dsh-side-chat-root]')?.getAttribute('data-mode')).toBe('right')

    fixture.frameBox.width = 640
    fixture.overlayBox.width = 640
    fixture.sidebarBox.width = 56
    fixture.centerBox.left = 56
    fixture.centerBox.width = 584
    fixture.portal.getBoundingClientRect = () => domRect({ left: 572, top: 724, width: 48, height: 48 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 })
    act(() => {
      for (const observer of FakeResizeObserver.instances) observer.trigger()
      flushAnimationFrames()
    })

    expect(fixture.slot.querySelector('[data-dsh-side-chat-root]')?.getAttribute('data-mode')).toBe('bottom-sheet')
    act(() => { root?.unmount() })
    root = undefined
    expect(FakeResizeObserver.instances.every(observer => observer.disconnect.mock.calls.length === 1)).toBe(true)
    expect(FakeMutationObserver.instances.every(observer => observer.disconnect.mock.calls.length === 1)).toBe(true)
  })

  it('keeps the real drawer draft while responsive placement changes mode', () => {
    const fixture = shell(800, 700)
    const snapshot: SideChatClientState = {
      epoch: 1,
      phase: 'open',
      parentSessionId: 'parent' as never,
      seedLength: 0,
      revision: 0,
      expiresAt: Date.now() + 60_000,
      messages: [],
      partial: '',
      running: false,
    }
    const controller = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      binding: () => undefined,
      close: vi.fn(async () => {}),
      send: vi.fn(async () => ({ ok: true as const })),
      cancel: vi.fn(async () => ({ ok: true as const })),
      retry: vi.fn(async () => {}),
    } as unknown as SideChatController
    const viewStore = new SideChatViewStore()
    viewStore.show('parent', 'drawer')
    const t = ((key: string) => key) as never

    root = createRoot(fixture.slot)
    act(() => {
      root?.render(
        <SideChatDrawer
          controller={controller}
          viewStore={viewStore}
          parentSessionId={'parent' as never}
          t={t}
          onMinimize={() => { viewStore.minimize('parent') }}
          onEnd={async () => { await controller.close(); viewStore.clear('parent') }}
        />,
      )
      flushAnimationFrames()
    })
    const sideRoot = fixture.slot.querySelector('[data-dsh-side-chat-root]')
    expect(sideRoot?.getAttribute('data-placement-mode')).toBe('compact-right')
    const textarea = fixture.slot.querySelector('textarea') as HTMLTextAreaElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(textarea, 'unfinished question')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(textarea.value).toBe('unfinished question')

    fixture.frameBox.width = 640
    fixture.overlayBox.width = 640
    fixture.sidebarBox.width = 56
    fixture.centerBox.left = 56
    fixture.centerBox.width = 584
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 640 })
    act(() => {
      for (const observer of FakeResizeObserver.instances) observer.trigger()
      flushAnimationFrames()
    })

    expect(sideRoot?.getAttribute('data-placement-mode')).toBe('bottom-sheet')
    expect((fixture.slot.querySelector('textarea') as HTMLTextAreaElement).value).toBe('unfinished question')
  })

  it('keeps the composer usable within a 375px bottom sheet and minimizes from its scrim', () => {
    const fixture = shell(375, 800)
    const snapshot: SideChatClientState = {
      epoch: 1, phase: 'open', parentSessionId: 'parent' as never,
      seedLength: 0, revision: 0, expiresAt: Date.now() + 60_000,
      messages: [], partial: '', running: false,
    }
    const close = vi.fn(async () => {})
    const controller = {
      subscribe: () => () => {}, getSnapshot: () => snapshot, binding: () => undefined, close,
      send: vi.fn(async () => ({ ok: true as const })), cancel: vi.fn(async () => ({ ok: true as const })),
      retry: vi.fn(async () => {}),
    } as unknown as SideChatController
    const viewStore = new SideChatViewStore()
    viewStore.show('parent', 'drawer')
    const t = ((key: string) => key) as never

    root = createRoot(fixture.slot)
    act(() => {
      root?.render(
        <SideChatDrawer
          controller={controller}
          viewStore={viewStore}
          parentSessionId={'parent' as never}
          t={t}
          onMinimize={() => { viewStore.minimize('parent') }}
          onEnd={async () => { await controller.close(); viewStore.clear('parent') }}
        />,
      )
      flushAnimationFrames()
    })

    const sideRoot = fixture.slot.querySelector<HTMLElement>('[data-dsh-side-chat-root]')
    const textarea = fixture.slot.querySelector('textarea')
    expect(sideRoot?.dataset.placementMode).toBe('bottom-sheet')
    expect(sideRoot?.style.getPropertyValue('--side-chat-width')).toBe('348px')
    expect(textarea).not.toBeNull()
    expect(textarea?.disabled).toBe(false)
    act(() => { fixture.slot.querySelector<HTMLElement>('[data-dsh-side-chat-scrim]')?.click() })
    expect(viewStore.get('parent').visible).toBe(false)
    expect(close).not.toHaveBeenCalled()
  })

  it('renders a clear expired state with a restart action', () => {
    const fixture = shell()
    const snapshot: SideChatClientState = {
      epoch: 2, phase: 'error', parentSessionId: 'parent' as never, errorKind: 'expired',
      error: 'This Side Chat ended after 30 minutes parked and idle.',
      seedLength: 0, revision: 0, expiresAt: 0, messages: [], partial: '', running: false,
    }
    const retry = vi.fn(async () => {})
    const controller = {
      subscribe: () => () => {}, getSnapshot: () => snapshot, binding: () => undefined, retry,
      close: vi.fn(async () => {}), send: vi.fn(), cancel: vi.fn(),
    } as unknown as SideChatController
    const viewStore = new SideChatViewStore()
    viewStore.show('parent', 'drawer')
    const t = ((key: string) => key) as never

    root = createRoot(fixture.slot)
    act(() => {
      root?.render(
        <SideChatDrawer
          controller={controller}
          viewStore={viewStore}
          parentSessionId={'parent' as never}
          t={t}
          onMinimize={() => { viewStore.minimize('parent') }}
          onEnd={async () => { await controller.close(); viewStore.clear('parent') }}
        />,
      )
      flushAnimationFrames()
    })

    expect(fixture.slot.textContent).toContain('drawer.expiredTitle')
    expect(fixture.slot.textContent).toContain('drawer.expiredBody')
    const restart = [...fixture.slot.querySelectorAll('button')].find(button =>
      button.textContent === 'drawer.restart',
    )
    expect(restart).toBeDefined()
    act(() => { restart?.click() })
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('produces a drawer rectangle disjoint from every measured avoid region', () => {
    const fixture = shell()
    const sideRoot = document.createElement('div')
    sideRoot.dataset.dshSideChatRoot = ''
    fixture.slot.append(sideRoot)
    const measured = collectOverlayGeometry(sideRoot, {
      avoidSelectors: ['[data-test-portal-avoid]'],
    })
    const placement = measured.compute()

    for (const occupied of measured.occupied) {
      expect(rectsIntersect(placement.rect, occupied)).toBe(false)
    }
  })
})
