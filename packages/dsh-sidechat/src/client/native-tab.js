import React, { createElement as h } from 'react'

export const SIDEBAR_TAB_ID = 'dsh-sidechat:conversation'
export const SIDEBAR_TAB_KIND = 'dsh-sidechat'
export const LEGACY_SIDECHAT_ADDRESS = 'sidebar://dsh-sidechat'
const CHILD_ADDRESS_PREFIX = 'dsh-resource://dsh-sidechat/'

/** @param {string} childSessionId */
export function sidechatAddress(childSessionId) {
  return `${CHILD_ADDRESS_PREFIX}${encodeURIComponent(childSessionId)}`
}

/** @param {unknown} address @returns {string | undefined} */
export function childFromSidechatAddress(address) {
  if (typeof address !== 'string' || !address.startsWith(CHILD_ADDRESS_PREFIX)) return undefined
  try {
    const childSessionId = decodeURIComponent(address.slice(CHILD_ADDRESS_PREFIX.length))
    return childSessionId === '' ? undefined : childSessionId
  } catch {
    return undefined
  }
}

/** @param {{ size?: number, className?: string }} props */
function SidechatIcon({ size = 20, className }) {
  return h('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
    'aria-hidden': 'true',
  },
  h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }),
  h('line', { x1: '8', y1: '9', x2: '16', y2: '9' }),
  h('line', { x1: '8', y1: '13', x2: '14', y2: '13' }))
}

export function createSidechatTabDefinition() {
  return {
    id: SIDEBAR_TAB_ID,
    kind: SIDEBAR_TAB_KIND,
    multiple: true,
    patterns: [`${CHILD_ADDRESS_PREFIX}**`],
    canOpen: (/** @type {string} */ address) => childFromSidechatAddress(address) !== undefined,
    keepMounted: true,
    title: () => '侧聊',
    guide: [
      {
        id: 'dsh-sidechat:new',
        order: 80,
        title: () => '新建侧聊',
        description: () => '在侧边栏中打开独立的对话。',
        icon: SidechatIcon,
      },
    ],
  }
}
