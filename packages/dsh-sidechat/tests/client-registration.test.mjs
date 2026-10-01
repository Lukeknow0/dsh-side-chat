import assert from 'node:assert/strict'
import test from 'node:test'

const loadRegistration = async () => import('../src/client/register-tab.js').catch(() => ({}))

function fixture() {
  const calls = []
  const ctx = {
    inject(names, register) {
      calls.push(['service-inject', names])
      const dispose = register(ctx)
      return {
        async dispose() {
          calls.push(['dispose-service-injection'])
          await dispose?.()
        },
      }
    },
    get(name) { return ctx[name] },
    sidebarRightTabs: {
      register(definition) {
        calls.push(['tab', definition])
        return () => calls.push(['dispose-tab'])
      },
    },
    slots: {
      inject(name, register) {
        calls.push(['inject', name])
        const disposeSlot = register()
        return () => {
          calls.push(['dispose-injection'])
          disposeSlot?.()
        }
      },
      register(definition, component) {
        calls.push(['slot', definition, component])
        return () => calls.push(['dispose-slot'])
      },
    },
  }
  return { calls, ctx }
}

test('registers the body under the exact native tab ID and disposes once', async () => {
  const { registerSidechatTab } = await loadRegistration()
  assert.equal(typeof registerSidechatTab, 'function')

  const { calls, ctx } = fixture()
  const api = { list: async () => ({ threads: [] }) }
  const state = { selected: () => undefined }
  const dispose = await registerSidechatTab(ctx, { api, state })
  const slot = calls.find(([kind]) => kind === 'slot')
  assert.equal(slot[1].name, 'sidebar.right.pane.tab')
  assert.equal(slot[1].key, 'dsh-sidechat:conversation')
  assert.equal(typeof slot[1].inject, 'function')
  assert.deepEqual(slot[1].inject('parent-a'), { api, state, parentSessionId: 'parent-a' })
  assert.equal(typeof slot[2], 'function')
  const titleSlot = calls.find(([kind, definition]) => kind === 'slot' && definition.name === 'sidebar.right.pane.tab.title')
  assert.ok(titleSlot, 'the native chip owns the conversation title')
  assert.equal(titleSlot[1].key, 'dsh-sidechat:conversation')
  assert.deepEqual(titleSlot[1].inject('parent-a'), { state, parentSessionId: 'parent-a' })
  assert.equal(typeof titleSlot[2], 'function')

  await dispose()
  await dispose()
  assert.equal(calls.filter(([kind]) => kind === 'dispose-injection').length, 2)
  assert.equal(calls.filter(([kind]) => kind === 'dispose-tab').length, 1)
  assert.equal(calls.filter(([kind]) => kind === 'dispose-service-injection').length, 1)
})

test('waits for the native tab service instead of losing registration during late boot', async () => {
  const { registerSidechatTab } = await loadRegistration()
  const calls = []
  let arrive
  let serviceCleanup
  const tabService = {
    register(definition) {
      calls.push(['tab', definition.id])
      return () => calls.push(['dispose-tab'])
    },
  }
  const ctx = {
    inject(names, callback) {
      calls.push(['service-inject', names])
      let resolveReady
      const fiber = new Promise((resolve) => { resolveReady = resolve })
      fiber.dispose = async () => { await serviceCleanup?.() }
      arrive = () => {
        serviceCleanup = callback(ctx)
        resolveReady()
      }
      return fiber
    },
    get(name) { return name === 'sidebarRightTabs' ? tabService : undefined },
    slots: {
      inject(_name, register) { return register() },
      register(definition) {
        calls.push(['slot', definition.key])
        return () => calls.push(['dispose-slot'])
      },
    },
  }

  const registration = registerSidechatTab(ctx, { api: {}, state: {} })
  assert.equal(calls.some(([kind]) => kind === 'tab'), false)
  arrive()
  const dispose = await registration
  assert.ok(calls.some(([kind]) => kind === 'tab'))
  await dispose()
  assert.equal(calls.filter(([kind]) => kind === 'dispose-tab').length, 1)
})
