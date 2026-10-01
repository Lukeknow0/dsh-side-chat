/**
 * Task 1.2 TDD — Session forking, boundary calculation, event filtering, and compensation.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

const {
  calculateCompletedPrefixBoundary,
  filterChildEvents,
  SidechatForkService,
  ForkBoundaryError,
} = await import('../../src/sidechat/seed.js')

const { OwnershipStore } = await import('../../src/sidechat/ownership.js')

function makeTable() {
  const store = new Map()
  return {
    get(key) { return store.get(key) },
    put(key, value) { store.set(key, value); return Promise.resolve() },
    delete(key) { return Promise.resolve(store.delete(key)) },
    update(key, fn) {
      const next = fn(store.get(key))
      store.set(key, next)
      return Promise.resolve(next)
    },
    entries() { return [...store.entries()][Symbol.iterator]() },
    keys() { return [...store.keys()][Symbol.iterator]() },
    get size() { return store.size },
  }
}

// ---------------------------------------------------------------------------
// calculateCompletedPrefixBoundary tests
// ---------------------------------------------------------------------------

test('calculateCompletedPrefixBoundary: returns undefined for empty session', () => {
  assert.equal(calculateCompletedPrefixBoundary([]), undefined)
})

test('calculateCompletedPrefixBoundary: returns undefined when session has no turn/end', () => {
  const events = [
    { seq: 0, type: 'session/created' },
    { seq: 1, type: 'user/message', surfaceOp: 'append' },
    { seq: 2, type: 'turn/start' },
    { seq: 3, type: 'assistant/chunk' },
  ]
  assert.equal(calculateCompletedPrefixBoundary(events), undefined)
})

test('calculateCompletedPrefixBoundary: finds exact seq of completed turn', () => {
  const events = [
    { seq: 0, type: 'session/created' },
    { seq: 1, type: 'user/message', surfaceOp: 'append' },
    { seq: 2, type: 'turn/start' },
    { seq: 3, type: 'turn/end' },
  ]
  assert.equal(calculateCompletedPrefixBoundary(events), 3)
})

test('calculateCompletedPrefixBoundary: stops before next turn/start when turn is in-flight', () => {
  const events = [
    { seq: 0, type: 'session/created' },
    { seq: 1, type: 'user/message', surfaceOp: 'append' },
    { seq: 2, type: 'turn/start' },
    { seq: 3, type: 'turn/end' },
    { seq: 4, type: 'session/checkpoint' },
    // in-flight turn starts:
    { seq: 5, type: 'user/message', surfaceOp: 'append' },
    { seq: 6, type: 'turn/start' },
    { seq: 7, type: 'assistant/chunk' },
  ]
  // Boundary must be 4 (turn/end + trailing non-turn events, but before seq 5 append)
  assert.equal(calculateCompletedPrefixBoundary(events), 4)
})

test('calculateCompletedPrefixBoundary: stops before inbox/spliced event', () => {
  const events = [
    { seq: 0, type: 'turn/end' },
    { seq: 1, type: 'agent/inbox/spliced' },
  ]
  assert.equal(calculateCompletedPrefixBoundary(events), 0)
})

// ---------------------------------------------------------------------------
// filterChildEvents tests
// ---------------------------------------------------------------------------

test('filterChildEvents: returns all events when no seed marker exists', () => {
  const events = [
    { seq: 0, type: 'user/message' },
    { seq: 1, type: 'turn/end' },
  ]
  assert.deepEqual(filterChildEvents(events), events)
})

test('filterChildEvents: strips inherited parent seed events and synthetic fork closers', () => {
  const events = [
    { seq: 0, type: 'session/created' },
    { seq: 1, type: 'user/message' },
    { seq: 2, type: 'turn/end' },
    { seq: 3, type: 'session/end-seed', data: { inherited: true } },
    { seq: 4, type: 'turn/end', data: { turn: 'parent-turn', reason: { kind: 'forked' } } },
    // Actual child events:
    { seq: 5, type: 'user/message', text: 'Hello side chat' },
    { seq: 6, type: 'turn/start' },
    { seq: 7, type: 'turn/end' },
  ]
  const childEvents = filterChildEvents(events)
  assert.equal(childEvents.length, 3)
  assert.equal(childEvents[0].seq, 5)
  assert.equal(childEvents[0].text, 'Hello side chat')
  assert.equal(childEvents[1].seq, 6)
  assert.equal(childEvents[2].seq, 7)
})

test('filterChildEvents: refuses an inherited log whose end-seed marker is missing', () => {
  const events = [
    { seq: 0, type: 'user/message', text: 'inherited parent content' },
    { seq: 1, type: 'turn/end' },
    { seq: 2, type: 'user/message', text: 'ambiguous content' },
  ]

  assert.deepEqual(filterChildEvents(events, 2), [])
})

// ---------------------------------------------------------------------------
// SidechatForkService tests (atomic fork + compensation)
// ---------------------------------------------------------------------------

test('SidechatForkService: successful fork creates child and records association', async () => {
  const store = new OwnershipStore(makeTable())
  let forkedWith = null
  const mockController = {
    fork: async (req) => {
      forkedWith = req
      return { sessionId: 'child-sess-999' }
    },
  }

  const service = new SidechatForkService(store, mockController)
  const result = await service.forkSideSession({
    parentSessionId: 'parent-sess-111',
    title: 'Research thread',
  })

  assert.equal(result.childSessionId, 'child-sess-999')
  assert.equal(result.title, 'Research thread')
  assert.deepEqual(forkedWith, { sessionId: 'parent-sess-111' })

  // Verify ownership store has the record
  const stored = store.resolve('child-sess-999', 'parent-sess-111')
  assert.equal(stored.childSessionId, 'child-sess-999')
  assert.equal(stored.parentSessionId, 'parent-sess-111')
})

test('SidechatForkService: fails when parentSessionId is missing', async () => {
  const store = new OwnershipStore(makeTable())
  const service = new SidechatForkService(store, { fork: async () => ({ sessionId: 'c' }) })

  await assert.rejects(
    () => service.forkSideSession({ parentSessionId: '' }),
    (err) => {
      assert.ok(err instanceof ForkBoundaryError)
      assert.equal(err.code, 'bad-request')
      return true
    },
  )
})

test('SidechatForkService: bubbles up controller fork error without creating store record', async () => {
  const store = new OwnershipStore(makeTable())
  const mockController = {
    fork: async () => {
      throw new Error('DSH session fork unavailable')
    },
  }
  const service = new SidechatForkService(store, mockController)

  await assert.rejects(
    () => service.forkSideSession({ parentSessionId: 'p1' }),
    (err) => {
      assert.ok(err instanceof ForkBoundaryError)
      assert.equal(err.code, 'fork-failed')
      return true
    },
  )
  assert.equal(store.listByParent('p1').length, 0)
})

test('SidechatForkService: compensates by cancelling orphaned child session when storage fails', async () => {
  const table = makeTable()
  // Mock store table put failure:
  table.put = () => Promise.reject(new Error('Disk full write error'))
  const store = new OwnershipStore(table)

  let cancelledChildId = null
  const mockController = {
    fork: async () => ({ sessionId: 'child-orphan-123' }),
    cancel: async (req) => {
      cancelledChildId = req.sessionId
      return { accepted: true }
    },
  }

  const service = new SidechatForkService(store, mockController)

  await assert.rejects(
    () => service.forkSideSession({ parentSessionId: 'parent-123' }),
    (err) => {
      assert.ok(err instanceof ForkBoundaryError)
      assert.equal(err.code, 'association-failed')
      assert.equal(err.detail.childSessionId, 'child-orphan-123')
      return true
    },
  )

  // Verify compensation was triggered
  assert.equal(cancelledChildId, 'child-orphan-123')
})
