import { validateSidechatPromptContent } from './attachments.js'
import { OwnershipError } from './ownership.js'
import { filterChildEvents } from './seed.js'

const DEFAULT_EVENT_PAGE_LIMIT = 100

export class SidechatOperationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'SidechatOperationError'
    this.code = code
    this.details = details
  }
}

function summaryOf(record) {
  return {
    childSessionId: record.childSessionId,
    parentSessionId: record.parentSessionId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.archivedAt === undefined ? 'idle' : 'archived',
  }
}

function textSummary(content) {
  if (!Array.isArray(content)) return undefined
  const text = content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim()
  return text.length === 0 ? undefined : text
}

function normalizeContent(content) {
  if (!Array.isArray(content)) return []
  const normalized = []
  for (const part of content) {
    if (part?.type === 'text' && typeof part.text === 'string') {
      normalized.push({ type: 'text', text: part.text })
      continue
    }

    const attachment = part?.attachment
    if (
      part?.type === 'image' &&
      attachment !== null &&
      typeof attachment === 'object' &&
      typeof attachment.attachmentId === 'string' &&
      typeof attachment.mediaType === 'string' &&
      Number.isSafeInteger(attachment.bytes) &&
      Number.isSafeInteger(attachment.width) &&
      Number.isSafeInteger(attachment.height)
    ) {
      normalized.push({
        type: 'image',
        attachmentId: attachment.attachmentId,
        mediaType: attachment.mediaType,
        bytes: attachment.bytes,
        width: attachment.width,
        height: attachment.height,
        ...(typeof attachment.name === 'string' ? { name: attachment.name } : {}),
      })
      continue
    }

    if (
      part?.type === 'file' &&
      attachment !== null &&
      typeof attachment === 'object' &&
      typeof attachment.attachmentId === 'string' &&
      typeof attachment.name === 'string' &&
      Number.isSafeInteger(attachment.bytes)
    ) {
      normalized.push({
        type: 'file',
        attachmentId: attachment.attachmentId,
        name: attachment.name,
        bytes: attachment.bytes,
      })
    }
  }
  return normalized
}

function explicitTurnId(value) {
  return typeof value === 'string' || Number.isSafeInteger(value)
    ? String(value)
    : undefined
}

function turnIdOf(event, message, activeTurnId) {
  return explicitTurnId(event.data?.turn) ??
    explicitTurnId(message?.turn) ??
    explicitTurnId(message?.turnId) ??
    activeTurnId ??
    `turn-${event.seq}`
}

