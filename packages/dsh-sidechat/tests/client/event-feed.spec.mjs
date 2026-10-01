import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import test from 'node:test'

import { createSidechatEventFeed } from '../../src/client/event-feed.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function turn() {
  await new Promise((resolve) => setImmediate(resolve))
}

test('polls only a selected visible child and reuses nextSeq as an exclusive cursor', async () => {
  const calls = []
  const waits = []
  const pages = [
    {
      events: [{ seq: 2, kind: 'turn-start', turnId: '1' }],
      nextSeq: 2,
      live: null,
    },
    {
      events: [{ seq: 3, kind: 'turn-end', turnId: '1', reason: 'completed' }],
      nextSeq: 3,
      live: null,
    },
  ]
  const api = {
    async events(childSessionId, afterSeq, signal) {
      calls.push({ childSessionId, afterSeq, signal })
      return pages.shift()
    },
  }
  const feed = createSidechatEventFeed({
    api,
    pollInterval: 25,
    wait(delay, signal) {
      const pending = deferred()
      waits.push({ delay, signal, ...pending })
      return pending.promise
    },
  })

  feed.setTarget(undefined, true)
  feed.setTarget('child-a', false)
  await turn()
  assert.equal(calls.length, 0)

  feed.setTarget('child-a', true)
  await turn()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].childSessionId, 'child-a')
  assert.equal(calls[0].afterSeq, undefined)
  assert.equal(calls[0].signal.aborted, false)
  assert.deepEqual(feed.getSnapshot().events.map((event) => event.seq), [2])
  assert.equal(waits[0].delay, 25)

  waits[0].resolve()
  await turn()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].afterSeq, 2)
  assert.deepEqual(feed.getSnapshot().events.map((event) => event.seq), [2, 3])

  feed.dispose()
})

test('deduplicates durable seqs, replaces live snapshots, and clears settled live output', async () => {
  const waits = []
  const firstLive = {
    childSessionId: 'child-a',
    attemptId: 'attempt-1',
    turnId: '7',
    step: 0,
    text: 'partial',
    truncated: false,
  }
  const nextLive = { ...firstLive, text: 'partial answer' }
  const pages = [
    {
      events: [
        { seq: 4, kind: 'turn-start', turnId: '7' },
        { seq: 5, kind: 'message', turnId: '7', role: 'user', source: 'user', content: [] },
      ],
      nextSeq: 5,
      live: firstLive,
      transient: {
        questions: [{
          childSessionId: 'child-a',
          requestId: 'question:1',
          questions: [{ id: 'q1', question: 'Choose?' }],
          truncated: false,
        }],
        error: null,
      },
    },
    {
      events: [
        { seq: 5, kind: 'message', turnId: '7', role: 'user', source: 'user', content: [] },
        { seq: 6, kind: 'tool', turnId: '7', callId: 'call-1', name: 'search', state: 'running' },
      ],
      nextSeq: 6,
      live: nextLive,
      transient: { questions: [], error: null },
    },
    {
      events: [
        { seq: 7, kind: 'message', turnId: '7', role: 'assistant', source: 'assistant', content: [] },
        { seq: 8, kind: 'turn-end', turnId: '7', reason: 'completed' },
      ],
      nextSeq: 8,
      // A response may race a Host cleanup notification. A matching durable
      // turn-end must still prevent a duplicate live row.
      live: nextLive,
    },
  ]
  const feed = createSidechatEventFeed({
    api: { async events() { return pages.shift() } },
    wait() {
      const pending = deferred()
      waits.push(pending)
      return pending.promise
    },
  })

  feed.setTarget('child-a', true)
  await turn()
  assert.equal(feed.getSnapshot().live, firstLive)
  assert.equal(feed.getSnapshot().transient.questions[0].questions[0].question, 'Choose?')

  waits[0].resolve()
  await turn()
  assert.deepEqual(feed.getSnapshot().events.map((event) => event.seq), [4, 5, 6])
  assert.equal(feed.getSnapshot().live, nextLive)
  assert.deepEqual(feed.getSnapshot().transient.questions, [])

  waits[1].resolve()
  await turn()
  assert.deepEqual(feed.getSnapshot().events.map((event) => event.seq), [4, 5, 6, 7, 8])
  assert.equal(feed.getSnapshot().live, null)

  feed.dispose()
})

