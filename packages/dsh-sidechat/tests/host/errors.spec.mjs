import assert from 'node:assert/strict'
import test from 'node:test'

import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { mapSidechatRemoteError } from '../../src/sidechat/errors.js'
import { SidechatModelPermissionError } from '../../src/sidechat/model-permission.js'
import { SidechatInteractionError } from '../../src/sidechat/interactions.js'
import { SidechatOperationError } from '../../src/sidechat/operations.js'

const cases = [
  ['sidechat/not-found', { childSessionId: 'child-a' }],
  ['sidechat/archived', { childSessionId: 'child-a' }],
  ['sidechat/session-unavailable', { childSessionId: 'child-a' }],
  ['sidechat/cursor-invalid', { childSessionId: 'child-a', committedCursor: 7 }],
]

for (const [code, details] of cases) {
  test(`maps ${code} to the stable public RemoteError`, () => {
    const mapped = mapSidechatRemoteError(new SidechatOperationError(
      code,
      'Stable public message.',
      { ...details, cause: 'private failure', title: 'Private title B' },
    ))

    assert.ok(mapped instanceof RemoteError)
    assert.equal(mapped.code, code)
    assert.equal(mapped.message, 'Stable public message.')
    assert.equal(mapped.details.childSessionId, 'child-a')
    assert.equal('cause' in mapped.details, false)
    assert.equal('title' in mapped.details, false)
    if (code === 'sidechat/cursor-invalid') {
      assert.equal(mapped.details.committedCursor, 7)
    }
  })
}

test('maps child configuration failures without exposing private details', () => {
  const mapped = mapSidechatRemoteError(new SidechatModelPermissionError(
    'sidechat/model-unavailable',
    'Requested model selection is unavailable.',
    {
      childSessionId: 'child-a',
      provider: 'deepseek',
      model: 'reasoner',
      reasoningEffort: 'high',
      parentSessionId: 'parent-secret',
    },
  ))

  assert.ok(mapped instanceof RemoteError)
  assert.equal(mapped.code, 'sidechat/model-unavailable')
  assert.deepEqual(mapped.details, {
    childSessionId: 'child-a',
    provider: 'deepseek',
    model: 'reasoner',
    reasoningEffort: 'high',
  })
})

test('maps question/approval response failures with only child and interaction identity', () => {
  const mapped = mapSidechatRemoteError(new SidechatInteractionError(
    'sidechat/interaction-stale',
    'Interaction is no longer pending.',
    {
      childSessionId: 'child-a',
      interactionId: 'interaction-1',
      parentSessionId: 'parent-secret',
      details: 'private',
    },
  ))

  assert.ok(mapped instanceof RemoteError)
  assert.equal(mapped.code, 'sidechat/interaction-stale')
  assert.deepEqual(mapped.details, {
    childSessionId: 'child-a',
    interactionId: 'interaction-1',
  })
})

test('does not rewrite unrelated errors', () => {
  const original = new Error('programmer defect')
  assert.equal(mapSidechatRemoteError(original), original)
})
