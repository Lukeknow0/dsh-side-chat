const DEFAULT_MAX_TEXT_CHARS = 32_768
const DEFAULT_MAX_QUESTION_TEXT_CHARS = 8_192
const DEFAULT_MAX_QUESTIONS_PER_REQUEST = 8
const DEFAULT_MAX_OPTIONS_PER_QUESTION = 16
const DEFAULT_MAX_PENDING_QUESTION_REQUESTS = 4
const DEFAULT_MAX_ERROR_CHARS = 2_048
const MAX_ERROR_CODE_CHARS = 128
const EMPTY_QUESTION_SNAPSHOTS = Object.freeze([])

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
}

function requireBound(value, name) {
  if (!isNonNegativeSafeInteger(value)) {
    throw new TypeError(`${name} must be a non-negative safe integer`)
  }
  return value
}

function sessionIdOf(payload) {
  const sessionId = payload?.agent?.session?.id
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined
}

function validRevision(frame) {
  return Number.isSafeInteger(frame?.revision) && frame.revision > 0
}

function validAttemptId(frame) {
  return typeof frame?.attemptId === 'string' && frame.attemptId.length > 0
}

function validStart(frame) {
  return validAttemptId(frame) &&
    isNonNegativeSafeInteger(frame.turn) &&
    isNonNegativeSafeInteger(frame.step)
}

function validIndexedFrame(frame) {
  return validAttemptId(frame) && isNonNegativeSafeInteger(frame.index)
}

function makeTextBudget(maxChars) {
  let remaining = maxChars
  let truncated = false
  return {
    take(value) {
      if (typeof value !== 'string') return undefined
      const text = value.slice(0, remaining)
      if (text.length < value.length) truncated = true
      remaining -= text.length
      return text
    },
    truncate() {
      truncated = true
    },
    get truncated() {
      return truncated
    },
  }
}

function sanitizeOption(candidate, budget) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return undefined
  const label = budget.take(candidate.label)
  if (label === undefined) return undefined
  const description = budget.take(candidate.description)
  return Object.freeze({
    label,
    ...(description === undefined ? {} : { description }),
  })
}

function sanitizeIntent(candidate, budget) {
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    Array.isArray(candidate) ||
    candidate.kind !== 'plan-review'
  ) return undefined

  const approve = budget.take(candidate.approve)
  if (approve === undefined) return undefined
  const callId = budget.take(candidate.callId)
  return Object.freeze({
    kind: 'plan-review',
    approve,
    ...(callId === undefined ? {} : { callId }),
  })
}

function sanitizeQuestions(request, options) {
  const source = Array.isArray(request?.questions) ? request.questions : []
  const budget = makeTextBudget(options.maxQuestionTextChars)
  if (source.length > options.maxQuestionsPerRequest) budget.truncate()

  const questions = []
  for (const candidate of source.slice(0, options.maxQuestionsPerRequest)) {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) continue
    const id = budget.take(candidate.id)
    const question = budget.take(candidate.question)
    if (id === undefined || question === undefined) continue

    const detail = budget.take(candidate.detail)
    const header = budget.take(candidate.header)
    const sourceOptions = Array.isArray(candidate.options) ? candidate.options : []
    if (sourceOptions.length > options.maxOptionsPerQuestion) budget.truncate()
    const sanitizedOptions = sourceOptions
      .slice(0, options.maxOptionsPerQuestion)
      .map((option) => sanitizeOption(option, budget))
      .filter((option) => option !== undefined)
    const intent = sanitizeIntent(candidate.intent, budget)

    questions.push(Object.freeze({
      id,
      question,
      ...(detail === undefined ? {} : { detail }),
      ...(header === undefined ? {} : { header }),
      ...(candidate.options === undefined ? {} : { options: Object.freeze(sanitizedOptions) }),
      ...(typeof candidate.multiSelect === 'boolean' ? { multiSelect: candidate.multiSelect } : {}),
      ...(intent === undefined ? {} : { intent }),
    }))
  }

  return {
    questions: Object.freeze(questions),
    truncated: budget.truncated,
  }
}

