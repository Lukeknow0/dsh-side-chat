import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import test from 'node:test'

const artifact = new URL('../lib/typert.remote-client.js', import.meta.url)

test('built Remote descriptor exposes health and child-owned operations', {
  skip: !existsSync(artifact),
}, async () => {
  const remote = await import(`${artifact.href}?task-1-3`)
  const descriptors = remote.default.descriptors
  assert.deepEqual(descriptors.map(({ method }) => method), [
    'answerQuestion',
    'archive',
    'cancel',
    'configuration',
    'configurationCatalogs',
    'events',
    'info',
    'list',
    'ping',
    'prompt',
    'rename',
    'resolveApproval',
    'selectModel',
    'selectPermission',
    'start',
  ])

  const byMethod = Object.fromEntries(descriptors.map((descriptor) => [descriptor.method, descriptor]))
  assert.deepEqual(byMethod.prompt.cancellation, { parameter: 'signal' })
  assert.deepEqual(byMethod.events.cancellation, { parameter: 'signal' })
  assert.deepEqual(byMethod.configuration.cancellation, { parameter: 'signal' })
  assert.deepEqual(byMethod.info.parameters.map(({ name }) => name), ['input'])
})
