/**
 * Child-owned response adapter for rc.2 question and approval waterfalls.
 */

const INTERACTIVE_APPROVAL_OUTCOMES = new Set(['allowed-once', 'rejected'])

function sessionIdOf(request) {
  const sessionId = request?.agent?.session?.id
  return typeof sessionId === 'string' && sessionId.length > 0
    ? sessionId
    : undefined
}

export class SidechatInteractionError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'SidechatInteractionError'
    this.code = code
    this.details = details
  }
}

export class SidechatInteractionHost {
  constructor({ ownership, liveState, maxSettledInteractions = 256 }) {
    if (!Number.isSafeInteger(maxSettledInteractions) || maxSettledInteractions < 0) {
      throw new TypeError('maxSettledInteractions must be a non-negative safe integer')
    }
    this.ownership = ownership
    this.liveState = liveState
    this.maxSettledInteractions = maxSettledInteractions
    this.pendingQuestions = new Map()
    this.claimedQuestions = new Set()
    this.settledQuestions = new Map()
    this.approvalAsks = new Map()
    this.pendingApprovals = new Map()
    this.settledApprovals = new Map()
    this.closed = false
  }

  activeOwnedRecord(childSessionId) {
    let record
    try {
      record = this.ownership.resolve(childSessionId)
    } catch (cause) {
      if (cause?.code !== 'not-found') throw cause
      throw new SidechatInteractionError(
        'sidechat/not-found',
        'Side chat was not found.',
        { childSessionId },
      )
    }
    if (record.archivedAt !== undefined) {
      throw new SidechatInteractionError(
        'sidechat/archived',
        'Side chat is archived.',
        { childSessionId },
      )
    }
    return record
  }

  tracks(childSessionId) {
    try {
      this.activeOwnedRecord(childSessionId)
      return true
    } catch {
      return false
    }
  }

