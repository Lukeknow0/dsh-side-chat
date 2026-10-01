import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'

import { SideChatPanel } from '../../src/client/SideChatPanel.js'
import { SidechatComposer } from '../../src/client/SidechatComposer.js'
import { createSidechatThreadState } from '../../src/client/state.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
}
const address = (id) => `dsh-resource://dsh-sidechat/${encodeURIComponent(id)}`
const button = (root, label) => root.findAllByType('button').find((node) => node.children.join('') === label)
const text = (renderer) => JSON.stringify(renderer.toJSON())
const row = (parentSessionId, childSessionId, title = '', createdAt = 1) => ({ parentSessionId, childSessionId, title, status: 'idle', createdAt, updatedAt: createdAt })

function fixture() {
  const calls = []
  const rows = {
    'parent-a': [row('parent-a', 'a-1', 'A one'), row('parent-a', 'a-2', 'A two', 2)],
    'parent-b': [row('parent-b', 'b-1', 'B one')],
  }
  let nextChild = 0
  const api = {
    async list(parent) { calls.push(['list', parent]); return { threads: rows[parent] ?? [] } },
    async start(parent) {
      calls.push(['start', parent])
      const childSessionId = `${parent}-new-${++nextChild}`
      rows[parent] = [...(rows[parent] ?? []), row(parent, childSessionId, '', 3 + nextChild)]
      return { childSessionId }
    },
    async prompt(...args) { calls.push(['prompt', ...args]); return { accepted: true } },
    async cancel(...args) { calls.push(['cancel', ...args]); return { accepted: true } },
    async rename(...args) { calls.push(['rename', ...args]); return { ok: true } },
    async archive(...args) { calls.push(['archive', ...args]); return { ok: true } },
  }
  return { api, calls, rows, state: createSidechatThreadState({ storage: memoryStorage() }) }
}

function nativeTab(contentId) {
  const controller = new AbortController()
  const navigations = []
  const info = {
    tab: {
      contentId,
      visible: true,
      signal: controller.signal,
      actions: { openResource: (...args) => navigations.push(args) },
    },
  }
  return { info, navigations, controller, useTabInfo: () => info }
}
async function render(props) {
  let renderer
  await act(async () => { renderer = TestRenderer.create(React.createElement(SideChatPanel, props)) })
  return renderer
}
async function draft(renderer, value) {
  await act(async () => renderer.root.findByProps({ 'aria-label': '侧聊消息' }).props.onChange({ target: { value } }))
}
async function submit(renderer) {
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
}
function feedFixture(initialChild = 'a-1', overrides = {}) {
  const targets = []
  let disposed = 0
  let notify = () => {}
  let snapshot = { childSessionId: initialChild, events: [], live: null, transient: { questions: [], error: null }, error: undefined, polling: true, revision: 1, ...overrides }
  const feed = {
    setTarget(child, visible) {
      targets.push([child, visible])
      if (child !== snapshot.childSessionId) { snapshot = { ...snapshot, childSessionId: child, revision: snapshot.revision + 1 }; notify() }
    },
    subscribe(listener) { notify = listener; return () => { notify = () => {} } },
    getSnapshot: () => snapshot,
    dispose() { disposed += 1 },
  }
  return { feed, targets, get disposed() { return disposed }, update(patch) { snapshot = { ...snapshot, ...patch, revision: snapshot.revision + 1 }; notify() } }
}

test('initial list failure exposes retry without creating a child', async () => {
  const f = fixture()
  f.api.list = async () => { throw new Error('list unavailable') }
  const tab = nativeTab('sidebar://dsh-sidechat/new-a')
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  assert.match(text(renderer), /list unavailable/)
  assert.ok(button(renderer.root, '重试'))
  assert.equal(f.calls.some(([method]) => method === 'start'), false)
  f.api.list = async () => ({ threads: f.rows['parent-a'] })
  await act(async () => button(renderer.root, '重试').props.onClick())
  assert.ok(renderer.root.findByProps({ 'aria-label': '侧聊消息' }))
})

