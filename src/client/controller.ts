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
  readonly expiresAt: number
  readonly messages: readonly SideChatTranscriptMessage[]
  readonly partial: string
  readonly running: boolean
  readonly runningTool?: string
  readonly error?: string
  readonly errorKind?: 'expired'
}

type OpeningDisposition = 'visible' | 'parked' | 'closed'
interface OpeningAttempt {
  readonly parentSessionId: SessionId
  readonly chatToken: string
  disposition: OpeningDisposition
}

interface RestoreAttempt {
  readonly parentSessionId: SessionId
  readonly parked: SideChatClientState
  disposition: OpeningDisposition
}

const EXPIRED_MESSAGE = 'This Side Chat ended after 30 minutes parked and idle.'

const EMPTY_TRANSCRIPT = Object.freeze({
  seedLength: 0,
  revision: 0,
  expiresAt: 0,
  messages: Object.freeze([]) as readonly SideChatTranscriptMessage[],
  partial: '',
  running: false,
})

function remoteFailure(error: { code: string; message?: string }): string {
  return error.message === undefined ? error.code : error.message
}

function keyOf(sessionId: SessionId): string {
  return String(sessionId)
}

export class SideChatController {
  private epoch = 0
  private state: SideChatClientState = Object.freeze({ epoch: 0, phase: 'closed', ...EMPTY_TRANSCRIPT })
  private readonly listeners = new Set<() => void>()
  private readonly parkedByParent = new Map<string, SideChatClientState>()
  private readonly openingByParent = new Map<string, OpeningAttempt>()
  private readonly openingByToken = new Map<string, OpeningAttempt>()
  private readonly restoringByParent = new Map<string, RestoreAttempt>()
  private closing: Promise<void> | undefined
  private pollTimer: ReturnType<typeof setTimeout> | undefined
  private readonly disposeList: () => void
  private readonly sessions: ISessions