  claimQuestionSnapshot(childSessionId, questions) {
    const snapshots = this.liveState?.questionSnapshots?.(childSessionId)
    if (!Array.isArray(snapshots)) return undefined
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      const snapshot = snapshots[index]
      if (
        typeof snapshot?.requestId !== 'string'
        || this.claimedQuestions.has(snapshot.requestId)
        || !Array.isArray(snapshot.questions)
        || snapshot.questions.length === 0
        || snapshot.questions.some((question, questionIndex) => (
          question?.id !== questions[questionIndex]?.id
        ))
      ) continue
      this.claimedQuestions.add(snapshot.requestId)
      return snapshot.requestId
    }
    return undefined
  }

  async trackQuestion(request, next) {
    if (this.closed) return next()
    const childSessionId = sessionIdOf(request)
    if (childSessionId === undefined || !this.tracks(childSessionId)) return next()
    const requestId = this.claimQuestionSnapshot(childSessionId, request.questions)
    if (requestId === undefined) return next()

    let resolve
    let reject
    const result = new Promise((onResolve, onReject) => {
      resolve = onResolve
      reject = onReject
    })
    const pending = {
      childSessionId,
      questions: request.questions,
      resolve,
      reject,
      delegate: next,
    }
    this.pendingQuestions.set(requestId, pending)
    const onAbort = () => {
      if (this.pendingQuestions.get(requestId) !== pending) return
      this.pendingQuestions.delete(requestId)
      this.rememberSettled(this.settledQuestions, requestId, childSessionId)
      reject(request.signal?.reason instanceof Error
        ? request.signal.reason
        : new Error('question request was aborted'))
    }
    request.signal?.addEventListener('abort', onAbort, { once: true })
    if (request.signal?.aborted) onAbort()
    try {
      return await result
    } finally {
      request.signal?.removeEventListener('abort', onAbort)
      this.pendingQuestions.delete(requestId)
    }
  }

  async answerQuestion(input) {
    this.activeOwnedRecord(input.childSessionId)
    const pending = this.pendingQuestions.get(input.requestId)
    if (pending === undefined || pending.childSessionId !== input.childSessionId) {
      const stale = this.settledQuestions.get(input.requestId) === input.childSessionId
      throw new SidechatInteractionError(
        stale ? 'sidechat/interaction-stale' : 'sidechat/interaction-not-found',
        stale ? 'Pending interaction is no longer answerable.' : 'Pending interaction was not found.',
        { childSessionId: input.childSessionId, interactionId: input.requestId },
      )
    }
    const answer = normalizeAnswers(input.answers, pending.questions, input)
    this.pendingQuestions.delete(input.requestId)
    this.rememberSettled(
      this.settledQuestions,
      input.requestId,
      input.childSessionId,
    )
    pending.resolve({ answers: answer })
    return { answered: true }
  }

  acceptSessionEvent(session, event) {
    if (this.closed) return
    const childSessionId = session?.id
    if (typeof childSessionId !== 'string' || !this.tracks(childSessionId)) return
    const interactionId = event?.data?.id
    if (typeof interactionId !== 'string' || interactionId.length === 0) return

    if (event.type === 'approval/asked') {
      if (typeof event.data.toolName !== 'string' || event.data.toolName.length === 0) return
      const asks = this.approvalAsks.get(childSessionId) ?? []
      asks.push({
        interactionId,
        toolName: event.data.toolName,
        callId: event.data.callId,
        reason: event.data.reason,
        claimed: false,
      })
      this.approvalAsks.set(childSessionId, asks)
      return
    }

    if (event.type === 'approval/decided') {
      const asks = this.approvalAsks.get(childSessionId)
      if (asks !== undefined) {
        const remaining = asks.filter((ask) => ask.interactionId !== interactionId)
        if (remaining.length === 0) this.approvalAsks.delete(childSessionId)
        else this.approvalAsks.set(childSessionId, remaining)
      }
      this.rememberSettled(this.settledApprovals, interactionId, childSessionId)
    }
  }

  claimApproval(childSessionId, request) {
    const asks = this.approvalAsks.get(childSessionId)
    if (asks === undefined) return undefined
    const ask = asks.find((candidate) => (
      !candidate.claimed
      && candidate.toolName === request.toolName
      && candidate.callId === request.callId
      && candidate.reason === request.reason
    ))
    if (ask === undefined) return undefined
    ask.claimed = true
    return ask.interactionId
  }

  async trackApproval(request, next) {
    if (this.closed) return next()
    const childSessionId = sessionIdOf(request)
    if (childSessionId === undefined || !this.tracks(childSessionId)) return next()
    const interactionId = this.claimApproval(childSessionId, request)
    if (interactionId === undefined) return next()

    let resolve
    let reject
    const result = new Promise((onResolve, onReject) => {
      resolve = onResolve
      reject = onReject
    })
    const pending = { childSessionId, resolve, reject, delegate: next }
    this.pendingApprovals.set(interactionId, pending)
    const onAbort = () => {
      if (this.pendingApprovals.get(interactionId) !== pending) return
      this.pendingApprovals.delete(interactionId)
      this.rememberSettled(this.settledApprovals, interactionId, childSessionId)
      resolve('cancelled')
    }
    request.signal?.addEventListener('abort', onAbort, { once: true })
    if (request.signal?.aborted) onAbort()
    try {
      return await result
    } finally {
      request.signal?.removeEventListener('abort', onAbort)
      this.pendingApprovals.delete(interactionId)
    }
  }

  async resolveApproval(input) {
    this.activeOwnedRecord(input.childSessionId)
    const pending = this.pendingApprovals.get(input.interactionId)
    if (pending === undefined || pending.childSessionId !== input.childSessionId) {
      const stale = this.settledApprovals.get(input.interactionId) === input.childSessionId
      throw new SidechatInteractionError(
        stale ? 'sidechat/interaction-stale' : 'sidechat/interaction-not-found',
        stale ? 'Pending interaction is no longer answerable.' : 'Pending interaction was not found.',
        { childSessionId: input.childSessionId, interactionId: input.interactionId },
      )
    }
    if (!INTERACTIVE_APPROVAL_OUTCOMES.has(input.decision)) {
      throw invalidResponse(input)
    }

    this.pendingApprovals.delete(input.interactionId)
    this.rememberSettled(
      this.settledApprovals,
      input.interactionId,
      input.childSessionId,
    )
    pending.resolve(input.decision)
    return { resolved: true }
  }

  close() {
    if (this.closed) return
    this.closed = true

    for (const [requestId, pending] of this.pendingQuestions) {
      this.pendingQuestions.delete(requestId)
      this.rememberSettled(this.settledQuestions, requestId, pending.childSessionId)
      Promise.resolve().then(pending.delegate).then(pending.resolve, pending.reject)
    }
    for (const [interactionId, pending] of this.pendingApprovals) {
      this.pendingApprovals.delete(interactionId)
      this.rememberSettled(
        this.settledApprovals,
        interactionId,
        pending.childSessionId,
      )
      Promise.resolve().then(pending.delegate).then(pending.resolve, pending.reject)
    }
    this.approvalAsks.clear()
  }

  rememberSettled(store, interactionId, childSessionId) {
    store.delete(interactionId)
    store.set(interactionId, childSessionId)
    while (store.size > this.maxSettledInteractions) {
      const oldest = store.keys().next().value
      store.delete(oldest)
      if (store === this.settledQuestions) this.claimedQuestions.delete(oldest)
    }
  }
}

