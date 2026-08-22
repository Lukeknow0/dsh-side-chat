import { useCallback, useSyncExternalStore } from 'react'
import { Button, IconBranchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SideChatController } from './controller.ts'
import { NS } from './locales.ts'
import type { SideChatPresentation } from './presentation.tsx'
import type { SideChatViewStore } from './view-store.ts'
import css from './side-chat.module.css'

export type SideChatButtonProps = PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS>
  & {
    controller: SideChatController
    viewStore: SideChatViewStore
    presentation: SideChatPresentation
  }

export function SideChatButton({ sessionId, controller, viewStore, presentation, t }: SideChatButtonProps) {
  useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const parentSessionId = String(sessionId)
  const subscribeView = useCallback((listener: () => void) => viewStore.subscribe(listener), [viewStore])
  const getView = useCallback(() => viewStore.get(parentSessionId), [parentSessionId, viewStore])
  const view = useSyncExternalStore(subscribeView, getView, getView)
  const active = controller.hasConversation(sessionId)
  const label = view.visible ? t('button.close') : t('button.open')
  return (
    <Button
      variant={active ? 'outline' : 'toolbar'}
      size="sm"
      icon={<IconBranchOutline16 />}
      className={active ? css.headerButtonActive : css.headerButton}
      aria-pressed={view.visible}
      title={label}
      onClick={() => { presentation.toggle(parentSessionId) }}
    >
      <span className={css.headerButtonLabel}>{t('drawer.title')}</span>
    </Button>
  )
}
