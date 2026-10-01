import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('publishes a DSH lazy-CJS client registration bundle', () => {
  const clientEntry = packageJson.exports?.['./client']?.default
  assert.equal(clientEntry, './lib/client.js')

  const source = readFileSync(new URL(`../${clientEntry.slice(2)}`, import.meta.url), 'utf8')
  let registration
  let calls = 0
  vm.runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(value) {
          calls += 1
          registration = value
        },
      },
    },
  }, { filename: 'dsh-sidechat-client.js' })

  assert.equal(calls, 1)
  assert.equal(registration.id, packageJson.name)
  assert.equal(typeof registration.factory, 'function')
  assert.doesNotMatch(source, /^\s*export\s/m)
})

test('materializes using shared React and ReactDOM portal platform modules', () => {
  const clientEntry = packageJson.exports?.['./client']?.default
  const source = readFileSync(new URL(`../${clientEntry.slice(2)}`, import.meta.url), 'utf8')
  let registration
  vm.runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(value) {
          registration = value
        },
      },
    },
  }, { filename: 'dsh-sidechat-client.js' })

  const requested = []
  const exports = registration.factory((specifier) => {
    requested.push(specifier)
    return {}
  })
  assert.deepEqual(requested, ['react', 'react-dom'])
  for (const module of requested) assert.ok(packageJson.dsh.client.external.includes(module))
  assert.equal(requested.includes('zod'), false)
  assert.equal(requested.includes('@lukeknow0/dsh-side-chat/remote'), false)
  assert.equal(typeof exports.default?.apply, 'function')
})