export function normalizeSessionEvent(event, activeTurnId) {
  if (event === null || typeof event !== 'object' || !Number.isSafeInteger(event.seq)) {
    return null
  }

  const data = event.data ?? {}
  switch (event.type) {
    case 'user/message': {
      const message = data
      const source = message.source?.kind === 'user' ? 'user' : 'plugin-injection'
      return {
        seq: event.seq,
        kind: 'message',
        turnId: turnIdOf(event, message, activeTurnId),
        role: 'user',
        source,
        content: normalizeContent(message.content),
      }
    }
    case 'assistant/message': {
      const message = data.message ?? {}
      return {
        seq: event.seq,
        kind: 'message',
        turnId: turnIdOf(event, message, activeTurnId),
        role: 'assistant',
        source: 'assistant',
        content: normalizeContent(message.content),
      }
    }
    case 'turn/start':
      return {
        seq: event.seq,
        kind: 'turn-start',
        turnId: turnIdOf(event, undefined, activeTurnId),
      }
    case 'turn/end': {
      const turnId = turnIdOf(event, undefined, activeTurnId)
      if (data.reason?.kind === 'error') {
        const failure = data.reason.error ?? data.reason.failure
        const message = typeof failure === 'string'
          ? failure
          : typeof failure?.message === 'string'
            ? failure.message
            : 'Side chat turn failed.'
        return {
          seq: event.seq,
          kind: 'error',
          turnId,
          message: message.slice(0, 4_096),
        }
      }
      return {
        seq: event.seq,
        kind: 'turn-end',
        turnId,
        reason: typeof data.reason === 'string'
          ? data.reason
          : typeof data.reason?.kind === 'string'
            ? data.reason.kind
            : 'unknown',
      }
    }
    case 'tool/call':
      return {
        seq: event.seq,
        kind: 'tool',
        turnId: turnIdOf(event, undefined, activeTurnId),
        callId: typeof data.callId === 'string' ? data.callId : `call-${event.seq}`,
        name: typeof data.name === 'string'
          ? data.name
          : typeof data.tool?.name === 'string'
            ? data.tool.name
            : 'tool',
        state: 'running',
      }
    case 'tool/result': {
      const message = data.message ?? {}
      const isError = data.error !== undefined || message.isError === true
      const summary = textSummary(message.content)
      return {
        seq: event.seq,
        kind: 'tool',
        turnId: turnIdOf(event, undefined, activeTurnId),
        callId: typeof message.source?.callId === 'string'
          ? message.source.callId
          : typeof data.callId === 'string'
            ? data.callId
            : `call-${event.seq}`,
        name: typeof data.name === 'string' ? data.name : 'tool',
        state: isError ? 'failed' : 'succeeded',
        ...(summary === undefined ? {} : { summary }),
      }
    }
    case 'approval/asked':
      return {
        seq: event.seq,
        kind: 'interaction',
        turnId: turnIdOf(event, undefined, activeTurnId),
        interactionId: String(data.id ?? data.approvalId ?? `approval-${event.seq}`),
        interactionKind: 'approval',
        state: 'pending',
        prompt: String(data.prompt ?? data.reason ?? 'Approval required'),
      }
    case 'approval/decided':
      return {
        seq: event.seq,
        kind: 'interaction',
        turnId: turnIdOf(event, undefined, activeTurnId),
        interactionId: String(data.id ?? data.approvalId ?? `approval-${event.seq}`),
        interactionKind: 'approval',
        state: 'resolved',
        prompt: String(data.prompt ?? data.reason ?? 'Approval resolved'),
      }
    default:
      return null
  }
}

export class SidechatOperations {
  constructor({
    ownership,
    sessionController,
    forkService,
    interactions,
    modelPermission,
    liveState = {
      snapshot: () => undefined,
      questionSnapshots: () => [],
      errorSnapshot: () => undefined,
    },
    eventPageLimit = DEFAULT_EVENT_PAGE_LIMIT,
  }) {
    this.ownership = ownership
    this.sessionController = sessionController
    this.forkService = forkService
    this.interactions = interactions
    this.modelPermission = modelPermission
    this.liveState = liveState
    this.eventPageLimit = eventPageLimit
  }

  /** @returns {Promise<{ childSessionId: string }>} */
  async start(input) {
    const value = await this.forkService.forkSideSession({
      parentSessionId: input.parentSessionId,
    })
    return { childSessionId: value.childSessionId }
  }

  /** @returns {Promise<{ threads: import('./types.js').SidechatThreadSummary[] }>} */
  async list(input) {
    const records = this.ownership.listByParent(input.parentSessionId, {
      includeArchived: input.includeArchived,
    })
    return { threads: records.map(summaryOf) }
  }

  /** @returns {Promise<import('./types.js').SidechatThreadSummary>} */
  async info(input) {
    return summaryOf(this.ownedRecord(input.childSessionId))
  }

  /** @returns {Promise<{ ok: true }>} */
  async rename(input) {
    const record = this.ownedRecord(input.childSessionId)
    await this.ownership.rename(input.childSessionId, record.parentSessionId, input.title)
    return { ok: true }
  }

  /** @returns {Promise<{ ok: true }>} */
  async archive(input) {
    const record = this.ownedRecord(input.childSessionId)
    await this.ownership.archive(input.childSessionId, record.parentSessionId)
    return { ok: true }
  }

  /** @returns {Promise<{ accepted: true }>} */
  async prompt(input, signal) {
    this.activeOwnedRecord(input.childSessionId)
    validateSidechatPromptContent(input.content)
    return this.sessionController.prompt({
      sessionId: input.childSessionId,
      requestId: input.requestId,
      mode: 'queue',
      content: input.content,
    }, signal)
  }

