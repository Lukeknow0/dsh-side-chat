import { describe, expect, it } from 'vitest'
import { isSideChatToolAllowed, READ_ONLY_TOOL_CANDIDATES } from '../src/shared/tool-policy.ts'

describe('Side Chat tool policy', () => {
  it.each(['read', 'glob', 'grep', 'web_search', 'run_code'])('allows read capability %s', name => {
    expect(isSideChatToolAllowed(name)).toBe(true)
  })

  it.each(['write', 'edit', 'bash', 'ssh_exec', 'subagent', 'mnemon_remember', 'ask_user_question'])('denies mutating or interactive capability %s', name => {
    expect(isSideChatToolAllowed(name)).toBe(false)
  })

  it('has no duplicate candidate names', () => {
    expect(new Set(READ_ONLY_TOOL_CANDIDATES).size).toBe(READ_ONLY_TOOL_CANDIDATES.length)
  })
})
