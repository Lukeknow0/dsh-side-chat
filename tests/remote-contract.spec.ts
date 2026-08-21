import { describe, expect, it } from 'vitest'
import {
  cancelSideChatRequestSchema, cancelSideChatResultSchema,
  closeSideChatRequestSchema, closeSideChatResultSchema,
  readSideChatRequestSchema, readSideChatResultSchema,
  sendSideChatRequestSchema, sendSideChatResultSchema,
  startSideChatRequestSchema, startSideChatResultSchema,
} from '../src/shared/remote.ts'

const token = '123e4567-e89b-42d3-a456-426614174000'

describe('Side Chat remote schemas', () => {
  it('accepts a strict start round trip', () => {
    expect(startSideChatRequestSchema.parse({ parentSessionId: 'parent', chatToken: token })).toEqual({ parentSessionId: 'parent', chatToken: token })
    expect(startSideChatResultSchema.parse({ ok: true, value: {
      parentSessionId: 'parent', childSessionId: 'child', chatToken: token, seedLength: 12, expiresAt: Date.now() + 1_000, cleanupMode: 'archive-on-close',
    } }).ok).toBe(true)
  })

  it('rejects malformed or widened payloads', () => {
    expect(() => startSideChatRequestSchema.parse({ parentSessionId: 'parent', chatToken: 'not-a-uuid' })).toThrow()
    expect(() => startSideChatRequestSchema.parse({ parentSessionId: 'parent', chatToken: token, extra: true })).toThrow()
  })

  it('validates host-projected transcript snapshots', () => {
    expect(readSideChatRequestSchema.parse({ chatToken: token }).chatToken).toBe(token)
    const result = readSideChatResultSchema.parse({ ok: true, value: {
      chatToken: token, revision: 18, expiresAt: Date.now() + 1_000, running: true, partial: 'Working',
      messages: [{ id: 'm1', role: 'user', text: 'Why?' }],
    } })
    expect(result.ok && result.value.messages).toHaveLength(1)
  })

  it('validates host-owned send and cancel payloads', () => {
    const requestId = '123e4567-e89b-42d3-a456-426614174001'
    expect(sendSideChatRequestSchema.parse({ chatToken: token, requestId, text: 'Why?' }).text).toBe('Why?')
    expect(sendSideChatResultSchema.parse({ ok: true, value: {
      chatToken: token, requestId, accepted: true, messageId: 'message-1',
    } }).ok).toBe(true)
    expect(cancelSideChatRequestSchema.parse({ chatToken: token }).chatToken).toBe(token)
    expect(cancelSideChatResultSchema.parse({ ok: true, value: { chatToken: token, accepted: true } }).ok).toBe(true)
  })

  it('accepts idempotent absent close results', () => {
    expect(closeSideChatRequestSchema.parse({ chatToken: token }).chatToken).toBe(token)
    expect(closeSideChatResultSchema.parse({ ok: true, value: { chatToken: token, closed: true, cleanup: 'absent' } }).ok).toBe(true)
  })
})
