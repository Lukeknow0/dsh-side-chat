import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import { SidechatComposer } from '../../src/client/SidechatComposer.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

function button(root, label) {
  return root.findAllByType('button').find((node) => node.children.join('') === label)
}

function text(renderer) {
  return JSON.stringify(renderer.toJSON())
}

const emptyProps = {
  draft: '',
  onDraftChange() {},
  requestScope: '["parent-a","child-a"]',
  childStatus: 'idle',
  pendingQuestions: [],
  approvals: [],
}

test('keeps the draft controlled, rejects blank text, and guards duplicate async submits', async () => {
  const pending = deferred()
  const drafts = []
  const submissions = []
  const props = {
    ...emptyProps,
    draft: '  hello child  ',
    onDraftChange(value) { drafts.push(value) },
    onSubmit(textValue, requestId) {
      submissions.push([textValue, requestId])
      return pending.promise
    },
  }
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, props))
  const textarea = renderer.root.findByProps({ 'aria-label': '侧聊消息' })
  let firstSubmit

  await act(async () => textarea.props.onChange({ target: { value: 'next draft' } }))
  assert.deepEqual(drafts, ['next draft'])
  assert.equal(textarea.props.value, '  hello child  ')

  await act(async () => {
    firstSubmit = renderer.root.findByType('form').props.onSubmit({ preventDefault() {} })
    renderer.root.findByType('form').props.onSubmit({ preventDefault() {} })
    await Promise.resolve()
  })
  assert.equal(submissions.length, 1)
  assert.equal(submissions[0][0], 'hello child')
  assert.match(submissions[0][1], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(button(renderer.root, '发送').props.disabled, true)
  assert.match(text(renderer), /正在发送/)

  await act(async () => {
    pending.resolve()
    await firstSubmit
  })
  assert.equal(button(renderer.root, '发送').props.disabled, false)
  assert.equal(renderer.root.findByProps({ 'aria-label': '侧聊消息' }).props.value, '  hello child  ')

  await act(async () => renderer.update(React.createElement(SidechatComposer, {
    ...props,
    draft: '   ',
  })))
  assert.equal(button(renderer.root, '发送').props.disabled, true)
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.equal(submissions.length, 1)
})

test('network retry preserves the controlled draft and reuses its secure request ID', async () => {
  const attempts = []
  let fail = true
  const props = {
    ...emptyProps,
    draft: 'retry me',
    async onSubmit(textValue, requestId) {
      attempts.push([textValue, requestId])
      if (fail) {
        fail = false
        throw new Error('temporary network failure')
      }
    },
  }
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, props))

  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.equal(attempts.length, 1)
  assert.match(attempts[0][1], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.match(text(renderer), /temporary network failure/)
  assert.equal(renderer.root.findByProps({ 'aria-label': '侧聊消息' }).props.value, 'retry me')

  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.equal(attempts.length, 2)
  assert.equal(attempts[1][1], attempts[0][1])
  assert.equal(renderer.root.findByProps({ 'aria-label': '侧聊消息' }).props.value, 'retry me')

  await act(async () => renderer.update(React.createElement(SidechatComposer, {
    ...props,
    draft: 'different draft',
  })))
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.equal(attempts.length, 3)
  assert.notEqual(attempts[2][1], attempts[0][1])
})

test('keeps failed request IDs isolated by request scope across child switches', async () => {
  const attempts = []
  const props = {
    ...emptyProps,
    draft: 'identical text',
    async onSubmit(textValue, requestId) {
      attempts.push([textValue, requestId])
      if (attempts.length <= 2) throw new Error('temporary failure')
    },
  }
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, {
    ...props,
    requestScope: '["parent-a","child-a"]',
  }))

  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  const childARequestId = attempts[0][1]

  await act(async () => renderer.update(React.createElement(SidechatComposer, {
    ...props,
    requestScope: '["parent-a","child-b"]',
  })))
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  const childBRequestId = attempts[1][1]
  assert.notEqual(childBRequestId, childARequestId)

  await act(async () => renderer.update(React.createElement(SidechatComposer, {
    ...props,
    requestScope: '["parent-a","child-a"]',
  })))
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.equal(attempts[2][1], childARequestId)

  await act(async () => renderer.update(React.createElement(SidechatComposer, {
    ...props,
    requestScope: '["parent-a","child-b"]',
  })))
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.equal(attempts[3][1], childBRequestId)

  await act(async () => renderer.update(React.createElement(SidechatComposer, {
    ...props,
    requestScope: '["parent-a","child-a"]',
  })))
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.notEqual(attempts[4][1], childARequestId)
})

