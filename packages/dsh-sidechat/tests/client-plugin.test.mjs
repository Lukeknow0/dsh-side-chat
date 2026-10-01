import assert from 'node:assert/strict'
import test from 'node:test'

const loadPlugin = async () => import('../src/client/plugin.js').catch(() => ({}))

test('declares every Cordis service read by the Client entry', async () => {
  const entry = await import('../src/client/index.js')
  assert.deepEqual(entry.inject, ['remote', 'sidebarRightTabs', 'slots', 'fileUpload'])
  assert.deepEqual(entry.default.inject, entry.inject)
})

test('owns the Remote mount and native tab in one Cordis effect', async () => {
  const { applySidechatClient } = await loadPlugin()
  assert.equal(typeof applySidechatClient, 'function')

  const calls = []
  const ctx = {
    inject: (_names, register) => {
      const cleanup = register(ctx)
      return { dispose: async () => cleanup?.() }
    },
    get: (name) => ctx[name],
    remote: {
      sideChat: {
        ping: async (...args) => {
          calls.push(['ping', ...args])
          return { ok: true, value: { ok: true } }
        },
      },
      $mount: async (remote) => {
        calls.push(['mount', remote])
        return async () => calls.push(['dispose-remote'])
      },
    },
    effect: (execute) => {
      calls.push(['effect'])
      let disposed = false
      return Promise.resolve().then(execute).then((cleanup) => async () => {
        if (disposed) return
        disposed = true
        await cleanup?.()
      })
    },
    sidebarRightTabs: { register: (definition) => {
      calls.push(['tab', definition.id])
      return () => calls.push(['dispose-tab'])
    } },
    slots: {
      inject: (name, register) => {
        calls.push(['inject', name])
        const dispose = register()
        return () => {
          calls.push(['dispose-injection'])
          dispose?.()
        }
      },
      register: (definition) => {
        calls.push(['slot', definition.key])
        return () => calls.push(['dispose-slot'])
      },
    },
  }
  const remote = { package: '@lukeknow0/dsh-side-chat', descriptors: [] }

  const dispose = await applySidechatClient(ctx, remote)
  assert.deepEqual(calls.slice(0, 4), [
    ['effect'],
    ['mount', remote],
    ['ping'],
    ['tab', 'dsh-sidechat:conversation'],
  ])
  await dispose()
  await dispose()
  assert.equal(calls.filter(([kind]) => kind === 'dispose-tab').length, 1)
  assert.equal(calls.filter(([kind]) => kind === 'dispose-remote').length, 1)
})

test('fails Client startup after an unsuccessful authenticated unary ping and rolls back the Remote mount', async () => {
  const { applySidechatClient } = await loadPlugin()
  let remoteDisposals = 0
  let tabRegistrations = 0
  let pingCalls = 0
  const ctx = {
    remote: {
      sideChat: {
        ping: async () => {
          pingCalls += 1
          throw new Error('authentication required')
        },
      },
      $mount: async () => async () => { remoteDisposals += 1 },
    },
    inject: (names, register) => {
      if (names.includes('remote.sideChat')) {
        register(ctx)
        return { dispose: async () => {} }
      }
      throw new Error('tab registration reached before ping')
    },
    effect: (execute) => Promise.resolve().then(execute).then((cleanup) => cleanup),
    sidebarRightTabs: { register: () => { tabRegistrations += 1; return () => {} } },
  }

  await assert.rejects(
    applySidechatClient(ctx, { package: '@lukeknow0/dsh-side-chat', descriptors: [] }),
    /authentication required/,
  )
  assert.equal(pingCalls, 1)
  assert.equal(remoteDisposals, 1)
  assert.equal(tabRegistrations, 0)
})

