import { useSyncExternalStore } from 'react'
import { Button, IconBranchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SideChatController } from './controller.ts'
import { NS } from './locales.ts'
import css from './side-chat.module.css'

export type SideChatButtonProps = PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<typeof NS>
  & { controller: SideChatController }

export function SideChatButton({ sessionId, controller, t }: SideChatButtonProps) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
  const active = state.phase !== 'closed' && String(state.parentSessionId) === String(sessionId)
  const label = active ? t('button.close') : t('button.open')
  return (
    <Button
      variant={active ? 'outline' : 'toolbar'}
      size="sm"
      icon={<IconBranchOutline16 />}
      className={active ? css.headerButtonActive : css.headerButton}
      aria-pressed={active}
      title={label}
      onClick={() => { void (active ? controller.close() : controller.open(sessionId)) }}
    >
      <span className={css.headerButtonLabel}>{t('drawer.title')}</span>
    </Button>
  )
}
