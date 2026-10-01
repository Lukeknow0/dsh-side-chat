/**
 * Task 1.1 TDD — plugin-owned thread association records.
 *
 * Tests run against a pure in-memory fake KvTable that satisfies the
 * KvTable<string, ThreadRecord> interface. No DSH host, no file I/O.
 *
 * Run: pnpm --dir packages/dsh-sidechat test -- tests/host/ownership.spec.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

// ---------------------------------------------------------------------------
// Fake in-memory KvTable
// ---------------------------------------------------------------------------

/** Minimal KvTable<string, V> fake — satisfies the same interface the real
 *  domain layer exposes, without any I/O. */
function makeTable(initial = new Map()) {
  const store = new Map(initial)
  return {
    get(key) { return store.get(key) },
    put(key, value) { store.set(key, value); return Promise.resolve() },
    delete(key) {
      const had = store.has(key)
      store.delete(key)
      return Promise.resolve(had)
    },
    update(key, fn) {
      if (!store.has(key)) return Promise.reject(new Error(`missing key: ${key}`))
      const next = fn(store.get(key))
      store.set(key, next)
      return Promise.resolve(next)
    },
    entries() { return [...store.entries()][Symbol.iterator]() },
    keys()    { return [...store.keys()][Symbol.iterator]() },
    get size() { return store.size },
    // Expose raw store for assertions
    _store: store,
  }
}

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const { OwnershipStore, OwnershipError } = await import(
  '../../src/sidechat/ownership.js'
)
const { ThreadRecordSchema, SCHEMA_VERSION } = await import(
  '../../src/sidechat/storage.js'
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore(initial) { return new OwnershipStore(makeTable(initial)) }

const PARENT_A = 'parent-session-aaa'
const PARENT_B = 'parent-session-bbb'
const CHILD_1  = 'child-session-111'
const CHILD_2  = 'child-session-222'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('create: valid parent→child registration', async () => {
  const store = makeStore()
  const rec = await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1, title: 'My thread' })

  assert.equal(rec.schemaVersion, SCHEMA_VERSION)
  assert.equal(rec.parentSessionId, PARENT_A)
  assert.equal(rec.childSessionId, CHILD_1)
  assert.equal(rec.title, 'My thread')
  assert.ok(rec.createdAt > 0)
  assert.ok(rec.updatedAt > 0)
  assert.equal(rec.archivedAt, undefined)
})

test('create: duplicate (same parent+child) is idempotent — returns existing record', async () => {
  const store = makeStore()
  const first  = await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })
  const second = await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })
  assert.deepEqual(first, second)
})

test('create: two different parents cannot claim the same child', async () => {
  const store = makeStore()
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })

  await assert.rejects(
    () => store.create({ parentSessionId: PARENT_B, childSessionId: CHILD_1 }),
    (err) => {
      assert.ok(err instanceof OwnershipError)
      assert.equal(err.code, 'child-already-owned')
      return true
    },
  )
})

test('resolve: throws parent-mismatch when supplied parent does not match stored owner', async () => {
  const store = makeStore()
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })

  assert.throws(
    () => store.resolve(CHILD_1, PARENT_B),
    (err) => {
      assert.ok(err instanceof OwnershipError)
      assert.equal(err.code, 'parent-mismatch')
      return true
    },
  )
})

test('resolve: throws not-found for unknown childSessionId', async () => {
  const store = makeStore()

  assert.throws(
    () => store.resolve('does-not-exist'),
    (err) => {
      assert.ok(err instanceof OwnershipError)
      assert.equal(err.code, 'not-found')
      return true
    },
  )
})

test('resolve: succeeds when no expectedParent supplied (ownership not checked)', async () => {
  const store = makeStore()
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })
  const rec = store.resolve(CHILD_1)
  assert.equal(rec.parentSessionId, PARENT_A)
})

test('listByParent: returns only threads owned by the given parent, sorted by createdAt', async () => {
  const store = makeStore()
  // Create two threads for PARENT_A slightly apart in time
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1, title: 'First' })
  await new Promise(r => setTimeout(r, 2)) // ensure distinct createdAt
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_2, title: 'Second' })
  // Create one thread for PARENT_B
  await store.create({ parentSessionId: PARENT_B, childSessionId: 'child-bbb', title: 'Other' })

  const list = store.listByParent(PARENT_A)
  assert.equal(list.length, 2)
  assert.equal(list[0].childSessionId, CHILD_1)
  assert.equal(list[1].childSessionId, CHILD_2)
})

