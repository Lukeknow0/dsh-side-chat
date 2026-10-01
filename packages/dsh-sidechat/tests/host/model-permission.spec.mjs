/**
 * Task 2.2 TDD — child-owned model and permission Host adapter.
 *
 * Pure dependency fakes only: no DSH process, profile, or filesystem access.
 *
 * Run: pnpm --dir packages/dsh-sidechat test -- tests/host/model-permission.spec.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const {
  SidechatModelPermissionHost,
  SidechatModelPermissionError,
} = await import('../../src/sidechat/model-permission.js')

const CHILD = 'child-session-1'
const PARENT = 'parent-session-1'

const MODELS = {
  default: { provider: 'deepseek', model: 'deepseek-chat' },
  routableProviders: ['deepseek'],
  groups: [{
    id: 'deepseek',
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
      {
        id: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        reasoning: {
          efforts: [
            { id: 'medium', name: 'Medium' },
            { id: 'high', name: 'High' },
          ],
          defaultEffort: 'medium',
        },
      },
    ],
  }],
  failures: [],
}

const AGENT_PRESETS = {
  presets: [{ id: 'default', isDefault: true, name: 'Default' }],
}

const PERMISSIONS = {
  options: [
    { value: 'workspace-write', name: 'Workspace write' },
    { value: 'danger-full-access', name: 'Full access' },
    { value: 'auto', name: 'Auto' },
  ],
  defaultOptions: [
    { value: 'workspace-write', name: 'Workspace write' },
    { value: 'danger-full-access', name: 'Full access' },
  ],
  defaultPreset: 'workspace-write',
}

function activeRecord() {
  return { childSessionId: CHILD, parentSessionId: PARENT }
}

function makeHarness(overrides = {}) {
  const calls = []
  const ownership = {
    resolve(childSessionId) {
      calls.push(['ownership.resolve', childSessionId])
      return activeRecord()
    },
  }
  const agent = {
    id: CHILD,
    status: 'idle',
    session: { id: CHILD },
  }
  const sessionController = {
    async modelCatalog() {
      calls.push(['sessionController.modelCatalog'])
      return MODELS
    },
    async projections(request, signal) {
      calls.push(['sessionController.projections', request, signal])
      return {
        asOfSeq: 12,
        values: {
          modelSelection: {
            lastUsed: { provider: 'deepseek', model: 'deepseek-chat' },
            next: {
              provider: 'deepseek',
              model: 'deepseek-reasoner',
              reasoningEffort: 'high',
            },
          },
          agentPreset: 'default',
          permissions: { currentValue: 'workspace-write' },
        },
      }
    },
    async selectModel(request) {
      calls.push(['sessionController.selectModel', request])
      return {
        selected: {
          provider: request.provider,
          model: request.model,
          ...(request.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: request.reasoningEffort }),
        },
      }
    },
    async resolveAgent(childSessionId) {
      calls.push(['sessionController.resolveAgent', childSessionId])
      return { agent }
    },
  }
  const agentPresets = {
    async remoteExportList() {
      calls.push(['agentPresets.remoteExportList'])
      return AGENT_PRESETS
    },
  }
  const permissionPresets = {
    catalog() {
      calls.push(['permissionPresets.catalog'])
      return PERMISSIONS
    },
    apply(session, name, setApproval) {
      calls.push(['permissionPresets.apply', session, name])
      setApproval(name === 'workspace-write' ? 'ask' : 'never')
    },
  }
  const approval = {
    setPolicy(target, policy) {
      calls.push(['approval.setPolicy', target, policy])
    },
  }

  const dependencies = {
    ownership: overrides.ownership ?? ownership,
    sessionController: { ...sessionController, ...overrides.sessionController },
    agentPresets: { ...agentPresets, ...overrides.agentPresets },
    permissionPresets: { ...permissionPresets, ...overrides.permissionPresets },
    approval: { ...approval, ...overrides.approval },
  }

  return {
    calls,
    dependencies,
    host: new SidechatModelPermissionHost(dependencies),
  }
}

test('configurationCatalogs returns all live Host catalogs without activating a Session', async () => {
  const { host, calls } = makeHarness()

  assert.deepEqual(await host.configurationCatalogs(), {
    models: MODELS,
    agentPresets: AGENT_PRESETS,
    permissions: PERMISSIONS,
  })
  assert.deepEqual(calls, [
    ['sessionController.modelCatalog'],
    ['agentPresets.remoteExportList'],
    ['permissionPresets.catalog'],
  ])
})

test('configuration reads the child projection without activating it and prefers next model', async () => {
  const { host, calls } = makeHarness()
  const signal = AbortSignal.timeout(1_000)

  assert.deepEqual(await host.configuration(CHILD, signal), {
    model: {
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      reasoningEffort: 'high',
    },
    agentPreset: 'default',
    permissionPreset: 'workspace-write',
    agentPresetMutable: false,
  })
  assert.deepEqual(calls, [
    ['ownership.resolve', CHILD],
    ['sessionController.projections', { sessionId: CHILD }, signal],
    ['sessionController.modelCatalog'],
  ])
})

test('configuration falls back from an empty model fold to the live catalog default', async () => {
  const { host } = makeHarness({
    sessionController: {
      async projections() {
        return {
          asOfSeq: 0,
          values: {
            modelSelection: { lastUsed: null, next: null },
            agentPreset: null,
            permissions: { currentValue: 'workspace-write' },
          },
        }
      },
    },
  })

  assert.deepEqual(await host.configuration(CHILD), {
    model: MODELS.default,
    agentPreset: null,
    permissionPreset: 'workspace-write',
    agentPresetMutable: false,
  })
})

test('configuration rejects archived ownership before any Host read', async () => {
  const { host, calls } = makeHarness({
    ownership: {
      resolve(childSessionId) {
        calls.push(['ownership.resolve', childSessionId])
        return { ...activeRecord(), archivedAt: 123 }
      },
    },
  })

  await assert.rejects(
    () => host.configuration(CHILD),
    (error) => {
      assert.ok(error instanceof SidechatModelPermissionError)
      assert.equal(error.code, 'sidechat/archived')
      assert.deepEqual(error.details, { childSessionId: CHILD })
      return true
    },
  )
  assert.deepEqual(calls, [['ownership.resolve', CHILD]])
})

test('configuration maps unknown plugin ownership to a stable non-leaking error', async () => {
  const cause = new Error('private storage detail')
  cause.code = 'not-found'
  const { host } = makeHarness({
    ownership: { resolve() { throw cause } },
  })

  await assert.rejects(
    () => host.configuration('unknown-child'),
    (error) => {
      assert.ok(error instanceof SidechatModelPermissionError)
      assert.equal(error.code, 'sidechat/not-found')
      assert.equal(error.message.includes('private storage detail'), false)
      assert.deepEqual(error.details, { childSessionId: 'unknown-child' })
      return true
    },
  )
})

test('configuration maps an absent durable Session to a stable error', async () => {
  const { host } = makeHarness({
    sessionController: { async projections() { return null } },
  })

  await assert.rejects(
    () => host.configuration(CHILD),
    (error) => {
      assert.ok(error instanceof SidechatModelPermissionError)
      assert.equal(error.code, 'sidechat/session-unavailable')
      assert.deepEqual(error.details, { childSessionId: CHILD })
      return true
    },
  )
})

test('selectModel revalidates the live catalog and changes only the owned child', async () => {
  const { host, calls } = makeHarness()

  assert.deepEqual(await host.selectModel({
    childSessionId: CHILD,
    provider: 'deepseek',
    model: 'deepseek-reasoner',
    reasoningEffort: 'high',
  }), {
    selected: {
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      reasoningEffort: 'high',
    },
  })
  assert.deepEqual(calls, [
    ['ownership.resolve', CHILD],
    ['sessionController.modelCatalog'],
    ['sessionController.selectModel', {
      sessionId: CHILD,
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      reasoningEffort: 'high',
    }],
  ])
  assert.equal(calls.some(([, value]) => value?.sessionId === PARENT), false)
})

test('selectModel rejects a stale provider/model before resuming the child', async () => {
  const { host, calls } = makeHarness()

  await assert.rejects(
    () => host.selectModel({
      childSessionId: CHILD,
      provider: 'missing-provider',
      model: 'missing-model',
    }),
    (error) => {
      assert.ok(error instanceof SidechatModelPermissionError)
      assert.equal(error.code, 'sidechat/model-unavailable')
      assert.deepEqual(error.details, {
        childSessionId: CHILD,
        provider: 'missing-provider',
        model: 'missing-model',
      })
      return true
    },
  )
  assert.deepEqual(calls, [
    ['ownership.resolve', CHILD],
    ['sessionController.modelCatalog'],
  ])
})

test('selectModel maps an rc.2 availability race to its stable domain error', async () => {
  const cause = new Error('adapter-private availability detail')
  cause.code = 'session/model-unavailable'
  const { host } = makeHarness({
    sessionController: { async selectModel() { throw cause } },
  })

  await assert.rejects(
    () => host.selectModel({
      childSessionId: CHILD,
      provider: 'deepseek',
      model: 'deepseek-chat',
    }),
    (error) => {
      assert.ok(error instanceof SidechatModelPermissionError)
      assert.equal(error.code, 'sidechat/model-unavailable')
      assert.equal(error.message.includes('adapter-private'), false)
      assert.deepEqual(error.details, {
        childSessionId: CHILD,
        provider: 'deepseek',
        model: 'deepseek-chat',
      })
      return true
    },
  )
})

test('selectModel rejects a stale reasoning effort before resuming the child', async () => {
  const { host, calls } = makeHarness()

  await assert.rejects(
    () => host.selectModel({
      childSessionId: CHILD,
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      reasoningEffort: 'extreme',
    }),
    (error) => {
      assert.ok(error instanceof SidechatModelPermissionError)
      assert.equal(error.code, 'sidechat/model-unavailable')
      assert.deepEqual(error.details, {
        childSessionId: CHILD,
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        reasoningEffort: 'extreme',
      })
      return true
    },
  )
  assert.deepEqual(calls, [
    ['ownership.resolve', CHILD],
    ['sessionController.modelCatalog'],
  ])
})

test('selectPermission applies a catalogued child preset through the live approval setter', async () => {
  const { host, calls } = makeHarness()

  assert.deepEqual(await host.selectPermission({
    childSessionId: CHILD,
    permissionPreset: 'danger-full-access',
    riskAcknowledged: true,
  }), { selected: 'danger-full-access' })

  assert.equal(calls[0][0], 'ownership.resolve')
  assert.equal(calls[1][0], 'permissionPresets.catalog')
  assert.deepEqual(calls[2], ['sessionController.resolveAgent', CHILD])
  assert.equal(calls[3][0], 'permissionPresets.apply')
  assert.equal(calls[3][1].id, CHILD)
  assert.equal(calls[3][2], 'danger-full-access')
  assert.equal(calls[4][0], 'approval.setPolicy')
  assert.equal(calls[4][1].id, CHILD)
  assert.equal(calls[4][2], 'never')
  assert.equal(calls.some(([, value]) => value?.id === PARENT), false)
})

test('selectPermission rejects an unknown live catalog value before activating the child', async () => {
  const { host, calls } = makeHarness()

  await assert.rejects(
    () => host.selectPermission({
      childSessionId: CHILD,
      permissionPreset: 'custom',
      riskAcknowledged: true,
    }),
    (error) => {
      assert.ok(error instanceof SidechatModelPermissionError)
      assert.equal(error.code, 'sidechat/permission-unavailable')
      assert.deepEqual(error.details, {
        childSessionId: CHILD,
        permissionPreset: 'custom',
      })
      return true
    },
  )
  assert.deepEqual(calls, [
    ['ownership.resolve', CHILD],
    ['permissionPresets.catalog'],
  ])
})

test('selectPermission requires explicit risk acknowledgement for full access and auto', async () => {
  for (const permissionPreset of ['danger-full-access', 'auto']) {
    const { host, calls } = makeHarness()

    await assert.rejects(
      () => host.selectPermission({
        childSessionId: CHILD,
        permissionPreset,
        riskAcknowledged: false,
      }),
      (error) => {
        assert.ok(error instanceof SidechatModelPermissionError)
        assert.equal(error.code, 'sidechat/risk-acknowledgement-required')
        assert.deepEqual(error.details, { childSessionId: CHILD, permissionPreset })
        return true
      },
    )
    assert.deepEqual(calls, [
      ['ownership.resolve', CHILD],
      ['permissionPresets.catalog'],
    ])
  }
})

test('selectPermission rejects a running child before applying any policy change', async () => {
  const runningAgent = { id: CHILD, status: 'running', session: { id: CHILD } }
  const { host, calls } = makeHarness({
    sessionController: {
      async resolveAgent(childSessionId) {
        calls.push(['sessionController.resolveAgent', childSessionId])
        return { agent: runningAgent }
      },
    },
  })

  await assert.rejects(
    () => host.selectPermission({
      childSessionId: CHILD,
      permissionPreset: 'workspace-write',
      riskAcknowledged: false,
    }),
    (error) => {
      assert.ok(error instanceof SidechatModelPermissionError)
      assert.equal(error.code, 'sidechat/child-running')
      assert.deepEqual(error.details, { childSessionId: CHILD })
      return true
    },
  )
  assert.deepEqual(calls, [
    ['ownership.resolve', CHILD],
    ['permissionPresets.catalog'],
    ['sessionController.resolveAgent', CHILD],
  ])
})

test('selectPermission maps resolveAgent failure without leaking its error', async () => {
  const { host } = makeHarness({
    sessionController: {
      async resolveAgent() { return { error: new Error('private resolver detail') } },
    },
  })

  await assert.rejects(
    () => host.selectPermission({
      childSessionId: CHILD,
      permissionPreset: 'workspace-write',
      riskAcknowledged: false,
    }),
    (error) => {
      assert.ok(error instanceof SidechatModelPermissionError)
      assert.equal(error.code, 'sidechat/session-unavailable')
      assert.equal(error.message.includes('private resolver detail'), false)
      assert.deepEqual(error.details, { childSessionId: CHILD })
      return true
    },
  )
})
