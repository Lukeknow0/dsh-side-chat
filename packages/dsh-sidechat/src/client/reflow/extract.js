/** @typedef {import('../../sidechat/types.js').SidechatEvent} SidechatEvent */

/**
 * Project the meaningful text blocks from one durable message.
 * @param {unknown} content
 * @returns {string | undefined}
 */
function messageText(content) {
  if (!Array.isArray(content)) return undefined
  const blocks = content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text.trim())
    .filter((value) => value.length > 0)
  return blocks.length === 0 ? undefined : blocks.join('\n')
}

function newTurn() {
  return {
    questions: [],
    answers: [],
    ended: false,
    completed: false,
    invalid: false,
    settlementOrder: Number.POSITIVE_INFINITY,
  }
}

/**
 * Extract complete durable question/answer pairs from normalized sidechat events.
 * Only a successfully ended turn with real user input and assistant output is
 * eligible; live output, injected context, failures, and malformed ordering are
 * intentionally not inferred into a pair.
 *
 * @param {readonly SidechatEvent[] | null | undefined} events
 * @returns {{ turnId: string, question: string, answer: string }[]}
 */
export function extractCompletedQAPairs(events) {
  const turns = new Map()
  const sourceEvents = Array.isArray(events) ? events : []

  for (let index = 0; index < sourceEvents.length; index += 1) {
    const event = sourceEvents[index]
    const turnId = event?.turnId
    if (typeof turnId !== 'string' || turnId.length === 0) continue
    const turn = turns.get(turnId) ?? newTurn()

    if (event.kind === 'message') {
      if (turn.ended) {
        turn.invalid = true
      } else {
        const value = messageText(event.content)
        if (value !== undefined && event.role === 'user' && event.source === 'user') {
          turn.questions.push(value)
        } else if (
          value !== undefined
          && event.role === 'assistant'
          && event.source === 'assistant'
        ) {
          turn.answers.push(value)
        }
      }
    } else if (event.kind === 'error') {
      turn.invalid = true
    } else if (event.kind === 'turn-end') {
      if (turn.ended) turn.invalid = true
      turn.ended = true
      turn.completed = event.reason === 'completed'
      turn.settlementOrder = index
    }

    turns.set(turnId, turn)
  }

  return [...turns]
    .filter(([, turn]) => (
      turn.ended
      && turn.completed
      && !turn.invalid
      && turn.questions.length > 0
      && turn.answers.length > 0
    ))
    .sort(([, left], [, right]) => left.settlementOrder - right.settlementOrder)
    .map(([turnId, turn]) => ({
      turnId,
      question: turn.questions.join('\n\n'),
      answer: turn.answers.join('\n\n'),
    }))
}