function safeErrorMessage(error) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return String(error)
  } catch {
    return 'Unknown Agent error'
  }
}

/**
 * Bounded, process-local presentation state for rc.2 Agent activity.
 *
 * Assistant snapshots retain only visible `text-delta` strings. The separate
 * question and error accessors expose sanitized JSON-safe views without
 * creating durable Session events; durable Session history stays authoritative.
 */
export class SidechatLiveState {
  constructor({
    maxTextChars = DEFAULT_MAX_TEXT_CHARS,
    maxQuestionTextChars = DEFAULT_MAX_QUESTION_TEXT_CHARS,
    maxQuestionsPerRequest = DEFAULT_MAX_QUESTIONS_PER_REQUEST,
    maxOptionsPerQuestion = DEFAULT_MAX_OPTIONS_PER_QUESTION,
    maxPendingQuestionRequests = DEFAULT_MAX_PENDING_QUESTION_REQUESTS,
    maxErrorChars = DEFAULT_MAX_ERROR_CHARS,
    isChildSessionId = () => true,
  } = {}) {
    this.maxTextChars = requireBound(maxTextChars, 'maxTextChars')
    this.maxQuestionTextChars = requireBound(maxQuestionTextChars, 'maxQuestionTextChars')
    this.maxQuestionsPerRequest = requireBound(maxQuestionsPerRequest, 'maxQuestionsPerRequest')
    this.maxOptionsPerQuestion = requireBound(maxOptionsPerQuestion, 'maxOptionsPerQuestion')
    this.maxPendingQuestionRequests = requireBound(maxPendingQuestionRequests, 'maxPendingQuestionRequests')
    this.maxErrorChars = requireBound(maxErrorChars, 'maxErrorChars')
    if (typeof isChildSessionId !== 'function') {
      throw new TypeError('isChildSessionId must be a function')
    }

    this.isChildSessionId = isChildSessionId
    this.sessions = new Map()
    this.pendingQuestions = new Map()
    this.errors = new Map()
    this.nextQuestionId = 0
    this.closed = false
  }

