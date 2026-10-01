import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../src/client/index.js', import.meta.url), 'utf8')

test('statically includes the generated Remote contribution in the Client bundle', () => {
  assert.match(source, /^import\s+\w+\s+from\s+['"]@lukeknow0\/dsh-side-chat\/remote['"]/m)
  assert.doesNotMatch(source, /import\(['"]@lukeknow0\/dsh-side-chat\/remote['"]\)/)
})
