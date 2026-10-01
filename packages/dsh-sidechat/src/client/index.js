import sidechatRemote from '@lukeknow0/dsh-side-chat/remote'
import { applySidechatClient } from './plugin.js'

export const name = 'dsh-sidechat/client'
export const inject = ['remote', 'sidebarRightTabs', 'slots', 'fileUpload']

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  return applySidechatClient(ctx, sidechatRemote)
}

export default { name, inject, apply }