test('disposes the Remote mount when the native Fiber fails asynchronously during startup', async () => {
  const { applySidechatClient } = await loadPlugin()
  let remoteDisposals = 0
  const ctx = {
    inject: (names, register) => names.includes('remote.sideChat')
      ? (register(ctx), { dispose: async () => {} })
      : ({
        then(_resolve, reject) { return Promise.resolve().then(() => reject(new Error('fiber startup failed'))) },
        async dispose() {},
      }),
    get: () => undefined,
    remote: {
      sideChat: { ping: async () => ({ ok: true, value: { ok: true } }) },
      $mount: async () => async () => { remoteDisposals += 1 },
    },
    effect: (execute) => Promise.resolve().then(execute).then((cleanup) => cleanup),
  }

  await assert.rejects(
    applySidechatClient(ctx, { package: '@lukeknow0/dsh-side-chat', descriptors: [] }),
    /fiber startup failed/,
  )
  assert.equal(remoteDisposals, 1)
})

test('disposes the Remote mount even when the native Fiber cleanup rejects', async () => {
  const { applySidechatClient } = await loadPlugin()
  let remoteDisposals = 0
  const ctx = {
    inject: (_names, register) => {
      register(ctx)
      return { dispose: async () => { throw new Error('fiber cleanup failed') } }
    },
    get: (name) => ctx[name],
    remote: {
      sideChat: { ping: async () => ({ ok: true, value: { ok: true } }) },
      $mount: async () => async () => { remoteDisposals += 1 },
    },
    effect: (execute) => Promise.resolve().then(execute).then((cleanup) => cleanup),
    sidebarRightTabs: { register: () => () => {} },
    slots: {
      inject: (_name, register) => register(),
      register: () => () => {},
    },
  }

  const dispose = await applySidechatClient(ctx, { package: '@lukeknow0/dsh-side-chat', descriptors: [] })
  await assert.rejects(dispose(), /fiber cleanup failed/)
  assert.equal(remoteDisposals, 1)
})

test('disposes the Remote mount when native tab registration fails', async () => {
  const { applySidechatClient } = await loadPlugin()
  let remoteDisposals = 0
  const ctx = {
    inject: (_names, register) => {
      const cleanup = register(ctx)
      return { dispose: async () => cleanup?.() }
    },
    get: (name) => ctx[name],
    remote: {
      sideChat: { ping: async () => ({ ok: true, value: { ok: true } }) },
      $mount: async () => async () => { remoteDisposals += 1 },
    },
    effect: (execute) => Promise.resolve().then(execute).then((cleanup) => cleanup),
    sidebarRightTabs: {
      register: () => { throw new Error('duplicate tab id') },
    },
  }

  await assert.rejects(
    applySidechatClient(ctx, { package: '@lukeknow0/dsh-side-chat', descriptors: [] }),
    /duplicate tab id/,
  )
  assert.equal(remoteDisposals, 1)
})

test('binds the mounted Remote namespace in an injected Cordis child context', async () => {
  const { applySidechatClient } = await loadPlugin()
  let pings = 0
  let tabs = 0
  let namespaceDisposals = 0
  const ctx = {
    remote: {
      $mount: async () => async () => {},
      get sideChat() { throw new Error('cannot get property "remote.sideChat" without inject') },
    },
    effect: (execute) => Promise.resolve().then(execute),
    sidebarRightTabs: { register: () => { tabs += 1; return () => {} } },
    slots: {
      inject: (_name, register) => register(),
      register: () => () => {},
    },
    inject: (names, register) => {
      const child = names.includes('remote.sideChat')
        ? { ...ctx, remote: { sideChat: { ping: async () => { pings += 1; return { ok: true, value: { ok: true } } } } } }
        : ctx
      child.get = (name) => child[name]
      const cleanup = register(child)
      return {
        async dispose() {
          if (names.includes('remote.sideChat')) namespaceDisposals += 1
          await cleanup?.()
        },
      }
    },
  }

  const dispose = await applySidechatClient(ctx, { package: '@lukeknow0/dsh-side-chat', descriptors: [] })
  assert.equal(pings, 1)
  assert.equal(tabs, 1)
  await dispose()
  assert.equal(namespaceDisposals, 1)
})