  /**
   * Accept the exact rc.2 `agent/assistant-stream` payload `{ agent, frame }`.
   * Revisions and chunk indexes stay internal to continuity validation.
   */
  accept(payload) {
    if (this.closed) return
    const childSessionId = sessionIdOf(payload)
    if (childSessionId === undefined || !this.#tracks(childSessionId)) return

    const frame = payload?.frame
    if (frame === null || typeof frame !== 'object' || !validRevision(frame)) return

    let session = this.sessions.get(childSessionId)
    if (session === undefined) session = { revision: 0, activeAttempt: undefined }

    // A replacement Agent lifecycle restarts its monotone frame revision at 1.
    if (frame.type === 'start' && frame.revision === 1 && session.revision !== 0) {
      session = { revision: 0, activeAttempt: undefined }
    }

    if (frame.revision <= session.revision) return
    if (frame.revision !== session.revision + 1) {
      // Continuity is lost. Do not present a partial attempt until a later
      // sequential start establishes a new current attempt.
      this.sessions.set(childSessionId, {
        revision: frame.revision,
        activeAttempt: undefined,
      })
      return
    }

    switch (frame.type) {
      case 'start': {
        if (!validStart(frame)) return
        this.sessions.set(childSessionId, {
          revision: frame.revision,
          activeAttempt: {
            attemptId: frame.attemptId,
            turnId: String(frame.turn),
            step: frame.step,
            nextIndex: 0,
            text: '',
            truncated: false,
          },
        })
        return
      }
      case 'chunk': {
        if (!validIndexedFrame(frame)) return
        const attempt = session.activeAttempt
        if (
          attempt === undefined ||
          frame.attemptId !== attempt.attemptId ||
          frame.index !== attempt.nextIndex
        ) return

        const next = { ...attempt, nextIndex: attempt.nextIndex + 1 }
        if (frame.chunk?.type === 'text-delta' && typeof frame.chunk.text === 'string') {
          const remaining = Math.max(0, this.maxTextChars - next.text.length)
          if (frame.chunk.text.length > remaining) next.truncated = true
          if (remaining > 0) next.text += frame.chunk.text.slice(0, remaining)
        }
        this.sessions.set(childSessionId, {
          revision: frame.revision,
          activeAttempt: next,
        })
        return
      }
      case 'end': {
        if (!validIndexedFrame(frame)) return
        const attempt = session.activeAttempt
        if (
          attempt === undefined ||
          frame.attemptId !== attempt.attemptId ||
          frame.index !== attempt.nextIndex
        ) return

        // rc.2 commits a durable assistant/message or assistant/attempt before
        // a committed end frame. The live copy must disappear, not be persisted.
        this.sessions.set(childSessionId, {
          revision: frame.revision,
          activeAttempt: undefined,
        })
        return
      }
      default:
        return
    }
  }

  /**
   * Transparently observe one rc.2 `user-questions/request` waterfall.
   * The exact value or rejection from `next()` is returned after cleanup.
   */
  async trackQuestion(request, next) {
    let token
    if (!this.closed) token = this.#beginQuestion(request)
    try {
      return await next()
    } finally {
      if (token !== undefined) this.#finishQuestion(token)
    }
  }

  /** Accept the exact rc.2 `agent/error` payload `{ agent, turn, step, error }`. */
  acceptError(payload) {
    if (this.closed) return
    const childSessionId = sessionIdOf(payload)
    if (
      childSessionId === undefined ||
      !this.#tracks(childSessionId) ||
      !isNonNegativeSafeInteger(payload?.turn) ||
      !isNonNegativeSafeInteger(payload?.step)
    ) return

    const rawMessage = safeErrorMessage(payload.error)
    const message = rawMessage.slice(0, this.maxErrorChars)
    const rawCode = typeof payload.error?.code === 'string' ? payload.error.code : undefined
    const code = rawCode?.slice(0, MAX_ERROR_CODE_CHARS)
    this.errors.set(childSessionId, Object.freeze({
      childSessionId,
      turnId: String(payload.turn),
      step: payload.step,
      message,
      ...(code === undefined ? {} : { code }),
      truncated: message.length < rawMessage.length || (rawCode !== undefined && code.length < rawCode.length),
    }))
  }

  /** Clear an old process-local failure when the Agent begins later work. */
  acceptStatus(payload) {
    if (payload?.status !== 'running') return
    const childSessionId = sessionIdOf(payload)
    if (childSessionId !== undefined) this.errors.delete(childSessionId)
  }

  /**
   * Retire a process-local error once the matching durable turn/end commits.
   * The durable reason is mapped separately by the history normalizer.
   */
  acceptSessionEvent(session, event) {
    const childSessionId = session?.id
    if (
      typeof childSessionId !== 'string' ||
      event?.type !== 'turn/end' ||
      !isNonNegativeSafeInteger(event.data?.turn)
    ) return
    if (this.errors.get(childSessionId)?.turnId === String(event.data.turn)) {
      this.errors.delete(childSessionId)
    }
  }

  /** Clear all process-local state for rc.2 `agent/disposed` payload `{ agent }`. */
  dispose(payload) {
    const childSessionId = sessionIdOf(payload)
    if (childSessionId !== undefined) this.clear(childSessionId)
  }

  /** Return the immutable, JSON-safe, text-only Assistant snapshot. */
  snapshot(childSessionId) {
    if (typeof childSessionId !== 'string' || childSessionId.length === 0) return undefined
    const attempt = this.sessions.get(childSessionId)?.activeAttempt
    if (attempt === undefined) return undefined

    return Object.freeze({
      childSessionId,
      attemptId: attempt.attemptId,
      turnId: attempt.turnId,
      step: attempt.step,
      text: attempt.text,
      truncated: attempt.truncated,
    })
  }

  /** Return every bounded pending question request for one child. */
  questionSnapshots(childSessionId) {
    if (typeof childSessionId !== 'string' || childSessionId.length === 0) {
      return EMPTY_QUESTION_SNAPSHOTS
    }
    const requests = this.pendingQuestions.get(childSessionId)
    return requests === undefined || requests.length === 0
      ? EMPTY_QUESTION_SNAPSHOTS
      : Object.freeze(requests.map((entry) => entry.snapshot))
  }

  /** Return the bounded process-local failure fallback for one child. */
  errorSnapshot(childSessionId) {
    if (typeof childSessionId !== 'string' || childSessionId.length === 0) return undefined
    return this.errors.get(childSessionId)
  }

  clear(childSessionId) {
    if (typeof childSessionId !== 'string') return
    this.sessions.delete(childSessionId)
    this.pendingQuestions.delete(childSessionId)
    this.errors.delete(childSessionId)
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.sessions.clear()
    this.pendingQuestions.clear()
    this.errors.clear()
  }

  #beginQuestion(request) {
    const childSessionId = sessionIdOf({ agent: request?.agent })
    if (childSessionId === undefined || !this.#tracks(childSessionId)) return undefined

    const sanitized = sanitizeQuestions(request, this)
    const requestId = `question:${String(++this.nextQuestionId)}`
    const snapshot = Object.freeze({
      childSessionId,
      requestId,
      questions: sanitized.questions,
      truncated: sanitized.truncated,
    })
    const requests = this.pendingQuestions.get(childSessionId) ?? []
    requests.push({ requestId, snapshot })
    if (requests.length > this.maxPendingQuestionRequests) {
      requests.splice(0, requests.length - this.maxPendingQuestionRequests)
    }
    if (requests.length === 0) this.pendingQuestions.delete(childSessionId)
    else this.pendingQuestions.set(childSessionId, requests)
    return { childSessionId, requestId }
  }

  #finishQuestion({ childSessionId, requestId }) {
    const requests = this.pendingQuestions.get(childSessionId)
    if (requests === undefined) return
    const next = requests.filter((entry) => entry.requestId !== requestId)
    if (next.length === 0) this.pendingQuestions.delete(childSessionId)
    else this.pendingQuestions.set(childSessionId, next)
  }

