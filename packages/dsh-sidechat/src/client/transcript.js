/** @typedef {import('../sidechat/types.js').SidechatEvent} SidechatEvent */
/** @typedef {import('../sidechat/types.js').SidechatEventContentPart} SidechatEventContentPart */

/**
 * @typedef {{
 *   key: string,
 *   type: 'message',
 *   seq: number,
 *   turnId: string,
 *   role: 'user' | 'assistant',
 *   content: readonly SidechatEventContentPart[],
 * }} TranscriptMessageRow
 */

/**
 * @typedef {{
 *   key: string,
 *   type: 'turn',
 *   seq: number,
 *   turnId: string,
 *   state: 'started' | 'ended',
 *   reason?: string,
 * }} TranscriptTurnRow
 */

/**
 * @typedef {{
 *   key: string,
 *   type: 'tool',
 *   turnId: string,
 *   callId: string,
 *   name: string,
 *   state: 'running' | 'succeeded' | 'failed',
 *   summary?: string,
 *   firstSeq: number,
 *   latestSeq: number,
 * }} TranscriptToolRow
 */

/**
 * @typedef {{
 *   key: string,
 *   type: 'interaction',
 *   turnId: string,
 *   interactionId: string,
 *   interactionKind: 'approval' | 'question',
 *   state: 'pending' | 'resolved' | 'expired',
 *   prompt: string,
 *   firstSeq: number,
 *   latestSeq: number,
 * }} TranscriptInteractionRow
 */

/**
 * @typedef {{
 *   key: string,
 *   type: 'error',
 *   seq: number,
 *   turnId?: string,
 *   message: string,
 * }} TranscriptErrorRow
 */

/** @typedef {TranscriptMessageRow | TranscriptTurnRow | TranscriptToolRow | TranscriptInteractionRow | TranscriptErrorRow} TranscriptRow */

/**
 * @typedef {{
 *   key: string,
 *   childSessionId?: string,
 *   attemptId?: string,
 *   turnId?: string,
 *   step?: string | number,
 *   text: string,
 *   truncated: boolean,
 * }} TranscriptLiveRow
 */

export const MAX_LIVE_TEXT_LENGTH = 32_768

/** @param {string} type @param {string} first @param {string} second */
function identityKey(type, first, second) {
  return `${type}:${JSON.stringify([first, second])}`
}

/**
 * Project Host-normalized durable events into renderer rows.
 * Lifecycle updates replace their earlier row in place so React keys and
 * chronological position stay stable while the visible state advances.
 *
 * @param {readonly SidechatEvent[] | null | undefined} events
 * @returns {TranscriptRow[]}
 */