test('older successful list is accepted when a newer concurrent list fails', async () => {
  const f = fixture()
  const requests = []
  f.api.list = () => new Promise((resolve, reject) => requests.push({ resolve, reject }))
  const first = await render({ ...f, parentSessionId: 'parent-a' })
  const second = await render({ ...f, parentSessionId: 'parent-a' })
  await act(async () => requests[1].reject(new Error('newer failed')))
  await act(async () => requests[0].resolve({ threads: f.rows['parent-a'] }))
  assert.equal(f.state.selected('parent-a'), 'a-1')
  assert.match(text(first), /A one/)
  assert.match(text(second), /newer failed/)
})

test('a resource tab displays only its own child, not a second history navigation', async () => {
  const f = fixture()
  const tab = nativeTab(address('a-2'))
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  assert.equal(renderer.root.findByProps({ 'data-sidechat-panel': true }).props['data-selected-child-session-id'], 'a-2')
  assert.equal(renderer.root.findAllByProps({ 'data-selected-child': true }).length, 1)
  assert.match(text(renderer), /A two/)
  assert.doesNotMatch(text(renderer), /A one/)
  assert.equal(renderer.root.findAllByProps({ 'aria-label': '侧聊历史' }).length, 0)
})

test('ID, rename, archive and nested new controls are absent from the whole panel', async () => {
  const f = fixture()
  const tab = nativeTab(address('a-1'))
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  for (const label of ['复制主会话 ID', '复制侧聊 ID', '重命名', '保存名称', '归档', '新建侧聊']) assert.equal(Boolean(button(renderer.root, label)), false, `${label} must be removed`)
  assert.doesNotMatch(text(renderer), /主会话 ID|侧聊 ID/)
  assert.equal(renderer.root.findAllByProps({ 'aria-label': '侧聊名称' }).length, 0)
  assert.equal(f.calls.some(([method]) => ['rename', 'archive'].includes(method)), false)
})

test('a new native page stays blank and offers existing history without forking', async () => {
  const f = fixture()
  const tab = nativeTab('sidebar://dsh-sidechat/new-a')
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  assert.equal(renderer.root.findAllByProps({ 'data-selected-child': true }).length, 0)
  assert.ok(button(renderer.root, 'A one'))
  assert.equal(f.calls.some(([method]) => method === 'start'), false)
  assert.doesNotMatch(text(renderer), /关闭应用后会消失/)
})

test('recovering a closed conversation reveals its stable native address without creating or mutating it', async () => {
  const f = fixture()
  const tab = nativeTab('sidebar://dsh-sidechat/new-a')
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  await act(async () => button(renderer.root, 'A two').props.onClick())
  assert.deepEqual(tab.navigations, [[address('a-2'), { replaceTab: true }]])
  assert.equal(f.calls.some(([method]) => ['start', 'rename', 'archive', 'cancel'].includes(method)), false)
})

test('two blank native pages preserve independent drafts', async () => {
  const f = fixture()
  const a = nativeTab('sidebar://dsh-sidechat/new-a')
  const b = nativeTab('sidebar://dsh-sidechat/new-b')
  const first = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: a.useTabInfo })
  const second = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: b.useTabInfo })
  await draft(first, 'first tab draft')
  await draft(second, 'second tab draft')
  assert.equal(first.root.findByProps({ 'aria-label': '侧聊消息' }).props.value, 'first tab draft')
  assert.equal(second.root.findByProps({ 'aria-label': '侧聊消息' }).props.value, 'second tab draft')
})

test('first submission forks once, sends to that child and replaces only its native page', async () => {
  const f = fixture()
  const tab = nativeTab('sidebar://dsh-sidechat/new-a')
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  await draft(renderer, 'Discuss native tabs')
  await submit(renderer)
  const child = 'parent-a-new-1'
  assert.deepEqual(f.calls.filter(([method]) => method === 'start'), [['start', 'parent-a']])
  const prompt = f.calls.find(([method]) => method === 'prompt')
  assert.equal(prompt[1], child)
  assert.equal(typeof prompt[2], 'string')
  assert.deepEqual(prompt[3], [{ type: 'text', text: 'Discuss native tabs' }])
  assert.deepEqual(tab.navigations, [[address(child), { replaceTab: true }]])
  assert.equal(f.state.tabChild('parent-a', tab.info.tab.contentId), child)
  assert.equal(f.state.label('parent-a', child), 'Discuss native tabs')
  assert.equal(f.state.draft('parent-a', child), '')
})

