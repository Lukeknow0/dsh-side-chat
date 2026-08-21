import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { sideChatRemoteDescriptors } from '../src/remote-descriptors.ts'

describe('package contract', () => {
  it('publishes all Typert remotes', () => {
    expect(sideChatRemoteDescriptors.map(item => item.method)).toEqual(['start', 'read', 'send', 'cancel', 'close'])
    expect(new Set(sideChatRemoteDescriptors.map(item => item.id)).size).toBe(5)
  })

  it('declares a web client and publishable artifacts', async () => {
    const json = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      dsh?: { client?: { platform?: string } }; files?: string[]; exports?: Record<string, unknown>
    }
    expect(json.dsh?.client?.platform).toBe('web')
    expect(json.files).toContain('docs')
    expect(json.files).toContain('SECURITY.md')
    expect(json.exports).toHaveProperty('./client')
    expect(json.exports).toHaveProperty('./typert')
  })
})
