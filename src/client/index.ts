import type { ClientContext, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { SideChatController } from './controller.ts'
import { SideChatButton } from './SideChatButton.tsx'
import { SideChatDrawer } from './SideChatDrawer.tsx'
import { en, NS, zh } from './locales.ts'
import remoteContribution from './remote.ts'

export const name = 'dsh-side-chat/client'
export const inject = ['slots', 'sessions', 'remote', 'locale']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remoteContribution)
  ctx.inject(['remote.sideChat'], (remoteCtx: ClientContext) => { installSideChat(remoteCtx) })
  return disposeRemote
}

function installSideChat(ctx: ClientContext): void {
  const controller = new SideChatController(ctx, ctx.remote.sideChat)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'side-chat: client dictionaries')
  ctx.effect(() => () => { void controller.dispose() }, 'side-chat: controller lifecycle')

  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'dsh-side-chat.action',
      order: 40,
      locale: NS,
      inject: (_sessionId: SessionId) => ({ controller }),
    }, SideChatButton),
  )

  ctx.slots.inject(
    'shell.overlay',
    () => ctx.slots.register({
      name: 'shell.overlay',
      id: 'dsh-side-chat.drawer',
      order: 100,
      locale: NS,
      inject: () => ({ controller }),
    }, SideChatDrawer),
  )

  ctx.effect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.code !== 'Period') return
      event.preventDefault()
      const state = controller.getSnapshot()
      if (state.phase !== 'closed') { void controller.close(); return }
      const current = controller.currentSessionId()
      if (current !== undefined) void controller.open(current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown) }
  }, 'side-chat: keyboard shortcut')
}
