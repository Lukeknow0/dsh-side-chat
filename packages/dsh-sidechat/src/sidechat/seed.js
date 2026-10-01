/**
 * Task 1.2: Session forking and seed boundary helper.
 *
 * Implements side-chat session creation via parent fork:
 * 1. Resolves parent session state and finds the safe committed turn boundary.
 * 2. Invokes DSH `sessionController.fork({ sessionId: parentSessionId })` or delegates.
 * 3. Atomically registers the parent→child association in OwnershipStore.
 * 4. Compensates by disposing the orphaned child session if association storage fails.
 * 5. Safely filters out inherited seed events so side-chat history only contains child events.
 */

export class ForkBoundaryError extends Error {
  constructor(code, message, detail = {}) {
    super(message)
    this.name = 'ForkBoundaryError'
    this.code = code
    this.detail = detail
  }
}

/**
 * Pure function: calculates the latest committed prefix boundary from an event list.
 *
 * Rules:
 * - Must have at least one turn/end.
 * - Stops before any subsequent turn/start, user/message (append), or inbox splice.
 * - Blank/empty session returns undefined (no completed turn to fork from).
 *
 * @param {Array<{ seq: number, type: string, surfaceOp?: string }>} events
 * @returns {number | undefined} The inclusive seq boundary, or undefined if no completed turn exists.
 */
export function calculateCompletedPrefixBoundary(events) {
  if (!Array.isArray(events) || events.length === 0) return undefined

  const lastTurnEnd = events.findLast((e) => e.type === 'turn/end')
  if (lastTurnEnd === undefined) return undefined

  let boundary = lastTurnEnd.seq
  for (const next of events.slice(boundary + 1)) {
    if (
      next.type === 'turn/start' ||
      (next.type === 'user/message' && next.surfaceOp === 'append') ||
      next.type === 'agent/inbox/spliced'
    ) {
      break
    }
    boundary = next.seq
  }
  return boundary
}

/**
 * Pure function: filters out inherited seed events from a child session's event stream.
 *
 * In DSH fork:
 * - Events up to boundary are cloned from parent.
 * - An event of type `session/end-seed` marks the end of inherited seed events.
 * - All subsequent events are the child session's own events.
 *
 * @param {Array<{ seq: number, type: string, data?: any }>} events
 * @param {number} [inheritedEventCount=0] Host-declared inherited prefix length.
 * @returns {Array<{ seq: number, type: string, data?: any }>} Only child-owned events.
 */
export function filterChildEvents(events, inheritedEventCount = 0) {
  if (!Array.isArray(events)) return []

  // A nested fork may inherit older tagged markers. RC2 defines the last
  // { inherited: true } marker as the current Session's ownership cut.
  const seedEndIdx = events.findLastIndex(
    (event) => event.type === 'session/end-seed' && event.data?.inherited === true,
  )
  if (seedEndIdx === -1) {
    // A fresh session has no inherited prefix and therefore needs no marker.
    // A forked session that declares inherited events but lacks the tagged
    // marker is malformed: fail closed rather than exposing ambiguous content.
    return inheritedEventCount > 0 ? [] : [...events]
  }

  // Child events start strictly after the current Session's end-seed marker and
  // any synthetic fork closers. Real DSH turn/end closers carry reason.kind.
  const childEvents = []
  for (let i = seedEndIdx + 1; i < events.length; i++) {
    const e = events[i]
    if (
      e.data?.kind === 'forked' ||
      e.data?.reason?.kind === 'forked' ||
      e.data?.inherited
    ) {
      continue
    }
    childEvents.push(e)
  }
  return childEvents
}

/**
 * Service to orchestrate atomic session forking + ownership registration + compensation.
 */
export class SidechatForkService {
  /**
   * @param {import('./ownership.js').OwnershipStore} ownershipStore
   * @param {{ fork: (req: { sessionId: string }) => Promise<{ sessionId: string }>, cancel?: (req: { sessionId: string }) => Promise<any> }} sessionController
   */
  constructor(ownershipStore, sessionController) {
    this.ownershipStore = ownershipStore
    this.sessionController = sessionController
  }

  /**
   * Atomically fork a parent session into a side-chat child session.
   *
   * @param {{ parentSessionId: string, title?: string }} input
   * @returns {Promise<{ childSessionId: string, title: string, createdAt: number }>}
   */
  async forkSideSession(input) {
    const { parentSessionId, title = '' } = input
    if (!parentSessionId) {
      throw new ForkBoundaryError('bad-request', 'parentSessionId is required')
    }

    // 1. Invoke host session controller fork
    let forked
    try {
      forked = await this.sessionController.fork({ sessionId: parentSessionId })
    } catch (err) {
      throw new ForkBoundaryError(
        'fork-failed',
        `Failed to fork parent session "${parentSessionId}": ${err.message}`,
        { cause: err },
      )
    }

    const childSessionId = forked.sessionId

    // 2. Persist ownership record
    try {
      const record = await this.ownershipStore.create({
        parentSessionId,
        childSessionId,
        title,
      })
      return {
        childSessionId: record.childSessionId,
        title: record.title,
        createdAt: record.createdAt,
      }
    } catch (storeErr) {
      // 3. Compensation: association write failed, dispose/cancel orphaned child session
      if (typeof this.sessionController.cancel === 'function') {
        try {
          await this.sessionController.cancel({ sessionId: childSessionId })
        } catch {
          // compensation error suppressed to preserve original store failure
        }
      }
      throw new ForkBoundaryError(
        'association-failed',
        `Failed to store thread association for child "${childSessionId}": ${storeErr.message}`,
        { cause: storeErr, childSessionId },
      )
    }
  }
}
