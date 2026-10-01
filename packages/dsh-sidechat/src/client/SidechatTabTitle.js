import { useSyncExternalStore } from 'react'
import { childFromSidechatAddress, LEGACY_SIDECHAT_ADDRESS } from './native-tab.js'

/**
 * @param {{
 *   state: ReturnType<import('./state.js').createSidechatThreadState>,
 *   parentSessionId: string,
 *   useTabInfo: () => any,
 * }} props
 */
export function SidechatTabTitle({ state, parentSessionId, useTabInfo }) {
  const { tab } = useTabInfo()
  useSyncExternalStore(state.subscribe, state.getSnapshot, state.getSnapshot)
  const childSessionId = childFromSidechatAddress(tab.contentId)
    ?? state.tabChild(parentSessionId, tab.contentId)
    ?? (tab.contentId === LEGACY_SIDECHAT_ADDRESS ? state.selected(parentSessionId) : undefined)
  return childSessionId === undefined ? '新侧聊' : state.label(parentSessionId, childSessionId)
}
