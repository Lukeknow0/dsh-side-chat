/**
 * @typedef {import('../sidechat/types.js').SidechatEvent} SidechatEvent
 * @typedef {import('../sidechat/types.js').SidechatTransientSnapshot} SidechatTransientSnapshot
 * @typedef {{ events: readonly SidechatEvent[], nextSeq: number, live?: any, transient?: SidechatTransientSnapshot }} EventPage
 * @typedef {{ events(childSessionId: string, afterSeq: number | undefined, signal: AbortSignal): Promise<EventPage> }} EventApi
 * @typedef {{ childSessionId: string | undefined, events: readonly SidechatEvent[], live: any, transient: SidechatTransientSnapshot, error: unknown, polling: boolean, revision: number }} EventFeedSnapshot
 */

const EMPTY_TRANSIENT = /** @type {SidechatTransientSnapshot} */ (Object.freeze({
  questions: Object.freeze([]),
  error: null,
}))

/** @param {number} delay @param {AbortSignal} signal @returns {Promise<void>} */
function waitFor(delay, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason)
    }
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, delay)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** @param {number} attempt */
function defaultRetryDelay(attempt) {
  return Math.min(250 * (2 ** (attempt - 1)), 5_000)
}

/**
 * Poll the durable event API for exactly one selected, visible child.
 * @param {{
 *   api: EventApi,
 *   pollInterval?: number,
 *   retryDelay?: (attempt: number, error: unknown) => number,
 *   wait?: (delay: number, signal: AbortSignal) => Promise<unknown>,
 * }} options
 */
export function createSidechatEventFeed({
  api,
  pollInterval = 250,
  retryDelay = defaultRetryDelay,
  wait = waitFor,
}) {
  const listeners = new Set()
  let disposed = false
  let visible = false
  /** @type {string | undefined} */
  let childSessionId
  /** @type {number | undefined} */
  let cursor
  const seenSeqs = new Set()
  /** @type {AbortController | undefined} */
  let controller
  let generation = 0
  let revision = 0
  /** @type {EventFeedSnapshot} */
  let snapshot = {
    childSessionId: undefined,
    events: [],
    live: null,
    transient: EMPTY_TRANSIENT,
    error: undefined,
    polling: false,
    revision,
  }

  /** @param {Partial<EventFeedSnapshot>} patch */
  function publish(patch) {
    revision += 1
    snapshot = { ...snapshot, ...patch, revision }
    for (const listener of listeners) listener()
  }

  function stop() {
    generation += 1
    controller?.abort()
    controller = undefined
    if (snapshot.polling) publish({ polling: false })
  }

  function start() {
    if (disposed || !visible || childSessionId === undefined || controller !== undefined) return
    const run = ++generation
    controller = new AbortController()
    const signal = controller.signal
    publish({ polling: true, error: undefined })
    void (async () => {
      let retryAttempt = 0
      while (!disposed && visible && run === generation && childSessionId !== undefined) {
        const activeChildId = /** @type {string} */ (childSessionId)
        try {
          const page = await api.events(activeChildId, cursor, signal)
          if (disposed || signal.aborted || run !== generation || childSessionId !== activeChildId) return
          cursor = page.nextSeq
          const appended = []
          for (const event of page.events) {
            if (!Number.isSafeInteger(event?.seq) || seenSeqs.has(event.seq)) continue
            seenSeqs.add(event.seq)
            appended.push(event)
          }
          const nextLive = page.live ?? null
          const live = nextLive !== null
            && typeof nextLive === 'object'
            && typeof nextLive.turnId === 'string'
            && page.events.some((event) => event?.kind === 'turn-end' && event.turnId === nextLive.turnId)
            ? null
            : nextLive
          publish({
            events: appended.length === 0 ? snapshot.events : [...snapshot.events, ...appended],
            live,
            transient: page.transient ?? EMPTY_TRANSIENT,
            error: undefined,
          })
          retryAttempt = 0
          await wait(pollInterval, signal)
        } catch (error) {
          if (disposed || signal.aborted || run !== generation) return
          retryAttempt += 1
          publish({ error })
          try {
            await wait(retryDelay(retryAttempt, error), signal)
          } catch (waitError) {
            if (disposed || signal.aborted || run !== generation) return
            publish({ error: waitError })
            return
          }
        }
      }
    })()
  }

  return {
    /** @param {string | undefined} nextChildSessionId @param {boolean} nextVisible */
    setTarget(nextChildSessionId, nextVisible) {
      if (disposed) return
      const changedChild = nextChildSessionId !== childSessionId
      const changedVisibility = nextVisible !== visible
      if (!changedChild && !changedVisibility) return
      stop()
      visible = nextVisible
      childSessionId = nextChildSessionId
      if (changedChild) {
        cursor = undefined
        seenSeqs.clear()
        publish({
          childSessionId,
          events: [],
          live: null,
          transient: EMPTY_TRANSIENT,
          error: undefined,
        })
      }
      start()
    },

    /** @param {() => void} listener */
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    getSnapshot() {
      return snapshot
    },

    dispose() {
      if (disposed) return
      disposed = true
      stop()
      listeners.clear()
    },
  }
}
