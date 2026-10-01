import assert from 'node:assert/strict'
import test from 'node:test'

const liveModule = await import('../../src/sidechat/live.js').catch(() => ({}))
const { SidechatLiveState, installSidechatLiveState } = liveModule

function agent(childSessionId) {
  return { id: childSessionId, session: { id: childSessionId } }
}

function payload(childSessionId, frame, extra = {}) {
  return { agent: agent(childSessionId), frame, ...extra }
}

function start(attemptId, turn = 1, step = 0, revision = 1) {
  return { type: 'start', attemptId, revision, turn, step }
}

function chunk(attemptId, index, value, revision = index + 2) {
  return {
    type: 'chunk',
    attemptId,
    revision,
    index,
    time: 1_000 + index,
    chunk: value,
  }
}

function end(attemptId, index, revision = index + 2, outcome = { kind: 'abandoned' }) {
  return { type: 'end', attemptId, revision, index, outcome }
}

function makeState(options) {
  assert.equal(typeof SidechatLiveState, 'function')
  return new SidechatLiveState(options)
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

test('tracks isolated child attempts and replaces only that child on start', () => {
  const state = makeState()

  state.accept(payload('child-a', start('child-a:1', 2, 3)))
  state.accept(payload('child-a', chunk('child-a:1', 0, { type: 'text-delta', index: 0, text: 'old' })))
  state.accept(payload('child-b', start('child-b:1', 7, 1)))
  state.accept(payload('child-b', chunk('child-b:1', 0, { type: 'text-delta', index: 0, text: 'other' })))

  assert.deepEqual(state.snapshot('child-a'), {
    childSessionId: 'child-a',
    attemptId: 'child-a:1',
    turnId: '2',
    step: 3,
    text: 'old',
    truncated: false,
  })
  assert.equal(state.snapshot('child-b').text, 'other')

  state.accept(payload('child-a', start('child-a:2', 2, 4, 3)))
  assert.deepEqual(state.snapshot('child-a'), {
    childSessionId: 'child-a',
    attemptId: 'child-a:2',
    turnId: '2',
    step: 4,
    text: '',
    truncated: false,
  })
  assert.equal(state.snapshot('child-b').text, 'other')
})

test('accepts only dense matching text deltas and rejects stale revisions', () => {
  const state = makeState()
  state.accept(payload('child-a', start('child-a:1')))
  state.accept(payload('child-a', chunk('child-a:1', 0, { type: 'reasoning-delta', index: 0, text: 'private reasoning' })))
  state.accept(payload('child-a', chunk('child-a:1', 1, { type: 'text-delta', index: 0, text: 'visible' })))

  state.accept(payload('child-a', chunk('stale-attempt', 2, { type: 'text-delta', index: 0, text: 'stale' }, 2)))
  state.accept(payload('child-a', chunk('child-a:1', 3, { type: 'text-delta', index: 0, text: 'gap' }, 4)))
  state.accept(payload('child-a', chunk('child-a:1', 1, { type: 'text-delta', index: 0, text: 'duplicate' }, 4)))
  state.accept(payload('child-a', chunk('child-a:1', 2, { type: 'text-delta', index: 0, text: '!' }, 4)))

  assert.equal(state.snapshot('child-a').text, 'visible!')
})

test('bounds retained text and never captures prompt, image data, or non-text chunks', () => {
  const state = makeState({ maxTextChars: 5 })
  state.accept(payload('child-a', start('child-a:1'), { prompt: 'do not retain me' }))
  state.accept(payload('child-a', chunk('child-a:1', 0, {
    type: 'block-end',
    index: 0,
    block: { type: 'image', mediaType: 'image/png', data: 'base64-secret' },
  })))
  state.accept(payload('child-a', chunk('child-a:1', 1, { type: 'text-delta', index: 1, text: 'hello' })))
  state.accept(payload('child-a', chunk('child-a:1', 2, { type: 'text-delta', index: 1, text: ' world' })))

  const snapshot = state.snapshot('child-a')
  assert.equal(snapshot.text, 'hello')
  assert.equal(snapshot.truncated, true)
  assert.doesNotMatch(JSON.stringify(snapshot), /do not retain|base64-secret/)
})

test('clears a matching attempt on committed or abandoned end and ignores stale ends', () => {
  const state = makeState()
  state.accept(payload('child-a', start('child-a:1')))
  state.accept(payload('child-a', chunk('child-a:1', 0, { type: 'text-delta', index: 0, text: 'answer' })))

  state.accept(payload('child-a', end('stale-attempt', 1, 3)))
  assert.equal(state.snapshot('child-a').text, 'answer')

  state.accept(payload('child-a', end('child-a:1', 1, 3, {
    kind: 'committed',
    eventType: 'assistant/message',
    seq: 12,
  })))
  assert.equal(state.snapshot('child-a'), undefined)

  state.accept(payload('child-a', start('child-a:2', 2, 0, 4)))
  state.accept(payload('child-a', end('child-a:2', 0, 5)))
  assert.equal(state.snapshot('child-a'), undefined)
})

test('filters unowned sessions and clears one child deterministically', () => {
  const state = makeState({ isChildSessionId: (sessionId) => sessionId.startsWith('child-') })
  state.accept(payload('parent-a', start('parent-a:1')))
  state.accept(payload('child-a', start('child-a:1')))

  assert.equal(state.snapshot('parent-a'), undefined)
  assert.ok(state.snapshot('child-a'))

  state.dispose(payload('child-a', undefined))
  assert.equal(state.snapshot('child-a'), undefined)
  state.dispose(payload('child-a', undefined))
})

test('installer subscribes to exact rc.2 event names and close is idempotent', async () => {
  assert.equal(typeof installSidechatLiveState, 'function')
  const listeners = new Map()
  const calls = []
  const ctx = {
    on(name, listener, options) {
      calls.push(['on', name, options])
      listeners.set(name, listener)
      return () => {
        calls.push(['off', name])
        listeners.delete(name)
      }
    },
  }

  const installed = installSidechatLiveState(ctx)
  assert.deepEqual(calls, [
    ['on', 'agent/assistant-stream', { global: true }],
    ['on', 'user-questions/request', { global: true }],
    ['on', 'agent/error', { global: true }],
    ['on', 'agent/status', { global: true }],
    ['on', 'session/event', { global: true }],
    ['on', 'agent/disposed', { global: true }],
  ])

  listeners.get('agent/assistant-stream')(payload('child-a', start('child-a:1')))
  listeners.get('agent/assistant-stream')(payload(
    'child-a',
    chunk('child-a:1', 0, { type: 'text-delta', index: 0, text: 'live' }),
  ))
  assert.equal(installed.state.snapshot('child-a').text, 'live')

  const question = deferred()
  const questionAnswer = { answers: [{ id: 'confirm', selected: ['Yes'] }] }
  const questionResult = listeners.get('user-questions/request')({
    agent: agent('child-a'),
    questions: [{ id: 'confirm', question: 'Continue?' }],
  }, () => question.promise)
  assert.equal(installed.state.questionSnapshots('child-a')[0].questions[0].id, 'confirm')
  question.resolve(questionAnswer)
  assert.equal(await questionResult, questionAnswer)
  assert.deepEqual(installed.state.questionSnapshots('child-a'), [])

  listeners.get('agent/error')({ agent: agent('child-a'), turn: 2, step: 1, error: new Error('boom') })
  assert.equal(installed.state.errorSnapshot('child-a').message, 'boom')
  listeners.get('session/event')({ id: 'child-a' }, {
    type: 'turn/end',
    data: { turn: 2, reason: { kind: 'error', error: { message: 'boom', code: 'UNKNOWN' } } },
  })
  assert.equal(installed.state.errorSnapshot('child-a'), undefined)

  listeners.get('agent/disposed')({ agent: agent('child-a') })
  assert.equal(installed.state.snapshot('child-a'), undefined)

  listeners.get('agent/assistant-stream')(payload('child-b', start('child-b:1')))
  installed.close()
  installed.close()
  assert.equal(installed.state.snapshot('child-b'), undefined)
  assert.deepEqual(calls.slice(6), [
    ['off', 'agent/disposed'],
    ['off', 'session/event'],
    ['off', 'agent/status'],
    ['off', 'agent/error'],
    ['off', 'user-questions/request'],
    ['off', 'agent/assistant-stream'],
  ])
})

test('tracks the exact rc.2 question waterfall lifetime and returns next unchanged', async () => {
  const state = makeState()
  const next = deferred()
  const answer = { answers: [{ id: 'mode', selected: ['Safe'] }] }
  const request = {
    agent: agent('child-a'),
    signal: new AbortController().signal,
    questions: [{
      id: 'mode',
      question: 'Which mode?',
      detail: 'Choose how this run continues.',
      header: 'Choose Mode',
      options: [
        { label: 'Safe', description: 'Use guarded behavior.' },
        { label: 'Fast' },
      ],
      multiSelect: true,
      intent: { kind: 'plan-review', approve: 'Safe', callId: 'call-1' },
    }],
  }

  const result = state.trackQuestion(request, () => next.promise)
  assert.deepEqual(state.questionSnapshots('child-a'), [{
    childSessionId: 'child-a',
    requestId: 'question:1',
    questions: [{
      id: 'mode',
      question: 'Which mode?',
      detail: 'Choose how this run continues.',
      header: 'Choose Mode',
      options: [
        { label: 'Safe', description: 'Use guarded behavior.' },
        { label: 'Fast' },
      ],
      multiSelect: true,
      intent: { kind: 'plan-review', approve: 'Safe', callId: 'call-1' },
    }],
    truncated: false,
  }])

  next.resolve(answer)
  assert.equal(await result, answer)
  assert.deepEqual(state.questionSnapshots('child-a'), [])
})

test('question capture is bounded, text-only, child-owned, and cleans rejected waterfalls', async () => {
  const state = makeState({
    maxQuestionTextChars: 10,
    maxQuestionsPerRequest: 1,
    maxOptionsPerQuestion: 1,
    maxPendingQuestionRequests: 1,
    isChildSessionId: (sessionId) => sessionId.startsWith('child-'),
  })
  const first = deferred()
  const second = deferred()
  const firstResult = state.trackQuestion({
    agent: agent('child-a'),
    questions: [{ id: 'q1', question: 'first question' }],
  }, () => first.promise)
  const secondResult = state.trackQuestion({
    agent: agent('child-a'),
    questions: [{
      id: 'q2',
      question: 'abcdefghijklmnop',
      options: [
        { label: 'visible option' },
        { label: 'dropped option' },
      ],
      extra: { image: 'base64-secret' },
    }, { id: 'dropped', question: 'dropped question' }],
  }, () => second.promise)
  const parentResult = state.trackQuestion({
    agent: agent('parent-a'),
    questions: [{ id: 'parent', question: 'not child-owned' }],
  }, async () => 'parent-result')

  const snapshots = state.questionSnapshots('child-a')
  assert.equal(snapshots.length, 1)
  assert.equal(snapshots[0].requestId, 'question:2')
  assert.equal(snapshots[0].questions.length, 1)
  assert.equal(snapshots[0].questions[0].id, 'q2')
  assert.equal(snapshots[0].questions[0].question, 'abcdefgh')
  assert.equal(snapshots[0].truncated, true)
  assert.doesNotMatch(JSON.stringify(snapshots), /base64-secret|dropped option|dropped question/)
  assert.deepEqual(state.questionSnapshots('parent-a'), [])
  assert.equal(await parentResult, 'parent-result')

  const rejection = new Error('same rejection')
  second.reject(rejection)
  await assert.rejects(secondResult, (error) => error === rejection)
  assert.deepEqual(state.questionSnapshots('child-a'), [])
  first.resolve('first-result')
  assert.equal(await firstResult, 'first-result')
})

test('captures bounded process-local Agent errors until durable settlement or new work', () => {
  const state = makeState({ maxErrorChars: 5 })
  const failure = Object.assign(new Error('failure with secret stack'), { code: 'BROKEN' })

  state.acceptError({ agent: agent('child-a'), turn: 3, step: 2, error: failure })
  assert.deepEqual(state.errorSnapshot('child-a'), {
    childSessionId: 'child-a',
    turnId: '3',
    step: 2,
    message: 'failu',
    code: 'BROKEN',
    truncated: true,
  })
  assert.doesNotMatch(JSON.stringify(state.errorSnapshot('child-a')), /stack/)

  state.acceptSessionEvent({ id: 'child-a' }, {
    type: 'turn/end',
    data: { turn: 2, reason: { kind: 'error', error: { message: 'older', code: 'OLD' } } },
  })
  assert.ok(state.errorSnapshot('child-a'))
  state.acceptSessionEvent({ id: 'child-a' }, {
    type: 'turn/end',
    data: { turn: 3, reason: { kind: 'error', error: { message: 'failure', code: 'BROKEN' } } },
  })
  assert.equal(state.errorSnapshot('child-a'), undefined)

  state.acceptError({ agent: agent('child-a'), turn: 4, step: 0, error: 'setup failed' })
  state.acceptStatus({ agent: agent('child-a'), status: 'idle' })
  assert.ok(state.errorSnapshot('child-a'))
  state.acceptStatus({ agent: agent('child-a'), status: 'running' })
  assert.equal(state.errorSnapshot('child-a'), undefined)
})

test('snapshots are immutable and close rejects future retention', async () => {
  const state = makeState()
  state.accept(payload('child-a', start('child-a:1')))
  const snapshot = state.snapshot('child-a')
  const pending = deferred()
  const tracked = state.trackQuestion({
    agent: agent('child-a'),
    questions: [{ id: 'pending', question: 'Pending?' }],
  }, () => pending.promise)
  state.acceptError({ agent: agent('child-a'), turn: 1, step: 0, error: new Error('boom') })

  assert.equal(Object.isFrozen(snapshot), true)
  assert.throws(() => { snapshot.text = 'mutated' }, TypeError)
  assert.equal(Object.isFrozen(state.questionSnapshots('child-a')), true)
  assert.equal(Object.isFrozen(state.questionSnapshots('child-a')[0]), true)
  assert.equal(Object.isFrozen(state.errorSnapshot('child-a')), true)

  state.close()
  state.close()
  state.accept(payload('child-b', start('child-b:1')))
  state.acceptError({ agent: agent('child-b'), turn: 1, step: 0, error: new Error('later') })
  assert.equal(state.snapshot('child-a'), undefined)
  assert.equal(state.snapshot('child-b'), undefined)
  assert.deepEqual(state.questionSnapshots('child-a'), [])
  assert.equal(state.errorSnapshot('child-a'), undefined)
  assert.equal(state.errorSnapshot('child-b'), undefined)

  pending.resolve('settled')
  assert.equal(await tracked, 'settled')
})
