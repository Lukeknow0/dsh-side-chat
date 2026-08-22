import {
  useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent,
} from 'react'
import type { SessionFace, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button, IconCloseOutline16, IconLoadingOutline16, IconSendOutline16, IconStopFill16,
  MarkdownText, Modal,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SideChatController } from './controller.ts'
import { NS } from './locales.ts'
import { SideChatSign } from './SideChatSign.tsx'
import type { SideChatPresentationMode, SideChatViewStore } from './view-store.ts'
import css from './side-chat.module.css'

type Snapshot = ReturnType<SessionFace['getSnapshot']>

function useSessionSnapshot(face: SessionFace | undefined): Snapshot | null {
  const subscribe = useCallback((listener: () => void) => face?.subscribe(listener) ?? (() => {}), [face])
  const getSnapshot = useCallback(() => face?.getSnapshot() ?? null, [face])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export interface SideChatSurfaceProps extends PropsLocale<typeof NS> {
  controller: SideChatController
  parentSessionId: SessionId
  viewStore: SideChatViewStore
  surfaceMode: SideChatPresentationMode
  onMinimize: () => void
  onEnd: () => Promise<void>
}

export function SideChatSurface({
  controller,
  parentSessionId,
  viewStore,
  t,
  surfaceMode,
  onMinimize,
  onEnd,
}: SideChatSurfaceProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const parent = controller.binding(parentSessionId)?.session
  const parentSnapshot = useSessionSnapshot(parent)
  const parentKey = String(parentSessionId)
  const subscribeView = useCallback((listener: () => void) => viewStore.subscribe(listener), [viewStore])
  const getView = useCallback(() => viewStore.get(parentKey), [parentKey, viewStore])
  const view = useSyncExternalStore(subscribeView, getView, getView)
  const draft = view.draft
  const sendError = view.sendError
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [ending, setEnding] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const confirmationFooterRef = useRef<HTMLDivElement>(null)

  const messages = state.messages
  const partial = state.partial

  useEffect(() => {
    if (state.phase === 'open') window.setTimeout(() => inputRef.current?.focus(), 120)
  }, [state.phase])
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, partial])
  useEffect(() => {
    if (!confirmEnd) return
    confirmationFooterRef.current?.querySelector('button')?.focus()
    const containEscape = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') event.stopPropagation()
    }
    document.addEventListener('keydown', containEscape)
    return () => { document.removeEventListener('keydown', containEscape) }
  }, [confirmEnd])

  const running = state.running
  const canSend = state.phase === 'open' && !running && draft.trim() !== ''
  const send = async (): Promise<void> => {
    if (!canSend) return
    const text = draft.trim()
    viewStore.setDraft(parentKey, '')
    const result = await controller.send(text)
    if (!result.ok) {
      viewStore.setDraft(parentKey, text)
      viewStore.setSendError(parentKey, result.error)
    }
  }
  const end = async (): Promise<void> => {
    if (ending) return
    setEnding(true)
    try {
      await onEnd()
      setConfirmEnd(false)
    } finally {
      setEnding(false)
    }
  }
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    void send()
  }
  const onConfirmationKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Tab') return
    const [cancel, confirm] = confirmationFooterRef.current?.querySelectorAll('button') ?? []
    if (cancel === undefined || confirm === undefined) return
    if (event.shiftKey && document.activeElement === cancel) {
      event.preventDefault()
      confirm.focus()
    } else if (!event.shiftKey && document.activeElement === confirm) {
      event.preventDefault()
      cancel.focus()
    }
  }
  return (
    <div className={css.surface} data-side-chat-surface-mode={surfaceMode}>
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
        <div className={css.headerActions}>
          <button
            className={css.endButton}
            type="button"
            aria-label={t('drawer.end')}
            title={t('drawer.end')}
            onClick={() => { setConfirmEnd(true) }}
          >
            {t('drawer.end')}
          </button>
          <button
            className={css.iconButton}
            type="button"
            aria-label={t('drawer.minimize')}
            title={t('drawer.minimize')}
            onClick={onMinimize}
          >
            <IconCloseOutline16 />
          </button>
        </div>
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
              onChange={event => { viewStore.setDraft(parentKey, event.target.value) }}
              onKeyDown={onComposerKeyDown}
            />
            {running ? (
              <button
                className={css.sendButton}
                type="button"
                aria-label={t('drawer.stop')}
                title={t('drawer.stop')}
                onClick={() => {
                  void controller.cancel().then(result => {
                    if (!result.ok) viewStore.setSendError(parentKey, result.error)
                  })
                }}
              >
                <IconStopFill16 />
              </button>
            ) : (
              <button
                className={css.sendButton}
                type="button"
                aria-label={t('drawer.send')}
                title={t('drawer.send')}
                disabled={!canSend}
                onClick={() => { void send() }}
              >
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

      <Modal
        open={confirmEnd}
        onClose={() => { if (!ending) setConfirmEnd(false) }}
        title={t('drawer.endTitle')}
        closeLabel={t('drawer.endCancel')}
        description={t('drawer.endBody')}
        footer={(
          <div ref={confirmationFooterRef} className={css.confirmationFooter} onKeyDown={onConfirmationKeyDown}>
            <Button
              size="sm"
              variant="outline"
              disabled={ending}
              onClick={() => { setConfirmEnd(false) }}
            >
              {t('drawer.endCancel')}
            </Button>
            <Button
              className={css.destructiveButton}
              size="sm"
              variant="primary"
              disabled={ending}
              onClick={() => { void end() }}
            >
              {ending ? t('drawer.ending') : t('drawer.endConfirm')}
            </Button>
          </div>
        )}
      />
    </div>
  )
}
