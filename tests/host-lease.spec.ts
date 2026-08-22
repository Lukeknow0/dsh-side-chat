import { describe, expect, it } from 'vitest'
import {
  evaluateSideChatLease, SIDE_CHAT_IDLE_TTL_MS, SIDE_CHAT_LEASE_POLL_MS,
} from '../src/host/side-chat-service.ts'

describe('Side Chat Host idle lease', () => {
  it('expires only when parent and child are idle at the deadline', () => {
    expect(evaluateSideChatLease({
      now: 10_000, expiresAt: 10_000, wasBusy: false,
      parentRunning: false, childRunning: false,
    })).toEqual({ expiresAt: 10_000, busy: false, expire: true, delay: 0 })
  })

  it.each([
    { parentRunning: true, childRunning: false },
    { parentRunning: false, childRunning: true },
    { parentRunning: true, childRunning: true },
  ])('pauses expiry while either task is running: %o', ({ parentRunning, childRunning }) => {
    expect(evaluateSideChatLease({
      now: 20_000, expiresAt: 1, wasBusy: false, parentRunning, childRunning,
    })).toEqual({
      expiresAt: 20_000 + SIDE_CHAT_IDLE_TTL_MS,
      busy: true,
      expire: false,
      delay: SIDE_CHAT_LEASE_POLL_MS,
    })
  })

  it('starts a fresh full TTL when both tasks become idle', () => {
    expect(evaluateSideChatLease({
      now: 30_000, expiresAt: 30_001, wasBusy: true,
      parentRunning: false, childRunning: false,
    })).toEqual({
      expiresAt: 30_000 + SIDE_CHAT_IDLE_TTL_MS,
      busy: false,
      expire: false,
      delay: SIDE_CHAT_LEASE_POLL_MS,
    })
  })

  it('restarts the full TTL after activity resumes during a countdown', () => {
    const resumed = evaluateSideChatLease({
      now: 40_000, expiresAt: 45_000, wasBusy: false,
      parentRunning: true, childRunning: false,
    })
    expect(resumed.busy).toBe(true)
    const stopped = evaluateSideChatLease({
      now: 41_000, expiresAt: resumed.expiresAt, wasBusy: resumed.busy,
      parentRunning: false, childRunning: false,
    })
    expect(stopped.expiresAt).toBe(41_000 + SIDE_CHAT_IDLE_TTL_MS)
    expect(stopped.delay).toBe(SIDE_CHAT_LEASE_POLL_MS)
  })

  it('keeps checking an idle countdown so resumed work cannot pass unnoticed', () => {
    expect(evaluateSideChatLease({
      now: 50_000, expiresAt: 55_000, wasBusy: false,
      parentRunning: false, childRunning: false,
    }).delay).toBe(SIDE_CHAT_LEASE_POLL_MS)

    expect(evaluateSideChatLease({
      now: 54_500, expiresAt: 55_000, wasBusy: false,
      parentRunning: false, childRunning: false,
    }).delay).toBe(500)
  })
})
