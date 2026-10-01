import assert from 'node:assert/strict'
import test from 'node:test'

import { createSidechatThreadState } from '../../src/client/state.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, value) },
  }
}

const parentAThreads = [
  { childSessionId: 'a-1', parentSessionId: 'parent-a', title: 'A one' },
  { childSessionId: 'a-2', parentSessionId: 'parent-a', title: 'A two' },
]
const parentBThreads = [
  { childSessionId: 'b-1', parentSessionId: 'parent-b', title: 'B one' },
]

test('operation tokens coordinate multiple panels sharing one parent state', () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  const older = state.beginOperation('parent-a', 'create')
  const newer = state.beginOperation('parent-a', 'create')

  assert.equal(state.isOperationCurrent('parent-a', 'create', older), false)
  assert.equal(state.isOperationCurrent('parent-a', 'create', newer), true)
  const otherParent = state.beginOperation('parent-b', 'create')
  assert.equal(state.isOperationCurrent('parent-a', 'create', newer), true)
  assert.equal(state.isOperationCurrent('parent-b', 'create', otherParent), true)
})

test('newest successful response wins even when a newer request failed', () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  const older = state.beginOperation('parent-a', 'list')
  state.beginOperation('parent-a', 'list')

  assert.equal(state.acceptOperationSuccess('parent-a', 'list', older), true)
  const newest = state.beginOperation('parent-a', 'list')
  assert.equal(state.acceptOperationSuccess('parent-a', 'list', newest), true)
  assert.equal(state.acceptOperationSuccess('parent-a', 'list', older), false)
})

test('exclusive operations reject duplicates until the owner releases', () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  const token = state.acquireExclusiveOperation('parent-a', 'create')
  assert.equal(typeof token, 'number')
  assert.equal(state.acquireExclusiveOperation('parent-a', 'create'), undefined)
  assert.equal(state.isOperationActive('parent-a', 'create'), true)
  assert.equal(state.releaseExclusiveOperation('parent-a', 'create', token), true)
  assert.equal(state.isOperationActive('parent-a', 'create'), false)
})

test('switching parents restores each parent selected child without cancelling anything', () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  const calls = []
  state.reconcile('parent-a', parentAThreads)
  state.select('parent-a', 'a-2', parentAThreads)
  state.reconcile('parent-b', parentBThreads)
  state.select('parent-b', 'b-1', parentBThreads)
  state.reconcile('parent-a', parentAThreads)

  calls.push(state.selected('parent-a'), state.selected('parent-b'))
  assert.deepEqual(calls, ['a-2', 'b-1'])
})

test('adding a child moves the prior current child into history', () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  state.reconcile('parent-a', parentAThreads)
  state.select('parent-a', 'a-1', parentAThreads)
  state.add('parent-a', 'a-3')

  assert.equal(state.selected('parent-a'), 'a-3')
  assert.deepEqual(state.parent('parent-a').historyIds, ['a-1', 'a-2'])
})

test('reopening one history child makes it current and retains the previous current in history', () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  const threads = [...parentAThreads, { childSessionId: 'a-3', parentSessionId: 'parent-a', title: 'A three' }]
  state.reconcile('parent-a', threads)
  state.add('parent-a', 'a-3')
  state.select('parent-a', 'a-1', threads)

  assert.equal(state.selected('parent-a'), 'a-1')
  assert.deepEqual(state.parent('parent-a').historyIds, ['a-3', 'a-2'])
})

test('unknown persisted child is never selected or rendered after server reconciliation', () => {
  const storage = memoryStorage()
  storage.setItem('dsh-sidechat/ui-state/v1', JSON.stringify({
    version: 1,
    parents: {
      'parent-a': {
        selectedChildId: 'unknown-child',
        historyIds: ['unknown-child', 'a-2'],
        drafts: { 'unknown-child': 'secret stale draft', 'a-2': 'known draft' },
      },
    },
  }))

  const state = createSidechatThreadState({ storage })
  state.reconcile('parent-a', parentAThreads)

  assert.equal(state.selected('parent-a'), 'a-2')
  assert.deepEqual(state.parent('parent-a').historyIds, ['a-1'])
  assert.equal(state.draft('parent-a', 'unknown-child'), '')
})

