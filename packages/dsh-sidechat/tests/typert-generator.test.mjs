import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))

test('generates Host and Remote client artifacts for all side-chat methods', () => {
  const generator = new WorkspaceTypertGenerator(workspaceRoot, { checkDiagnostics: false })
  const artifacts = generator.generate(['@lukeknow0/dsh-side-chat'], ['host'])

  assert.equal(artifacts.length, 1)
  assert.ok(artifacts[0].remote)
  for (const method of [
    'archive',
    'cancel',
    'events',
    'info',
    'list',
    'ping',
    'prompt',
    'rename',
    'start',
  ]) {
    assert.match(artifacts[0].remote.js, new RegExp(`method: ['\"]${method}['\"]`))
  }
})
