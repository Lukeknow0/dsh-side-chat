import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync, gzipSync } from 'node:zlib'

const node = process.execPath
const cli = fileURLToPath(new URL('../scripts/check-package.mjs', import.meta.url))
const name = '@lukeknow0/dsh-side-chat'

function fixture(t, mutate = () => {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'sidechat-audit-'))
  const owner = realpathSync(root)
  t.after(() => {
    if (realpathSync(root) === owner && owner.startsWith(realpathSync(os.tmpdir()) + path.sep)) rmSync(root, { recursive: true, force: true })
  })
  const pkg = path.join(root, 'package')
  mkdirSync(path.join(pkg, 'lib/types'), { recursive: true })
  const manifest = {
    name, version: '1.0.0-rc.1', type: 'module', engines: { dsh: '0.2.0-rc.2' },
    exports: {
      '.': { types: './lib/types/index.d.ts', default: './lib/index.mjs' },
      './types': { types: './lib/types/sidechat/types.d.ts' },
      './client': { default: './lib/client.js' },
      './typert': { types: './lib/typert.host.d.ts', default: './lib/typert.host.js' },
      './remote': { types: './lib/typert.remote-client.d.ts', default: './lib/typert.remote-client.js' },
    },
    dsh: { client: { external: ['@deepseek-ai/dsh-api-gateway/client', 'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'] } },
    dependencies: { zod: '^3.24.0' }, peerDependencies: { '@deepseek-ai/cordis': '~4.0.4' },
  }
  const files = {
    'package.json': JSON.stringify(manifest),
    'cordis.patch.yml': `- insert:\n    - id: dsh-sidechat\n      name: '${name}'\n`,
    'README.md': 'readme', 'README.zh.md': 'readme', 'CHANGELOG.md': 'changes', 'MIGRATION.md': 'migration', 'SECURITY.md': 'security', LICENSE: 'MIT',
    'lib/index.mjs': "import './types/index.d.ts'; export {};",
    'lib/client.js': "window.__ModuleLoader__.load({ id: '@lukeknow0/dsh-side-chat', factory: (require) => { var module = { exports: {} }; module.exports.default = { apply() {} }; return module.exports; } });",
    'lib/client-dep.js': 'export const ok = true',
    'lib/typert.host.js': "export { x } from './index.mjs'",
    'lib/typert.remote-client.js': "import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'; export { RemoteError }",
    'lib/index.d.ts': "export type { Sidechat } from './types/sidechat/types.d.ts'",
    'lib/types/index.d.ts': "export type { Sidechat } from './sidechat/types.d.ts'",
    'lib/types/sidechat/types.d.ts': 'export interface Sidechat {}',
    'lib/typert.host.d.ts': "export type { Sidechat } from './types/sidechat/types.d.ts'",
    'lib/typert.remote-client.d.ts': "export type { Sidechat } from './types/sidechat/types.d.ts'",
  }
  mutate({ manifest, files, pkg })
  files['package.json'] = JSON.stringify(manifest)
  for (const [rel, value] of Object.entries(files)) {
    const target = path.join(pkg, rel)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, value)
  }
  const archive = path.join(root, 'fixture.tgz')
  execFileSync('tar', ['--format=ustar', '-czf', archive, '-C', root, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } })
  return archive
}

function tarHeader(name, type, size) {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100)
  header.write('0000644\\0', 100, 8)
  header.write('0000000\\0', 108, 8)
  header.write('0000000\\0', 116, 8)
  header.write(size.toString(8).padStart(11, '0') + '\\0', 124, 12)
  header.write('00000000000\\0', 136, 12)
  header.fill(32, 148, 156)
  header.write(type, 156, 1)
  header.write('ustar\\0', 257, 6)
  header.write('00', 263, 2)
  const checksum = [...header].reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0')
  header.write(`${checksum}\\0 `, 148, 8)
  return header
}

function audit(archive) { return spawnSync(node, [cli, archive], { encoding: 'utf8' }) }

test('accepts a valid installable release archive', t => {
  const result = audit(fixture(t))
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /audit passed/i)
})