test('duplicate first submission while the fork is pending does not create or send twice', async () => {
  const f = fixture()
  let finish
  f.api.start = async (parent) => { f.calls.push(['start', parent]); return new Promise((resolve) => { finish = resolve }) }
  const tab = nativeTab('sidebar://dsh-sidechat/new-a')
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  await draft(renderer, 'one request')
  let pending
  await act(async () => {
    pending = renderer.root.findByType('form').props.onSubmit({ preventDefault() {} })
    renderer.root.findByType('form').props.onSubmit({ preventDefault() {} })
  })
  assert.equal(f.calls.filter(([method]) => method === 'start').length, 1)
  await act(async () => { finish({ childSessionId: 'a-created' }); await pending })
  assert.equal(f.calls.filter(([method]) => method === 'prompt').length, 1)
})

test('first prompt failure reuses both its successful fork and prompt request ID', async () => {
  const f = fixture()
  f.api.prompt = async (...args) => {
    f.calls.push(['prompt', ...args])
    if (f.calls.filter(([method]) => method === 'prompt').length === 1) throw new Error('network unavailable')
    return { accepted: true }
  }
  const tab = nativeTab('sidebar://dsh-sidechat/new-a')
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  await draft(renderer, 'retry me')
  await submit(renderer)
  assert.equal(renderer.root.findByProps({ 'aria-label': '侧聊消息' }).props.value, 'retry me')
  assert.match(text(renderer), /network unavailable/)
  await submit(renderer)
  const prompts = f.calls.filter(([method]) => method === 'prompt')
  assert.equal(f.calls.filter(([method]) => method === 'start').length, 1)
  assert.equal(prompts.length, 2)
  assert.equal(prompts[0][1], prompts[1][1])
  assert.equal(prompts[0][2], prompts[1][2])
  assert.equal(tab.navigations.length, 1)
})

test('two native conversation pages route prompts independently of shared last-selection state', async () => {
  const f = fixture()
  const a = nativeTab(address('a-1'))
  const b = nativeTab(address('a-2'))
  const first = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: a.useTabInfo })
  const second = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: b.useTabInfo })
  await draft(first, 'question one')
  await draft(second, 'question two')
  await act(async () => f.state.select('parent-a', 'a-2', f.rows['parent-a']))
  await submit(first)
  await submit(second)
  assert.deepEqual(f.calls.filter(([method]) => method === 'prompt').map((call) => [call[1], call[3][0].text]), [['a-1', 'question one'], ['a-2', 'question two']])
})

test('a resource from another parent is not displayed, polled or silently replaced by that parent current child', async () => {
  const f = fixture()
  const tab = nativeTab(address('a-1'))
  const feed = feedFixture()
  const renderer = await render({ ...f, parentSessionId: 'parent-b', useTabInfo: tab.useTabInfo, eventFeedFactory: () => feed.feed })
  assert.equal(renderer.root.findAllByProps({ 'data-selected-child': true }).length, 0)
  assert.doesNotMatch(text(renderer), /A one|B one/)
  assert.ok(feed.targets.every(([child]) => child === undefined))
  assert.equal(renderer.root.findAllByType('form').length, 0)
})

test('switching to a loading parent hides prior content immediately', async () => {
  const f = fixture()
  let finish
  f.api.list = async (parent) => parent === 'parent-a' ? { threads: f.rows[parent] } : new Promise((resolve) => { finish = resolve })
  const renderer = await render({ ...f, parentSessionId: 'parent-a' })
  await act(async () => renderer.update(React.createElement(SideChatPanel, { ...f, parentSessionId: 'parent-b' })))
  assert.doesNotMatch(text(renderer), /A one|A two/)
  assert.match(text(renderer), /正在加载侧聊/)
  await act(async () => finish({ threads: f.rows['parent-b'] }))
})

test('legacy singleton restores each parent selection without cancellation', async () => {
  const f = fixture()
  const renderer = await render({ ...f, parentSessionId: 'parent-a' })
  await act(async () => f.state.select('parent-a', 'a-2', f.rows['parent-a']))
  await act(async () => renderer.update(React.createElement(SideChatPanel, { ...f, parentSessionId: 'parent-b' })))
  await act(async () => renderer.update(React.createElement(SideChatPanel, { ...f, parentSessionId: 'parent-a' })))
  assert.equal(f.state.selected('parent-a'), 'a-2')
  assert.match(text(renderer), /A two/)
  assert.equal(f.calls.some(([method]) => method === 'cancel'), false)
})

