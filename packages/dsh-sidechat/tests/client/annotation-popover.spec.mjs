import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import { AnnotationPopover } from '../../src/client/annotations/AnnotationPopover.js'

function button(root, label) {
  return root.findAllByType('button').find((node) => node.children.join('') === label)
}

test('renders nothing while hidden', () => {
  const renderer = TestRenderer.create(React.createElement(AnnotationPopover, {
    quote: 'selected quote',
    visible: false,
    onSave() { throw new Error('must not save') },
    onClose() { throw new Error('must not close') },
  }))

  assert.equal(renderer.toJSON(), null)
})

test('renders an accessible quote dialog and disables empty comments', async () => {
  const renderer = TestRenderer.create(React.createElement(AnnotationPopover, {
    quote: 'selected quote',
    onSave() {},
    onClose() {},
  }))
  const root = renderer.root

  assert.equal(root.findByProps({ role: 'dialog' }).props['aria-label'], '添加划选注释')
  assert.equal(root.findByProps({ 'aria-label': '划选引文' }).children.join(''), 'selected quote')
  const textarea = root.findByProps({ 'aria-label': '注释内容' })
  assert.equal(textarea.props.value, '')
  assert.equal(button(root, '保存').props.disabled, true)

  await act(async () => textarea.props.onChange({ target: { value: '   ' } }))
  assert.equal(button(root, '保存').props.disabled, true)
})

test('submits a trimmed non-empty comment exactly once', async () => {
  const saved = []
  const renderer = TestRenderer.create(React.createElement(AnnotationPopover, {
    quote: 'selected quote',
    onSave(comment) { saved.push(comment) },
    onClose() {},
  }))

  await act(async () => renderer.root.findByProps({ 'aria-label': '注释内容' }).props.onChange({
    target: { value: '  useful note  ' },
  }))
  assert.equal(button(renderer.root, '保存').props.disabled, false)
  await act(async () => button(renderer.root, '保存').props.onClick())

  assert.deepEqual(saved, ['useful note'])
})

test('cancel and Escape close the popover while other keys do not', async () => {
  let closes = 0
  const renderer = TestRenderer.create(React.createElement(AnnotationPopover, {
    quote: 'selected quote',
    onSave() {},
    onClose() { closes += 1 },
  }))
  const dialog = renderer.root.findByProps({ role: 'dialog' })
  let prevented = 0
  let stopped = 0

  await act(async () => dialog.props.onKeyDown({
    key: 'Enter',
    preventDefault() { prevented += 1 },
    stopPropagation() { stopped += 1 },
  }))
  assert.equal(closes, 0)

  await act(async () => dialog.props.onKeyDown({
    key: 'Escape',
    preventDefault() { prevented += 1 },
    stopPropagation() { stopped += 1 },
  }))
  assert.equal(closes, 1)
  assert.equal(prevented, 1)
  assert.equal(stopped, 1)

  await act(async () => button(renderer.root, '取消').props.onClick())
  assert.equal(closes, 2)
})