function normalizeAnswers(answers, questions, input) {
  if (!Array.isArray(answers) || answers.length !== questions.length) {
    throw invalidResponse(input)
  }
  const byId = new Map()
  for (const answer of answers) {
    if (
      answer === null
      || typeof answer !== 'object'
      || Array.isArray(answer)
      || typeof answer.id !== 'string'
      || !Array.isArray(answer.selected)
      || answer.selected.some((value) => typeof value !== 'string')
      || (answer.custom !== undefined && typeof answer.custom !== 'string')
      || byId.has(answer.id)
    ) throw invalidResponse(input)
    byId.set(answer.id, answer)
  }
  const normalized = []
  for (const question of questions) {
    const answer = byId.get(question.id)
    if (answer === undefined) throw invalidResponse(input)
    const selected = new Set(answer.selected)
    const labels = new Set(
      Array.isArray(question.options)
        ? question.options.map((option) => option?.label)
        : [],
    )
    if (
      selected.size !== answer.selected.length
      || answer.selected.some((label) => !labels.has(label))
      || (question.multiSelect !== true && answer.selected.length > 1)
      || (
        question.multiSelect !== true
        && answer.custom !== undefined
        && answer.selected.length > 0
      )
    ) throw invalidResponse(input)
    normalized.push({
      id: answer.id,
      selected: [...answer.selected],
      ...(answer.custom === undefined ? {} : { custom: answer.custom }),
    })
  }
  return normalized
}

function invalidResponse(input) {
  return new SidechatInteractionError(
    'sidechat/interaction-response-invalid',
    'Interaction response is invalid.',
    {
      childSessionId: input.childSessionId,
      interactionId: input.requestId ?? input.interactionId,
    },
  )
}

export function installSidechatInteractions(ctx, options) {
  if (ctx === null || typeof ctx !== 'object' || typeof ctx.on !== 'function') {
    throw new TypeError('ctx.on must be a function')
  }

  const host = new SidechatInteractionHost(options)
  const disposers = []
  try {
    disposers.push(ctx.on(
      'session/event',
      (session, event) => { host.acceptSessionEvent(session, event) },
      { global: true },
    ))
    // SidechatLiveState must already own the earlier question observer so its
    // public requestId is available when this answerer receives `next()`.
    disposers.push(ctx.on(
      'user-questions/request',
      (request, next) => host.trackQuestion(request, next),
      { global: true },
    ))
    disposers.push(ctx.on(
      'approval/request',
      (request, next) => host.trackApproval(request, next),
      { global: true },
    ))
  } catch (error) {
    host.close()
    for (const dispose of disposers.reverse()) dispose?.()
    throw error
  }

  let closed = false
  return {
    host,
    close() {
      if (closed) return
      closed = true
      host.close()
      for (const dispose of disposers.reverse()) dispose?.()
    },
  }
}

export { INTERACTIVE_APPROVAL_OUTCOMES }