export function projectTranscript(events) {
  /** @type {TranscriptRow[]} */
  const rows = []
  /** @type {Map<string, number>} */
  const lifecycleIndexes = new Map()

  for (const event of Array.isArray(events) ? events : []) {
    switch (event.kind) {
      case 'message': {
        // A plugin-injected seed is context for the child Agent, not a request
        // authored in this side-chat transcript.
        if (event.role === 'user' && event.source !== 'user') break
        rows.push({
          key: `message:${event.seq}`,
          type: 'message',
          seq: event.seq,
          turnId: event.turnId,
          role: event.role,
          content: event.content,
        })
        break
      }
      case 'turn-start':
        rows.push({
          key: `turn:start:${event.seq}`,
          type: 'turn',
          seq: event.seq,
          turnId: event.turnId,
          state: 'started',
        })
        break
      case 'turn-end':
        rows.push({
          key: `turn:end:${event.seq}`,
          type: 'turn',
          seq: event.seq,
          turnId: event.turnId,
          state: 'ended',
          reason: event.reason,
        })
        break
      case 'tool': {
        const key = identityKey('tool', event.turnId, event.callId)
        const existingIndex = lifecycleIndexes.get(key)
        if (existingIndex === undefined) {
          lifecycleIndexes.set(key, rows.length)
          rows.push({
            key,
            type: 'tool',
            turnId: event.turnId,
            callId: event.callId,
            name: event.name,
            state: event.state,
            ...(event.summary === undefined ? {} : { summary: event.summary }),
            firstSeq: event.seq,
            latestSeq: event.seq,
          })
          break
        }

        const current = rows[existingIndex]
        if (current?.type !== 'tool') break
        rows[existingIndex] = {
          ...current,
          name: event.name === 'tool' && current.name !== 'tool' ? current.name : event.name,
          state: event.state,
          ...(event.summary === undefined ? {} : { summary: event.summary }),
          latestSeq: event.seq,
        }
        break
      }
      case 'interaction': {
        const key = identityKey('interaction', event.interactionKind, event.interactionId)
        const existingIndex = lifecycleIndexes.get(key)
        if (existingIndex === undefined) {
          lifecycleIndexes.set(key, rows.length)
          rows.push({
            key,
            type: 'interaction',
            turnId: event.turnId,
            interactionId: event.interactionId,
            interactionKind: event.interactionKind,
            state: event.state,
            prompt: event.prompt,
            firstSeq: event.seq,
            latestSeq: event.seq,
          })
          break
        }

        const current = rows[existingIndex]
        if (current?.type !== 'interaction') break
        rows[existingIndex] = {
          ...current,
          turnId: event.turnId,
          state: event.state,
          // The initial prompt carries the actual question. Terminal Host
          // events often contain only a generic lifecycle label.
          prompt: current.prompt || event.prompt,
          latestSeq: event.seq,
        }
        break
      }
      case 'error':
        rows.push({
          key: `error:${event.seq}`,
          type: 'error',
          seq: event.seq,
          ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
          message: event.message,
        })
        break
    }
  }

  return rows
}

/** @param {unknown} value @returns {string | undefined} */
function optionalIdentity(value) {
  return typeof value === 'string' || Number.isSafeInteger(value)
    ? String(value)
    : undefined
}

/**
 * Normalize the opaque current-attempt snapshot supplied by the event feed.
 * The Host owns the primary bound; this client cap is a defensive DOM bound.
 *
 * @param {unknown} live
 * @returns {TranscriptLiveRow | null}
 */
export function normalizeLiveOutput(live) {
  if (typeof live === 'string') {
    if (live.trim() === '') return null
    const truncated = live.length > MAX_LIVE_TEXT_LENGTH
    return {
      key: 'live:["current"]',
      text: truncated ? live.slice(-MAX_LIVE_TEXT_LENGTH) : live,
      truncated,
    }
  }
  if (live === null || typeof live !== 'object') return null

  const input = /** @type {Record<string, unknown>} */ (live)
  if (typeof input.text !== 'string' || input.text.trim() === '') return null
  const childSessionId = optionalIdentity(input.childSessionId)
  const attemptId = optionalIdentity(input.attemptId)
  const turnId = optionalIdentity(input.turnId)
  const step = optionalIdentity(input.step)
  const clipped = input.text.length > MAX_LIVE_TEXT_LENGTH
  const identity = attemptId ?? turnId ?? 'current'

  return {
    key: `live:${JSON.stringify([identity])}`,
    ...(childSessionId === undefined ? {} : { childSessionId }),
    ...(attemptId === undefined ? {} : { attemptId }),
    ...(turnId === undefined ? {} : { turnId }),
    ...(step === undefined ? {} : { step }),
    text: clipped ? input.text.slice(-MAX_LIVE_TEXT_LENGTH) : input.text,
    truncated: input.truncated === true || clipped,
  }
}

/**
 * A lagging live snapshot must not duplicate a durable, settled turn.
 * @param {readonly TranscriptRow[]} rows
 * @param {TranscriptLiveRow | null} live
 */
export function liveOutputIsSettled(rows, live) {
  if (live?.turnId === undefined) return false
  return rows.some((row) => row.type === 'turn' && row.state === 'ended' && row.turnId === live.turnId)
}
