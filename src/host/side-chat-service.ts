import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import {
  appendDelegatedPolicyOverrides,
  applyChildComposition,
  childSessionMeta,
  resolveChildAgentOptions,
  resolveChildDepth,
} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'

import type {
  CancelSideChatRequest,
  CancelSideChatResult,
  CloseSideChatRequest,
  CloseSideChatResult,
  ReadSideChatRequest,
  ReadSideChatResult,
  SendSideChatRequest,
  SendSideChatResult,
  SideChatErrorCode,
  StartSideChatRequest,
  StartSideChatResult,
} from '../shared/remote.ts'
import {
  isSideChatToolAllowed,
  READ_ONLY_DENIAL,
  READ_ONLY_TOOL_CANDIDATES,
} from '../shared/tool-policy.ts'

const SIDE_CHAT_PERSONA = 'You are in a temporary side conversation, separate from the main task. '
  + 'Treat inherited history as reference context only. Do not continue or complete the parent task. '
  + 'Answer only instructions submitted in this side conversation. Use lightweight, read-only exploration. '
  + 'Never modify files, repositories, sessions, processes, remote systems, or external state. Do not delegate to subagents.'

const SIDE_CHAT_BOUNDARY = 'Side conversation boundary. Everything before this message is inherited history from the parent thread and is reference context only, not your current task. Do not continue any earlier plan, edit, command, approval, or tool call. Only direct user messages after this boundary are active instructions. This conversation is read-only.'

export const SIDE_CHAT_IDLE_TTL_MS = 30 * 60 * 1_000
export const SIDE_CHAT_LEASE_POLL_MS = 1_000

export interface SideChatLeaseInput {
  now: number
  expiresAt: number
  wasBusy: boolean
  parentRunning: boolean
  childRunning: boolean
}

export interface SideChatLeaseDecision {
  expiresAt: number
  busy: boolean
  expire: boolean
  delay: number
}

export function evaluateSideChatLease(input: SideChatLeaseInput): SideChatLeaseDecision {
  const busy = input.parentRunning || input.childRunning
  if (busy) {
    return {
      expiresAt: input.now + SIDE_CHAT_IDLE_TTL_MS,
      busy: true,
      expire: false,
      delay: SIDE_CHAT_LEASE_POLL_MS,
    }
  }
  if (input.wasBusy) {
    return {
      expiresAt: input.now + SIDE_CHAT_IDLE_TTL_MS,
      busy: false,
      expire: false,
      delay: SIDE_CHAT_LEASE_POLL_MS,
    }
  }
  if (input.expiresAt <= input.now) {
    return { expiresAt: input.expiresAt, busy: false, expire: true, delay: 0 }
  }
  return {
    expiresAt: input.expiresAt,
    busy: false,
    expire: false,
    delay: Math.max(1, Math.min(SIDE_CHAT_LEASE_POLL_MS, input.expiresAt - input.now)),
  }
}

interface LiveSideChat {
  chatToken: string
  readonly parentSessionId: string
  readonly childSessionId: SessionId
  readonly seedLength: number
  readonly abort: AbortController
  readonly sentRequests: Map<string, string>
  expiresAt: number
  expiryTimer: ReturnType<typeof setTimeout> | undefined
  leaseBusy: boolean
  handle?: AgentHandle
  creation?: Promise<AgentHandle>
  closing: boolean
}

function failure(code: SideChatErrorCode, message: string): StartSideChatResult {
  return { ok: false, error: { code, message } }
}

export function completedTurnSeed(events: readonly SessionEvent[]): SessionEvent[] {
  const lastTurnEnd = events.findLast((event): event is SessionEvent<'turn/end'> => event.type === 'turn/end')
  if (lastTurnEnd === undefined) return []
  return events.slice(0, lastTurnEnd.seq + 1)
}

function visibleReadTools(parent: Agent): string[] {
  return READ_ONLY_TOOL_CANDIDATES.filter(name => parent.ctx.tools.get(name, parent) !== undefined)
}

