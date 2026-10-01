import assert from 'node:assert/strict'
import test from 'node:test'

import { OwnershipStore } from '../../src/sidechat/ownership.js'
import {
  SidechatOperations,
  SidechatOperationError,
  normalizeSessionEvent,
} from '../../src/sidechat/operations.js'

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

function event(seq, type, data, extra = {}) {
  return { seq, type, time: 1_000 + seq, data, ...extra }
}

async function fixture(events, options = {}) {
  const ownership = new OwnershipStore(makeTable())
  await ownership.create({ parentSessionId: 'parent-a', childSessionId: 'child-a', title: 'A' })
  await ownership.create({ parentSessionId: 'parent-b', childSessionId: 'child-b', title: 'Secret B' })
  if (options.archived) await ownership.archive('child-a', 'parent-a')

  const calls = []
  const sessionController = {
    async inspect(sessionId, signal) {
      calls.push(['inspect', sessionId, signal])
      signal?.throwIfAborted()
      return {
        inheritedEventCount: options.inheritedEventCount ?? 4,
        events,
      }
    },
  }
  const operations = new SidechatOperations({
    ownership,
    sessionController,
    forkService: { forkSideSession: async () => ({ childSessionId: 'unused' }) },
    eventPageLimit: options.eventPageLimit,
    liveState: options.liveState,
  })
  return { operations, ownership, calls }
}

function expectCode(code) {
  return (error) => {
    assert.ok(error instanceof SidechatOperationError)
    assert.equal(error.code, code)
    return true
  }
}

