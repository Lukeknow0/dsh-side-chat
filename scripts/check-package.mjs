#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const expected = '@lukeknow0/dsh-side-chat'
const version = '1.0.0-rc.1'
const requiredDocs = ['README.md', 'README.zh.md', 'CHANGELOG.md', 'MIGRATION.md', 'SECURITY.md', 'LICENSE']
const sharedExternals = ['@deepseek-ai/dsh-api-gateway/client', 'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']

function fail(message) { throw new Error(message) }
function audit(file) {
  if (!file) fail('Usage: node scripts/check-package.mjs <artifact.tgz>')
  const archive = readFileSync(file)
  const raw = archive[0] === 0x1f && archive[1] === 0x8b ? gunzipSync(archive) : archive
  const entries = []
  let offset = 0
  let paxPath
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const text = (start, size) => header.subarray(start, start + size).toString('utf8').replace(/\0.*$/s, '')
    const name = text(0, 100)
    const prefix = text(345, 155)
    let full = (prefix ? `${prefix}/` : '') + name
    const type = text(156, 1)
    const size = Number.parseInt(text(124, 12).trim() || '0', 8)
    if (!Number.isFinite(size) || size < 0) fail(`Invalid archive size for ${full}`)
    if (type === 'x' || type === 'g') {
      const body = raw.subarray(offset + 512, offset + 512 + size)
      if (body.length !== size) fail('Truncated PAX header')
      let cursor = 0
      while (cursor < body.length) {
        const space = body.indexOf(0x20, cursor)
        if (space < 0) fail('Malformed PAX record length')
        const recordLength = Number(body.subarray(cursor, space).toString('ascii'))
        if (!Number.isInteger(recordLength) || recordLength <= space - cursor + 1 || cursor + recordLength > body.length) fail('Malformed PAX record length')
        const record = body.subarray(space + 1, cursor + recordLength - 1).toString('utf8')
        const split = record.indexOf('=')
        if (split > 0 && record.slice(0, split) === 'path') paxPath = record.slice(split + 1)
        cursor += recordLength
      }
      offset += 512 + Math.ceil(size / 512) * 512
      continue
    }
    if (type === 'L' || type === 'K') fail(`Unsupported extended archive entry ${full}`)
    if (paxPath) { full = paxPath; paxPath = undefined }
    if (type && type !== '0' && type !== '5') fail(`Non-regular archive entry is not allowed: ${full}`)
    if (type === '5' && size !== 0) fail(`Invalid directory archive entry: ${full}`)
    if (full.startsWith('/') || /^[A-Za-z]:/.test(full) || full.split('/').some(part => part === '..') || !(full === 'package' || full.startsWith('package/'))) fail(`Unsafe archive path: ${full}`)
    if (full.includes('\\')) fail(`Unsafe archive path: ${full}`)
    if (/^(?:package\/)?(?:\.git|node_modules|profiles?)(?:\/|$)/i.test(full) || /(?:^|\/)(?:\.env(?:\.|$)|\.DS_Store|credentials?(?:\.|$)|.*\.local(?:\.|$))/i.test(full)) fail(`Unexpected private/local artifact: ${full}`)
    const normalized = full.replace(/\/$/, '')
    if (entries.includes(normalized)) fail(`Duplicate archive entry: ${normalized}`)
    entries.push(normalized)
    offset += 512 + Math.ceil(size / 512) * 512
  }
  const names = new Set(entries)
  const contents = new Map()
  const read = name => {
    if (!names.has(name)) fail(`Missing required package file: ${name}`)
    if (!contents.has(name)) contents.set(name, execFileSync('tar', ['-xOzf', file, name], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
    return contents.get(name)
  }
  const manifest = JSON.parse(read('package/package.json'))
  if (manifest.name !== expected) fail(`Wrong package identity: expected ${expected}`)
  if (manifest.version !== version) fail(`Wrong package version: expected ${version}`)
  if (manifest.engines?.dsh !== '0.2.0-rc.2') fail('Wrong DSH engine version; expected 0.2.0-rc.2')
  for (const doc of requiredDocs) read(`package/${doc}`)
  const exports = manifest.exports
  if (!exports || typeof exports !== 'object') fail('Package exports are missing')
  const targets = []
  const gather = value => {
    if (typeof value === 'string' && value.startsWith('./')) targets.push(value.slice(2))
    else if (value && typeof value === 'object') for (const child of Object.values(value)) gather(child)
  }
  for (const value of Object.values(exports)) gather(value)
  if (!targets.length) fail('No runtime/type exports declared')
  for (const target of targets) if (!names.has(`package/${target}`)) fail(`Missing export target: ${target}`)
  const patch = read('package/cordis.patch.yml')
  if (!patch.includes(`name: '${expected}'`) && !patch.includes(`name: "${expected}"`)) fail('Cordis patch must register the scoped package name')
  const entry = manifest.exports['./client']?.default
  if (typeof entry !== 'string') fail('Missing client runtime export for module loader')
  const entryText = read(`package/${entry.replace(/^\.\//, '')}`)
  let registration
  let calls = 0
  try {
    vm.runInNewContext(entryText, { window: { __ModuleLoader__: { load(value) { calls++; registration = value } } } }, { timeout: 1000 })
  } catch (error) { fail(`Client loader registration could not be captured: ${error.message}`) }
  if (calls !== 1 || registration?.id !== expected || typeof registration.factory !== 'function') fail('Incorrect Client loader registration ID or factory')
  const requested = []
  const stubs = new Map(sharedExternals.map(external => [external, {}]))
  const moduleExports = registration.factory(specifier => {
    requested.push(specifier)
    if (!stubs.has(specifier)) fail(`Client factory requires undeclared external: ${specifier}`)
    return stubs.get(specifier)
  })
  if (requested.some(specifier => specifier === 'zod' || specifier === `${expected}/remote`)) fail('Client factory externalizes bundled zod or package self Remote')
  if (typeof moduleExports?.default?.apply !== 'function') fail('Client factory must export default.apply')
  const externals = manifest.dsh?.client?.external ?? []
  for (const external of sharedExternals) if (!externals.includes(external)) fail(`Missing shared platform external: ${external}`)
  if (externals.includes(`${expected}/remote`) || externals.includes('./remote') || externals.includes('../remote')) fail('Do not externalize the package self Remote')
  const deps = { ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies }
  for (const [dep, spec] of Object.entries(deps)) {
    if (typeof spec !== 'string' || /^(?:file:|link:|workspace:|\.\.?\/|\/|[A-Za-z]:[\\/])/.test(spec)) fail(`Local dependency specification is not publishable: ${dep}`)
  }
  for (const name of names) {
    if (!name.startsWith('package/') || !/\.(?:m?js|cjs|d\.ts)$/.test(name)) continue
    const source = read(name)
    if (/(?:\/Users\/|\/home\/|\/private\/tmp\/|[A-Za-z]:\\Users\\)/i.test(source)) fail(`Machine-specific absolute source path in ${name}`)
    const imports = /(?:\bfrom\s*|\bimport\s*\(|\bimport\s*)['"](\.{1,2}\/[^'"]+)['"]/g
    // Bundlers retain JSDoc from the original modules. Those comments are not
    // runtime imports and their source-relative paths do not move with the bundle.
    const importSource = source.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const match of importSource.matchAll(imports)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name.slice('package/'.length)), match[1]))
      if (resolved === '..' || resolved.startsWith('../') || ![resolved, `${resolved}.js`, `${resolved}.mjs`, `${resolved}.cjs`, `${resolved}.d.ts`, `${resolved}.d.mts`, `${resolved}.d.cts`, ...(resolved.endsWith('.js') ? [`${resolved.slice(0, -3)}.d.ts`] : []), ...(resolved.endsWith('.mjs') ? [`${resolved.slice(0, -4)}.d.mts`] : []), ...(resolved.endsWith('.cjs') ? [`${resolved.slice(0, -4)}.d.cts`] : []), `${resolved}/index.js`, `${resolved}/index.d.ts`].some(candidate => names.has(`package/${candidate}`))) {
        fail(`Unresolved relative import in ${name}: ${match[1]}`)
      }
    }
  }
  return { entries: entries.length, exports: targets.length, name: manifest.name, version: manifest.version }
}

try {
  const result = audit(process.argv[2])
  console.log(`Package audit passed: ${result.name}@${result.version}; ${result.entries} archive entries, ${result.exports} export targets.`)
} catch (error) {
  console.error(`Package audit failed: ${error.message}`)
  process.exitCode = 1
}