test('Enter submits while Shift+Enter and IME composition preserve text entry', async () => {
  const submissions = []
  const drafts = []
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, {
    ...emptyProps,
    draft: 'keyboard message',
    onDraftChange(value) { drafts.push(value) },
    onSubmit(textValue, requestId) { submissions.push([textValue, requestId]) },
  }))
  const textarea = renderer.root.findByProps({ 'aria-label': '侧聊消息' })
  let prevented = 0

  await act(async () => textarea.props.onKeyDown({
    key: 'Enter',
    shiftKey: false,
    nativeEvent: { isComposing: false },
    preventDefault() { prevented += 1 },
  }))
  assert.equal(prevented, 1)
  assert.equal(submissions.length, 1)
  assert.equal(submissions[0][0], 'keyboard message')

  await act(async () => textarea.props.onKeyDown({
    key: 'Enter',
    shiftKey: true,
    nativeEvent: { isComposing: false },
    preventDefault() { prevented += 1 },
  }))
  await act(async () => textarea.props.onChange({ target: { value: 'keyboard message\nnext line' } }))
  assert.equal(prevented, 1)
  assert.deepEqual(drafts, ['keyboard message\nnext line'])
  assert.equal(submissions.length, 1)

  await act(async () => textarea.props.onCompositionStart())
  await act(async () => textarea.props.onKeyDown({
    key: 'Enter',
    shiftKey: false,
    nativeEvent: { isComposing: true },
    preventDefault() { prevented += 1 },
  }))
  await act(async () => textarea.props.onCompositionEnd())
  assert.equal(prevented, 1)
  assert.equal(submissions.length, 1)
})

test('explains why an archived child cannot accept another message', () => {
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, {
    ...emptyProps,
    draft: 'cannot send',
    childStatus: 'archived',
    onSubmit() {},
  }))

  assert.equal(button(renderer.root, '发送').props.disabled, true)
  assert.equal(renderer.root.findByProps({ 'aria-label': '侧聊消息' }).props.disabled, true)
  assert.match(renderer.root.findByProps({ role: 'status' }).children.join(''), /已归档/)
})

test('shows external sending state and offers one guarded cancel for a running child', async () => {
  const pending = deferred()
  let cancels = 0
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, {
    ...emptyProps,
    draft: 'queued',
    childStatus: 'running',
    sending: true,
    onCancel() {
      cancels += 1
      return pending.promise
    },
  }))

  assert.equal(button(renderer.root, '发送').props.disabled, true)
  assert.equal(renderer.root.findByProps({ 'aria-label': '侧聊消息' }).props.disabled, true)
  assert.match(text(renderer), /正在发送/)
  const stop = button(renderer.root, '停止')
  let firstCancel
  await act(async () => {
    firstCancel = stop.props.onClick()
    stop.props.onClick()
    await Promise.resolve()
  })
  assert.equal(cancels, 1)
  assert.equal(button(renderer.root, '停止').props.disabled, true)

  await act(async () => {
    pending.resolve()
    await firstCancel
  })
  assert.equal(button(renderer.root, '停止').props.disabled, false)
})

