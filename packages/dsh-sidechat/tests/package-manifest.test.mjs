import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

test('declares an installable DSH bundle layer', () => {
  assert.deepEqual(packageJson.dsh?.bundle, { patch: './cordis.patch.yml' })
  assert.ok(existsSync(new URL('../cordis.patch.yml', import.meta.url)))
})

test('publishes Host Typert and Web Client entry points', () => {
  assert.deepEqual(packageJson.exports?.['./typert'], {
    types: './lib/typert.host.d.ts',
    default: './lib/typert.host.js',
  })
  assert.deepEqual(packageJson.exports?.['./remote'], {
    types: './lib/typert.remote-client.d.ts',
    default: './lib/typert.remote-client.js',
  })
  assert.equal(packageJson.dsh?.client?.platform, 'web')
  assert.deepEqual(packageJson.exports?.['./client'], { default: './lib/client.js' })
  assert.ok(packageJson.files.includes('lib/client.js'))
})

test('declares one uniquely versioned package compatible with the current DSH Host', () => {
  assert.equal(packageJson.version, '1.0.0-rc.1')
  assert.ok(packageJson.dsh.client.inject.includes('@deepseek-ai/dsh-client-file-upload'))
  assert.equal(packageJson.engines.dsh, '0.2.0-rc.2')
  for (const [name, range] of Object.entries({
    ...packageJson.peerDependencies,
    ...packageJson.devDependencies,
  })) {
    if (name.startsWith('@deepseek-ai/dsh-')) {
      assert.equal(range, '0.2.0-rc.2', name)
    }
  }
})
