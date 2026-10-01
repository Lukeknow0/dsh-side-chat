import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const config = readFileSync(new URL('../tsdown.config.ts', import.meta.url), 'utf8')
const clientConfigPath = new URL('../tsdown.client.config.ts', import.meta.url)
const clientConfig = existsSync(clientConfigPath) ? readFileSync(clientConfigPath, 'utf8') : ''
const hostEntry = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

test('builds the browser entry as the DSH lazy-CJS registration bundle', () => {
  assert.ok(clientConfig, 'a dedicated browser bundle config is required')
  assert.ok(clientConfig.includes("format: 'cjs'"))
  assert.ok(clientConfig.includes("entryFileNames: 'client.js'"))
  assert.match(clientConfig, /window\.__ModuleLoader__\.load/)
})

test('bundles the generated Remote subpath instead of self-externalizing it', () => {
  const selfExternal = /external:\s*\[[^\]]*['"]@lukeknow0\/dsh-side-chat\/remote['"]/s
  assert.doesNotMatch(config, selfExternal)
  assert.doesNotMatch(clientConfig, selfExternal)
})

test('exports the Host Remote service so Typert can discover its methods', () => {
  assert.match(hostEntry, /export\s*\{[^}]*\bSidechatController\b/)
})

test('a clean build generates Host Remote declarations before checking the Client', () => {
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const generate = manifest.scripts.typecheck.indexOf('tsdown --config tsdown.config.ts')
  const clientCheck = manifest.scripts.typecheck.indexOf('tsc -p tsconfig.dsh-client.json')
  assert.ok(generate >= 0, 'typecheck must generate missing Host/Remote artifacts on a clean checkout')
  assert.ok(clientCheck > generate, 'Client types consume the generated Remote declarations')
  assert.match(manifest.scripts.build, /^pnpm run typecheck && tsdown --config tsdown.client.config.ts$/)
})