test('rejects incomplete option answers and submits the exact request answer shape', async () => {
  const calls = []
  const request = {
    childSessionId: 'child-a',
    requestId: 'question:1',
    truncated: true,
    questions: [{
      id: 'mode',
      header: '运行模式',
      question: '请选择模式',
      detail: '选择一个安全级别。',
      options: [
        { label: 'Safe', description: '只读操作' },
        { label: 'Fast', description: '允许写入' },
      ],
      multiSelect: false,
    }],
  }
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, {
    ...emptyProps,
    pendingQuestions: [request],
    onAnswerQuestion(requestId, answers) { calls.push([requestId, answers]) },
  }))

  assert.match(text(renderer), /运行模式/)
  assert.match(text(renderer), /选择一个安全级别/)
  assert.match(text(renderer), /只读操作/)
  assert.match(text(renderer), /部分问题内容已截断/)

  await act(async () => button(renderer.root, '提交回答').props.onClick())
  assert.deepEqual(calls, [])
  assert.match(renderer.root.findByProps({ role: 'alert' }).children.join(''), /请完成所有问题/)

  const safe = renderer.root.findAllByType('input').find((input) => input.props.value === 'Safe')
  await act(async () => safe.props.onChange({ target: { checked: true, value: 'Safe' } }))
  await act(async () => button(renderer.root, '提交回答').props.onClick())

  assert.deepEqual(calls, [[
    'question:1',
    [{ id: 'mode', selected: ['Safe'] }],
  ]])
})

test('supports bounded multi-select and free-text questions without fabricating Host state', async () => {
  const calls = []
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, {
    ...emptyProps,
    pendingQuestions: [{
      childSessionId: 'child-a',
      requestId: 'question:2',
      truncated: false,
      questions: [
        {
          id: 'features',
          question: '选择功能',
          options: [{ label: 'A' }, { label: 'B' }],
          multiSelect: true,
        },
        { id: 'note', question: '补充说明' },
      ],
    }],
    onAnswerQuestion(requestId, answers) { calls.push([requestId, answers]) },
  }))
  const inputs = renderer.root.findAllByType('input')
  const choiceA = inputs.find((input) => input.props.value === 'A')
  const choiceB = inputs.find((input) => input.props.value === 'B')
  const note = inputs.find((input) => input.props['aria-label'] === '补充说明')

  await act(async () => choiceA.props.onChange({ target: { checked: true, value: 'A' } }))
  await act(async () => choiceB.props.onChange({ target: { checked: true, value: 'B' } }))
  await act(async () => note.props.onChange({ target: { value: '  details  ' } }))
  await act(async () => button(renderer.root, '提交回答').props.onClick())

  assert.deepEqual(calls, [[
    'question:2',
    [
      { id: 'features', selected: ['A', 'B'] },
      { id: 'note', selected: [], custom: 'details' },
    ],
  ]])
  assert.match(text(renderer), /选择功能/)
})

test('renders approval lifecycle rows and guards exact approval decisions', async () => {
  const pending = deferred()
  const calls = []
  const approvals = [
    { interactionId: 'approval-1', prompt: 'Allow shell?', state: 'pending' },
    { interactionId: 'approval-2', prompt: 'Old approval', state: 'resolved' },
    { interactionId: 'approval-3', prompt: 'Expired approval', state: 'expired' },
  ]
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, {
    ...emptyProps,
    approvals,
    onResolveApproval(interactionId, decision) {
      calls.push([interactionId, decision])
      return pending.promise
    },
  }))

  assert.match(text(renderer), /Allow shell/)
  assert.match(text(renderer), /已处理/)
  assert.match(text(renderer), /已过期/)
  assert.equal(renderer.root.findAllByProps({ 'aria-label': '审批请求' }).length, 3)
  let firstDecision
  await act(async () => {
    firstDecision = button(renderer.root, '批准').props.onClick()
    button(renderer.root, '批准').props.onClick()
    await Promise.resolve()
  })
  assert.deepEqual(calls, [['approval-1', 'allowed-once']])
  assert.equal(button(renderer.root, '批准').props.disabled, true)
  assert.equal(button(renderer.root, '拒绝').props.disabled, true)

  await act(async () => {
    pending.resolve()
    await firstDecision
  })
})

test('surfaces supplied and callback errors accessibly', async () => {
  const renderer = TestRenderer.create(React.createElement(SidechatComposer, {
    ...emptyProps,
    draft: 'hello',
    error: 'connection unavailable',
    async onSubmit() { throw new Error('send rejected') },
  }))

  assert.match(text(renderer), /connection unavailable/)
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  const alerts = renderer.root.findAllByProps({ role: 'alert' })
  assert.equal(alerts.some((alert) => alert.children.join('').includes('send rejected')), true)
})