  constructor(
    ctx: ClientContext,
    private readonly remote: SideChatRemoteNamespace,
  ) {
    this.sessions = ctx.get('sessions') as unknown as ISessions
    this.disposeList = this.sessions.list.subscribe(() => { this.handleSessionChange() })
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

  hasConversation(sessionId: SessionId | undefined): boolean {
    if (sessionId === undefined) return false
    const key = keyOf(sessionId)
    if (this.state.phase !== 'closed' && this.state.parentSessionId !== undefined
      && keyOf(this.state.parentSessionId) === key) return true
    if (this.parkedByParent.has(key)) return true
    return this.openingByParent.has(key)
  }

  async open(parentSessionId: SessionId): Promise<void> {
    if (this.state.phase !== 'closed') {
      if (this.state.parentSessionId !== undefined
        && keyOf(this.state.parentSessionId) === keyOf(parentSessionId)) return
      this.parkVisible()
    }
    if (this.restoreExisting(parentSessionId)) return
    if (this.closing !== undefined) await this.closing

    const chatToken = crypto.randomUUID()
    const attempt: OpeningAttempt = { parentSessionId, chatToken, disposition: 'visible' }
    this.openingByParent.set(keyOf(parentSessionId), attempt)
    this.openingByToken.set(chatToken, attempt)
    this.publish(this.startingState(attempt))

    try {
      const result = await this.remote.start({ parentSessionId: String(parentSessionId), chatToken })
      if (!result.ok) throw new Error(remoteFailure(result.error))
      if (!result.value.ok) throw new Error(result.value.error.message)
      const value = result.value.value
      const openState: SideChatClientState = {
        epoch: this.nextEpoch(),
        phase: 'open',
        parentSessionId,
        childSessionId: value.childSessionId as SessionId,
        chatToken: value.chatToken,
        seedLength: value.seedLength,
        revision: value.seedLength,
        expiresAt: value.expiresAt,
        messages: [],
        partial: '',
        running: false,
      }
      if (attempt.disposition === 'closed') {
        void this.remote.close({ chatToken: value.chatToken })
        return
      }
      const current = this.currentSessionId()
      if (attempt.disposition === 'parked'
        || (current !== undefined && keyOf(current) !== keyOf(parentSessionId))) {
        this.parkedByParent.set(keyOf(parentSessionId), openState)
        return
      }
      this.publish(openState)
      void this.poll(openState.epoch)
    } catch (error: unknown) {
      if (attempt.disposition === 'closed') return
      const errorState: SideChatClientState = {
        epoch: this.nextEpoch(),
        phase: 'error',
        parentSessionId,
        chatToken,
        ...EMPTY_TRANSCRIPT,
        error: error instanceof Error ? error.message : String(error),
      }
      if (attempt.disposition === 'parked') this.parkedByParent.set(keyOf(parentSessionId), errorState)
      else this.publish(errorState)
    } finally {
      if (this.openingByParent.get(keyOf(parentSessionId)) === attempt) {
        this.openingByParent.delete(keyOf(parentSessionId))
      }
      if (this.openingByToken.get(chatToken) === attempt) this.openingByToken.delete(chatToken)
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
    const key = keyOf(parent)
    if (this.state.phase === 'error' && this.parkedByParent.has(key)) {
      this.publish(this.closedState())
      this.restoreExisting(parent)
      return
    }
    await this.close()
    await this.open(parent)
  }

  async close(): Promise<void> {
    const snapshot = this.state
    const token = snapshot.chatToken
    const parent = snapshot.parentSessionId
    this.stopPolling()
    if (parent !== undefined) {
      const key = keyOf(parent)
      this.parkedByParent.delete(key)
      const restore = this.restoringByParent.get(key)
      if (restore !== undefined) {
        restore.disposition = 'closed'
        this.restoringByParent.delete(key)
      }
    }
    if (token !== undefined) {
      const attempt = this.openingByToken.get(token)
      if (attempt !== undefined) attempt.disposition = 'closed'
    }
    this.publish(this.closedState())
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
    this.stopPolling()
    if (this.state.phase !== 'closed') this.parkVisible()
    this.listeners.clear()
  }

  private handleSessionChange(): void {
    const current = this.currentSessionId()
    if (current === undefined) return
    const parent = this.state.parentSessionId
    if (this.state.phase !== 'closed' && parent !== undefined && keyOf(parent) !== keyOf(current)) {
      this.parkVisible()
    }
    if (this.state.phase === 'closed') this.restoreExisting(current)
  }

  private parkVisible(): void {
    if (this.state.phase === 'closed') return
    this.stopPolling()
    const snapshot = this.state
    if (snapshot.parentSessionId !== undefined) {
      const key = keyOf(snapshot.parentSessionId)
      const restore = this.restoringByParent.get(key)
      if (snapshot.phase === 'starting' && restore !== undefined) {
        restore.disposition = 'parked'
      } else if (snapshot.phase === 'starting' && snapshot.chatToken !== undefined) {
        const attempt = this.openingByToken.get(snapshot.chatToken)
        if (attempt !== undefined) attempt.disposition = 'parked'
      } else if (!(snapshot.phase === 'error' && this.parkedByParent.has(key))) {
        this.parkedByParent.set(key, snapshot)
      }
    }
    this.publish(this.closedState())
  }

  private restoreExisting(parentSessionId: SessionId): boolean {
    const key = keyOf(parentSessionId)
    const restoring = this.restoringByParent.get(key)
    if (restoring !== undefined) {
      restoring.disposition = 'visible'
      this.publish(this.restoringState(restoring))
      return true
    }

    const parked = this.parkedByParent.get(key)
    if (parked !== undefined) {
      this.parkedByParent.delete(key)
      if (parked.phase !== 'open' || parked.chatToken === undefined) {
        this.publish({ ...parked, epoch: this.nextEpoch() })
        return true
      }
      const restore: RestoreAttempt = { parentSessionId, parked, disposition: 'visible' }
      this.restoringByParent.set(key, restore)
      this.publish(this.restoringState(restore))
      void this.confirmRestore(restore)
      return true
    }

    const attempt = this.openingByParent.get(key)
    if (attempt !== undefined) {
      attempt.disposition = 'visible'
      this.publish(this.startingState(attempt))
      return true
    }
    return false
  }

  private async confirmRestore(attempt: RestoreAttempt): Promise<void> {
    const key = keyOf(attempt.parentSessionId)
    const token = attempt.parked.chatToken
    if (token === undefined) return
    try {
      const result = await this.remote.read({ chatToken: token })
      if (!result.ok) throw new Error(remoteFailure(result.error))
      if (!result.value.ok) {
        if (result.value.error.code === 'not-open') {
          if (attempt.disposition === 'visible') {
            this.publish(this.expiredState(attempt.parentSessionId, token))
          }
          return
        }
        throw new Error(result.value.error.message)
      }

      const value = result.value.value
      const { runningTool: previousRunningTool, error: previousError, errorKind: previousErrorKind, ...base } = attempt.parked
      void previousRunningTool
      void previousError
      void previousErrorKind
      const restored: SideChatClientState = {
        ...base,
        epoch: this.nextEpoch(),
        phase: 'open',
        revision: value.revision,
        expiresAt: value.expiresAt,
        messages: value.messages,
        partial: value.partial,
        running: value.running,
        ...(value.runningTool === undefined ? {} : { runningTool: value.runningTool }),
      }
      if (attempt.disposition !== 'visible') {
        if (attempt.disposition === 'parked') this.parkedByParent.set(key, restored)
        return
      }
      this.publish(restored)
      void this.poll(restored.epoch)
    } catch (error: unknown) {
      if (attempt.disposition === 'closed') return
      this.parkedByParent.set(key, attempt.parked)
      if (attempt.disposition === 'visible') {
        this.publish({
          epoch: this.nextEpoch(),
          phase: 'error',
          parentSessionId: attempt.parentSessionId,
          chatToken: token,
          ...EMPTY_TRANSCRIPT,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } finally {
      if (this.restoringByParent.get(key) === attempt) this.restoringByParent.delete(key)
    }
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
          const parent = this.state.parentSessionId
          if (parent !== undefined) {
            this.parkedByParent.delete(keyOf(parent))
            this.publish(this.expiredState(parent, token))
          } else {
            this.publish(this.closedState())
          }
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
        expiresAt: value.expiresAt,
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

  private restoringState(attempt: RestoreAttempt): SideChatClientState {
    return {
      epoch: this.nextEpoch(),
      phase: 'starting',
      parentSessionId: attempt.parentSessionId,
      ...(attempt.parked.chatToken === undefined ? {} : { chatToken: attempt.parked.chatToken }),
      ...EMPTY_TRANSCRIPT,
    }
  }

  private expiredState(parentSessionId: SessionId, chatToken: string): SideChatClientState {
    return {
      epoch: this.nextEpoch(),
      phase: 'error',
      parentSessionId,
      chatToken,
      ...EMPTY_TRANSCRIPT,
      error: EXPIRED_MESSAGE,
      errorKind: 'expired',
    }
  }

  private startingState(attempt: OpeningAttempt): SideChatClientState {
    return {
      epoch: this.nextEpoch(),
      phase: 'starting',
      parentSessionId: attempt.parentSessionId,
      chatToken: attempt.chatToken,
      ...EMPTY_TRANSCRIPT,
    }
  }

  private closedState(): SideChatClientState {
    return { epoch: this.nextEpoch(), phase: 'closed', ...EMPTY_TRANSCRIPT }
  }

  private nextEpoch(): number {
    this.epoch += 1
    return this.epoch
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
