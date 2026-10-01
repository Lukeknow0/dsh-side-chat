import assert from 'node:assert/strict'
import test from 'node:test'

import { createSidechatApi, unwrapRemoteResult } from '../../src/client/api.js'

test('unwrapRemoteResult returns values and throws the stable RemoteError branch', () => {
  assert.deepEqual(unwrapRemoteResult({ ok: true, value: { childSessionId: 'child' } }), {
    childSessionId: 'child',
  })
  const failure = Object.assign(new Error('missing'), { code: 'sidechat/not-found' })
  assert.throws(
    () => unwrapRemoteResult({ ok: false, error: failure }),
    (error) => error === failure,
  )
})

test('client API invokes ping as an argument-free unary Remote call', async () => {
  const calls = []
  const api = createSidechatApi({
    sideChat: {
      ping: async (...args) => {
        calls.push(args)
        return { ok: true, value: { ok: true } }
      },
    },
  })

  assert.deepEqual(await api.ping(), { ok: true })
  assert.deepEqual(calls, [[]])
})

test('client API sends exact child-only and parent-addressed Remote inputs', async () => {
  const calls = []
  const sideChat = new Proxy({}, {
    get(_target, method) {
      return async (...args) => {
        calls.push([method, ...args])
        if (method === 'list') return { ok: true, value: { threads: [] } }
        if (method === 'start') return { ok: true, value: { childSessionId: 'new-child' } }
        return { ok: true, value: { ok: true } }
      }
    },
  })
  const api = createSidechatApi({ sideChat })

  await api.list('parent-a')
  await api.start('parent-a')
  await api.info('child-a')
  await api.rename('child-a', 'New title')
  await api.archive('child-a')

  assert.deepEqual(calls, [
    ['list', { parentSessionId: 'parent-a' }],
    ['start', { parentSessionId: 'parent-a' }],
    ['info', { childSessionId: 'child-a' }],
    ['rename', { childSessionId: 'child-a', title: 'New title' }],
    ['archive', { childSessionId: 'child-a' }],
  ])
})

test('client API forwards AbortSignal only to cancellable Remote methods', async () => {
  const calls = []
  const sideChat = {
    events: async (...args) => { calls.push(['events', ...args]); return { ok: true, value: { events: [], nextSeq: -1, live: false } } },
    prompt: async (...args) => { calls.push(['prompt', ...args]); return { ok: true, value: { accepted: true } } },
  }
  const api = createSidechatApi({ sideChat })
  const signal = new AbortController().signal

  await api.events('child-a', 7, signal)
  await api.prompt('child-a', 'request-1', [{ type: 'text', text: 'hello' }], signal)

  assert.deepEqual(calls, [
    ['events', { childSessionId: 'child-a', afterSeq: 7 }, signal],
    ['prompt', { childSessionId: 'child-a', requestId: 'request-1', content: [{ type: 'text', text: 'hello' }] }, signal],
  ])
})

test('client configuration API sends exact plugin-owned inputs and only cancellable read signal', async () => {
  const calls = []
  const sideChat = new Proxy({}, {
    get(_target, method) {
      return async (...args) => {
        calls.push([method, ...args])
        return { ok: true, value: { method } }
      }
    },
  })
  const api = createSidechatApi({ sideChat })
  const signal = new AbortController().signal

  assert.deepEqual(await api.configurationCatalogs(), { method: 'configurationCatalogs' })
  assert.deepEqual(await api.configuration('child-a', signal), { method: 'configuration' })
  assert.deepEqual(await api.selectModel('child-a', {
    provider: 'provider-a',
    model: 'model-a',
    reasoningEffort: 'high',
  }), { method: 'selectModel' })
  assert.deepEqual(await api.selectModel('child-a', {
    provider: 'provider-a',
    model: 'model-b',
  }), { method: 'selectModel' })
  assert.deepEqual(
    await api.selectPermission('child-a', 'danger-full-access', true),
    { method: 'selectPermission' },
  )

  assert.deepEqual(calls, [
    ['configurationCatalogs'],
    ['configuration', { childSessionId: 'child-a' }, signal],
    ['selectModel', {
      childSessionId: 'child-a',
      provider: 'provider-a',
      model: 'model-a',
      reasoningEffort: 'high',
    }],
    ['selectModel', {
      childSessionId: 'child-a',
      provider: 'provider-a',
      model: 'model-b',
    }],
    ['selectPermission', {
      childSessionId: 'child-a',
      permissionPreset: 'danger-full-access',
      riskAcknowledged: true,
    }],
  ])
})

test('client question and approval API sends exact child-owned response payloads', async () => {
  const calls = []
  const sideChat = new Proxy({}, {
    get(_target, method) {
      return async (...args) => {
        calls.push([method, ...args])
        return { ok: true, value: { method } }
      }
    },
  })
  const api = createSidechatApi({ sideChat })
  const answers = [
    { id: 'q1', selected: ['option-a'] },
    { id: 'q2', selected: [], custom: 'answer text' },
  ]

  assert.deepEqual(await api.answerQuestion('child-a', 'question:1', answers), { method: 'answerQuestion' })
  assert.deepEqual(await api.resolveApproval('child-a', 'approval:1', 'allowed-once'), { method: 'resolveApproval' })

  assert.deepEqual(calls, [
    ['answerQuestion', {
      childSessionId: 'child-a',
      requestId: 'question:1',
      answers,
    }],
    ['resolveApproval', {
      childSessionId: 'child-a',
      interactionId: 'approval:1',
      decision: 'allowed-once',
    }],
  ])
})

test('client configuration API throws the stable Remote error branch', async () => {
  const failure = Object.assign(new Error('model unavailable'), {
    code: 'sidechat/model-unavailable',
  })
  const api = createSidechatApi({
    sideChat: {
      configurationCatalogs: async () => ({ ok: false, error: failure }),
    },
  })

  await assert.rejects(api.configurationCatalogs(), (error) => error === failure)
})
