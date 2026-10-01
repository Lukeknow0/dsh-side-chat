import assert from 'node:assert/strict'
import test from 'node:test'

import { copySidechatId, legacyCopy } from '../../src/client/clipboard.js'

test('copy controls preserve distinct parent and child ID values', async () => {
  const copied = []
  const clipboard = { writeText: async (value) => copied.push(value) }

  assert.deepEqual(await copySidechatId('parent', 'parent-123', { clipboard }), {
    ok: true,
    kind: 'parent',
    value: 'parent-123',
  })
  assert.deepEqual(await copySidechatId('child', 'child-456', { clipboard }), {
    ok: true,
    kind: 'child',
    value: 'child-456',
  })
  assert.deepEqual(copied, ['parent-123', 'child-456'])
})

test('legacy fallback restores keyboard focus after copying', () => {
  const originalDocument = globalThis.document
  let restored = 0
  let removed = 0
  const input = {
    value: '',
    style: {},
    setAttribute() {},
    select() {},
    remove() { removed += 1 },
  }
  globalThis.document = {
    activeElement: { focus() { restored += 1 } },
    body: { appendChild() {} },
    createElement() { return input },
    execCommand(command) { return command === 'copy' },
  }
  try {
    assert.equal(legacyCopy('child-456'), true)
    assert.equal(restored, 1)
    assert.equal(removed, 1)
  } finally {
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('copy reports an explicit error when Clipboard API and fallback both fail', async () => {
  const result = await copySidechatId('child', 'child-456', {
    clipboard: { writeText: async () => { throw new Error('denied') } },
    fallback: () => false,
  })

  assert.equal(result.ok, false)
  assert.equal(result.kind, 'child')
  assert.equal(result.value, 'child-456')
  assert.match(result.message, /复制失败/)
})