function hiddenSideChatMeta(parent: Agent, depth: number, forkSeq: number) {
  const { parentSession: durableParentLink, ...meta } = childSessionMeta(parent, depth, forkSeq)
  void durableParentLink
  return meta
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function contentText(content: readonly ContentBlock[]): string {
  return content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

function transcript(entry: LiveSideChat): Extract<ReadSideChatResult, { ok: true }>['value'] {
  const events = entry.handle?.agent.session.events.slice(entry.seedLength) ?? []
  const messages: Extract<ReadSideChatResult, { ok: true }>['value']['messages'][number][] = []
  const finalized = new Set<string>()
  const chunkText = new Map<string, string>()
  let runningTool: string | undefined
  for (const event of events) {
    if (event.type === 'user/message' && event.data.source.kind === 'user') {
      const text = contentText(event.data.content)
      if (text !== '') messages.push({ id: String(event.data.id), role: 'user', text })
      continue
    }
    if (event.type === 'assistant/chunk') {
      const key = `${event.data.turn}:${event.data.step}`
      if (event.data.chunk.type === 'text-delta') {
        chunkText.set(key, (chunkText.get(key) ?? '') + event.data.chunk.text)
      }
      continue
    }
    if (event.type === 'assistant/message') {
      const key = `${event.data.turn}:${event.data.step}`
      finalized.add(key)
      const text = contentText(event.data.message.content)
      if (text !== '') messages.push({ id: String(event.data.message.id), role: 'assistant', text })
      continue
    }
    if (event.type === 'tool/call') runningTool = event.data.name
  }
  const partial = [...chunkText.entries()]
    .filter(([key]) => !finalized.has(key))
    .map(([, text]) => text)
    .join('')
  const value = {
    chatToken: entry.chatToken,
    revision: events.at(-1)?.seq ?? entry.seedLength,
    expiresAt: entry.expiresAt,
    messages, partial,
    running: entry.handle?.agent.status === 'running',
    ...(entry.handle?.agent.status === 'running' && runningTool !== undefined ? { runningTool } : {}),
  }
  return value
}

export class SideChatService extends TypertRemoteService {
  static inject = ['agents', 'sessions']

  private readonly byToken = new Map<string, LiveSideChat>()
  private readonly tokenByParent = new Map<string, string>()

  constructor(ctx: Context) {
    super(ctx, 'sideChat')
    ctx.effect(() => () => this.disposeAll(), 'side-chat: dispose live side conversations')
    ctx.on('agent/disposed', ({ agent }) => {
      const token = [...this.byToken.values()]
        .find(entry => String(entry.childSessionId) === String(agent.id))?.chatToken
      if (token !== undefined) this.forget(token)
    })
  }

  async start(request: StartSideChatRequest): Promise<StartSideChatResult> {
    const duplicate = this.byToken.get(request.chatToken)
    if (duplicate !== undefined && !duplicate.closing) {
      const handle = duplicate.handle ?? await duplicate.creation?.catch(() => undefined)
      if (handle !== undefined && !duplicate.closing) {
        duplicate.handle = handle
        this.touch(duplicate)
        return this.startValue(duplicate)
      }
      if (this.byToken.get(request.chatToken) === duplicate) {
        return failure('already-open', 'This Side Chat is still opening.')
      }
    }
    const existingToken = this.tokenByParent.get(request.parentSessionId)
    if (existingToken !== undefined && existingToken !== request.chatToken) {
      const existing = this.byToken.get(existingToken)
      if (existing !== undefined && !existing.closing) {
        const handle = existing.handle ?? await existing.creation?.catch(() => undefined)
        if (handle !== undefined && !existing.closing) {
          existing.handle = handle
          this.adoptToken(existing, request.chatToken)
          this.touch(existing)
          return this.startValue(existing)
        }
      }
      if (this.tokenByParent.get(request.parentSessionId) === existingToken) {
        this.tokenByParent.delete(request.parentSessionId)
      }
    }

    const parentId = SessionId(request.parentSessionId)
    const parent = this.ctx.agents.get(parentId)
    if (parent === undefined) return failure('parent-not-found', 'The parent conversation is not live.')
    const seed = completedTurnSeed(parent.session.events)
    if (seed.length === 0) {
      return failure('no-completed-turn', 'Send at least one message and wait for a completed turn before opening Side Chat.')
    }

    const childId = SessionId(randomUUID())
    const entry: LiveSideChat = {
      chatToken: request.chatToken,
      parentSessionId: request.parentSessionId,
      childSessionId: childId,
      seedLength: seed.length,
      abort: new AbortController(),
      sentRequests: new Map(),
      expiresAt: Date.now() + SIDE_CHAT_IDLE_TTL_MS,
      expiryTimer: undefined,
      leaseBusy: false,
      closing: false,
    }
    this.byToken.set(request.chatToken, entry)
    this.tokenByParent.set(request.parentSessionId, request.chatToken)
    this.scheduleExpiry(entry)

    try {
      const childDepth = resolveChildDepth(parent, undefined)
      const allowedTools = visibleReadTools(parent)
      const creation = parent.ctx.agents.create({
        sessionId: childId,
        seed,
        meta: hiddenSideChatMeta(parent, childDepth, seed.length),
        agentOptions: resolveChildAgentOptions(parent, undefined, childDepth),
        signal: entry.abort.signal,
        setup: (childCtx: Context): void => {
          appendDelegatedPolicyOverrides((childCtx.agent as Agent).session, {
            sandboxMode: 'read-only',
            approvalPolicy: 'never',
          })
          applyChildComposition(childCtx, parent, {
            persona: SIDE_CHAT_PERSONA,
            toolFilter: { allow: allowedTools },
          })
          childCtx.tools.guard(execution => isSideChatToolAllowed(execution.name) ? undefined : READ_ONLY_DENIAL)
        },
      })
      entry.creation = creation
      const handle = await creation
      if (entry.closing || this.byToken.get(entry.chatToken) !== entry) {
        await handle.dispose()
        return failure('cancelled', 'Side Chat was closed before it finished opening.')
      }
      entry.handle = handle
      handle.agent.inject(createUserMessage({
        content: [{ type: 'text', text: SIDE_CHAT_BOUNDARY }],
        source: { kind: 'plugin', plugin: 'dsh-side-chat', form: 'notice', summary: 'Side conversation boundary' },
      }))
      return this.startValue(entry)
    } catch (error: unknown) {
      this.forget(entry.chatToken)
      if (entry.abort.signal.aborted || entry.closing) return failure('cancelled', 'Side Chat opening was cancelled.')
      const message = errorText(error)
      const code: SideChatErrorCode = message.includes('tool') || message.includes('factory')
        ? 'compatibility'
        : 'internal'
      return failure(code, message)
    }
  }

  read(request: ReadSideChatRequest): ReadSideChatResult {
    const entry = this.byToken.get(request.chatToken)
    if (entry === undefined || entry.closing || entry.handle === undefined) {
      return { ok: false, error: { code: 'not-open', message: 'This Side Chat is no longer open.' } }
    }
    // Adaptive transcript reads are the client attachment heartbeat. Visible
    // drawers keep their child alive; parking stops reads and starts the lease.
    this.touch(entry)
    return { ok: true, value: transcript(entry) }
  }

  async send(request: SendSideChatRequest): Promise<SendSideChatResult> {
    const entry = this.byToken.get(request.chatToken)
    if (entry === undefined || entry.closing || entry.handle === undefined) {
      return { ok: false, error: { code: 'not-open', message: 'This Side Chat is no longer open.' } }
    }
    const existing = entry.sentRequests.get(request.requestId)
    this.touch(entry)
    if (existing !== undefined) {
      return {
        ok: true,
        value: {
          chatToken: request.chatToken, requestId: request.requestId, accepted: true, messageId: existing,
        },
      }
    }
    const text = request.text.trim()
    if (text.length === 0) {
      return { ok: false, error: { code: 'invalid-input', message: 'A Side Chat question cannot be empty.' } }
    }
    const message = createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
    entry.sentRequests.set(request.requestId, String(message.id))
    entry.handle.agent.followup(message)
    this.scheduleExpiry(entry)
    return {
      ok: true,
      value: {
        chatToken: request.chatToken, requestId: request.requestId, accepted: true, messageId: String(message.id),
      },
    }
  }

  async cancel(request: CancelSideChatRequest): Promise<CancelSideChatResult> {
    const entry = this.byToken.get(request.chatToken)
    if (entry === undefined || entry.closing || entry.handle === undefined) {
      return { ok: false, error: { code: 'not-open', message: 'This Side Chat is no longer open.' } }
    }
    entry.handle.agent.cancel({ kind: 'user' })
    this.touch(entry)
    return { ok: true, value: { chatToken: request.chatToken, accepted: true } }
  }

  async close(request: CloseSideChatRequest): Promise<CloseSideChatResult> {
    const entry = this.byToken.get(request.chatToken)
    if (entry === undefined) {
      return { ok: true, value: { chatToken: request.chatToken, closed: true, cleanup: 'absent' } }
    }
    entry.closing = true
    entry.abort.abort()
    this.forget(entry.chatToken)

    try {
      const handle = entry.handle ?? await entry.creation?.catch(() => undefined)
      if (handle !== undefined) await handle.dispose()
      const workspace = this.ctx.get('workspaceRegistry')
      if (workspace !== undefined) {
        try {
          await workspace.archiveSession(entry.childSessionId)
          return { ok: true, value: { chatToken: request.chatToken, closed: true, cleanup: 'archived' } }
        } catch (error: unknown) {
          return {
            ok: true,
            value: {
              chatToken: request.chatToken,
              closed: true,
              cleanup: 'runtime-only',
              warning: 'Runtime state was removed, but archive cleanup failed: ' + errorText(error),
            },
          }
        }
      }
      return {
        ok: true,
        value: {
          chatToken: request.chatToken,
          closed: true,
          cleanup: 'runtime-only',
          warning: 'This DSH build exposes no durable cleanup capability; the live session was removed.',
        },
      }
    } catch (error: unknown) {
      return { ok: false, error: { code: 'internal', message: errorText(error) } }
    }
  }

  private startValue(entry: LiveSideChat): StartSideChatResult {
    return {
      ok: true,
      value: {
        parentSessionId: entry.parentSessionId,
        childSessionId: String(entry.childSessionId),
        chatToken: entry.chatToken,
        seedLength: entry.seedLength,
        expiresAt: entry.expiresAt,
        cleanupMode: this.ctx.get('workspaceRegistry') === undefined ? 'runtime-only' : 'archive-on-close',
      },
    }
  }

  private adoptToken(entry: LiveSideChat, chatToken: string): void {
    if (entry.chatToken === chatToken) return
    this.byToken.delete(entry.chatToken)
    entry.chatToken = chatToken
    this.byToken.set(chatToken, entry)
    this.tokenByParent.set(entry.parentSessionId, chatToken)
  }

  private touch(entry: LiveSideChat): void {
    entry.expiresAt = Date.now() + SIDE_CHAT_IDLE_TTL_MS
    this.scheduleExpiry(entry)
  }

  private scheduleExpiry(entry: LiveSideChat): void {
    if (entry.expiryTimer !== undefined) clearTimeout(entry.expiryTimer)
    if (entry.closing || this.byToken.get(entry.chatToken) !== entry) return

    const decision = evaluateSideChatLease({
      now: Date.now(),
      expiresAt: entry.expiresAt,
      wasBusy: entry.leaseBusy,
      parentRunning: this.ctx.agents.get(SessionId(entry.parentSessionId))?.status === 'running',
      childRunning: entry.handle?.agent.status === 'running',
    })
    entry.expiresAt = decision.expiresAt
    entry.leaseBusy = decision.busy
    if (decision.expire) {
      void this.close({ chatToken: entry.chatToken })
      return
    }
    entry.expiryTimer = setTimeout(() => {
      entry.expiryTimer = undefined
      this.scheduleExpiry(entry)
    }, decision.delay)
  }

  private forget(chatToken: string): void {
    const entry = this.byToken.get(chatToken)
    if (entry === undefined) return
    if (entry.expiryTimer !== undefined) clearTimeout(entry.expiryTimer)
    entry.expiryTimer = undefined
    this.byToken.delete(chatToken)
    if (this.tokenByParent.get(entry.parentSessionId) === chatToken) {
      this.tokenByParent.delete(entry.parentSessionId)
    }
  }

  private async disposeAll(): Promise<void> {
    const entries = [...this.byToken.values()]
    this.byToken.clear()
    this.tokenByParent.clear()
    await Promise.allSettled(entries.map(async entry => {
      if (entry.expiryTimer !== undefined) clearTimeout(entry.expiryTimer)
      entry.expiryTimer = undefined
      entry.closing = true
      entry.abort.abort()
      const handle = entry.handle ?? await entry.creation?.catch(() => undefined)
      await handle?.dispose()
      const workspace = this.ctx.get('workspaceRegistry')
      if (workspace !== undefined) await workspace.archiveSession(entry.childSessionId).catch(() => undefined)
    }))
  }
}
