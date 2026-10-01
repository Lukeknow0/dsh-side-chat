import assert from 'node:assert/strict'
import test from 'node:test'

const runtimeModule = await import('../../src/sidechat/runtime.js').catch(() => ({}))
const { openSidechatRuntime } = runtimeModule

function makeTable() {
  const records = new Map()
  return {
    get(key) { return records.get(key) },
    put(key, value) { records.set(key, value); return Promise.resolve() },
    delete(key) { return Promise.resolve(records.delete(key)) },
    update(key, transform) {
      const next = transform(records.get(key))
      records.set(key, next)
      return Promise.resolve(next)
    },
    entries() { return records.entries() },
    keys() { return records.keys() },
    get size() { return records.size },
  }
}

test('opens the plugin-owned domain and closes it through one runtime owner', async () => {
  assert.equal(typeof openSidechatRuntime, 'function')
  const table = makeTable()
  const calls = []
  const domain = {
    table(name) {
      calls.push(['table', name])
      return table
    },
    async close() {
      calls.push(['close'])
    },
  }
  const storageDomainFacility = {
    async open(spec) {
      calls.push(['open', spec])
      return domain
    },
  }
  const storageDomainApi = {
    defineDomain(spec) { return spec },
    domainTable(valueSchema) { return { valueSchema } },
  }
  const listeners = new Map()
  const hostContext = {
    on(name, listener, options) {
      calls.push(['on', name, options])
      const entries = listeners.get(name) ?? []
      entries.push(listener)
      listeners.set(name, entries)
      return () => {
        calls.push(['off', name])
        const current = listeners.get(name) ?? []
        const index = current.indexOf(listener)
        if (index >= 0) current.splice(index, 1)
        if (current.length === 0) listeners.delete(name)
      }
    },
  }
  const sessionController = {
    async fork() { return { sessionId: 'child-created' } },
    async prompt() { return { accepted: true } },
    async resolveAgent(sessionId) { return { agent: { id: sessionId } } },
    cancel() { return { accepted: true } },
    async inspect() { return { inheritedEventCount: 0, events: [] } },
    async modelCatalog() {
      return {
        default: { provider: 'deepseek', model: 'chat' },
        routableProviders: ['deepseek'],
        groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'chat', name: 'Chat' }] }],
        failures: [],
      }
    },
    async projections() {
      return {
        asOfSeq: 0,
        values: {
          modelSelection: { next: null, lastUsed: null },
          agentPreset: 'default',
          permissions: { currentValue: 'workspace-write' },
        },
      }
    },
  }
  const agentPresets = {
    async remoteExportList() { return { presets: [{ id: 'default', isDefault: true }] } },
  }
  const permissionPresets = {
    catalog() {
      return {
        options: [{ value: 'workspace-write', name: 'Workspace write' }],
        defaultOptions: [{ value: 'workspace-write', name: 'Workspace write' }],
        defaultPreset: 'workspace-write',
      }
    },
  }
  const approval = { setPolicy() {} }

  const runtime = await openSidechatRuntime({
    storageDomainFacility,
    storageDomainApi,
    sessionController,
    agentPresets,
    permissionPresets,
    approval,
    hostContext,
  })

  assert.equal(typeof runtime.operations.list, 'function')
  assert.equal(typeof runtime.operations.answerQuestion, 'function')
  assert.equal(typeof runtime.operations.resolveApproval, 'function')
  assert.equal(listeners.get('user-questions/request')?.length, 2,
    'live capture must register before the response adapter on the same waterfall')
  const installedEvents = calls.filter(([kind]) => kind === 'on').map(([, name]) => name)
  const questionSubscriptions = installedEvents.flatMap((name, index) => (
    name === 'user-questions/request' ? [index] : []
  ))
  assert.ok(questionSubscriptions[0] < questionSubscriptions[1])
  assert.equal(listeners.get('approval/request')?.length, 1)
  assert.equal(calls[0][0], 'open')
  assert.equal(calls[0][1].name, 'sidechat_threads')
  assert.equal(calls[0][1].layout, 'per-record')
  assert.equal(calls[0][1].invalidRecords, 'backup-and-skip')
  assert.deepEqual(calls[1], ['table', 'threads'])

  const started = await runtime.operations.start({ parentSessionId: 'parent' })
  assert.equal(started.childSessionId, 'child-created')
  assert.deepEqual(await runtime.operations.configuration({ childSessionId: 'child-created' }), {
    model: { provider: 'deepseek', model: 'chat' },
    agentPreset: 'default',
    permissionPreset: 'workspace-write',
    agentPresetMutable: false,
  })
  const catalogs = await runtime.operations.configurationCatalogs()
  assert.equal(catalogs.models.groups[0].id, 'deepseek')

  const agent = { session: { id: 'child-created' } }
  listeners.get('agent/assistant-stream')[0]({
    agent,
    frame: { type: 'start', attemptId: 'attempt-1', revision: 1, turn: 1, step: 0 },
  })
  listeners.get('agent/assistant-stream')[0]({
    agent,
    frame: {
      type: 'chunk',
      attemptId: 'attempt-1',
      revision: 2,
      index: 0,
      time: 1,
      chunk: { type: 'text-delta', index: 0, text: 'live answer' },
    },
  })
  const page = await runtime.operations.events({ childSessionId: 'child-created' })
  assert.equal(page.live.text, 'live answer')

  await runtime.close()
  assert.equal(listeners.size, 0)
  assert.deepEqual(calls.at(-1), ['close'])
})