  #tracks(childSessionId) {
    try {
      return this.isChildSessionId(childSessionId) === true
    } catch {
      return false
    }
  }
}

/**
 * Subscribe a live-state buffer to exact rc.2 Host Cordis events.
 * The returned close operation removes listeners in reverse registration order
 * and clears all retained state; it is safe to call repeatedly.
 */
export function installSidechatLiveState(ctx, options) {
  if (ctx === null || typeof ctx !== 'object' || typeof ctx.on !== 'function') {
    throw new TypeError('ctx.on must be a function')
  }

  const state = new SidechatLiveState(options)
  const disposers = []
  try {
    disposers.push(ctx.on(
      'agent/assistant-stream',
      (payload) => { state.accept(payload) },
      { global: true },
    ))
    disposers.push(ctx.on(
      'user-questions/request',
      (request, next) => state.trackQuestion(request, next),
      { global: true },
    ))
    disposers.push(ctx.on(
      'agent/error',
      (payload) => { state.acceptError(payload) },
      { global: true },
    ))
    disposers.push(ctx.on(
      'agent/status',
      (payload) => { state.acceptStatus(payload) },
      { global: true },
    ))
    disposers.push(ctx.on(
      'session/event',
      (session, event) => { state.acceptSessionEvent(session, event) },
      { global: true },
    ))
    disposers.push(ctx.on(
      'agent/disposed',
      (payload) => { state.dispose(payload) },
      { global: true },
    ))
  } catch (error) {
    state.close()
    for (const dispose of disposers.reverse()) dispose?.()
    throw error
  }

  let closed = false
  return {
    state,
    close() {
      if (closed) return
      closed = true
      state.close()
      for (const dispose of disposers.reverse()) dispose?.()
    },
  }
}