const seededEvents = [
  event(0, 'user/message', {
    id: 'ancestor-user', role: 'user', content: [{ type: 'text', text: 'ancestor seed' }], source: { kind: 'user' },
  }, { surfaceOp: 'append' }),
  event(1, 'session/end-seed', { inherited: true }),
  event(2, 'user/message', {
    id: 'parent-user', role: 'user', content: [{ type: 'text', text: 'parent after ancestor' }], source: { kind: 'user' },
  }, { surfaceOp: 'append' }),
  event(3, 'session/end-seed', { inherited: true }),
  event(4, 'turn/end', { turn: 1, reason: { kind: 'forked' } }),
  event(5, 'turn/start', { turn: 2 }),
  event(6, 'user/message', {
    id: 'child-user',
    role: 'user',
    content: [
      { type: 'text', text: 'child question' },
      {
        type: 'image',
        attachment: {
          attachmentId: 'img-1', mediaType: 'image/png', bytes: 10, width: 2, height: 3, name: 'shot.png',
        },
      },
      {
        type: 'file',
        attachment: { attachmentId: 'file-1', name: 'brief.pdf', bytes: 20 },
      },
    ],
    source: { kind: 'user' },
  }, { surfaceOp: 'append' }),
  event(7, 'assistant/message', {
    turn: 2,
    step: 0,
    message: {
      id: 'child-assistant',
      role: 'assistant',
      content: [{ type: 'text', text: 'child answer' }],
      source: { kind: 'model', provider: 'p', model: 'm' },
    },
    stream: [],
  }, { surfaceOp: 'append' }),
  event(8, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
]

test('events uses the last inherited seed marker and omits every ancestor prefix', async () => {
  const signal = new AbortController().signal
  const { operations } = await fixture(seededEvents)
  const page = await operations.events({ childSessionId: 'child-a' }, signal)

  assert.deepEqual(page.events.map((item) => [item.seq, item.kind]), [
    [5, 'turn-start'],
    [6, 'message'],
    [7, 'message'],
    [8, 'turn-end'],
  ])
  assert.equal(page.events[1].turnId, '2')
  assert.equal(page.events[2].turnId, '2')
  assert.equal(page.nextSeq, 8)
  assert.equal(page.live, null)
})

test('events includes only the requested child current live snapshot', async () => {
  const snapshots = []
  const live = Object.freeze({
    childSessionId: 'child-a',
    attemptId: 'attempt-1',
    turnId: '2',
    step: 0,
    text: 'partial answer',
    truncated: false,
  })
  const pendingQuestion = Object.freeze({
    childSessionId: 'child-a',
    requestId: 'question:1',
    questions: [{ id: 'choice', question: 'Choose one?' }],
    truncated: false,
  })
  const processError = Object.freeze({
    childSessionId: 'child-a',
    turnId: '2',
    step: 0,
    message: 'Temporary stream failure',
    truncated: false,
  })
  const liveState = {
    snapshot(childSessionId) {
      snapshots.push(childSessionId)
      return childSessionId === 'child-a' ? live : undefined
    },
    questionSnapshots(childSessionId) {
      return childSessionId === 'child-a' ? [pendingQuestion] : []
    },
    errorSnapshot(childSessionId) {
      return childSessionId === 'child-a' ? processError : undefined
    },
  }
  const { operations } = await fixture(seededEvents, { liveState })

  const page = await operations.events({ childSessionId: 'child-a', afterSeq: 8 })
  assert.deepEqual(page.live, live)
  assert.deepEqual(page.transient, {
    questions: [pendingQuestion],
    error: processError,
  })
  assert.deepEqual(snapshots, ['child-a'])
})

test('events maps durable image and file attachment references without prompt receipts or base64', async () => {
  const { operations } = await fixture(seededEvents)
  const page = await operations.events({ childSessionId: 'child-a' })
  const content = page.events.find((item) => item.seq === 6).content

  assert.deepEqual(content, [
    { type: 'text', text: 'child question' },
    {
      type: 'image',
      attachmentId: 'img-1',
      mediaType: 'image/png',
      bytes: 10,
      width: 2,
      height: 3,
      name: 'shot.png',
    },
    {
      type: 'file',
      attachmentId: 'file-1',
      name: 'brief.pdf',
      bytes: 20,
    },
  ])
})

test('events honors an exclusive afterSeq cursor', async () => {
  const { operations } = await fixture(seededEvents)
  const page = await operations.events({ childSessionId: 'child-a', afterSeq: 6 })

  assert.deepEqual(page.events.map((item) => item.seq), [7, 8])
  assert.equal(page.nextSeq, 8)
})

test('events cursor round-trips without skipping a newly committed event', async () => {
  const events = [
    event(0, 'session/end-seed', { inherited: true }),
    event(1, 'turn/start', { turn: 1 }),
    event(2, 'turn/start', { turn: 2 }),
  ]
  const { operations } = await fixture(events, {
    inheritedEventCount: 0,
    eventPageLimit: 2,
  })

  const first = await operations.events({ childSessionId: 'child-a' })
  assert.deepEqual(first.events.map((item) => item.seq), [1, 2])
  assert.equal(first.nextSeq, 2)

  events.push(event(3, 'turn/start', { turn: 3 }))
  const second = await operations.events({ childSessionId: 'child-a', afterSeq: first.nextSeq })
  assert.deepEqual(second.events.map((item) => item.seq), [3])
  assert.equal(second.nextSeq, 3)

  const tail = await operations.events({ childSessionId: 'child-a', afterSeq: second.nextSeq })
  assert.deepEqual(tail.events, [])
  assert.equal(tail.nextSeq, 3)
})

test('events rejects a cursor beyond the committed Session cursor', async () => {
  const { operations } = await fixture(seededEvents)

  await assert.rejects(
    () => operations.events({ childSessionId: 'child-a', afterSeq: 99 }),
    expectCode('sidechat/cursor-invalid'),
  )
})

test('events allows archived history without resuming the Agent', async () => {
  const signal = new AbortController().signal
  const { operations, calls } = await fixture(seededEvents, { archived: true })
  const page = await operations.events({ childSessionId: 'child-a' }, signal)

  assert.ok(page.events.length > 0)
  assert.deepEqual(calls, [['inspect', 'child-a', signal]])
})

test('events rejects an unknown child before inspecting history and leaks no data', async () => {
  const { operations, calls } = await fixture(seededEvents)

  await assert.rejects(
    () => operations.events({ childSessionId: 'unknown-child' }),
    (error) => {
      expectCode('sidechat/not-found')(error)
      assert.doesNotMatch(error.message, /Secret B|parent-b|child-b/)
      return true
    },
  )
  assert.deepEqual(calls, [])
})

test('events preserves an already-aborted request instead of rewriting it as session-unavailable', async () => {
  const { operations, calls } = await fixture(seededEvents)
  const controller = new AbortController()
  const reason = new Error('caller cancelled')
  controller.abort(reason)

  await assert.rejects(
    () => operations.events({ childSessionId: 'child-a' }, controller.signal),
    (error) => error === reason,
  )
  assert.deepEqual(calls, [])
})

test('normalizeSessionEvent skips unknown variants instead of treating them as messages', () => {
  assert.equal(
    normalizeSessionEvent(event(12, 'future/unknown-event', { message: { role: 'user', content: [] } })),
    null,
  )
})

test('normalizeSessionEvent exposes durable turn failures as transcript errors', () => {
  const normalized = normalizeSessionEvent(event(9, 'turn/end', {
    turn: 4,
    reason: {
      kind: 'error',
      error: { kind: 'provider-error', message: 'Provider unavailable' },
    },
  }))

  assert.deepEqual(normalized, {
    seq: 9,
    kind: 'error',
    turnId: '4',
    message: 'Provider unavailable',
  })
})

test('normalizeSessionEvent maps numeric tool turns and result lifecycle', () => {
  const running = normalizeSessionEvent(event(10, 'tool/call', {
    turn: 7, step: 0, callId: 'call-1', name: 'search', arguments: '{}',
  }))
  const succeeded = normalizeSessionEvent(event(11, 'tool/result', {
    turn: 7,
    step: 0,
    message: {
      isError: false,
      source: { kind: 'tool', callId: 'call-1' },
      content: [{ type: 'text', text: 'done' }],
    },
  }))

  assert.deepEqual(running, {
    seq: 10,
    kind: 'tool',
    turnId: '7',
    callId: 'call-1',
    name: 'search',
    state: 'running',
  })
  assert.equal(succeeded.kind, 'tool')
  assert.equal(succeeded.turnId, '7')
  assert.equal(succeeded.callId, 'call-1')
  assert.equal(succeeded.state, 'succeeded')
  assert.equal(succeeded.summary, 'done')
})
