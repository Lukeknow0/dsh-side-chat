export type SideChatPresentationMode = 'drawer' | 'better-sidebar'

export interface SideChatViewState {
  readonly visible: boolean
  readonly draft: string
  readonly sendError: string | null
  readonly presentation: SideChatPresentationMode
}

const EMPTY_VIEW: SideChatViewState = Object.freeze({
  visible: false,
  draft: '',
  sendError: null,
  presentation: 'drawer',
})

export class SideChatViewStore {
  private readonly entries = new Map<string, SideChatViewState>()
  private readonly listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  get(parentSessionId: string): SideChatViewState {
    return this.entries.get(parentSessionId) ?? EMPTY_VIEW
  }

  show(parentSessionId: string, presentation: SideChatPresentationMode): void {
    this.update(parentSessionId, state => ({ ...state, visible: true, presentation }))
  }

  minimize(parentSessionId: string): void {
    this.update(parentSessionId, state => ({ ...state, visible: false }))
  }

  setDraft(parentSessionId: string, draft: string): void {
    this.update(parentSessionId, state => ({ ...state, draft, sendError: null }))
  }

  setSendError(parentSessionId: string, sendError: string | null): void {
    this.update(parentSessionId, state => ({ ...state, sendError }))
  }

  clear(parentSessionId: string): void {
    if (!this.entries.delete(parentSessionId)) return
    this.publish()
  }

  fallbackVisiblePresentation(
    from: SideChatPresentationMode,
    to: SideChatPresentationMode,
  ): void {
    let changed = false
    for (const [parentSessionId, state] of this.entries) {
      if (!state.visible || state.presentation !== from) continue
      this.entries.set(parentSessionId, Object.freeze({ ...state, presentation: to }))
      changed = true
    }
    if (changed) this.publish()
  }

  private update(parentSessionId: string, change: (state: SideChatViewState) => SideChatViewState): void {
    const previous = this.get(parentSessionId)
    const next = Object.freeze(change(previous))
    if (Object.is(previous, next)) return
    this.entries.set(parentSessionId, next)
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}
