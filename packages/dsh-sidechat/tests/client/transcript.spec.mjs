import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import TestRenderer from 'react-test-renderer'

import {
  MAX_LIVE_TEXT_LENGTH,
  projectTranscript,
} from '../../src/client/transcript.js'
import { TranscriptView } from '../../src/client/TranscriptView.js'

const textPart = (text) => ({ type: 'text', text })

function message(seq, turnId, role, content, source = role) {
  return { seq, kind: 'message', turnId, role, source, content }
}

test('projects every durable message step while excluding plugin-injected user context', () => {
  const rows = projectTranscript([
    { seq: 1, kind: 'turn-start', turnId: 'turn-1' },
    message(2, 'turn-1', 'user', [textPart('inherited context')], 'plugin-injection'),
    message(3, 'turn-1', 'user', [
      textPart('real request'),
      { type: 'image', attachmentId: 'image-1', mediaType: 'image/png', bytes: 10, width: 2, height: 3, name: 'shot.png' },
      { type: 'file', attachmentId: 'file-1', name: 'brief.pdf', bytes: 20 },
    ], 'user'),
    message(4, 'turn-1', 'assistant', [textPart('first step')], 'assistant'),
    message(5, 'turn-1', 'assistant', [textPart('second step')], 'assistant'),
    { seq: 6, kind: 'turn-end', turnId: 'turn-1', reason: 'completed' },
  ])

  assert.deepEqual(rows.map((row) => [row.key, row.type]), [
    ['turn:start:1', 'turn'],
    ['message:3', 'message'],
    ['message:4', 'message'],
    ['message:5', 'message'],
    ['turn:end:6', 'turn'],
  ])
  assert.deepEqual(
    rows.filter((row) => row.type === 'message').map((row) => [row.role, row.content[0].text]),
    [['user', 'real request'], ['assistant', 'first step'], ['assistant', 'second step']],
  )
  assert.deepEqual(rows[1].content.slice(1).map((part) => part.type), ['image', 'file'])
})

test('pairs tool calls and results into one stable row at first appearance', () => {
  const rows = projectTranscript([
    { seq: 10, kind: 'tool', turnId: '7', callId: 'call:1', name: 'search', state: 'running' },
    { seq: 11, kind: 'message', turnId: '7', role: 'assistant', source: 'assistant', content: [textPart('working')] },
    { seq: 12, kind: 'tool', turnId: '7', callId: 'call:1', name: 'tool', state: 'succeeded', summary: '3 results' },
    { seq: 13, kind: 'tool', turnId: '7', callId: 'call-2', name: 'shell', state: 'failed', summary: 'exit 1' },
  ])

  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], {
    key: 'tool:["7","call:1"]',
    type: 'tool',
    turnId: '7',
    callId: 'call:1',
    name: 'search',
    state: 'succeeded',
    summary: '3 results',
    firstSeq: 10,
    latestSeq: 12,
  })
  assert.equal(rows[2].state, 'failed')
  assert.equal(rows[2].key, 'tool:["7","call-2"]')
})

test('projects approval and question lifecycles without duplicating their cards', () => {
  const rows = projectTranscript([
    { seq: 20, kind: 'interaction', turnId: '8', interactionId: 'approval-1', interactionKind: 'approval', state: 'pending', prompt: 'Allow shell?' },
    { seq: 21, kind: 'interaction', turnId: '8', interactionId: 'question-1', interactionKind: 'question', state: 'pending', prompt: 'Which branch?' },
    { seq: 22, kind: 'interaction', turnId: '8', interactionId: 'approval-1', interactionKind: 'approval', state: 'resolved', prompt: 'Approval resolved' },
    { seq: 23, kind: 'interaction', turnId: '8', interactionId: 'question-1', interactionKind: 'question', state: 'expired', prompt: 'Question expired' },
  ])

  assert.deepEqual(rows.map((row) => ({
    key: row.key,
    kind: row.interactionKind,
    state: row.state,
    prompt: row.prompt,
    firstSeq: row.firstSeq,
    latestSeq: row.latestSeq,
  })), [
    {
      key: 'interaction:["approval","approval-1"]',
      kind: 'approval',
      state: 'resolved',
      prompt: 'Allow shell?',
      firstSeq: 20,
      latestSeq: 22,
    },
    {
      key: 'interaction:["question","question-1"]',
      kind: 'question',
      state: 'expired',
      prompt: 'Which branch?',
      firstSeq: 21,
      latestSeq: 23,
    },
  ])
})

test('projects turn boundaries and errors with deterministic keys', () => {
  const rows = projectTranscript([
    { seq: 30, kind: 'turn-start', turnId: 'turn-9' },
    { seq: 31, kind: 'error', turnId: 'turn-9', message: 'model unavailable' },
    { seq: 32, kind: 'error', message: 'session unavailable' },
    { seq: 33, kind: 'turn-end', turnId: 'turn-9', reason: 'failed' },
  ])

  assert.deepEqual(rows.map((row) => row.key), [
    'turn:start:30',
    'error:31',
    'error:32',
    'turn:end:33',
  ])
  assert.equal(rows[1].message, 'model unavailable')
  assert.equal(rows[2].turnId, undefined)
  assert.equal(rows[3].reason, 'failed')
})

