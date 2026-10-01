import assert from 'node:assert/strict'
import test from 'node:test'

const loadNativeTab = async () => import('../src/client/native-tab.js').catch(() => ({}))

test('sidechat tab has its own stable registration identity', async () => {
  const { createSidechatTabDefinition } = await loadNativeTab()
  assert.equal(typeof createSidechatTabDefinition, 'function')

  const definition = createSidechatTabDefinition()
  assert.equal(definition.id, 'dsh-sidechat:conversation')
  assert.equal(definition.kind, 'dsh-sidechat')
  assert.equal(definition.title(), '侧聊')
  assert.equal(definition.keepMounted, true)
  assert.equal(definition.multiple, true)
  assert.deepEqual(definition.patterns, ['dsh-resource://dsh-sidechat/**'])
  assert.equal(definition.guide[0].title(), '新建侧聊')
})

test('child resource addresses round-trip without claiming other plugin content', async () => {
  const { sidechatAddress, childFromSidechatAddress, createSidechatTabDefinition } = await loadNativeTab()
  assert.equal(typeof sidechatAddress, 'function')
  assert.equal(typeof childFromSidechatAddress, 'function')
  const address = sidechatAddress('child/a 你好')
  assert.equal(childFromSidechatAddress(address), 'child/a 你好')
  const definition = createSidechatTabDefinition()
  assert.equal(definition.canOpen(address), true)
  for (const invalid of ['sidebar://dsh-sidechat/new', 'dsh-resource://file/session/a', 'dsh-resource://dsh-sidechat/', 'dsh-resource://dsh-sidechat/%zz']) {
    assert.equal(childFromSidechatAddress(invalid), undefined)
    assert.equal(definition.canOpen(invalid), false)
  }
})