test('composer drafts persist independently per parent and child across reload', () => {
  const storage = memoryStorage()
  const first = createSidechatThreadState({ storage })
  first.reconcile('parent-a', parentAThreads)
  first.reconcile('parent-b', parentBThreads)
  first.setDraft('parent-a', 'a-1', 'draft A1')
  first.setDraft('parent-a', 'a-2', 'draft A2')
  first.setDraft('parent-b', 'b-1', 'draft B1')

  const restored = createSidechatThreadState({ storage })
  restored.reconcile('parent-a', parentAThreads)
  restored.reconcile('parent-b', parentBThreads)

  assert.equal(restored.draft('parent-a', 'a-1'), 'draft A1')
  assert.equal(restored.draft('parent-a', 'a-2'), 'draft A2')
  assert.equal(restored.draft('parent-b', 'b-1'), 'draft B1')
})

test('blank native pages retain independent drafts and child bindings through reload', () => {
  const storage = memoryStorage()
  const state = createSidechatThreadState({ storage })
  assert.equal(typeof state.bindTab, 'function')
  state.setDraft('parent-a', 'new:page-a', 'first draft')
  state.setDraft('parent-a', 'new:page-b', 'second draft')
  state.reconcile('parent-a', parentAThreads)
  state.bindTab('parent-a', 'page-a', 'a-1')
  state.bindTab('parent-a', 'page-b', 'a-2')
  assert.equal(state.tabChild('parent-a', 'page-a'), 'a-1')
  assert.equal(state.tabChild('parent-b', 'page-a'), undefined)
  assert.equal(state.draft('parent-a', 'a-1'), 'first draft')
  assert.equal(state.draft('parent-a', 'a-2'), 'second draft')
  const restored = createSidechatThreadState({ storage })
  restored.reconcile('parent-a', parentAThreads)
  assert.equal(restored.tabChild('parent-a', 'page-b'), 'a-2')
  assert.equal(restored.draft('parent-a', 'a-2'), 'second draft')
})

test('creation is shared only within one parent and native page', async () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  assert.equal(typeof state.ensureTabChild, 'function')
  let calls = 0
  let finish
  const create = () => { calls += 1; return new Promise((resolve) => { finish = resolve }) }
  const first = state.ensureTabChild('parent-a', 'page-a', create)
  const duplicate = state.ensureTabChild('parent-a', 'page-a', create)
  await Promise.resolve()
  assert.equal(calls, 1)
  finish('a-new')
  assert.deepEqual(await Promise.all([first, duplicate]), ['a-new', 'a-new'])
  assert.equal(await state.ensureTabChild('parent-a', 'page-a', create), 'a-new')
  assert.equal(await state.ensureTabChild('parent-a', 'page-b', async () => 'a-other'), 'a-other')
  assert.equal(await state.ensureTabChild('parent-b', 'page-a', async () => 'b-new'), 'b-new')
  assert.equal(calls, 1)
})

test('failed fork releases its reservation and keeps the pending page draft', async () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  assert.equal(typeof state.ensureTabChild, 'function')
  state.setDraft('parent-a', 'new:page-a', 'try again')
  await assert.rejects(state.ensureTabChild('parent-a', 'page-a', async () => { throw new Error('fork failed') }), /fork failed/)
  assert.equal(state.tabChild('parent-a', 'page-a'), undefined)
  assert.equal(state.draft('parent-a', 'new:page-a'), 'try again')
  assert.equal(await state.ensureTabChild('parent-a', 'page-a', async () => 'a-new'), 'a-new')
  assert.equal(state.draft('parent-a', 'a-new'), 'try again')
})

test('labels retain real titles and distinguish unnamed conversations without renaming Host metadata', () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  assert.equal(typeof state.label, 'function')
  state.reconcile('parent-a', [...parentAThreads, { childSessionId: 'a-3', parentSessionId: 'parent-a', title: '' }])
  assert.equal(state.label('parent-a', 'a-1'), 'A one')
  assert.equal(state.label('parent-a', 'a-3'), '侧聊 3')
  state.setLabel('parent-a', 'a-3', '  Discuss\n  native tabs  ')
  assert.equal(state.label('parent-a', 'a-3'), 'Discuss native tabs')
  state.reconcile('parent-a', [...parentAThreads, { childSessionId: 'a-3', parentSessionId: 'parent-a', title: '' }])
  assert.equal(state.label('parent-a', 'a-3'), 'Discuss native tabs')
})

test('archiving the current child selects the next known history child', () => {
  const state = createSidechatThreadState({ storage: memoryStorage() })
  state.reconcile('parent-a', parentAThreads)
  state.select('parent-a', 'a-2', parentAThreads)
  state.remove('parent-a', 'a-2')

  assert.equal(state.selected('parent-a'), 'a-1')
  assert.deepEqual(state.parent('parent-a').historyIds, [])
})
