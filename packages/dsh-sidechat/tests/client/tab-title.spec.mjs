import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createSidechatThreadState } from '../../src/client/state.js'

const loadTitle = () => import('../../src/client/SidechatTabTitle.js').catch(() => ({}))

test('native title distinguishes a blank page from a bound conversation and follows local labels', async () => {
  const { SidechatTabTitle } = await loadTitle()
  assert.equal(typeof SidechatTabTitle, 'function')
  const state = createSidechatThreadState()
  const info = { tab: { contentId: 'sidebar://dsh-sidechat/new-a' } }
  const props = { state, parentSessionId: 'parent-a', useTabInfo: () => info }
  let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(SidechatTabTitle, props)) })
  assert.equal(renderer.toJSON(), '新侧聊')
  await act(async () => {
    state.bindTab('parent-a', info.tab.contentId, 'a-new')
    state.setLabel('parent-a', 'a-new', 'Discuss native tabs')
  })
  assert.equal(renderer.toJSON(), 'Discuss native tabs')
  info.tab.contentId = 'dsh-resource://dsh-sidechat/a-new'
  await act(async () => renderer.update(React.createElement(SidechatTabTitle, props)))
  assert.equal(renderer.toJSON(), 'Discuss native tabs')
  await act(async () => renderer.unmount())
})
