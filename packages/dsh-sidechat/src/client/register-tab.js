import { createSidechatTabDefinition, SIDEBAR_TAB_ID } from './native-tab.js'
import { SideChatPanel } from './SideChatPanel.js'
import { SidechatTabTitle } from './SidechatTabTitle.js'

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ api: any, state: any, uploads?: any }} services
 */
export async function registerSidechatTab(ctx, { api, state, uploads }) {
  const serviceSeat = ctx.inject(['sidebarRightTabs'], (injected) => {
    const tabs = /** @type {any} */ (injected.get('sidebarRightTabs'))
    if (tabs === undefined) return undefined

    const disposeDefinition = tabs.register(createSidechatTabDefinition())
    let disposeSlot
    let disposeTitle
    try {
      disposeSlot = injected.slots.inject('sidebar.right.pane.tab', () =>
        injected.slots.register(
          {
            name: 'sidebar.right.pane.tab',
            key: SIDEBAR_TAB_ID,
            inject: (parentSessionId) => ({ api, state, parentSessionId, ...(uploads ? { uploads } : {}) }),
          },
          SideChatPanel,
        ),
      )
      disposeTitle = injected.slots.inject('sidebar.right.pane.tab.title', () =>
        injected.slots.register(
          {
            name: 'sidebar.right.pane.tab.title',
            key: SIDEBAR_TAB_ID,
            inject: (parentSessionId) => ({ state, parentSessionId }),
          },
          SidechatTabTitle,
        ),
      )
    } catch (error) {
      disposeTitle?.()
      disposeSlot?.()
      disposeDefinition?.()
      throw error
    }

    return () => {
      try {
        disposeTitle?.()
      } finally {
        try {
          disposeSlot?.()
        } finally {
          disposeDefinition?.()
        }
      }
    }
  })

  try {
    await serviceSeat
  } catch (error) {
    try {
      await serviceSeat.dispose()
    } catch {
      // Preserve the startup failure while still attempting Fiber cleanup.
    }
    throw error
  }

  let disposed = false
  return async () => {
    if (disposed) return
    disposed = true
    await serviceSeat.dispose()
  }
}
