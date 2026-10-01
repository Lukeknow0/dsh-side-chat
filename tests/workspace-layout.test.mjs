import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

function readJson(path) {
  return existsSync(new URL(path, import.meta.url))
    ? JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
    : undefined
}

test('Typert workspace references the installable package Host and Client faces', () => {
  const host = readJson('../tsconfig.host.json')
  const client = readJson('../tsconfig.client.json')
  const packageManifest = readJson('../packages/dsh-sidechat/package.json')
  const protocolShim = readJson('../packages/.codegen/dsh-typert-protocol/package.json')

  assert.ok(host?.references?.some(({ path }) => path === './packages/dsh-sidechat/tsconfig.dsh-host.json'))
  assert.ok(host?.references?.some(({ path }) => path === './packages/.codegen/dsh-typert-protocol/tsconfig.codegen-host.json'))
  assert.ok(client?.references?.some(({ path }) => path === './packages/dsh-sidechat/tsconfig.dsh-client.json'))
  assert.equal(host?.compilerOptions?.moduleResolution, 'NodeNext')
  assert.equal(client?.compilerOptions?.moduleResolution, 'Bundler')
  assert.equal(host?.compilerOptions?.paths?.['@deepseek-ai/dsh-typert-protocol']?.[0], 'packages/.codegen/dsh-typert-protocol/index.d.ts')
  assert.equal(packageManifest?.name, '@lukeknow0/dsh-side-chat')
  assert.equal(protocolShim?.name, '@deepseek-ai/dsh-typert-protocol')
})
