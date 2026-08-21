import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const hostSource = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
const clientSource = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
assert.equal(hostSource.includes('@Remote('), false)
assert.equal(/require\((['"])zod\1\)/u.test(clientSource), false)
assert.equal(clientSource.includes('require("@deepseek-ai/dsh-workspace")'), false)

const host = await import('../lib/index.js')
const typert = await import('../lib/typert.host.js')
const remote = await import('../lib/typert.remote-client.js')
assert.equal(host.name, 'dsh-side-chat')
assert.equal(typert.TYPERT.package, 'dsh-side-chat')
assert.equal(typert.TYPERT.invocations.length, 5)
assert.equal(remote.TYPERT_REMOTE.package, 'dsh-side-chat')
assert.equal(remote.TYPERT_REMOTE.descriptors.length, 5)
