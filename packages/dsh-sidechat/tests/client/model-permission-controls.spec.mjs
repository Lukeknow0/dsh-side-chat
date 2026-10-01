import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import { ModelPermissionControls } from '../../src/client/ModelPermissionControls.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}

function text(renderer) {
  return JSON.stringify(renderer.toJSON())
}

const baseProps = {
  provider: 'provider-a',
  model: 'model-a',
  permission: 'ask',
  modelOptions: [
    { value: 'model-a', label: 'Model A' },
    { value: 'model-b', label: 'Model B' },
    {
      value: 'model-future',
      label: 'Future model',
      supported: false,
      explanation: '当前宿主版本不支持此模型。',
    },
  ],
  permissionOptions: [
    'ask',
    { value: 'allow', label: 'Allow tools' },
    {
      value: 'unrestricted',
      label: 'Unrestricted',
      supported: false,
      explanation: '此侧聊不能使用无限制权限。',
    },
  ],
}

test('shows current provider/model identity and explains every unsupported choice', () => {
  const renderer = TestRenderer.create(React.createElement(ModelPermissionControls, baseProps))
  const root = renderer.root
  const selects = root.findAllByType('select')
  const options = root.findAllByType('option')

  assert.match(text(renderer), /provider-a/)
  assert.match(text(renderer), /model-a/)
  assert.equal(selects[0].props.value, 'model-a')
  assert.equal(selects[1].props.value, 'ask')
  assert.equal(options.find((option) => option.props.value === 'model-future').props.disabled, true)
  assert.equal(options.find((option) => option.props.value === 'unrestricted').props.disabled, true)
  assert.match(text(renderer), /当前宿主版本不支持此模型/)
  assert.match(text(renderer), /此侧聊不能使用无限制权限/)
  assert.equal(root.findAllByProps({ 'aria-label': '不可用选项说明' }).length, 1)
})

test('awaits one controlled model change and blocks duplicate submissions while busy', async () => {
  const pending = deferred()
  const calls = []
  const props = {
    ...baseProps,
    async onModelChange(value) {
      calls.push(value)
      return pending.promise
    },
    async onPermissionChange() {},
  }
  const renderer = TestRenderer.create(React.createElement(ModelPermissionControls, props))
  const firstSelect = renderer.root.findByProps({ 'aria-label': '模型' })
  let firstChange

  await act(async () => {
    firstChange = firstSelect.props.onChange({ target: { value: 'model-b' } })
    firstSelect.props.onChange({ target: { value: 'model-b' } })
    await Promise.resolve()
  })

  assert.deepEqual(calls, ['model-b'])
  assert.equal(renderer.root.findAllByType('select').every((select) => select.props.disabled), true)
  assert.equal(renderer.root.findByProps({ role: 'status' }).props['aria-live'], 'polite')
  assert.match(text(renderer), /正在更新模型/)
  assert.equal(renderer.root.findByProps({ 'aria-label': '模型' }).props.value, 'model-a')

  await act(async () => {
    pending.resolve()
    await firstChange
  })

  assert.equal(renderer.root.findByProps({ 'aria-label': '模型' }).props.value, 'model-a')
  assert.equal(renderer.root.findAllByProps({ role: 'status' }).length, 0)

  await act(async () => {
    renderer.update(React.createElement(ModelPermissionControls, { ...props, model: 'model-b' }))
  })
  assert.equal(renderer.root.findByProps({ 'aria-label': '模型' }).props.value, 'model-b')
})

test('routes permission changes only to their callback and surfaces rejection accessibly', async () => {
  const calls = []
  const failure = new Error('permission update denied')
  const renderer = TestRenderer.create(React.createElement(ModelPermissionControls, {
    ...baseProps,
    onModelChange(value) { calls.push(['model', value]) },
    async onPermissionChange(value) {
      calls.push(['permission', value])
      throw failure
    },
  }))

  await act(async () => {
    await renderer.root.findByProps({ 'aria-label': '权限' }).props.onChange({ target: { value: 'allow' } })
  })

  assert.deepEqual(calls, [['permission', 'allow']])
  const alert = renderer.root.findByProps({ role: 'alert' })
  assert.equal(alert.props['aria-live'], 'assertive')
  assert.match(alert.children.join(''), /permission update denied/)
  assert.equal(renderer.root.findAllByType('select').every((select) => !select.props.disabled), true)
  assert.equal(renderer.root.findByProps({ 'aria-label': '权限' }).props.value, 'ask')
})

test('global disabled and external busy states show explanations and never invoke callbacks', async () => {
  const calls = []
  const callbacks = {
    onModelChange(value) { calls.push(['model', value]) },
    onPermissionChange(value) { calls.push(['permission', value]) },
  }
  const renderer = TestRenderer.create(React.createElement(ModelPermissionControls, {
    ...baseProps,
    ...callbacks,
    disabled: true,
    disabledExplanation: '会话已归档，设置不可更改。',
  }))

  const disabledModel = renderer.root.findByProps({ 'aria-label': '模型' })
  const disabledPermission = renderer.root.findByProps({ 'aria-label': '权限' })
  assert.equal(disabledModel.props.disabled, true)
  assert.equal(disabledPermission.props.disabled, true)
  assert.match(text(renderer), /会话已归档，设置不可更改/)
  await act(async () => {
    await disabledModel.props.onChange({ target: { value: 'model-b' } })
    await disabledPermission.props.onChange({ target: { value: 'allow' } })
  })
  assert.deepEqual(calls, [])

  await act(async () => {
    renderer.update(React.createElement(ModelPermissionControls, {
      ...baseProps,
      ...callbacks,
      busy: true,
      busyExplanation: '正在同步宿主设置。',
    }))
  })
  assert.equal(renderer.root.findAllByType('select').every((select) => select.props.disabled), true)
  assert.match(text(renderer), /正在同步宿主设置/)
})

test('missing callbacks and unsupported option events remain inert with a clear explanation', async () => {
  const calls = []
  const renderer = TestRenderer.create(React.createElement(ModelPermissionControls, {
    ...baseProps,
    onModelChange(value) { calls.push(value) },
  }))
  const modelSelect = renderer.root.findByProps({ 'aria-label': '模型' })
  const permissionSelect = renderer.root.findByProps({ 'aria-label': '权限' })

  assert.equal(permissionSelect.props.disabled, true)
  assert.match(text(renderer), /当前宿主不支持更改权限/)
  await act(async () => {
    await modelSelect.props.onChange({ target: { value: 'model-future' } })
    await permissionSelect.props.onChange({ target: { value: 'allow' } })
  })
  assert.deepEqual(calls, [])
})
