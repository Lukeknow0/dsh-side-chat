/**
 * Task 2.3 TDD — child-owned rc.2 question and approval responses.
 *
 * Pure dependency fakes only: no DSH process, profile, or filesystem access.
 *
 * Run: pnpm --dir packages/dsh-sidechat test -- tests/host/interactions.spec.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const {
  SidechatInteractionError,
  SidechatInteractionHost,
  installSidechatInteractions,
} = await import('../../src/sidechat/interactions.js')

const CHILD_A = 'child-session-a'
const CHILD_B = 'child-session-b'
const PARENT = 'parent-session'

const QUESTIONS = [
  {
    id: 'scope',
    question: 'Which scope?',
    options: [{ label: 'Workspace' }, { label: 'Global' }],
  },
  {
    id: 'notes',
    question: 'Any notes?',
    multiSelect: false,
  },
]

function requestFor(childSessionId, questions = QUESTIONS, signal) {
  return {
    agent: { id: childSessionId, session: { id: childSessionId } },
    questions,
    ...(signal === undefined ? {} : { signal }),
  }
}

function makeHarness({ snapshots, archived = new Set() } = {}) {
  const records = new Map([
    [CHILD_A, { childSessionId: CHILD_A, parentSessionId: PARENT }],
    [CHILD_B, { childSessionId: CHILD_B, parentSessionId: PARENT }],
  ])
  const ownership = {
    resolve(childSessionId) {
      const record = records.get(childSessionId)
      if (record === undefined) {
        const error = new Error('private ownership detail')
        error.code = 'not-found'
        throw error
      }
      return archived.has(childSessionId)
        ? { ...record, archivedAt: 123 }
        : record
    },
  }
  const liveState = {
    questionSnapshots(childSessionId) {
      if (snapshots !== undefined) return snapshots(childSessionId)
      return childSessionId === CHILD_A
        ? [{
            childSessionId: CHILD_A,
            requestId: 'question:1',
            questions: QUESTIONS,
            truncated: false,
          }]
        : []
    },
  }
  return {
    ownership,
    liveState,
    host: new SidechatInteractionHost({ ownership, liveState }),
  }
}

test('constructor rejects an unsafe settled-interaction bound', () => {
  const { ownership, liveState } = makeHarness()
  assert.throws(
    () => new SidechatInteractionHost({
      ownership,
      liveState,
      maxSettledInteractions: -1,
    }),
    /maxSettledInteractions/,
  )
})

test('answerQuestion returns the exact rc.2 answer batch to the owned waterfall', async () => {
  const { host } = makeHarness()
  let delegated = false
  const waterfall = host.trackQuestion(
    requestFor(CHILD_A),
    async () => {
      delegated = true
      return { delegated: true }
    },
  )

  assert.deepEqual(await host.answerQuestion({
    childSessionId: CHILD_A,
    requestId: 'question:1',
    answers: [
      { id: 'scope', selected: ['Workspace'] },
      { id: 'notes', selected: [], custom: 'Keep it local' },
    ],
  }), { answered: true })
  assert.deepEqual(await waterfall, {
    answers: [
      { id: 'scope', selected: ['Workspace'] },
      { id: 'notes', selected: [], custom: 'Keep it local' },
    ],
  })
  assert.equal(delegated, false)
})

test('trackQuestion delegates an unowned Session and returns next unchanged', async () => {
  const { host } = makeHarness()
  const delegated = { source: 'ordinary answerer' }

  assert.equal(
    await host.trackQuestion(requestFor('not-a-sidechat-child'), async () => delegated),
    delegated,
  )
})

test('answerQuestion cannot settle another child and preserves the owned pending request', async () => {
  const { host } = makeHarness()
  const waterfall = host.trackQuestion(requestFor(CHILD_A), async () => null)
  const answer = [
    { id: 'scope', selected: ['Global'] },
    { id: 'notes', selected: [] },
  ]

  await assert.rejects(
    () => host.answerQuestion({
      childSessionId: CHILD_B,
      requestId: 'question:1',
      answers: answer,
    }),
    (error) => {
      assert.ok(error instanceof SidechatInteractionError)
      assert.equal(error.code, 'sidechat/interaction-not-found')
      return true
    },
  )
  await host.answerQuestion({ childSessionId: CHILD_A, requestId: 'question:1', answers: answer })
  assert.deepEqual(await waterfall, { answers: answer })
})

test('answerQuestion rejects incomplete or forged answer batches without settling', async () => {
  const { host } = makeHarness()
  const waterfall = host.trackQuestion(requestFor(CHILD_A), async () => null)

  for (const answers of [
    [{ id: 'scope', selected: ['Workspace'] }],
    [
      { id: 'scope', selected: ['Forged'] },
      { id: 'notes', selected: [] },
    ],
    [
      { id: 'scope', selected: ['Workspace'], custom: 'conflicting' },
      { id: 'notes', selected: [] },
    ],
  ]) {
    await assert.rejects(
      () => host.answerQuestion({ childSessionId: CHILD_A, requestId: 'question:1', answers }),
      (error) => {
        assert.ok(error instanceof SidechatInteractionError)
        assert.equal(error.code, 'sidechat/interaction-response-invalid')
        return true
      },
    )
  }

  const valid = [
    { id: 'scope', selected: ['Workspace'] },
    { id: 'notes', selected: [] },
  ]
  await host.answerQuestion({ childSessionId: CHILD_A, requestId: 'question:1', answers: valid })
  assert.deepEqual(await waterfall, { answers: valid })
})

test('answerQuestion distinguishes resolved or aborted request IDs from unknown IDs', async () => {
  const { host } = makeHarness()
  const first = host.trackQuestion(requestFor(CHILD_A), async () => null)
  const answers = [
    { id: 'scope', selected: ['Workspace'] },
    { id: 'notes', selected: [] },
  ]
  await host.answerQuestion({ childSessionId: CHILD_A, requestId: 'question:1', answers })
  await first

  await assert.rejects(
    () => host.answerQuestion({ childSessionId: CHILD_A, requestId: 'question:1', answers }),
    (error) => error instanceof SidechatInteractionError
      && error.code === 'sidechat/interaction-stale',
  )
  await assert.rejects(
    () => host.answerQuestion({ childSessionId: CHILD_A, requestId: 'question:unknown', answers }),
    (error) => error instanceof SidechatInteractionError
      && error.code === 'sidechat/interaction-not-found',
  )

  const abortHarness = makeHarness({
    snapshots: (childSessionId) => childSessionId === CHILD_A
      ? [{ childSessionId: CHILD_A, requestId: 'question:2', questions: QUESTIONS, truncated: false }]
      : [],
  })
  const abort = new AbortController()
  const aborted = abortHarness.host.trackQuestion(
    requestFor(CHILD_A, QUESTIONS, abort.signal),
    async () => null,
  )
  const rejected = assert.rejects(aborted, /withdrawn/)
  abort.abort(new Error('question withdrawn'))
  await rejected
  await assert.rejects(
    () => abortHarness.host.answerQuestion({
      childSessionId: CHILD_A,
      requestId: 'question:2',
      answers,
    }),
    (error) => error instanceof SidechatInteractionError
      && error.code === 'sidechat/interaction-stale',
  )
})

function approvalRequest(session, signal) {
  return {
    agent: { id: session.id, session },
    toolName: 'bash',
    callId: 'tool-call-1',
    reason: 'Needs wider filesystem access',
    ...(signal === undefined ? {} : { signal }),
  }
}

function approvalAsked(id = 'approval-1') {
  return {
    type: 'approval/asked',
    data: {
      id,
      toolName: 'bash',
      callId: 'tool-call-1',
      reason: 'Needs wider filesystem access',
    },
  }
}

test('resolveApproval returns exact rc.2 interactive outcomes to the matching child waterfall', async () => {
  const { host } = makeHarness()
  const session = { id: CHILD_A }
  host.acceptSessionEvent(session, approvalAsked())
  let delegated = false
  const waterfall = host.trackApproval(approvalRequest(session), async () => {
    delegated = true
    return 'unavailable'
  })

  assert.deepEqual(await host.resolveApproval({
    childSessionId: CHILD_A,
    interactionId: 'approval-1',
    decision: 'allowed-once',
  }), { resolved: true })
  assert.equal(await waterfall, 'allowed-once')
  assert.equal(delegated, false)
})

test('trackApproval delegates unowned or uncorrelated requests unchanged', async () => {
  const { host } = makeHarness()
  const unowned = { id: 'not-a-sidechat-child' }

  assert.equal(
    await host.trackApproval(approvalRequest(unowned), async () => 'ordinary-unowned'),
    'ordinary-unowned',
  )
  assert.equal(
    await host.trackApproval(approvalRequest({ id: CHILD_A }), async () => 'ordinary-uncorrelated'),
    'ordinary-uncorrelated',
  )
})

test('resolveApproval rejects wrong-child and non-interactive decisions without settling', async () => {
  const { host } = makeHarness()
  const session = { id: CHILD_A }
  host.acceptSessionEvent(session, approvalAsked())
  const waterfall = host.trackApproval(approvalRequest(session), async () => 'unavailable')

  await assert.rejects(
    () => host.resolveApproval({
      childSessionId: CHILD_B,
      interactionId: 'approval-1',
      decision: 'rejected',
    }),
    (error) => error instanceof SidechatInteractionError
      && error.code === 'sidechat/interaction-not-found',
  )
  await assert.rejects(
    () => host.resolveApproval({
      childSessionId: CHILD_A,
      interactionId: 'approval-1',
      decision: 'approved',
    }),
    (error) => error instanceof SidechatInteractionError
      && error.code === 'sidechat/interaction-response-invalid',
  )

  await host.resolveApproval({
    childSessionId: CHILD_A,
    interactionId: 'approval-1',
    decision: 'rejected',
  })
  assert.equal(await waterfall, 'rejected')
})

test('resolveApproval rejects resolved, withdrawn, and unknown interactions stably', async () => {
  const { host } = makeHarness()
  const session = { id: CHILD_A }
  host.acceptSessionEvent(session, approvalAsked())
  const waterfall = host.trackApproval(approvalRequest(session), async () => 'unavailable')
  await host.resolveApproval({
    childSessionId: CHILD_A,
    interactionId: 'approval-1',
    decision: 'rejected',
  })
  await waterfall

  await assert.rejects(
    () => host.resolveApproval({
      childSessionId: CHILD_A,
      interactionId: 'approval-1',
      decision: 'rejected',
    }),
    (error) => error instanceof SidechatInteractionError
      && error.code === 'sidechat/interaction-stale',
  )
  await assert.rejects(
    () => host.resolveApproval({
      childSessionId: CHILD_A,
      interactionId: 'approval-unknown',
      decision: 'rejected',
    }),
    (error) => error instanceof SidechatInteractionError
      && error.code === 'sidechat/interaction-not-found',
  )

  const abortedHarness = makeHarness()
  const abortedSession = { id: CHILD_A }
  const abort = new AbortController()
  abortedHarness.host.acceptSessionEvent(abortedSession, approvalAsked('approval-2'))
  const aborted = abortedHarness.host.trackApproval(
    approvalRequest(abortedSession, abort.signal),
    async () => 'unavailable',
  )
  abort.abort(new Error('approval withdrawn'))
  assert.equal(await aborted, 'cancelled')
  await assert.rejects(
    () => abortedHarness.host.resolveApproval({
      childSessionId: CHILD_A,
      interactionId: 'approval-2',
      decision: 'allowed-once',
    }),
    (error) => error instanceof SidechatInteractionError
      && error.code === 'sidechat/interaction-stale',
  )
})

test('close delegates pending interactions once and retires their IDs', async () => {
  const { host } = makeHarness()
  const session = { id: CHILD_A }
  host.acceptSessionEvent(session, approvalAsked())
  let questionDelegations = 0
  let approvalDelegations = 0
  const question = host.trackQuestion(requestFor(CHILD_A), async () => {
    questionDelegations += 1
    return { fallback: 'question' }
  })
  const approval = host.trackApproval(approvalRequest(session), async () => {
    approvalDelegations += 1
    return 'unavailable'
  })

  host.close()
  host.close()
  assert.deepEqual(await question, { fallback: 'question' })
  assert.equal(await approval, 'unavailable')
  assert.equal(questionDelegations, 1)
  assert.equal(approvalDelegations, 1)
})

test('installer subscribes to exact rc.2 events and disposes in reverse once', () => {
  const registrations = []
  const disposals = []
  const ctx = {
    on(name, listener, options) {
      registrations.push({ name, listener, options })
      return () => { disposals.push(name) }
    },
  }
  const { ownership, liveState } = makeHarness()
  const installed = installSidechatInteractions(ctx, { ownership, liveState })

  assert.deepEqual(registrations.map(({ name, options }) => ({ name, options })), [
    { name: 'session/event', options: { global: true } },
    { name: 'user-questions/request', options: { global: true } },
    { name: 'approval/request', options: { global: true } },
  ])
  assert.ok(installed.host instanceof SidechatInteractionHost)
  installed.close()
  installed.close()
  assert.deepEqual(disposals, [
    'approval/request',
    'user-questions/request',
    'session/event',
  ])
})

// Keep every planned public export observable from the first RED/green slice.
assert.equal(typeof SidechatInteractionError, 'function')
assert.equal(typeof installSidechatInteractions, 'function')