test('visible transcript follows only its native child, stops on hide and disposes on close', async () => {
  const f = fixture()
  const tab = nativeTab(address('a-1'))
  const feed = feedFixture('a-1', {
    events: [{ seq: 1, kind: 'message', turnId: '1', role: 'assistant', source: 'assistant', content: [{ type: 'text', text: 'Durable answer' }] }],
    live: { childSessionId: 'a-1', attemptId: 'attempt-2', turnId: '2', step: 0, text: 'Live answer', truncated: false },
  })
  const props = { ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo, eventFeedFactory: () => feed.feed }
  const renderer = await render(props)
  assert.match(text(renderer), /Durable answer/)
  assert.match(text(renderer), /Live answer/)
  assert.deepEqual(feed.targets.at(-1), ['a-1', true])
  tab.info.tab.visible = false
  await act(async () => renderer.update(React.createElement(SideChatPanel, props)))
  assert.equal(feed.targets.at(-1)[1], false)
  await act(async () => renderer.unmount())
  assert.equal(feed.disposed, 1)
  assert.equal(f.calls.some(([method]) => ['archive', 'cancel'].includes(method)), false)
})

test('closing a page during first send retains its child and never reopens the closed tab', async () => {
  const f = fixture()
  let finish
  f.api.start = async (parent) => { f.calls.push(['start', parent]); return new Promise((resolve) => { finish = resolve }) }
  const tab = nativeTab('sidebar://dsh-sidechat/new-a')
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  await draft(renderer, 'background request')
  let pending
  await act(async () => { pending = renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
  tab.controller.abort()
  await act(async () => renderer.unmount())
  await act(async () => { finish({ childSessionId: 'a-background' }); await pending })
  assert.equal(f.state.tabChild('parent-a', tab.info.tab.contentId), 'a-background')
  assert.equal(tab.navigations.length, 0)
  assert.equal(f.calls.some(([method]) => ['archive', 'cancel'].includes(method)), false)
})

test('in-flight submit clears only the addressed child draft after acceptance', async () => {
  const f = fixture()
  let finish
  f.api.prompt = (...args) => { f.calls.push(['prompt', ...args]); return new Promise((resolve) => { finish = resolve }) }
  f.state.setDraft('parent-a', 'a-1', 'first child draft')
  f.state.setDraft('parent-a', 'a-2', 'second child draft')
  const tab = nativeTab(address('a-1'))
  const props = { ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo }
  const renderer = await render(props)
  let pending
  await act(async () => { pending = renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
  tab.info.tab.contentId = address('a-2')
  await act(async () => renderer.update(React.createElement(SideChatPanel, props)))
  assert.equal(renderer.root.findByProps({ 'aria-label': '侧聊消息' }).props.value, 'second child draft')
  await act(async () => { finish({ accepted: true }); await pending })
  assert.equal(f.state.draft('parent-a', 'a-1'), '')
  assert.equal(f.state.draft('parent-a', 'a-2'), 'second child draft')
  assert.equal(f.calls.find(([method]) => method === 'prompt')[1], 'a-1')
})

test('retry request IDs remain scoped to the native conversation across switches', async () => {
  const f = fixture()
  f.state.setDraft('parent-a', 'a-1', 'same draft')
  f.state.setDraft('parent-a', 'a-2', 'same draft')
  f.api.prompt = async (...args) => {
    f.calls.push(['prompt', ...args])
    if (f.calls.filter(([method, child]) => method === 'prompt' && child === args[0]).length === 1) throw new Error('try again')
    return { accepted: true }
  }
  const tab = nativeTab(address('a-1'))
  const props = { ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo }
  const renderer = await render(props)
  for (const child of ['a-1', 'a-2', 'a-1', 'a-2']) {
    tab.info.tab.contentId = address(child)
    await act(async () => renderer.update(React.createElement(SideChatPanel, props)))
    await submit(renderer)
  }
  const a = f.calls.filter(([method, child]) => method === 'prompt' && child === 'a-1')
  const b = f.calls.filter(([method, child]) => method === 'prompt' && child === 'a-2')
  assert.equal(a.length, 2)
  assert.equal(b.length, 2)
  assert.equal(a[0][2], a[1][2])
  assert.equal(b[0][2], b[1][2])
  assert.notEqual(a[0][2], b[0][2])
})

test('hiding and showing an existing resource tab retains prompt retry ID across background list refreshes', async () => {
  const f = fixture()
  f.state.setDraft('parent-a', 'a-1', 'transient error prompt')
  let finishList
  const origList = f.api.list
  f.api.list = async (p) => {
    if (f.calls.filter(([m]) => m === 'list').length > 1) {
      return new Promise((resolve) => { finishList = resolve })
    }
    return origList(p)
  }
  f.api.prompt = async (...args) => {
    f.calls.push(['prompt', ...args])
    if (f.calls.filter(([m]) => m === 'prompt').length === 1) throw new Error('response lost')
    return { accepted: true }
  }
  const tab = nativeTab(address('a-1'))
  const props = { ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo }
  const renderer = await render(props)
  await submit(renderer)
  assert.match(text(renderer), /response lost/)

  // Hide the tab, then reveal it again while list refresh is still in flight
  tab.info.tab.visible = false
  await act(async () => renderer.update(React.createElement(SideChatPanel, props)))
  tab.info.tab.visible = true
  await act(async () => renderer.update(React.createElement(SideChatPanel, props)))

  // Retrying the same prompt should reuse the prompt request ID without remounting or losing state
  await submit(renderer)
  const prompts = f.calls.filter(([m]) => m === 'prompt')
  assert.equal(prompts.length, 2)
  assert.equal(prompts[0][2], prompts[1][2])

  if (finishList) finishList({ threads: f.rows['parent-a'] })
})

test('stale pendingConfiguration is not reapplied when child permission is modified after fork', async () => {
  const f = fixture()
  let currentPermission = 'workspace-write'
  const appliedPermissions = []
  f.api.configurationCatalogs = async () => ({
    models: { groups: [] },
    permissions: { options: [{ value: 'workspace-write', name: 'Workspace write' }, { value: 'danger-full-access', name: 'Full access' }] },
    agentPresets: { presets: [] },
  })
  f.api.configuration = async () => ({ model: undefined, permission: currentPermission })
  f.api.selectModel = async () => ({})
  f.api.selectPermission = async (child, preset) => {
    appliedPermissions.push(preset)
    currentPermission = preset
    return { selected: preset }
  }
  const tab = nativeTab('sidebar://dsh-sidechat/new-perm')
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo, confirmRisk: () => true })

  // Set initial permission on blank page
  await act(async () => renderer.root.findByType(SidechatComposer).props.onPermissionChange('danger-full-access'))
  await draft(renderer, 'first message')
  await submit(renderer)

  // Forked child now exists with danger-full-access. Now explicitly switch child to workspace-write
  await act(async () => renderer.root.findByType(SidechatComposer).props.onPermissionChange('workspace-write'))
  assert.equal(currentPermission, 'workspace-write')

  // Send second message on same tab/child
  await draft(renderer, 'second message')
  await submit(renderer)

  // Danger full access must not have been reapplied by stale initialConfiguration
  assert.equal(appliedPermissions.at(-1), 'workspace-write')
})

test('failed initial model selection is reapplied on prompt retry until successful', async () => {
  const f = fixture()
  const modelCalls = []
  let selectModelAttempts = 0
  f.api.configurationCatalogs = async () => ({
    models: { groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'chat', name: 'Chat' }, { id: 'reasoner', name: 'Reasoner' }] }] },
    permissions: { options: [{ value: 'workspace-write', name: 'Workspace write' }] },
    agentPresets: { presets: [] },
  })
  f.api.configuration = async () => ({ model: { provider: 'deepseek', model: 'chat' }, permission: 'workspace-write' })
  f.api.selectPermission = async () => ({})
  f.api.selectModel = async (child, selection) => {
    modelCalls.push(selection.model)
    selectModelAttempts += 1
    if (selectModelAttempts === 1) throw new Error('model selection timeout')
    return { selected: selection }
  }
  const tab = nativeTab('sidebar://dsh-sidechat/new-retry-model')
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo })
  await act(async () => { await Promise.resolve() })

  // Choose Reasoner on blank page
  await act(async () => renderer.root.findByType(SidechatComposer).props.onModelChange('deepseek/reasoner'))
  await draft(renderer, 'first attempt')
  await submit(renderer)

  // First attempt fails during selectModel
  assert.equal(modelCalls.length, 1)
  assert.equal(modelCalls[0], 'reasoner')
  assert.equal(f.calls.filter(([m]) => m === 'prompt').length, 0)

  // Retry sending the message: must re-attempt selectModel and then prompt
  await submit(renderer)
  assert.equal(modelCalls.length, 2)
  assert.equal(modelCalls[1], 'reasoner')
  assert.equal(f.calls.filter(([m]) => m === 'prompt').length, 1)
})

