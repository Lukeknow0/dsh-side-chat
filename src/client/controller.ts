import type { ClientContext, ISessions, SessionBinding, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { SideChatTranscriptMessage } from '../shared/remote.ts'
import type { SideChatRemoteNamespace } from './remote.ts'

export type SideChatPhase = 'closed' | 'starting' | 'open' | 'error'
export type SideChatCommandResult = { readonly ok: true } | { readonly ok: false; readonly error: string }

export interface SideChatClientState {
  readonly epoch: number
  readonly phase: SideChatPhase
  readonly parentSessionId?: SessionId
  readonly childSessionId?: SessionId
  readonly chatToken?: string
  readonly seedLength: number
  readonly revision: number
  readonly messages: readonly SideChatTranscriptMessage[]
  readonly partial: string
  readonly running: boolean
  readonly runningTool?: string
  readonly error?: string
}

const EMPTY_TRANSCRIPT = Object.freeze({
  seedLength: 0,
  revision: 0,
  messages: Object.freeze([]) as readonly SideChatTranscriptMessage[],
  partial: '',
  running: false,
})
const CLOSED: SideChatClientState = Object.freeze({ epoch: 0, phase: 'closed', ...EMPTY_TRANSCRIPT })

function remoteFailure(error: { code: string; message?: string }): string {
  return error.message === undefined ? error.code : error.message
}

export class SideChatController {
  private state: SideChatClientState = CLOSED
  private readonly listeners = new Set<() => void>()
  private closing: Promise<void> | undefined
  private pollTimer: ReturnType<typeof setTimeout> | undefined
  private readonly disposeList: () => void
  private readonly sessions: ISessions

  constructor(
    ctx: ClientContext,
    private readonly remote: SideChatRemoteNamespace,
  ) {
    this.sessions = ctx.get('sessions') as unknown as ISessions
    this.disposeList = this.sessions.list.subscribe(() => {
      const parentId = this.state.parentSessionId
      if (parentId === undefined || this.state.phase === 'closed') return
      const current = this.sessions.list.getSnapshot().current
      if (current !== undefined && String(current) !== String(parentId)) void this.close()
    })
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  readonly getSnapshot = (): SideChatClientState => this.state

  currentSessionId(): SessionId | undefined {
    return this.sessions.list.getSnapshot().current
  }

  binding(sessionId: SessionId | undefined): SessionBinding | undefined {
    return sessionId === undefined ? undefined : this.sessions.binding(sessionId)
  }

  async open(parentSessionId: SessionId): Promise<void> {
    if (this.state.phase !== 'closed') {
      if (String(this.state.parentSessionId) === String(parentSessionId)) return
      await this.close()
    }
    if (this.closing !== undefined) await this.closing

    const epoch = this.state.epoch + 1
    const chatToken = crypto.randomUUID()
    this.publish({ epoch, phase: 'starting', parentSessionId, chatToken, ...EMPTY_TRANSCRIPT })

    try {
      const result = await this.remote.start({ parentSessionId: String(parentSessionId), chatToken })
      if (this.state.epoch !== epoch || this.state.chatToken !== chatToken) {
        void this.remote.close({ chatToken })
        return
      }
      if (!result.ok) throw new Error(remoteFailure(result.error))
      if (!result.value.ok) throw new Error(result.value.error.message)
      const value = result.value.value
      this.publish({
        epoch,
        phase: 'open',
        parentSessionId,
        childSessionId: value.childSessionId as SessionId,
        chatToken,
        seedLength: value.seedLength,
        revision: value.seedLength,
        messages: [],
        partial: '',
        running: false,
      })
      void this.poll(epoch)
    } catch (error: unknown) {
      if (this.state.epoch !== epoch) return
      this.publish({
        epoch, phase: 'error', parentSessionId, chatToken, ...EMPTY_TRANSCRIPT,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async send(text: string): Promise<SideChatCommandResult> {
    const token = this.state.chatToken
    if (this.state.phase !== 'open' || token === undefined) {
      return { ok: false, error: 'This Side Chat is no longer open.' }
    }
    try {
      const result = await this.remote.send({ chatToken: token, requestId: crypto.randomUUID(), text })
      if (!result.ok) return { ok: false, error: remoteFailure(result.error) }
      if (!result.value.ok) return { ok: false, error: result.value.error.message }
      void this.poll(this.state.epoch)
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async cancel(): Promise<SideChatCommandResult> {
    const token = this.state.chatToken
    if (this.state.phase !== 'open' || token === undefined) {
      return { ok: false, error: 'This Side Chat is no longer open.' }
    }
    try {
      const result = await this.remote.cancel({ chatToken: token })
      if (!result.ok) return { ok: false, error: remoteFailure(result.error) }
      if (!result.value.ok) return { ok: false, error: result.value.error.message }
      return { ok: true }
    } catch (error: unknown) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async retry(): Promise<void> {
    const parent = this.state.parentSessionId
    if (parent === undefined) return
    await this.close()
    await this.open(parent)
  }

  async close(): Promise<void> {
    const token = this.state.chatToken
    const epoch = this.state.epoch + 1
    this.stopPolling()
    this.publish({ epoch, phase: 'closed', ...EMPTY_TRANSCRIPT })
    if (token === undefined) return
    const close = this.remote.close({ chatToken: token }).then(result => {
      if (!result.ok) console.warn('[dsh-side-chat] close transport failed', result.error)
      else if (!result.value.ok) console.warn('[dsh-side-chat] close failed', result.value.error)
      else if (result.value.value.warning !== undefined) console.warn('[dsh-side-chat]', result.value.value.warning)
    }).catch(error => { console.warn('[dsh-side-chat] close failed', error) })
      .finally(() => { if (this.closing === close) this.closing = undefined })
    this.closing = close
    await close
  }

  async dispose(): Promise<void> {
    this.disposeList()
    await this.close()
    this.listeners.clear()
  }

  private async poll(epoch: number): Promise<void> {
    this.stopPolling()
    const token = this.state.chatToken
    if (this.state.phase !== 'open' || this.state.epoch !== epoch || token === undefined) return
    let delay = 700
    try {
      const result = await this.remote.read({ chatToken: token })
      if (this.state.phase !== 'open' || this.state.epoch !== epoch || this.state.chatToken !== token) return
      if (!result.ok) throw new Error(remoteFailure(result.error))
      if (!result.value.ok) {
        if (result.value.error.code === 'not-open') {
          this.publish({ ...this.state, phase: 'error', running: false, error: result.value.error.message })
          return
        }
        throw new Error(result.value.error.message)
      }
      const value = result.value.value
      delay = value.running ? 220 : 700
      const { runningTool: previousRunningTool, ...baseState } = this.state
      void previousRunningTool
      this.publish({
        ...baseState,
        revision: value.revision,
        messages: value.messages,
        partial: value.partial,
        running: value.running,
        ...(value.runningTool === undefined ? {} : { runningTool: value.runningTool }),
      })
    } catch (error: unknown) {
      console.warn('[dsh-side-chat] transcript read failed', error)
      delay = 1_200
    }
    if (this.state.phase === 'open' && this.state.epoch === epoch) {
      this.pollTimer = setTimeout(() => { void this.poll(epoch) }, delay)
    }
  }

  private stopPolling(): void {
    if (this.pollTimer === undefined) return
    clearTimeout(this.pollTimer)
    this.pollTimer = undefined
  }

  private publish(next: SideChatClientState): void {
    this.state = Object.freeze(next)
    for (const listener of this.listeners) listener()
  }
}
