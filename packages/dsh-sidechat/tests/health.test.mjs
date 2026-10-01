import assert from 'node:assert/strict'
import test from 'node:test'

const loadHealth = async () => import('../src/health.js').catch(() => ({}))

test('health returns a side-effect-free constant probe result', async () => {
  const { health } = await loadHealth()
  assert.equal(typeof health, 'function')
  assert.deepEqual(health(), { ok: true })
})