test('accepts the actual loader contract with declared zod and JS declaration imports', t => {
  const result = audit(fixture(t, ({ files }) => {
    files['lib/types/index.d.ts'] = "import type { Sidechat } from './sidechat/types.js'; export type { Sidechat }; export type SidechatAlias = import('./sidechat/types.js').Sidechat"
  }))
  assert.equal(result.status, 0, result.stderr)
})

test('ignores bundled type-only JSDoc imports in runtime JavaScript', t => {
  const result = audit(fixture(t, ({ files }) => {
    files['lib/client.js'] = '/** @param {import("../sidechat/types.js").ThreadRecord} record */\n' + files['lib/client.js']
  }))
  assert.equal(result.status, 0, result.stderr)
})

test('rejects a loader registration with the wrong ID', t => {
  const result = audit(fixture(t, ({ files }) => {
    files['lib/client.js'] = files['lib/client.js'].replace(name, 'dsh-sidechat/client')
  }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /loader|registration|ID|id/i)
})

test('rejects a hidden external self Remote in the client factory', t => {
  const result = audit(fixture(t, ({ files }) => {
    files['lib/client.js'] = files['lib/client.js'].replace('var module =', "require('@lukeknow0/dsh-side-chat/remote'); var module =")
  }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /remote|external|require/i)
})

test('rejects a PAX traversal path', t => {
  const archive = fixture(t)
  const bytes = gunzipSync(readFileSync(archive))
  const value = 'path=package/../../pax-escape'
  let length = value.length + 4
  let recordText
  do {
    recordText = `${length} ${value}\n`
    const next = Buffer.byteLength(recordText)
    if (next === length) break
    length = next
  } while (true)
  const record = Buffer.from(recordText)
  const pax = tarHeader('PaxHeaders.0/x', 'x', record.length)
  const member = tarHeader('x', '0', 0)
  const end = bytes.length - 1024
  const injected = Buffer.concat([bytes.subarray(0, end), pax, record, Buffer.alloc((512 - record.length % 512) % 512), member, Buffer.alloc(1024)])
  writeFileSync(archive, gzipSync(injected))
  const result = audit(archive)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /path|traversal|unsafe/i)
})

test('rejects a wrong package identity', t => {
  const result = audit(fixture(t, ({ manifest }) => { manifest.name = 'other-package' }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /name|identity/i)
})

test('rejects a missing runtime export target', t => {
  const result = audit(fixture(t, ({ files }) => { delete files['lib/client.js'] }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /client|missing|export/i)
})

test('rejects a missing relative declaration dependency', t => {
  const result = audit(fixture(t, ({ files }) => { files['lib/types/index.d.ts'] = "export type { Missing } from './missing.d.ts'" }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /missing|relative|declaration/i)
})

test('rejects externalization of the package self Remote', t => {
  const result = audit(fixture(t, ({ manifest }) => { manifest.dsh.client.external.push(`${name}/remote`) }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /remote|external/i)
})

test('rejects private profile or local artifacts in the archive', t => {
  const result = audit(fixture(t, ({ files }) => { files['profiles/default.json'] = '{}' }))
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /profile|private|unexpected/i)
})

test('rejects unsafe archive entry paths', t => {
  const archive = fixture(t)
  const bytes = gunzipSync(readFileSync(archive))
  const header = Buffer.alloc(512)
  const name = 'package/../../escape'
  header.write(name, 0, 100)
  header.write('0000644\0', 100, 8)
  header.write('0000000\0', 108, 8)
  header.write('0000000\0', 116, 8)
  header.write('0000006\0', 124, 12)
  header.write('00000000000\0', 136, 12)
  header.fill(32, 148, 156)
  header.write('0', 156, 1)
  header.write('ustar\0', 257, 6)
  header.write('00', 263, 2)
  const checksum = [...header].reduce((sum, value) => sum + value, 0).toString(8).padStart(6, '0')
  header.write(`${checksum}\0 `, 148, 8)
  const end = bytes.length - 1024
  const injected = Buffer.concat([bytes.subarray(0, end), header, Buffer.from('unsafe'), Buffer.alloc(506), Buffer.alloc(1024)])
  writeFileSync(archive, gzipSync(injected))
  const result = audit(archive)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /path|traversal|unsafe/i)
})