test('uses injectable deterministic retry backoff and clears the error after recovery', async () => {
  const failure = new Error('temporary network failure')
  const calls = []
  const waits = []
  const retryCalls = []
  let attempt = 0
  const feed = createSidechatEventFeed({
    api: {
      async events(childSessionId, afterSeq) {
        calls.push([childSessionId, afterSeq])
        attempt += 1
        if (attempt === 1) throw failure
        return { events: [], nextSeq: -1, live: null }
      },
    },
    pollInterval: 20,
    retryDelay(retryAttempt, error) {
      retryCalls.push([retryAttempt, error])
      return 70
    },
    wait(delay) {
      const pending = deferred()
      waits.push({ delay, ...pending })
      return pending.promise
    },
  })

  feed.setTarget('child-retry', true)
  await turn()
  assert.equal(feed.getSnapshot().error, failure)
  assert.deepEqual(retryCalls, [[1, failure]])
  assert.equal(waits[0].delay, 70)

  waits[0].resolve()
  await turn()
  assert.deepEqual(calls, [
    ['child-retry', undefined],
    ['child-retry', undefined],
  ])
  assert.equal(feed.getSnapshot().error, undefined)
  assert.equal(waits[1].delay, 20)

  feed.dispose()
})

test('aborts and ignores stale requests on hide, child switch, and dispose', async () => {
  const requests = []
  const feed = createSidechatEventFeed({
    api: {
      events(childSessionId, afterSeq, signal) {
        const pending = deferred()
        requests.push({ childSessionId, afterSeq, signal, ...pending })
        return pending.promise
      },
    },
  })

  feed.setTarget('child-a', true)
  await turn()
  assert.equal(requests.length, 1)

  feed.setTarget('child-a', false)
  assert.equal(requests[0].signal.aborted, true)
  assert.equal(feed.getSnapshot().polling, false)
  requests[0].resolve({
    events: [{ seq: 40, kind: 'error', message: 'stale hidden result' }],
    nextSeq: 40,
    live: null,
  })
  await turn()
  assert.deepEqual(feed.getSnapshot().events, [])

  feed.setTarget('child-a', true)
  await turn()
  assert.equal(requests.length, 2)
  feed.setTarget('child-b', true)
  await turn()
  assert.equal(requests[1].signal.aborted, true)
  assert.equal(requests[2].childSessionId, 'child-b')
  assert.equal(requests[2].afterSeq, undefined)
  assert.equal(feed.getSnapshot().childSessionId, 'child-b')
  assert.deepEqual(feed.getSnapshot().events, [])

  requests[1].resolve({
    events: [{ seq: 50, kind: 'error', message: 'stale child result' }],
    nextSeq: 50,
    live: null,
  })
  requests[2].resolve({
    events: [{ seq: 1, kind: 'turn-start', turnId: '1' }],
    nextSeq: 1,
    live: null,
  })
  await turn()
  assert.deepEqual(feed.getSnapshot().events.map((event) => event.seq), [1])

  feed.dispose()
  assert.equal(requests[2].signal.aborted, true)
  feed.setTarget('child-c', true)
  await turn()
  assert.equal(requests.length, 3)
})

test('aborting an in-flight retry delay stops cleanly without an unhandled rejection', async () => {
  let retrySignal
  const feed = createSidechatEventFeed({
    api: { async events() { throw new Error('offline') } },
    retryDelay: () => 1_000,
    wait(_delay, signal) {
      retrySignal = signal
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    },
  })

  feed.setTarget('child-a', true)
  await turn()
  assert.equal(retrySignal.aborted, false)
  feed.dispose()
  assert.equal(retrySignal.aborted, true)
  await turn()
})

test('removes each resolved poll delay abort listener before the next request', async () => {
  const thirdRequest = deferred()
  let calls = 0
  let signal
  const feed = createSidechatEventFeed({
    api: {
      async events(_childSessionId, _afterSeq, requestSignal) {
        calls += 1
        signal = requestSignal
        if (calls === 3) return thirdRequest.promise
        return { events: [], nextSeq: -1, live: null }
      },
    },
    pollInterval: 0,
  })

  feed.setTarget('child-a', true)
  for (let attempt = 0; attempt < 10 && calls < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  assert.equal(calls, 3)
  assert.equal(getEventListeners(signal, 'abort').length, 0)

  feed.dispose()
  thirdRequest.resolve({ events: [], nextSeq: -1, live: null })
  await turn()
})
