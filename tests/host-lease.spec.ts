import { describe, expect, it } from 'vitest'
import { evaluateSideChatLease, SIDE_CHAT_IDLE_TTL_MS } from '../src/host/side-chat-service.ts'

describe('Side Chat Host idle lease', () => {
  it('expires an idle conversation when its deadline is reached', () => {
    const result = evaluateSideChatLease({
      now: 10_000,
      expiresAt: 10_000,
      wasRunning: false,
      running: false,
    })

    expect(result).toEqual({ expiresAt: 10_000, running: false, expire: true, delay: 0 })
  })

  it('keeps a running conversation alive even beyond its old deadline', () => {
    const result = evaluateSideChatLease({
      now: 20_000,
      expiresAt: 1,
      wasRunning: false,
      running: true,
    })

    expect(result).toEqual({
      expiresAt: 20_000 + SIDE_CHAT_IDLE_TTL_MS,
      running: true,
      expire: false,
      delay: 1_000,
    })
  })

  it('starts a complete idle TTL when running work ends', () => {
    const stoppedAt = 30_000
    const result = evaluateSideChatLease({
      now: stoppedAt,
      expiresAt: stoppedAt + 12_000,
      wasRunning: true,
      running: false,
    })

    expect(result).toEqual({
      expiresAt: stoppedAt + SIDE_CHAT_IDLE_TTL_MS,
      running: false,
      expire: false,
      delay: SIDE_CHAT_IDLE_TTL_MS,
    })
  })
})
