import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAnnotationAnchor,
  resolveAnnotationAnchor,
} from '../../src/client/annotations/anchor.js'
import {
  AnnotationStoreError,
  createAnnotationStore,
} from '../../src/client/annotations/store.js'

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, value) },
    values,
  }
}

test('creates an exact quote anchor with bounded prefix and suffix context', () => {
  const text = '0123456789 selected abcdefghij'
  const start = text.indexOf('selected')
  const anchor = createAnnotationAnchor(text, start, start + 'selected'.length, 5)

  assert.deepEqual(anchor, {
    quote: 'selected',
    prefix: '6789 ',
    suffix: ' abcd',
    start,
    end: start + 'selected'.length,
  })

  assert.deepEqual(createAnnotationAnchor('pick end', 0, 4, 20), {
    quote: 'pick', prefix: '', suffix: ' end', start: 0, end: 4,
  })
})

test('rejects empty or invalid selection ranges and context lengths', () => {
  assert.throws(() => createAnnotationAnchor('text', -1, 2), RangeError)
  assert.throws(() => createAnnotationAnchor('text', 2, 2), RangeError)
  assert.throws(() => createAnnotationAnchor('text', 1, 5), RangeError)
  assert.throws(() => createAnnotationAnchor('text', 0, 1, -1), RangeError)
  assert.throws(() => createAnnotationAnchor('text', 0, 1, 1.5), RangeError)
})

test('resolves a unique quote after surrounding text shifts', () => {
  const source = 'A unique quotation lives here.'
  const start = source.indexOf('unique quotation')
  const anchor = createAnnotationAnchor(source, start, start + 'unique quotation'.length, 6)
  const edited = `Inserted before. ${source}`
  const expectedStart = edited.indexOf('unique quotation')

  assert.deepEqual(resolveAnnotationAnchor(edited, anchor), {
    state: 'resolved',
    start: expectedStart,
    end: expectedStart + 'unique quotation'.length,
  })
})

test('uses exact prefix and suffix context to disambiguate repeated quotes', () => {
  const source = 'alpha target omega / beta target gamma'
  const start = source.lastIndexOf('target')
  const anchor = createAnnotationAnchor(source, start, start + 'target'.length, 5)
  const edited = `new ${source}`
  const expectedStart = edited.lastIndexOf('target')

  assert.equal(anchor.prefix, 'beta ')
  assert.equal(anchor.suffix, ' gamm')
  assert.deepEqual(resolveAnnotationAnchor(edited, anchor), {
    state: 'resolved',
    start: expectedStart,
    end: expectedStart + 'target'.length,
  })
})

test('marks missing, malformed, or context-ambiguous anchors for review', () => {
  const ambiguous = {
    quote: 'same',
    prefix: ' ',
    suffix: ' ',
    start: 0,
    end: 4,
  }
  assert.deepEqual(resolveAnnotationAnchor('x same y x same y', ambiguous), { state: 'needs-review' })
  assert.deepEqual(resolveAnnotationAnchor('quote was removed', {
    quote: 'missing', prefix: '', suffix: '', start: 0, end: 7,
  }), { state: 'needs-review' })
  assert.deepEqual(resolveAnnotationAnchor('anything', {
    quote: '', prefix: '', suffix: '', start: 0, end: 0,
  }), { state: 'needs-review' })
})

test('stores annotations independently for each parent session', () => {
  let nextId = 0
  const store = createAnnotationStore({ idFactory: () => `annotation-${++nextId}` })
  const anchor = createAnnotationAnchor('hello world', 6, 11)
  const first = store.add('parent-a', { anchor, comment: 'A note' })
  const second = store.add('parent-b', { id: 'shared', anchor, comment: 'B note' })
  store.add('parent-a', { id: 'shared', anchor, comment: 'A second note' })

  assert.equal(first.id, 'annotation-1')
  assert.deepEqual(store.list('parent-a').map((item) => item.comment), ['A note', 'A second note'])
  assert.deepEqual(store.list('parent-b').map((item) => item.comment), ['B note'])
  assert.equal(store.remove('parent-a', 'shared'), true)
  assert.equal(store.remove('parent-a', 'missing'), false)
  assert.deepEqual(store.list('parent-a').map((item) => item.id), ['annotation-1'])
  assert.deepEqual(store.list('parent-b').map((item) => item.id), [second.id])
})

test('updates records without changing IDs and returns defensive copies', () => {
  const store = createAnnotationStore({ idFactory: () => 'generated' })
  const created = store.add('parent-a', {
    id: 'note-1',
    anchor: createAnnotationAnchor('some quote', 5, 10),
    comment: 'before',
  })
  const updated = store.update('parent-a', 'note-1', { id: 'wrong', comment: 'after' })

  assert.equal(created.id, 'note-1')
  assert.equal(updated.id, 'note-1')
  assert.equal(updated.comment, 'after')
  assert.equal(store.update('parent-b', 'note-1', { comment: 'nope' }), undefined)

  const listed = store.list('parent-a')
  listed[0].comment = 'mutated outside'
  listed[0].anchor.quote = 'also mutated'
  assert.equal(store.list('parent-a')[0].comment, 'after')
  assert.equal(store.list('parent-a')[0].anchor.quote, 'quote')
})

test('persists isolated parent records through StorageLike and ignores corrupt snapshots', () => {
  const storage = memoryStorage()
  const first = createAnnotationStore({ storage, storageKey: 'annotations', idFactory: () => 'one' })
  first.add('parent-a', {
    anchor: createAnnotationAnchor('persist quote', 8, 13),
    comment: 'saved',
  })
  first.add('parent-b', {
    id: 'two',
    anchor: createAnnotationAnchor('other quote', 6, 11),
    comment: 'other',
  })

  const restored = createAnnotationStore({ storage, storageKey: 'annotations' })
  assert.deepEqual(restored.list('parent-a').map((item) => item.id), ['one'])
  assert.deepEqual(restored.list('parent-b').map((item) => item.id), ['two'])

  const corruptStorage = memoryStorage({ annotations: '{not json' })
  const recovered = createAnnotationStore({ storage: corruptStorage, storageKey: 'annotations', idFactory: () => 'new' })
  assert.deepEqual(recovered.list('parent-a'), [])
  recovered.add('parent-a', { anchor: createAnnotationAnchor('fresh', 0, 5), comment: 'ok' })
  assert.equal(JSON.parse(corruptStorage.values.get('annotations')).version, 1)
})

test('rejects invalid parents, duplicate IDs, and non-object records', () => {
  const store = createAnnotationStore({ idFactory: () => 'generated' })
  assert.throws(() => store.list(''), (error) => error instanceof AnnotationStoreError && error.code === 'annotation/parent-required')
  assert.throws(() => store.add('parent-a', null), (error) => error instanceof AnnotationStoreError && error.code === 'annotation/record-invalid')
  store.add('parent-a', { id: 'same', comment: 'one' })
  assert.throws(() => store.add('parent-a', { id: 'same', comment: 'two' }), (error) => error instanceof AnnotationStoreError && error.code === 'annotation/id-conflict')
})
