import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SideChatController } from './controller.ts'
import { NS } from './locales.ts'
import { SideChatSurface } from './SideChatSurface.tsx'
import type { SideChatViewStore } from './view-store.ts'
import { overlayPlacementStyle, useOverlayPlacement } from './use-overlay-placement.ts'
import css from './side-chat.module.css'

export interface SideChatDrawerInjected {
  controller: SideChatController
  viewStore: SideChatViewStore
  parentSessionId: SessionId
  onMinimize: () => void
  onEnd: () => Promise<void>
}
export type SideChatDrawerProps = SideChatDrawerInjected & PropsLocale<typeof NS>

export function SideChatDrawer({
  controller,
  viewStore,
  parentSessionId,
  t,
  onMinimize,
  onEnd,
}: SideChatDrawerProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const activeParentSessionId = state.parentSessionId ?? parentSessionId
  const parentKey = String(activeParentSessionId)
  const subscribeView = useCallback((listener: () => void) => viewStore.subscribe(listener), [viewStore])
  const getView = useCallback(() => viewStore.get(parentKey), [parentKey, viewStore])
  const view = useSyncExternalStore(subscribeView, getView, getView)
  const placementRootRef = useRef<HTMLDivElement>(null)
  const visible = state.phase !== 'closed'
    && state.parentSessionId !== undefined
    && String(state.parentSessionId) === parentKey
    && view.visible
    && view.presentation === 'drawer'
  const placement = useOverlayPlacement(placementRootRef, { enabled: visible })

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onMinimize()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, [onMinimize, visible])

  if (!visible) return null

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
        aria-label={t('drawer.minimize')}
        onClick={onMinimize}
      />
      <aside className={css.drawer} data-dsh-side-chat-drawer role="complementary" aria-label={t('drawer.title')}>
        <SideChatSurface
          parentSessionId={activeParentSessionId}
          controller={controller}
          viewStore={viewStore}
          t={t}
          surfaceMode="drawer"
          onMinimize={onMinimize}
          onEnd={onEnd}
        />
      </aside>
    </div>
  )
}
