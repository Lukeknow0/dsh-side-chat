// @vitest-environment happy-dom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  BetterSidebarService, SessionScope, TabDescriptor,
} from 'dsh-better-sidebar/client/service'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SideChatClientState, SideChatController } from '../src/client/controller.ts'
import { SideChatButton, type SideChatButtonProps } from '../src/client/SideChatButton.tsx'
import {
  SIDE_CHAT_TAB_TYPE, SideChatPresentation,
} from '../src/client/presentation.tsx'
import { SideChatViewStore } from '../src/client/view-store.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ children, onClick, disabled }: {
    children?: ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => <button type="button" disabled={disabled} onClick={onClick}>{children}</button>,
  IconBranchOutline16: () => <span />,
  IconLoadingOutline16: () => <span />,
  IconSendOutline16: () => <span />,
  IconStopFill16: () => <span />,
  MarkdownText: ({ text }: { text: string }) => <span>{text}</span>,
  Modal: () => null,
}))

const closedSnapshot: SideChatClientState = {
  epoch: 0,
  phase: 'closed',
  seedLength: 0,
  revision: 0,
  expiresAt: 0,
  messages: [],
  partial: '',
  running: false,
}

class FakeBetterSidebar {
  descriptor: TabDescriptor | undefined
  enabled = true
  registrationError: Error | undefined
  readonly features: readonly string[]
  readonly unregister = vi.fn()
  readonly registerTab = vi.fn((descriptor: TabDescriptor) => {
    if (this.registrationError !== undefined) throw this.registrationError
    this.descriptor = descriptor
    return this.unregister
  })
  readonly isTabEnabled = vi.fn(() => this.enabled)
  readonly openTab = vi.fn()
  readonly closeTab = vi.fn((tabId: string, scope?: SessionScope) => {
    if (tabId !== SIDE_CHAT_TAB_TYPE || scope === undefined) return
    this.descriptor?.onClose?.(
      { id: tabId, type: SIDE_CHAT_TAB_TYPE, title: 'Side Chat' },
      scope,
    )
  })
  readonly activateTab = vi.fn()
  readonly subscribeState = vi.fn(() => () => {})
  readonly getSnapshot = vi.fn(() => ({ sessionId: undefined, state: undefined, prefs: {} }))

  constructor(features: readonly string[] = [
    'badge', 'tabLifecycle', 'targetedOpen', 'stateSubscription',
  ]) {
    this.features = features
  }

  service(): BetterSidebarService {
    return this as unknown as BetterSidebarService
  }
}

