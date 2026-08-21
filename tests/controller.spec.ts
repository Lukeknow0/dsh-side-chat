import { describe, expect, it, vi } from 'vitest'
import type { ClientContext, ISessions, SessionBinding, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SideChatRemoteNamespace } from '../src/client/remote.ts'
import { SideChatController } from '../src/client/controller.ts'

const EXPIRES_AT = Date.now() + 30 * 60 * 1_000

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

function success(token: string, parentSessionId = 'parent', expiresAt = EXPIRES_AT) {
  return {
    ok: true as const,
    value: {
      ok: true as const,
      value: {
        parentSessionId,
        childSessionId: `child-${parentSessionId}`,
        chatToken: token,
        seedLength: 14,
        expiresAt,
        cleanupMode: 'archive-on-close' as const,
      },
    },
  }
}

function closeResult() {
  return { ok: true as const, value: { ok: true as const, value: {
    chatToken: 'ignored', closed: true, cleanup: 'absent' as const,
  } } }
}

function readResult(
  chatToken: string,
  messages: { id: string, role: 'assistant', text: string }[] = [],
  expiresAt = EXPIRES_AT,
  running = false,
) {
  return { ok: true as const, value: { ok: true as const, value: {
    chatToken,
    revision: 18,
    expiresAt,
    running,
    partial: '',
    messages,
  } } }
}

function notOpenResult() {
  return { ok: true as const, value: { ok: false as const, error: {
    code: 'not-open' as const, message: 'Side Chat is not open.',
  } } }
}

function transportFailure(message = 'Network unavailable.') {
  return { ok: false as const, error: { code: 'transport-failure', message } }
}

