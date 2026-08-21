import { describe, expect, it, vi } from 'vitest'
import type { ClientContext, ISessions, SessionBinding, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SideChatRemoteNamespace } from '../src/client/remote.ts'
import { SideChatController } from '../src/client/controller.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

function harness() {
  let current = 'parent' as SessionId
  const listeners = new Set<() => void>()
  const bindings = new Map<string, SessionBinding>()
  const sessions = {
    list: {
      getSnapshot: () => ({ current }),
      subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    },
    binding: (id: SessionId) => bindings.get(String(id)),
  } as unknown as ISessions
  const ctx = { get: (name: string) => name === 'sessions' ? sessions : undefined } as unknown as ClientContext
  return {
    ctx,
    bindings,
    switchTo(id: string) { current = id as SessionId; for (const listener of listeners) listener() },
  }
}

function success(token: string) {
  return {
    ok: true as const,
    value: {
      ok: true as const,
      value: {
        parentSessionId: 'parent', childSessionId: 'child', chatToken: token,
        seedLength: 14, cleanupMode: 'archive-on-close' as const,
      },
    },
  }
}

describe('SideChatController lifecycle', () => {
  it('retires a start response that arrives after close', async () => {
    const env = harness()
    const start = deferred<ReturnType<typeof success>>()
    const close = vi.fn(async () => ({ ok: true as const, value: { ok: true as const, value: {
      chatToken: 'ignored', closed: true, cleanup: 'absent' as const,
    } } }))
    const remote = { start: vi.fn(() => start.promise), close } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    const opening = controller.open('parent' as SessionId)
    const token = controller.getSnapshot().chatToken
    expect(controller.getSnapshot().phase).toBe('starting')
    await controller.close()
    start.resolve(success(token!))
    await opening

    expect(controller.getSnapshot().phase).toBe('closed')
    expect(close).toHaveBeenCalledWith({ chatToken: token })
    await controller.dispose()
  })

  it('publishes only the active child transcript epoch', async () => {
    const env = harness()
    const remote = {
      start: vi.fn(async ({ chatToken }: { chatToken: string }) => success(chatToken)),
      read: vi.fn(async ({ chatToken }: { chatToken: string }) => ({ ok: true as const, value: {
        ok: true as const, value: { chatToken, revision: 18, running: false, partial: '',
          messages: [{ id: 'm1', role: 'assistant' as const, text: 'A focused answer.' }] },
      } })),
      close: vi.fn(async () => ({ ok: true as const, value: { ok: true as const, value: {
        chatToken: 'x', closed: true, cleanup: 'archived' as const,
      } } })),
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    await vi.waitFor(() => { expect(controller.getSnapshot().revision).toBe(18) })
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'open', childSessionId: 'child', seedLength: 14,
      messages: [{ id: 'm1', role: 'assistant', text: 'A focused answer.' }],
    })
    await controller.dispose()
  })

  it('closes when the active parent session changes', async () => {
    const env = harness()
    const close = vi.fn(async () => ({ ok: true as const, value: { ok: true as const, value: {
      chatToken: 'x', closed: true, cleanup: 'archived' as const,
    } } }))
    const remote = {
      start: vi.fn(async ({ chatToken }: { chatToken: string }) => success(chatToken)),
      read: vi.fn(async ({ chatToken }: { chatToken: string }) => ({ ok: true as const, value: {
        ok: true as const, value: { chatToken, revision: 14, running: false, partial: '', messages: [] },
      } })),
      close,
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    env.switchTo('another-parent')
    await vi.waitFor(() => { expect(controller.getSnapshot().phase).toBe('closed') })
    expect(close).toHaveBeenCalledTimes(1)
    await controller.dispose()
  })

  it('surfaces host business errors without creating a binding', async () => {
    const env = harness()
    const remote = {
      start: vi.fn(async () => ({ ok: true as const, value: {
        ok: false as const,
        error: { code: 'no-completed-turn' as const, message: 'Complete one turn first.' },
      } })),
      close: vi.fn(async () => ({ ok: true as const, value: { ok: true as const, value: {
        chatToken: 'x', closed: true, cleanup: 'absent' as const,
      } } })),
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    expect(controller.getSnapshot()).toMatchObject({ phase: 'error', error: 'Complete one turn first.' })
    await controller.dispose()
  })
})
