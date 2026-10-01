import assert from 'node:assert/strict'
import test from 'node:test'

import { OwnershipStore } from '../../src/sidechat/ownership.js'
import { SidechatOperations, SidechatOperationError } from '../../src/sidechat/operations.js'

function makeTable() {
  const records = new Map()
  return {
    get(key) { return records.get(key) },
    put(key, value) { records.set(key, value); return Promise.resolve() },
    delete(key) { return Promise.resolve(records.delete(key)) },
    update(key, transform) {
      if (!records.has(key)) return Promise.reject(new Error(`missing key: ${key}`))
      const next = transform(records.get(key))
      records.set(key, next)
      return Promise.resolve(next)
    },
    entries() { return records.entries() },
    keys() { return records.keys() },
    get size() { return records.size },
  }
}

async function fixture() {
  const ownership = new OwnershipStore(makeTable())
  await ownership.create({
    parentSessionId: 'parent-a',
    childSessionId: 'child-a',
    title: 'Private title A',
  })
  await ownership.create({
    parentSessionId: 'parent-b',
    childSessionId: 'child-b',
    title: 'Private title B',
  })

  const calls = []
  const sessionController = {
    async resolveAgent(sessionId) {
      calls.push(['resolveAgent', sessionId])
      return { agent: { id: sessionId } }
    },
    async prompt(request, signal) {
      calls.push(['prompt', request, signal])
      signal.throwIfAborted()
      return { accepted: true }
    },
    cancel(request) {
      calls.push(['cancel', request])
      return { accepted: true }
    },
    async inspect(sessionId) {
      calls.push(['inspect', sessionId])
      return { inheritedEventCount: 0, events: [] }
    },
  }
  const forkService = {
    async forkSideSession(input) {
      calls.push(['fork', input])
      return { childSessionId: 'new-child', title: '', createdAt: 1 }
    },
  }

  return {
    ownership,
    calls,
    operations: new SidechatOperations({ ownership, sessionController, forkService }),
  }
}

function expectCode(code) {
  return (error) => {
    assert.ok(error instanceof SidechatOperationError)
    assert.equal(error.code, code)
    return true
  }
}

test('start delegates parent validation and forking to the fork service', async () => {
  const { operations, calls } = await fixture()
  const result = await operations.start({ parentSessionId: 'parent-a' })

  assert.deepEqual(result, { childSessionId: 'new-child' })
  assert.deepEqual(calls, [['fork', { parentSessionId: 'parent-a' }]])
})

test('list returns only the requested parent active threads', async () => {
  const { operations, ownership } = await fixture()
  await ownership.create({ parentSessionId: 'parent-a', childSessionId: 'child-a-2', title: 'Second' })
  await ownership.archive('child-a-2', 'parent-a')

  const result = await operations.list({ parentSessionId: 'parent-a' })
  assert.deepEqual(result.threads.map((thread) => thread.childSessionId), ['child-a'])
  assert.equal(result.threads[0].status, 'idle')
})

test('info derives the parent exclusively from the stored child association', async () => {
  const { operations } = await fixture()
  const result = await operations.info({ childSessionId: 'child-b' })

  assert.equal(result.childSessionId, 'child-b')
  assert.equal(result.parentSessionId, 'parent-b')
  assert.equal(result.title, 'Private title B')
})

test('info returns a stable non-leaking failure for an unknown child', async () => {
  const { operations } = await fixture()

  await assert.rejects(
    () => operations.info({ childSessionId: 'unknown-child' }),
    (error) => {
      expectCode('sidechat/not-found')(error)
      assert.doesNotMatch(error.message, /Private title|parent-a|parent-b/)
      return true
    },
  )
})

test('rename changes only the addressed association title', async () => {
  const { operations, ownership } = await fixture()
  const result = await operations.rename({ childSessionId: 'child-a', title: 'Renamed' })

  assert.deepEqual(result, { ok: true })
  assert.equal(ownership.resolve('child-a', 'parent-a').title, 'Renamed')
  assert.equal(ownership.resolve('child-b', 'parent-b').title, 'Private title B')
})

test('rename rejects an unknown child without changing existing records', async () => {
  const { operations, ownership } = await fixture()

  await assert.rejects(
    () => operations.rename({ childSessionId: 'unknown-child', title: 'Stolen' }),
    expectCode('sidechat/not-found'),
  )
  assert.equal(ownership.resolve('child-b', 'parent-b').title, 'Private title B')
})

test('archive hides metadata but never calls a DSH session deletion operation', async () => {
  const { operations, ownership, calls } = await fixture()
  const result = await operations.archive({ childSessionId: 'child-a' })

  assert.deepEqual(result, { ok: true })
  assert.ok(ownership.resolve('child-a', 'parent-a').archivedAt)
  assert.deepEqual(calls, [])
})

test('prompt forwards the Typert cancellation signal, idempotency key, and content', async () => {
  const { operations, calls } = await fixture()
  const content = [{ type: 'text', text: 'question' }]
  const signal = new AbortController().signal
  const result = await operations.prompt({
    childSessionId: 'child-a',
    requestId: 'request-1',
    content,
  }, signal)

  assert.deepEqual(result, { accepted: true })
  assert.deepEqual(calls, [[
    'prompt',
    {
      sessionId: 'child-a',
      requestId: 'request-1',
      mode: 'queue',
      content,
    },
    signal,
  ]])
})

test('prompt rejects unknown and archived children before touching Session Controller', async () => {
  const { operations, ownership, calls } = await fixture()
  const signal = new AbortController().signal

  await assert.rejects(
    () => operations.prompt({
      childSessionId: 'unknown-child',
      requestId: 'unknown',
      content: [{ type: 'text', text: 'x' }],
    }, signal),
    expectCode('sidechat/not-found'),
  )

  await ownership.archive('child-a', 'parent-a')
  await assert.rejects(
    () => operations.prompt({
      childSessionId: 'child-a',
      requestId: 'archived',
      content: [{ type: 'text', text: 'x' }],
    }, signal),
    expectCode('sidechat/archived'),
  )
  assert.deepEqual(calls, [])
})

test('cancel resumes a cold addressed child before explicit cancellation', async () => {
  const { operations, calls } = await fixture()
  const result = await operations.cancel({ childSessionId: 'child-a' })

  assert.deepEqual(result, { accepted: true })
  assert.deepEqual(calls, [
    ['resolveAgent', 'child-a'],
    ['cancel', { sessionId: 'child-a' }],
  ])
})

test('cancel propagates a stable resolver failure and does not call cancel', async () => {
  const { operations, calls } = await fixture()
  operations.sessionController.resolveAgent = async (sessionId) => {
    calls.push(['resolveAgent', sessionId])
    return { error: Object.assign(new Error('persisted child missing'), { code: 'session/not-found' }) }
  }

  await assert.rejects(
    () => operations.cancel({ childSessionId: 'child-a' }),
    expectCode('sidechat/session-unavailable'),
  )
  assert.deepEqual(calls, [['resolveAgent', 'child-a']])
})