  /** @returns {Promise<{ accepted: true }>} */
  async cancel(input) {
    this.activeOwnedRecord(input.childSessionId)
    const resolved = await this.sessionController.resolveAgent(input.childSessionId)
    if (resolved && typeof resolved === 'object' && 'error' in resolved) {
      throw new SidechatOperationError(
        'sidechat/session-unavailable',
        'Side chat session is unavailable.',
        { childSessionId: input.childSessionId },
      )
    }
    return this.sessionController.cancel({ sessionId: input.childSessionId })
  }

  /** @returns {Promise<{ answered: true }>} */
  async answerQuestion(input) {
    return this.interactions.answerQuestion(input)
  }

  /** @returns {Promise<{ resolved: true }>} */
  async resolveApproval(input) {
    return this.interactions.resolveApproval(input)
  }

  /** @returns {Promise<import('./types.js').SidechatConfigurationCatalogs>} */
  async configurationCatalogs() {
    return this.modelPermission.configurationCatalogs()
  }

  /** @returns {Promise<import('./types.js').SidechatConfiguration>} */
  async configuration(input, signal) {
    return this.modelPermission.configuration(input.childSessionId, signal)
  }

  /** @returns {Promise<{ selected: import('./types.js').SidechatModelSelection }>} */
  async selectModel(input) {
    return this.modelPermission.selectModel(input)
  }

  /** @returns {Promise<{ selected: string }>} */
  async selectPermission(input) {
    return this.modelPermission.selectPermission(input)
  }

  /** @returns {Promise<import('./types.js').SidechatEventPage>} */
  async events(input, signal) {
    this.ownedRecord(input.childSessionId)
    const afterSeq = input.afterSeq ?? -1
    if (!Number.isSafeInteger(afterSeq) || afterSeq < -1) {
      throw new SidechatOperationError(
        'sidechat/cursor-invalid',
        'Side chat event cursor is invalid.',
        { childSessionId: input.childSessionId },
      )
    }

    signal?.throwIfAborted()
    let snapshot
    try {
      snapshot = await this.sessionController.inspect(input.childSessionId, signal)
      signal?.throwIfAborted()
    } catch (cause) {
      if (signal?.aborted) signal.throwIfAborted()
      throw new SidechatOperationError(
        'sidechat/session-unavailable',
        'Side chat session is unavailable.',
        { childSessionId: input.childSessionId, cause: String(cause) },
      )
    }

    const committedCursor = snapshot.events.at(-1)?.seq ?? -1
    if (afterSeq > committedCursor) {
      throw new SidechatOperationError(
        'sidechat/cursor-invalid',
        'Side chat event cursor is past the committed session cursor.',
        { childSessionId: input.childSessionId, committedCursor },
      )
    }

    const childEvents = filterChildEvents(snapshot.events, snapshot.inheritedEventCount)
    const events = []
    let activeTurnId
    let lastScannedSeq = afterSeq
    for (const event of childEvents) {
      signal?.throwIfAborted()
      const eventTurnId = explicitTurnId(event.data?.turn)
      if (event.type === 'turn/start' && eventTurnId !== undefined) {
        activeTurnId = eventTurnId
      }

      const normalized = normalizeSessionEvent(event, activeTurnId)
      if (event.seq > afterSeq && event.seq <= committedCursor) {
        lastScannedSeq = event.seq
        if (normalized !== null) events.push(normalized)
        if (events.length >= this.eventPageLimit) break
      }

      if (event.type === 'turn/end') activeTurnId = undefined
    }

    return {
      events,
      nextSeq: lastScannedSeq,
      live: this.liveState.snapshot(input.childSessionId) ?? null,
      transient: {
        questions: this.liveState.questionSnapshots?.(input.childSessionId) ?? [],
        error: this.liveState.errorSnapshot?.(input.childSessionId) ?? null,
      },
    }
  }

  ownedRecord(childSessionId) {
    try {
      return this.ownership.resolve(childSessionId)
    } catch (error) {
      if (error instanceof OwnershipError && error.code === 'not-found') {
        throw new SidechatOperationError(
          'sidechat/not-found',
          'Side chat thread was not found.',
          { childSessionId },
        )
      }
      throw error
    }
  }

  activeOwnedRecord(childSessionId) {
    const record = this.ownedRecord(childSessionId)
    if (record.archivedAt !== undefined) {
      throw new SidechatOperationError(
        'sidechat/archived',
        'Side chat thread is archived.',
        { childSessionId },
      )
    }
    return record
  }
}
