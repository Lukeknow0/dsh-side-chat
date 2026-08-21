import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { completedTurnSeed, SIDE_CHAT_IDLE_TTL_MS } from '../src/host/side-chat-service.ts'

function event(seq: number, type: string): SessionEvent {
  return { seq, time: seq, type, data: {} } as unknown as SessionEvent
}

describe('Side Chat retention policy', () => {
  it('uses a thirty-minute parked-and-idle lease', () => {
    expect(SIDE_CHAT_IDLE_TTL_MS).toBe(30 * 60 * 1_000)
  })
})

describe('completedTurnSeed', () => {
  it('returns the balanced prefix through the last completed turn', () => {
    const events = [
      event(0, 'user/message'), event(1, 'turn/start'), event(2, 'assistant/message'), event(3, 'turn/end'),
      event(4, 'user/message'), event(5, 'turn/start'), event(6, 'assistant/chunk'),
    ]
    expect(completedTurnSeed(events).map(item => item.seq)).toEqual([0, 1, 2, 3])
  })

  it('rejects an empty or open-turn-only history', () => {
    expect(completedTurnSeed([])).toEqual([])
    expect(completedTurnSeed([event(0, 'user/message'), event(1, 'turn/start')])).toEqual([])
  })

  it('uses the latest completed turn when several exist', () => {
    const events = [
      event(0, 'turn/start'), event(1, 'turn/end'), event(2, 'turn/start'), event(3, 'turn/end'),
    ]
    expect(completedTurnSeed(events)).toHaveLength(4)
  })
})
