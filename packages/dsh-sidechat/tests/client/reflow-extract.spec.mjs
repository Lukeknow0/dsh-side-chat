/**
 * Task 4.3 TDD — extract settled sidechat question/answer pairs.
 *
 * Run: node --test tests/client/reflow-extract.spec.mjs
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { extractCompletedQAPairs } from '../../src/client/reflow/extract.js'

function text(text) {
  return { type: 'text', text }
}

function message(seq, turnId, role, content, source = role) {
  return { seq, kind: 'message', turnId, role, source, content }
}

test('extracts one durable user/assistant pair only after its turn settles', () => {
  const events = [
    { seq: 1, kind: 'turn-start', turnId: 'turn-1' },
    message(2, 'turn-1', 'user', [text('What changed?')], 'user'),
    message(3, 'turn-1', 'assistant', [text('The validation changed.')], 'assistant'),
    { seq: 4, kind: 'turn-end', turnId: 'turn-1', reason: 'completed' },
  ]

  assert.deepEqual(extractCompletedQAPairs(events), [{
    turnId: 'turn-1',
    question: 'What changed?',
    answer: 'The validation changed.',
  }])
})

test('extracts multiple completed turns in settlement order through tool activity', () => {
  const events = [
    { seq: 1, kind: 'turn-start', turnId: 'turn-a' },
    message(2, 'turn-a', 'user', [
      text('  Inspect '),
      { type: 'image', attachmentId: 'image-1' },
      text('this change.  '),
    ], 'user'),
    message(3, 'turn-a', 'assistant', [text('I will inspect it.')], 'assistant'),
    { seq: 4, kind: 'tool', turnId: 'turn-a', callId: 'call-1', name: 'read', state: 'succeeded' },
    message(5, 'turn-a', 'assistant', [text('The change is safe.')], 'assistant'),
    { seq: 6, kind: 'turn-end', turnId: 'turn-a', reason: 'completed' },
    { seq: 7, kind: 'turn-start', turnId: 'turn-b' },
    message(8, 'turn-b', 'user', [text('Can you recover?')], 'user'),
    { seq: 9, kind: 'tool', turnId: 'turn-b', callId: 'call-2', name: 'lookup', state: 'failed' },
    message(10, 'turn-b', 'assistant', [text('Yes, I recovered.')], 'assistant'),
    { seq: 11, kind: 'turn-end', turnId: 'turn-b', reason: 'completed' },
  ]

  assert.deepEqual(extractCompletedQAPairs(events), [
    {
      turnId: 'turn-a',
      question: 'Inspect\nthis change.',
      answer: 'I will inspect it.\n\nThe change is safe.',
    },
    {
      turnId: 'turn-b',
      question: 'Can you recover?',
      answer: 'Yes, I recovered.',
    },
  ])
})

test('never pairs messages across turn IDs or from plugin injection', () => {
  const events = [
    message(1, 'turn-injected', 'user', [text('Parent seed')], 'plugin-injection'),
    message(2, 'turn-injected', 'assistant', [text('Seed response')], 'assistant'),
    { seq: 3, kind: 'turn-end', turnId: 'turn-injected', reason: 'completed' },
    message(4, 'turn-user-only', 'user', [text('Real question')], 'user'),
    { seq: 5, kind: 'turn-end', turnId: 'turn-user-only', reason: 'completed' },
    message(6, 'turn-assistant-only', 'assistant', [text('Wrong turn')], 'assistant'),
    { seq: 7, kind: 'turn-end', turnId: 'turn-assistant-only', reason: 'completed' },
  ]

  assert.deepEqual(extractCompletedQAPairs(events), [])
})

test('excludes unsettled, cancelled, interrupted, blocked, and errored turns', () => {
  const events = []
  let seq = 1
  for (const [turnId, ending] of [
    ['turn-unsettled', null],
    ['turn-cancelled', 'cancelled'],
    ['turn-aborted', 'aborted'],
    ['turn-interrupted', 'interrupted'],
    ['turn-blocked', 'blocked'],
    ['turn-max-tokens', 'max-tokens'],
  ]) {
    events.push(message(seq++, turnId, 'user', [text(`Question ${turnId}`)], 'user'))
    events.push(message(seq++, turnId, 'assistant', [text(`Answer ${turnId}`)], 'assistant'))
    if (ending !== null) {
      events.push({ seq: seq++, kind: 'turn-end', turnId, reason: ending })
    }
  }

  events.push(message(seq++, 'turn-error', 'user', [text('Question error')], 'user'))
  events.push(message(seq++, 'turn-error', 'assistant', [text('Answer error')], 'assistant'))
  events.push({ seq: seq++, kind: 'error', turnId: 'turn-error', message: 'failed' })
  events.push({ seq: seq++, kind: 'turn-end', turnId: 'turn-error', reason: 'completed' })

  assert.deepEqual(extractCompletedQAPairs(events), [])
})

test('requires non-blank durable text on both sides before settlement', () => {
  const events = [
    message(1, 'turn-image-question', 'user', [{ type: 'image', attachmentId: 'image-1' }], 'user'),
    message(2, 'turn-image-question', 'assistant', [text('answer')], 'assistant'),
    { seq: 3, kind: 'turn-end', turnId: 'turn-image-question', reason: 'completed' },
    message(4, 'turn-blank-answer', 'user', [text('question')], 'user'),
    message(5, 'turn-blank-answer', 'assistant', [text('   ')], 'assistant'),
    { seq: 6, kind: 'turn-end', turnId: 'turn-blank-answer', reason: 'completed' },
  ]

  assert.deepEqual(extractCompletedQAPairs(events), [])
})

test('does not let a message arriving after turn-end complete a settled pair', () => {
  const events = [
    message(1, 'turn-late', 'user', [text('question')], 'user'),
    { seq: 2, kind: 'turn-end', turnId: 'turn-late', reason: 'completed' },
    message(3, 'turn-late', 'assistant', [text('late answer')], 'assistant'),
  ]

  assert.deepEqual(extractCompletedQAPairs(events), [])
})

test('returns an empty list for absent or malformed event input', () => {
  assert.deepEqual(extractCompletedQAPairs(undefined), [])
  assert.deepEqual(extractCompletedQAPairs(null), [])
  assert.deepEqual(extractCompletedQAPairs({}), [])
  assert.deepEqual(extractCompletedQAPairs([null, {}, { kind: 'message', turnId: 1 }]), [])
})