test('renders plain durable content with accessible labels and lifecycle statuses', () => {
  const events = [
    message(1, '1', 'user', [textPart('**plain request**')], 'user'),
    message(2, '1', 'assistant', [textPart('plain answer')], 'assistant'),
    { seq: 3, kind: 'tool', turnId: '1', callId: 'call-1', name: 'search', state: 'succeeded', summary: 'done' },
    { seq: 4, kind: 'interaction', turnId: '1', interactionId: 'approval-1', interactionKind: 'approval', state: 'resolved', prompt: 'Allow search?' },
    { seq: 5, kind: 'interaction', turnId: '1', interactionId: 'question-1', interactionKind: 'question', state: 'expired', prompt: 'Need input' },
    { seq: 6, kind: 'error', turnId: '1', message: 'network failed' },
  ]
  const renderer = TestRenderer.create(React.createElement(TranscriptView, { events }))
  const root = renderer.root

  assert.equal(root.findAllByProps({ 'aria-label': '用户消息' }).length, 1)
  assert.equal(root.findAllByProps({ 'aria-label': '助手消息' }).length, 1)
  assert.equal(root.findAllByProps({ 'aria-label': '工具 search：成功' }).length, 1)
  assert.equal(root.findAllByProps({ 'aria-label': '审批请求：已处理' }).length, 1)
  assert.equal(root.findAllByProps({ 'aria-label': '用户问题：已过期' }).length, 1)
  assert.equal(root.findAllByProps({ role: 'alert' }).length, 1)
  assert.match(JSON.stringify(renderer.toJSON()), /\*\*plain request\*\*/)
})

test('renders bounded process-local questions and fallback errors', () => {
  const renderer = TestRenderer.create(React.createElement(TranscriptView, {
    events: [],
    transient: {
      questions: [{
        childSessionId: 'child-a',
        requestId: 'question:1',
        questions: [{
          id: 'branch',
          header: '选择分支',
          question: 'Which branch?',
          detail: 'Select one',
          options: [{ label: 'main', description: 'Stable' }, { label: 'dev' }],
        }],
        truncated: false,
      }],
      error: {
        childSessionId: 'child-a',
        turnId: '2',
        step: 0,
        message: 'Temporary failure',
        code: 'UPSTREAM',
        truncated: false,
      },
    },
  }))

  assert.equal(renderer.root.findAllByProps({ 'aria-label': '用户问题：待处理' }).length, 1)
  assert.equal(renderer.root.findAllByProps({ 'aria-label': '实时会话错误' }).length, 1)
  const output = JSON.stringify(renderer.toJSON())
  assert.match(output, /Which branch\?|main|Temporary failure|UPSTREAM/)
})

test('renders bounded live output separately and removes it after its durable turn ends', () => {
  const oversized = 'x'.repeat(MAX_LIVE_TEXT_LENGTH + 50)
  const live = {
    childSessionId: 'child-a',
    attemptId: 'attempt-1',
    turnId: 'turn-live',
    step: 2,
    text: oversized,
    truncated: false,
  }
  const renderer = TestRenderer.create(React.createElement(TranscriptView, {
    events: [message(1, 'turn-live', 'user', [textPart('go')], 'user')],
    live,
  }))
  const liveRow = renderer.root.findByProps({ 'data-transcript-live': true })

  assert.equal(liveRow.props.role, 'status')
  assert.equal(liveRow.props['aria-live'], 'polite')
  assert.equal(liveRow.props['aria-label'], '助手正在回复')
  assert.equal(liveRow.findByType('p').children.join('').length, MAX_LIVE_TEXT_LENGTH)
  assert.match(JSON.stringify(renderer.toJSON()), /较早的实时输出已截断/)

  renderer.update(React.createElement(TranscriptView, {
    events: [
      message(1, 'turn-live', 'user', [textPart('go')], 'user'),
      message(2, 'turn-live', 'assistant', [textPart('settled')], 'assistant'),
      { seq: 3, kind: 'turn-end', turnId: 'turn-live', reason: 'completed' },
    ],
    live,
  }))

  assert.equal(renderer.root.findAllByProps({ 'data-transcript-live': true }).length, 0)
  assert.match(JSON.stringify(renderer.toJSON()), /settled/)
})

test('tolerates absent or empty live snapshots without adding a live row', () => {
  for (const live of [undefined, null, '', { text: '' }]) {
    const renderer = TestRenderer.create(React.createElement(TranscriptView, { events: [], live }))
    assert.equal(renderer.root.findAllByProps({ 'data-transcript-live': true }).length, 0)
  }
})