test('running child cancellation is explicit and stays child-scoped', async () => {
  const f = fixture()
  const tab = nativeTab(address('a-2'))
  const feed = feedFixture('a-2', { events: [{ seq: 1, kind: 'turn-start', turnId: '1' }] })
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo, eventFeedFactory: () => feed.feed })
  await act(async () => button(renderer.root, '停止').props.onClick())
  assert.deepEqual(f.calls.find(([method]) => method === 'cancel'), ['cancel', 'a-2'])
})

test('question answers and approvals route only to the native child', async () => {
  const f = fixture()
  f.api.answerQuestion = async (...args) => { f.calls.push(['answerQuestion', ...args]); return { answered: true } }
  f.api.resolveApproval = async (...args) => { f.calls.push(['resolveApproval', ...args]); return { resolved: true } }
  const tab = nativeTab(address('a-2'))
  const feed = feedFixture('a-2', {
    events: [{ seq: 1, kind: 'interaction', turnId: '1', interactionId: 'approval:1', interactionKind: 'approval', state: 'pending', prompt: 'Allow tool use?' }],
    transient: { questions: [{ childSessionId: 'a-2', requestId: 'question:1', questions: [{ id: 'q1', question: 'Continue?', options: [{ label: 'Yes' }, { label: 'No' }] }], truncated: false }], error: null },
  })
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo, eventFeedFactory: () => feed.feed })
  const yes = renderer.root.findAllByType('input').find((node) => node.props.value === 'Yes')
  await act(async () => yes.props.onChange({ target: { checked: true } }))
  await act(async () => button(renderer.root, '提交回答').props.onClick())
  await act(async () => button(renderer.root, '批准').props.onClick())
  assert.deepEqual(f.calls.filter(([method]) => ['answerQuestion', 'resolveApproval'].includes(method)), [
    ['answerQuestion', 'a-2', 'question:1', [{ id: 'q1', selected: ['Yes'] }]],
    ['resolveApproval', 'a-2', 'approval:1', 'allowed-once'],
  ])
})