describe('SideChatPresentation', () => {
  let controller: SideChatController
  let viewStore: SideChatViewStore
  let presentation: SideChatPresentation
  let mount: HTMLDivElement
  let root: Root | undefined

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    controller = {
      subscribe: () => () => {},
      getSnapshot: () => closedSnapshot,
      binding: () => undefined,
      hasConversation: vi.fn(() => false),
      open: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      send: vi.fn(async () => ({ ok: true as const })),
      cancel: vi.fn(async () => ({ ok: true as const })),
      retry: vi.fn(async () => {}),
    } as unknown as SideChatController
    viewStore = new SideChatViewStore()
    const localeSnapshot = { active: 'en', locales: [], revision: 0 }
    const ctx = {
      locale: {
        bind: () => (key: string) => key,
        subscribe: () => () => {},
        getSnapshot: () => localeSnapshot,
      },
    } as unknown as ClientContext
    presentation = new SideChatPresentation(ctx, controller, viewStore)
    mount = document.createElement('div')
    document.body.append(mount)
  })

  afterEach(() => {
    if (root !== undefined) act(() => { root?.unmount() })
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('uses the drawer without Better Sidebar', () => {
    presentation.show('parent')

    expect(viewStore.get('parent').presentation).toBe('drawer')
    expect(controller.open).toHaveBeenCalledWith('parent')
  })

  it('header toggle minimizes without ending and restores the same child', () => {
    presentation.show('parent')
    presentation.toggle('parent')
    expect(viewStore.get('parent').visible).toBe(false)
    expect(controller.close).not.toHaveBeenCalled()
    presentation.toggle('parent')
    expect(viewStore.get('parent').visible).toBe(true)
    expect(controller.open).toHaveBeenCalledWith('parent')
  })

  it('routes the header action through presentation visibility', () => {
    presentation.show('parent')
    vi.mocked(controller.hasConversation).mockReturnValue(true)
    root = createRoot(mount)

    act(() => {
      root?.render(
        <SideChatButton {...({
          sessionId: 'parent',
          controller,
          viewStore,
          presentation,
          t: (key: string) => key,
        } as unknown as SideChatButtonProps)} />,
      )
    })
    act(() => { mount.querySelector('button')?.click() })

    expect(viewStore.get('parent').visible).toBe(false)
    expect(controller.close).not.toHaveBeenCalled()
  })

  it('registers one native tab and opens it with session scope', () => {
    const fake = new FakeBetterSidebar()
    const dispose = presentation.attachBetterSidebar(fake.service())

    presentation.show('parent')

    expect(fake.registerTab).toHaveBeenCalledTimes(1)
    expect(fake.descriptor).toMatchObject({
      id: SIDE_CHAT_TAB_TYPE,
      single: true,
      hidden: false,
    })
    expect(fake.openTab).toHaveBeenCalledWith(
      expect.objectContaining({
        type: SIDE_CHAT_TAB_TYPE,
        id: SIDE_CHAT_TAB_TYPE,
        path: 'side-chat:parent',
      }),
      { sessionId: 'parent' },
    )
    dispose()
  })

  it('treats native tab close as minimize', () => {
    const fake = new FakeBetterSidebar()
    presentation.attachBetterSidebar(fake.service())
    presentation.show('parent')

    fake.descriptor?.onClose?.(
      { id: SIDE_CHAT_TAB_TYPE, type: SIDE_CHAT_TAB_TYPE, title: 'Side Chat' },
      { sessionId: 'parent' },
    )

    expect(viewStore.get('parent').visible).toBe(false)
    expect(controller.close).not.toHaveBeenCalled()
  })

  it('falls back without losing draft when the service disposes', () => {
    const fake = new FakeBetterSidebar()
    const dispose = presentation.attachBetterSidebar(fake.service())
    presentation.show('parent')
    viewStore.setDraft('parent', 'unfinished')

    dispose()
    dispose()

    expect(fake.unregister).toHaveBeenCalledTimes(1)
    expect(viewStore.get('parent')).toMatchObject({
      presentation: 'drawer',
      draft: 'unfinished',
    })
  })

  it('uses the drawer when the native tab is disabled', () => {
    const fake = new FakeBetterSidebar()
    fake.enabled = false

    expect(() => presentation.attachBetterSidebar(fake.service())).not.toThrow()
    expect(() => presentation.show('parent')).not.toThrow()
    expect(viewStore.get('parent').presentation).toBe('drawer')
    expect(fake.openTab).not.toHaveBeenCalled()
  })

  it('falls back after duplicate registration with one concise warning', () => {
    const fake = new FakeBetterSidebar()
    fake.registrationError = new Error(`duplicate tab id: ${SIDE_CHAT_TAB_TYPE}`)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => presentation.attachBetterSidebar(fake.service())).not.toThrow()
    expect(() => presentation.show('parent')).not.toThrow()

    expect(viewStore.get('parent').presentation).toBe('drawer')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]?.[0])).toContain('Better Sidebar')
  })

  it('falls back when a required runtime capability is missing', () => {
    const fake = new FakeBetterSidebar()
    const incomplete = { ...fake.service(), closeTab: undefined }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() => presentation.attachBetterSidebar(incomplete as unknown as BetterSidebarService)).not.toThrow()
    expect(() => presentation.show('parent')).not.toThrow()

    expect(viewStore.get('parent').presentation).toBe('drawer')
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('falls back when targeted open is not advertised', () => {
    const fake = new FakeBetterSidebar(['tabLifecycle'])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    presentation.attachBetterSidebar(fake.service())
    presentation.show('parent')

    expect(viewStore.get('parent').presentation).toBe('drawer')
    expect(fake.registerTab).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('public minimize closes the native tab without ending the conversation', () => {
    const fake = new FakeBetterSidebar()
    presentation.attachBetterSidebar(fake.service())
    presentation.show('parent')

    presentation.minimize('parent')

    expect(viewStore.get('parent').visible).toBe(false)
    expect(fake.closeTab).toHaveBeenCalledWith(SIDE_CHAT_TAB_TYPE, { sessionId: 'parent' })
    expect(controller.close).not.toHaveBeenCalled()
  })

  it('end closes the native tab before clearing retained view state', async () => {
    const fake = new FakeBetterSidebar()
    presentation.attachBetterSidebar(fake.service())
    presentation.show('parent')
    viewStore.setDraft('parent', 'discard me')

    await presentation.end('parent')

    expect(controller.close).toHaveBeenCalledTimes(1)
    expect(fake.closeTab).toHaveBeenCalledWith(SIDE_CHAT_TAB_TYPE, { sessionId: 'parent' })
    expect(viewStore.get('parent')).toMatchObject({ visible: false, draft: '' })
  })

  it('the native component mirrors visibility and opens an absent conversation', () => {
    const fake = new FakeBetterSidebar()
    presentation.attachBetterSidebar(fake.service())
    const component = fake.descriptor?.component
    expect(component).toBeTypeOf('function')
    root = createRoot(mount)

    act(() => {
      root?.render(component?.({
        ctx: {} as never,
        store: {} as never,
        scope: { sessionId: 'parent' },
        tab: { id: SIDE_CHAT_TAB_TYPE, type: SIDE_CHAT_TAB_TYPE, title: 'Side Chat' },
        visible: true,
      }))
    })

    expect(viewStore.get('parent')).toMatchObject({
      visible: true,
      presentation: 'better-sidebar',
    })
    expect(controller.open).toHaveBeenCalledWith('parent')
    expect(mount.querySelector('[data-side-chat-surface-mode="better-sidebar"]')).not.toBeNull()

    act(() => {
      root?.render(component?.({
        ctx: {} as never,
        store: {} as never,
        scope: { sessionId: 'parent' },
        tab: { id: SIDE_CHAT_TAB_TYPE, type: SIDE_CHAT_TAB_TYPE, title: 'Side Chat' },
        visible: false,
      }))
    })
    expect(viewStore.get('parent').visible).toBe(false)
    expect(controller.close).not.toHaveBeenCalled()
  })

  it('only declares a badge when the runtime advertises it', () => {
    const withBadge = new FakeBetterSidebar()
    presentation.attachBetterSidebar(withBadge.service())
    expect(withBadge.descriptor?.badge).toBeTypeOf('function')

    const withoutBadge = new FakeBetterSidebar(['tabLifecycle', 'targetedOpen'])
    presentation.attachBetterSidebar(withoutBadge.service())
    expect(withoutBadge.descriptor?.badge).toBeUndefined()
  })

  it('replaces a previous registration and exposes the view snapshot', () => {
    const first = new FakeBetterSidebar()
    const second = new FakeBetterSidebar()
    presentation.attachBetterSidebar(first.service())

    presentation.attachBetterSidebar(second.service())
    presentation.show('parent')

    expect(first.unregister).toHaveBeenCalledTimes(1)
    expect(second.openTab).toHaveBeenCalledTimes(1)
    expect(presentation.getSnapshot('parent')).toBe(viewStore.get('parent'))
  })
})
