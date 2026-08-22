// @vitest-environment happy-dom

import { act, useEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SideChatSurface } from '../src/client/SideChatSurface.tsx'
import type { SideChatController, SideChatClientState } from '../src/client/controller.ts'
import { SideChatViewStore } from '../src/client/view-store.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, onClick, disabled }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => <button type="button" disabled={disabled} onClick={onClick}>{children}</button>,
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
    return open ? (
      <div role="presentation">
        <button type="button" data-modal-backdrop onClick={onClose} />
        <div role="dialog" aria-label={title}>{children}{footer}</div>
      </div>
    ) : null
  },
}))

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

function input(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('SideChatSurface controls', () => {
  let mount: HTMLDivElement
  let root: Root
  let controller: SideChatController
  let viewStore: SideChatViewStore

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    mount = document.createElement('div')
    document.body.append(mount)
    viewStore = new SideChatViewStore()
    viewStore.show('parent', 'drawer')
    controller = {
      subscribe: () => () => {},
      getSnapshot: () => snapshot,
      binding: () => undefined,
      close: vi.fn(async () => {}),
      send: vi.fn(async () => ({ ok: true as const })),
      cancel: vi.fn(async () => ({ ok: true as const })),
      retry: vi.fn(async () => {}),
    } as unknown as SideChatController
    root = createRoot(mount)
  })

  afterEach(() => {
    act(() => { root.unmount() })
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  function renderSurface(onEndOverride?: () => Promise<void>): void {
    const onMinimize = (): void => { viewStore.minimize('parent') }
    const onEnd = onEndOverride ?? (async (): Promise<void> => {
      await controller.close()
      viewStore.clear('parent')
    })
    const t = ((key: string) => key) as never
    act(() => {
      root.render(
        <SideChatSurface
          parentSessionId={'parent' as never}
          controller={controller}
          viewStore={viewStore}
          t={t}
          surfaceMode="drawer"
          onMinimize={onMinimize}
          onEnd={onEnd}
        />,
      )
    })
  }

  it('minimizes without closing and preserves the draft', () => {
    renderSurface()
    act(() => {
      input(mount.querySelector('textarea') as HTMLTextAreaElement, 'keep this')
      mount.querySelector<HTMLElement>('[aria-label="drawer.minimize"]')?.click()
    })

    expect(viewStore.get('parent').visible).toBe(false)
    expect(viewStore.get('parent').draft).toBe('keep this')
    expect(controller.close).not.toHaveBeenCalled()
  })

  it('requires confirmation before destructive end', async () => {
    renderSurface()
    const endButton = mount.querySelector<HTMLElement>('[aria-label="drawer.end"]')
    act(() => {
      input(mount.querySelector('textarea') as HTMLTextAreaElement, 'remove this')
      endButton?.click()
    })

    expect(controller.close).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    const confirmButton = [...document.querySelectorAll('button')].find(button =>
      button.textContent === 'drawer.endConfirm',
    )
    await act(async () => { confirmButton?.click() })
    expect(controller.close).toHaveBeenCalledTimes(1)
    expect(viewStore.get('parent').draft).toBe('')
    expect(document.activeElement).toBe(endButton)
  })

  it('cancels destructive end on Escape', () => {
    renderSurface()
    const endButton = mount.querySelector<HTMLElement>('[aria-label="drawer.end"]')
    act(() => { endButton?.click() })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(controller.close).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(endButton)
  })

  it('keeps destructive confirmation keyboard-contained', () => {
    renderSurface()
    act(() => { mount.querySelector<HTMLElement>('[aria-label="drawer.end"]')?.click() })
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
    const cancelButton = buttons.find(button => button.textContent === 'drawer.endCancel')
    const confirmButton = buttons.find(button => button.textContent === 'drawer.endConfirm')

    expect(document.activeElement).toBe(cancelButton)
    act(() => {
      cancelButton?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', shiftKey: true, bubbles: true, cancelable: true,
      }))
    })
    expect(document.activeElement).toBe(confirmButton)
    act(() => {
      confirmButton?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Tab', bubbles: true, cancelable: true,
      }))
    })
    expect(document.activeElement).toBe(cancelButton)
  })

  it('does not let delayed composer autofocus steal confirmation focus', () => {
    vi.useFakeTimers()
    renderSurface()
    act(() => { mount.querySelector<HTMLElement>('[aria-label="drawer.end"]')?.click() })
    const cancelButton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find(button => button.textContent === 'drawer.endCancel')

    expect(document.activeElement).toBe(cancelButton)
    act(() => { vi.advanceTimersByTime(120) })
    expect(document.activeElement).toBe(cancelButton)
  })

  it('restores focus to End after the Cancel action', () => {
    renderSurface()
    const endButton = mount.querySelector<HTMLElement>('[aria-label="drawer.end"]')
    act(() => { endButton?.click() })
    const cancelButton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find(button => button.textContent === 'drawer.endCancel')

    act(() => { cancelButton?.click() })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(endButton)
  })

  it('restores focus to End after backdrop dismissal', () => {
    renderSurface()
    const endButton = mount.querySelector<HTMLElement>('[aria-label="drawer.end"]')
    act(() => { endButton?.click() })

    act(() => { document.querySelector<HTMLElement>('[data-modal-backdrop]')?.click() })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(endButton)
  })

  it('invokes a pending End only once', async () => {
    let resolveEnd: (() => void) | undefined
    const onEnd = vi.fn(() => new Promise<void>(resolve => { resolveEnd = resolve }))
    renderSurface(onEnd)
    act(() => { mount.querySelector<HTMLElement>('[aria-label="drawer.end"]')?.click() })
    const confirmButton = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')]
      .find(button => button.textContent === 'drawer.endConfirm')

    act(() => { confirmButton?.click(); confirmButton?.click() })
    expect(onEnd).toHaveBeenCalledTimes(1)
    await act(async () => { resolveEnd?.() })
  })

  it('uses distinct glyphs for End and Minimize', () => {
    renderSurface()
    const endButton = mount.querySelector('[aria-label="drawer.end"]')
    const minimizeButton = mount.querySelector('[aria-label="drawer.minimize"]')
    expect(endButton?.textContent).toBe('×')
    expect(endButton?.getAttribute('title')).toBe('drawer.end')
    expect(minimizeButton?.textContent).toBe('—')
    expect(minimizeButton?.getAttribute('title')).toBe('drawer.minimize')
  })
})
