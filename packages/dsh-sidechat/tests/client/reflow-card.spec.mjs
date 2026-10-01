/**
 * Task 4.4 TDD — parent-scoped pending reflow state and cards.
 *
 * Run: node --test tests/client/reflow-card.spec.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import { ReflowCard } from '../../src/client/reflow/ReflowCard.js'
import { createReflowStore } from '../../src/client/reflow/store.js'

function item(id, parentSessionId, overrides = {}) {
  return {
    id,
    parentSessionId,
    childSessionId: `child-${id}`,
    turnId: `turn-${id}`,
    question: `Question ${id}`,
    answer: `Answer ${id}`,
    ...overrides,
  }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, value) },
    values,
  }
}

test('adds and lists pending reflow items only for their parent session', () => {
  const store = createReflowStore()
  const first = item('one', 'parent-a')
  const second = item('two', 'parent-b')
  const third = item('three', 'parent-a')

  assert.deepEqual(store.add(first), first)
  store.add(second)
  store.add(third)

  assert.deepEqual(store.list('parent-a'), [first, third])
  assert.deepEqual(store.list('parent-b'), [second])
  assert.deepEqual(store.list('parent-missing'), [])
})

test('removes one item by ID and clears only the requested parent queue', () => {
  const store = createReflowStore()
  store.add(item('one', 'parent-a'))
  store.add(item('two', 'parent-a'))
  store.add(item('three', 'parent-b'))

  assert.equal(store.remove('two'), true)
  assert.equal(store.remove('missing'), false)
  assert.deepEqual(store.list('parent-a').map((entry) => entry.id), ['one'])
  assert.deepEqual(store.list('parent-b').map((entry) => entry.id), ['three'])

  store.clear('parent-a')
  assert.deepEqual(store.list('parent-a'), [])
  assert.deepEqual(store.list('parent-b').map((entry) => entry.id), ['three'])
})

test('validates the exact pending item identity and returns defensive copies', () => {
  const store = createReflowStore()
  const original = item('one', 'parent-a')
  const added = store.add(original)
  original.question = 'mutated caller input'
  added.answer = 'mutated returned value'

  assert.deepEqual(store.list('parent-a'), [item('one', 'parent-a')])
  const listed = store.list('parent-a')
  listed[0].question = 'mutated list result'
  assert.equal(store.list('parent-a')[0].question, 'Question one')

  for (const field of ['id', 'parentSessionId', 'childSessionId', 'turnId', 'question', 'answer']) {
    assert.throws(() => store.add(item(`bad-${field}`, 'parent-a', { [field]: '   ' })), TypeError)
  }
  assert.throws(() => store.add(null), TypeError)
  assert.throws(() => store.add(item('one', 'parent-b')), TypeError)
})

test('persists optional storage state and ignores a corrupt snapshot', () => {
  const storage = memoryStorage()
  const first = createReflowStore({ storage })
  first.add(item('one', 'parent-a'))
  first.add(item('two', 'parent-b'))

  const restored = createReflowStore({ storage })
  assert.deepEqual(restored.list('parent-a'), [item('one', 'parent-a')])
  assert.deepEqual(restored.list('parent-b'), [item('two', 'parent-b')])
  assert.equal(restored.remove('one'), true)
  restored.clear('parent-b')

  const empty = createReflowStore({ storage })
  assert.deepEqual(empty.list('parent-a'), [])
  assert.deepEqual(empty.list('parent-b'), [])

  const [storageKey] = storage.values.keys()
  const corrupt = memoryStorage({ [storageKey]: '{not json' })
  assert.deepEqual(createReflowStore({ storage: corrupt }).list('parent-a'), [])
})

test('renders question and answer summaries with independent remove controls', async () => {
  const removals = []
  const items = [item('one', 'parent-a'), item('two', 'parent-a')]
  const renderer = TestRenderer.create(React.createElement(ReflowCard, {
    items,
    onRemove(id) { removals.push(id) },
  }))
  const root = renderer.root
  const rendered = JSON.stringify(renderer.toJSON())

  assert.equal(root.findByProps({ 'aria-label': '待发送回流' }).type, 'section')
  assert.equal(root.findAllByType('li').length, 2)
  assert.match(rendered, /来自侧聊/)
  assert.match(rendered, /提问/)
  assert.match(rendered, /Question one/)
  assert.match(rendered, /回答/)
  assert.match(rendered, /Answer two/)
  assert.deepEqual(root.findAllByType('button').map((button) => button.children.join('')), ['×', '×'])

  await act(async () => root.findByProps({ 'aria-label': '删除待回流项 one' }).props.onClick())
  await act(async () => root.findByProps({ 'aria-label': '删除待回流项 two' }).props.onClick())
  assert.deepEqual(removals, ['one', 'two'])
})

test('renders nothing for an empty queue and disables removal when requested', () => {
  const empty = TestRenderer.create(React.createElement(ReflowCard, { items: [] }))
  assert.equal(empty.toJSON(), null)

  let removals = 0
  const disabled = TestRenderer.create(React.createElement(ReflowCard, {
    items: [item('one', 'parent-a')],
    disabled: true,
    onRemove() { removals += 1 },
  }))
  const disabledButton = disabled.root.findByType('button')
  assert.equal(disabledButton.props.disabled, true)
  assert.equal(disabledButton.props.onClick, undefined)
  assert.equal(removals, 0)

  const noHandler = TestRenderer.create(React.createElement(ReflowCard, {
    items: [item('two', 'parent-a')],
  }))
  assert.equal(noHandler.root.findByType('button').props.disabled, true)
})