test('model and permission settings still address only their native child', async () => {
  const f = fixture()
  let configuration = { model: { provider: 'deepseek', model: 'chat' }, permission: 'workspace-write', agentPreset: 'default' }
  Object.assign(f.api, {
    async configurationCatalogs() { return {
      models: { groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'chat', name: 'Chat' }, { id: 'reasoner', name: 'Reasoner' }] }] },
      permissions: { options: [{ value: 'workspace-write', name: 'Workspace write' }, { value: 'danger-full-access', name: 'Full access' }] },
      agentPresets: { presets: [{ id: 'default', name: 'Default' }] },
    } },
    async configuration(child) { f.calls.push(['configuration', child]); return configuration },
    async selectModel(child, selection) { f.calls.push(['selectModel', child, selection]); configuration = { ...configuration, model: selection } },
    async selectPermission(...args) { f.calls.push(['selectPermission', ...args]); configuration = { ...configuration, permission: args[1] } },
  })
  const risks = []
  const tab = nativeTab(address('a-2'))
  const renderer = await render({ ...f, parentSessionId: 'parent-a', useTabInfo: tab.useTabInfo, confirmRisk: (message) => { risks.push(message); return true } })
  const composer = renderer.root.findByType(SidechatComposer)
  const option = composer.props.modelOptions.find((candidate) => candidate.selection.model === 'reasoner')
  await act(async () => composer.props.onModelChange(option.value))
  await act(async () => renderer.root.findByType(SidechatComposer).props.onPermissionChange('danger-full-access'))
  assert.deepEqual(f.calls.find(([method]) => method === 'selectModel'), ['selectModel', 'a-2', { provider: 'deepseek', model: 'reasoner' }])
  assert.deepEqual(f.calls.find(([method]) => method === 'selectPermission'), ['selectPermission', 'a-2', 'danger-full-access', true])
  assert.equal(risks.length, 1)
  assert.ok(f.calls.some(([method, child]) => method === 'configuration' && child === 'a-2'))
})
