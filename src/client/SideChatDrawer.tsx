import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent,
} from 'react'
import type { SessionFace } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button, IconCloseOutline16, IconLoadingOutline16, IconSendOutline16, IconStopFill16, MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SideChatController } from './controller.ts'
import { NS } from './locales.ts'
import { SideChatSign } from './SideChatSign.tsx'
import { overlayPlacementStyle, useOverlayPlacement } from './use-overlay-placement.ts'
import css from './side-chat.module.css'

export interface SideChatDrawerInjected { controller: SideChatController }
export type SideChatDrawerProps = SideChatDrawerInjected & PropsLocale<typeof NS>

type Snapshot = ReturnType<SessionFace['getSnapshot']>

function useSessionSnapshot(face: SessionFace | undefined): Snapshot | null {
  const subscribe = useCallback((listener: () => void) => face?.subscribe(listener) ?? (() => {}), [face])
  const getSnapshot = useCallback(() => face?.getSnapshot() ?? null, [face])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function SideChatDrawer({ controller, t }: SideChatDrawerProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const parent = controller.binding(state.parentSessionId)?.session
  const parentSnapshot = useSessionSnapshot(parent)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const placementRootRef = useRef<HTMLDivElement>(null)
  const placement = useOverlayPlacement(placementRootRef, { enabled: state.phase !== 'closed' })

  const messages = state.messages
  const partial = state.partial

  useEffect(() => {
    if (state.phase === 'open') window.setTimeout(() => inputRef.current?.focus(), 120)
  }, [state.phase])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, partial])
  useEffect(() => {
    if (state.phase === 'closed') { setDraft(''); setSendError(null) }
  }, [state.phase])
  useEffect(() => {
    if (state.phase === 'closed') return
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void controller.close()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [controller, state.phase])

  if (state.phase === 'closed') return null

  const running = state.running
  const canSend = state.phase === 'open' && !running && draft.trim() !== ''
  const send = async (): Promise<void> => {
    if (!canSend) return
    const text = draft.trim()
    setDraft('')
    setSendError(null)
    const result = await controller.send(text)
    if (!result.ok) { setDraft(text); setSendError(result.error) }
  }
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void send()
  }

  return (
    <div
      ref={placementRootRef}
      className={css.placementRoot}
      data-dsh-side-chat-root
      data-placement-mode={placement.mode}
      data-placement-degraded={placement.degraded || undefined}
      style={overlayPlacementStyle(placement)}
    >
      <span className={css.safeAreaProbe} data-dsh-side-chat-safe-area aria-hidden="true" />
      <button
        className={css.mobileScrim}
        data-dsh-side-chat-scrim
        aria-label={t('drawer.close')}
        onClick={() => { void controller.close() }}
      />
      <aside className={css.drawer} data-dsh-side-chat-drawer role="complementary" aria-label={t('drawer.title')}>
        <header className={css.drawerHeader}>
          <div className={css.titleCluster}>
            <SideChatSign className={css.railMark} />
            <div>
              <div className={css.titleLine}>
                <strong>{t('drawer.title')}</strong>
                <span className={css.readOnlyBadge}>{t('drawer.readOnly')}</span>
              </div>
              <p>{t('drawer.subtitle')}</p>
            </div>
          </div>
          <button className={css.iconButton} type="button" aria-label={t('drawer.close')} title={t('drawer.close')} onClick={() => { void controller.close() }}>
            <IconCloseOutline16 />
          </button>
        </header>

        <div className={css.parentStatus}>
          <span className={parentSnapshot?.running ? css.statusDotRunning : css.statusDot} />
          <span>{parentSnapshot?.running ? t('drawer.mainRunning') : t('drawer.mainReady')}</span>
          <span className={css.contextNote}>{t('drawer.contextNote')}</span>
        </div>

        <div className={css.transcript} ref={scrollRef} aria-live="polite">
          {state.phase === 'starting' && (
            <div className={css.loadingState}>
              <SideChatSign className={css.loadingMark} />
              <strong>{t('drawer.opening')}</strong>
            </div>
          )}
          {state.phase === 'error' && (
            <div className={css.errorState}>
              <span className={css.errorRule} />
              <strong>{state.errorKind === 'expired' ? t('drawer.expiredTitle') : t('drawer.error')}</strong>
              <p>{state.errorKind === 'expired' ? t('drawer.expiredBody') : state.error}</p>
              <Button size="sm" variant="outline" onClick={() => { void controller.retry() }}>
                {state.errorKind === 'expired' ? t('drawer.restart') : t('drawer.retry')}
              </Button>
            </div>
          )}
          {state.phase === 'open' && messages.length === 0 && partial === '' && !running && (
            <div className={css.emptyState}>
              <SideChatSign className={css.railMark} />
              <strong>{t('drawer.emptyTitle')}</strong>
              <p>{t('drawer.emptyBody')}</p>
            </div>
          )}
          {messages.map(message => (
            <article key={message.id} className={message.role === 'user' ? css.userMessage : css.assistantMessage}>
              <div className={css.messageMeta}>{message.role === 'user' ? t('drawer.you') : t('drawer.assistant')}</div>
              {message.role === 'assistant'
                ? <MarkdownText text={message.text} />
                : <p>{message.text}</p>}
            </article>
          ))}
          {partial !== '' && (
            <article className={css.assistantMessage}>
              <div className={css.messageMeta}>{t('drawer.assistant')}</div>
              <MarkdownText text={partial} streaming />
            </article>
          )}
          {running && partial === '' && (
            <div className={css.readingState}><IconLoadingOutline16 /> {t('drawer.reading')}</div>
          )}
        </div>

        {state.phase === 'open' && (
          <footer className={css.composerArea}>
            {sendError !== null && <div className={css.sendError}>{sendError}</div>}
            <div className={css.composer}>
              <textarea
                ref={inputRef}
                value={draft}
                rows={2}
                placeholder={t('drawer.placeholder')}
                aria-label={t('drawer.placeholder')}
                disabled={running}
                onChange={event => { setDraft(event.target.value); setSendError(null) }}
                onKeyDown={onComposerKeyDown}
              />
              {running ? (
                <button className={css.sendButton} type="button" aria-label={t('drawer.stop')} title={t('drawer.stop')} onClick={() => { void controller.cancel().then(result => { if (!result.ok) setSendError(result.error) }) }}>
                  <IconStopFill16 />
                </button>
              ) : (
                <button className={css.sendButton} type="button" aria-label={t('drawer.send')} title={t('drawer.send')} disabled={!canSend} onClick={() => { void send() }}>
                  <IconSendOutline16 />
                </button>
              )}
            </div>
            <div className={css.composerFoot}>
              <span>Shift + Enter</span>
              <span>{t('drawer.discard')}</span>
            </div>
          </footer>
        )}
      </aside>
    </div>
  )
}