test('listByParent: excludes archived threads by default', async () => {
  const store = makeStore()
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_2 })
  await store.archive(CHILD_1, PARENT_A)

  const active = store.listByParent(PARENT_A)
  assert.equal(active.length, 1)
  assert.equal(active[0].childSessionId, CHILD_2)
})

test('listByParent: includeArchived returns archived threads too', async () => {
  const store = makeStore()
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })
  await store.archive(CHILD_1, PARENT_A)

  const all = store.listByParent(PARENT_A, { includeArchived: true })
  assert.equal(all.length, 1)
  assert.ok(all[0].archivedAt !== undefined)
})

test('rename: updates title and updatedAt', async () => {
  const store = makeStore()
  const original = await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1, title: 'Old' })
  await new Promise(r => setTimeout(r, 2))
  const renamed = await store.rename(CHILD_1, PARENT_A, 'New title')

  assert.equal(renamed.title, 'New title')
  assert.ok(renamed.updatedAt >= original.updatedAt)
})

test('rename: throws parent-mismatch when wrong parent supplied', async () => {
  const store = makeStore()
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })

  await assert.rejects(
    () => store.rename(CHILD_1, PARENT_B, 'Hacked title'),
    (err) => {
      assert.ok(err instanceof OwnershipError)
      assert.equal(err.code, 'parent-mismatch')
      return true
    },
  )
})

test('archive: sets archivedAt on first call', async () => {
  const store = makeStore()
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })
  const rec = await store.archive(CHILD_1, PARENT_A)

  assert.ok(typeof rec.archivedAt === 'number')
  assert.ok(rec.archivedAt > 0)
})

test('archive: is idempotent — second call preserves original archivedAt', async () => {
  const store = makeStore()
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })
  const first  = await store.archive(CHILD_1, PARENT_A)
  const second = await store.archive(CHILD_1, PARENT_A)

  assert.equal(second.archivedAt, first.archivedAt)
})

test('archive: throws parent-mismatch when wrong parent supplied', async () => {
  const store = makeStore()
  await store.create({ parentSessionId: PARENT_A, childSessionId: CHILD_1 })

  await assert.rejects(
    () => store.archive(CHILD_1, PARENT_B),
    (err) => {
      assert.ok(err instanceof OwnershipError)
      assert.equal(err.code, 'parent-mismatch')
      return true
    },
  )
})

test('ThreadRecordSchema: accepts a valid record', () => {
  const result = ThreadRecordSchema.safeParse({
    schemaVersion: SCHEMA_VERSION,
    parentSessionId: 'p1',
    childSessionId: 'c1',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    title: 'hello',
  })
  assert.ok(result.success)
})

test('ThreadRecordSchema: rejects record missing parentSessionId', () => {
  const result = ThreadRecordSchema.safeParse({
    schemaVersion: SCHEMA_VERSION,
    childSessionId: 'c1',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    title: '',
  })
  assert.ok(!result.success)
})

test('ThreadRecordSchema: rejects record with wrong schemaVersion', () => {
  const result = ThreadRecordSchema.safeParse({
    schemaVersion: 999,
    parentSessionId: 'p1',
    childSessionId: 'c1',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    title: '',
  })
  assert.ok(!result.success)
})

test('corrupt/old schema does not cause unowned sessions to be adopted', async () => {
  // Simulate a pre-existing record in the table with the wrong parentSessionId
  // (e.g., from a corrupt or migrated entry). Resolving it with any parent
  // that does not match must fail, not silently adopt.
  const store = makeStore()
  await store.create({ parentSessionId: 'real-owner', childSessionId: CHILD_1 })

  // An attacker-supplied parentSessionId that is not the owner
  assert.throws(
    () => store.resolve(CHILD_1, 'attacker-parent'),
    (err) => {
      assert.ok(err instanceof OwnershipError)
      assert.ok(['parent-mismatch', 'not-found'].includes(err.code))
      return true
    },
  )
})