describe('SideChatController lifecycle', () => {
  it('retires a start response that arrives after explicit close', async () => {
    const env = harness()
    const start = deferred<ReturnType<typeof success>>()
    const close = vi.fn(async () => closeResult())
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
      read: vi.fn(async ({ chatToken }: { chatToken: string }) => readResult(chatToken, [
        { id: 'm1', role: 'assistant' as const, text: 'A focused answer.' },
      ])),
      close: vi.fn(async () => closeResult()),
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    await vi.waitFor(() => { expect(controller.getSnapshot().revision).toBe(18) })
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'open', childSessionId: 'child-parent', seedLength: 14, expiresAt: EXPIRES_AT,
      messages: [{ id: 'm1', role: 'assistant', text: 'A focused answer.' }],
    })
    await controller.dispose()
  })

  it('confirms a parked conversation with the Host before restoring its latest transcript', async () => {
    const env = harness()
    const restore = deferred<ReturnType<typeof readResult>>()
    let reads = 0
    const close = vi.fn(async () => closeResult())
    const remote = {
      start: vi.fn(async ({ chatToken }: { chatToken: string }) => success(chatToken)),
      read: vi.fn(({ chatToken }: { chatToken: string }) => {
        reads += 1
        if (reads === 1) return Promise.resolve(readResult(chatToken, [
          { id: 'cached', role: 'assistant' as const, text: 'Cached answer.' },
        ]))
        if (reads === 2) return restore.promise
        return Promise.resolve(readResult(chatToken, [
          { id: 'latest', role: 'assistant' as const, text: 'Latest Host answer.' },
        ]))
      }),
      close,
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    await vi.waitFor(() => { expect(controller.getSnapshot().messages).toHaveLength(1) })
    const token = controller.getSnapshot().chatToken
    env.switchTo('another-parent')

    expect(controller.getSnapshot().phase).toBe('closed')
    expect(controller.hasConversation('parent' as SessionId)).toBe(true)
    expect(close).not.toHaveBeenCalled()

    env.switchTo('parent')
    expect(controller.getSnapshot()).toMatchObject({ phase: 'starting', chatToken: token, messages: [] })
    restore.resolve(readResult(token!, [
      { id: 'latest', role: 'assistant', text: 'Latest Host answer.' },
    ]))
    await vi.waitFor(() => { expect(controller.getSnapshot().phase).toBe('open') })
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'open', chatToken: token, childSessionId: 'child-parent',
      messages: [{ id: 'latest', text: 'Latest Host answer.' }],
    })
    expect(close).not.toHaveBeenCalled()

    await controller.close()
    expect(close).toHaveBeenCalledTimes(1)
    await controller.dispose()
  })

  it('lets the Host override a stale cached expiry after background work', async () => {
    const env = harness()
    const staleExpiry = Date.now() - 1
    const close = vi.fn(async () => closeResult())
    const remote = {
      start: vi.fn(async ({ chatToken }: { chatToken: string }) => success(chatToken, 'parent', staleExpiry)),
      read: vi.fn(async ({ chatToken }: { chatToken: string }) => readResult(
        chatToken, [], EXPIRES_AT, true,
      )),
      close,
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    env.switchTo('another-parent')
    expect(controller.hasConversation('parent' as SessionId)).toBe(true)
    env.switchTo('parent')

    await vi.waitFor(() => { expect(controller.getSnapshot().phase).toBe('open') })
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'open', chatToken: expect.any(String), expiresAt: EXPIRES_AT, running: true,
    })
    expect(close).not.toHaveBeenCalled()
    await controller.dispose()
  })

  it('keeps separate retained conversations for different parent tasks', async () => {
    const env = harness()
    const remote = {
      start: vi.fn(async ({ chatToken, parentSessionId }: { chatToken: string, parentSessionId: string }) => (
        success(chatToken, parentSessionId)
      )),
      read: vi.fn(async ({ chatToken }: { chatToken: string }) => readResult(chatToken)),
      close: vi.fn(async () => closeResult()),
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    const firstToken = controller.getSnapshot().chatToken
    env.switchTo('second')
    await controller.open('second' as SessionId)
    const secondToken = controller.getSnapshot().chatToken
    expect(secondToken).not.toBe(firstToken)

    env.switchTo('parent')
    await vi.waitFor(() => {
      expect(controller.getSnapshot()).toMatchObject({ phase: 'open', chatToken: firstToken, childSessionId: 'child-parent' })
    })
    env.switchTo('second')
    await vi.waitFor(() => {
      expect(controller.getSnapshot()).toMatchObject({ phase: 'open', chatToken: secondToken, childSessionId: 'child-second' })
    })
    expect(remote.close).not.toHaveBeenCalled()
    await controller.dispose()
  })

  it('parks an in-flight opening instead of deleting its late result', async () => {
    const env = harness()
    const start = deferred<ReturnType<typeof success>>()
    const close = vi.fn(async () => closeResult())
    const remote = {
      start: vi.fn(() => start.promise),
      read: vi.fn(async ({ chatToken }: { chatToken: string }) => readResult(chatToken)),
      close,
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    const opening = controller.open('parent' as SessionId)
    const token = controller.getSnapshot().chatToken!
    env.switchTo('other')
    start.resolve(success(token))
    await opening

    expect(controller.getSnapshot().phase).toBe('closed')
    expect(close).not.toHaveBeenCalled()
    env.switchTo('parent')
    await vi.waitFor(() => { expect(controller.getSnapshot()).toMatchObject({ phase: 'open', chatToken: token }) })
    await controller.dispose()
  })

  it('does not flash an expired cached transcript and offers an explicit restart', async () => {
    const env = harness()
    let reads = 0
    const start = vi.fn(async ({ chatToken }: { chatToken: string }) => success(chatToken))
    const close = vi.fn(async () => closeResult())
    const remote = {
      start,
      read: vi.fn(async ({ chatToken }: { chatToken: string }) => {
        reads += 1
        if (reads === 1) return readResult(chatToken, [
          { id: 'expired-cache', role: 'assistant' as const, text: 'Do not flash me.' },
        ])
        if (reads === 2) return notOpenResult()
        return readResult(chatToken)
      }),
      close,
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    await vi.waitFor(() => { expect(controller.getSnapshot().messages).toHaveLength(1) })
    env.switchTo('other')
    env.switchTo('parent')

    expect(controller.getSnapshot()).toMatchObject({ phase: 'starting', messages: [] })
    await vi.waitFor(() => { expect(controller.getSnapshot().phase).toBe('error') })
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'error', errorKind: 'expired', messages: [],
      error: 'This Side Chat ended after 30 minutes parked and idle.',
    })

    await controller.retry()
    await vi.waitFor(() => { expect(controller.getSnapshot().phase).toBe('open') })
    expect(start).toHaveBeenCalledTimes(2)
    await controller.dispose()
  })

  it('keeps a parked conversation retryable when Host confirmation has a transport failure', async () => {
    const env = harness()
    let reads = 0
    const close = vi.fn(async () => closeResult())
    const remote = {
      start: vi.fn(async ({ chatToken }: { chatToken: string }) => success(chatToken)),
      read: vi.fn(async ({ chatToken }: { chatToken: string }) => {
        reads += 1
        if (reads === 1) return readResult(chatToken, [
          { id: 'cached', role: 'assistant' as const, text: 'Cached answer.' },
        ])
        if (reads === 2) return transportFailure()
        return readResult(chatToken, [
          { id: 'recovered', role: 'assistant' as const, text: 'Recovered answer.' },
        ])
      }),
      close,
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    await vi.waitFor(() => { expect(controller.getSnapshot().messages).toHaveLength(1) })
    env.switchTo('other')
    env.switchTo('parent')

    await vi.waitFor(() => { expect(controller.getSnapshot().phase).toBe('error') })
    expect(controller.getSnapshot()).toMatchObject({
      phase: 'error', error: 'Network unavailable.', messages: [],
    })
    expect(controller.getSnapshot().errorKind).toBeUndefined()

    await controller.retry()
    await vi.waitFor(() => { expect(controller.getSnapshot().phase).toBe('open') })
    expect(controller.getSnapshot().messages).toContainEqual({
      id: 'recovered', role: 'assistant', text: 'Recovered answer.',
    })
    expect(close).not.toHaveBeenCalled()
    await controller.dispose()
  })

  it('surfaces host business errors without creating a binding', async () => {
    const env = harness()
    const remote = {
      start: vi.fn(async () => ({ ok: true as const, value: {
        ok: false as const,
        error: { code: 'no-completed-turn' as const, message: 'Complete one turn first.' },
      } })),
      close: vi.fn(async () => closeResult()),
    } as unknown as SideChatRemoteNamespace
    const controller = new SideChatController(env.ctx, remote)

    await controller.open('parent' as SessionId)
    expect(controller.getSnapshot()).toMatchObject({ phase: 'error', error: 'Complete one turn first.' })
    await controller.dispose()
  })
})
