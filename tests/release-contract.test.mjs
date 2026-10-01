import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

const text = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const manifest = JSON.parse(text('../packages/dsh-sidechat/package.json'))
const name = '@lukeknow0/dsh-side-chat'

test('retains the scoped distribution identity for the v1 prerelease', () => {
  assert.equal(manifest.name, name)
  assert.equal(manifest.version, '1.0.0-rc.1')
  assert.equal(manifest.engines.dsh, '0.2.0-rc.2')
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.repository.url, 'git+https://github.com/Lukeknow0/dsh-side-chat.git')
})

test('resolves Cordis and static Remote self-imports through the published name', () => {
  assert.match(text('../packages/dsh-sidechat/cordis.patch.yml'), /name: ['"]@lukeknow0\/dsh-side-chat['"]/)
  assert.match(text('../packages/dsh-sidechat/src/client/index.js'), /^import\s+\w+\s+from\s+['"]@lukeknow0\/dsh-side-chat\/remote['"]/m)
  assert.match(text('../packages/dsh-sidechat/src/client/native-tab.js'), /SIDEBAR_TAB_KIND = 'dsh-sidechat'/)
})

test('ships the license and release migration disclosures with the installable package', () => {
  for (const file of ['LICENSE', 'README.md', 'README.zh.md', 'CHANGELOG.md', 'MIGRATION.md', 'SECURITY.md']) {
    assert.ok(manifest.files.includes(file), `manifest files must include ${file}`)
    assert.ok(existsSync(new URL(`../packages/dsh-sidechat/${file}`, import.meta.url)), file)
  }
})

test('documents the prerelease distribution and unverified Desktop boundary in both languages', () => {
  for (const file of ['README.md', 'README.zh.md']) {
    const readme = text(`../${file}`)
    assert.ok(readme.includes('v1.0.0-rc.1'), file)
    assert.ok(readme.includes('lukeknow0-dsh-side-chat-1.0.0-rc.1.tgz'), file)
    assert.ok(readme.includes('0.2.0-rc.2'), file)
    assert.ok(readme.includes('Desktop'), file)
  }
  const security = text('../SECURITY.md')
  assert.match(security, /not.*read-only/i)
  assert.match(security, /Host/i)
})
