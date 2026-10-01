import { createSidechatApi } from './api.js'
import { registerSidechatTab } from './register-tab.js'
import { createSidechatThreadState } from './state.js'
import { createUploadDrafts } from './upload-drafts.js'

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {import('@deepseek-ai/dsh-typert-protocol').TypertRemoteContribution} remoteContribution
 */
export function applySidechatClient(ctx, remoteContribution) {
  return ctx.effect(async () => {
    const disposeRemote = await ctx.remote.$mount(remoteContribution)
    /** @type {{ dispose: () => Promise<void> | void } | undefined} */
    let namespaceSeat
    try {
      const namespace = {
        /** @type {ReturnType<typeof createSidechatApi> | undefined} */
        api: undefined,
      }
      // The mounted namespace is a Cordis service of its own. The Client
      // manifest's package-level inject does not authorize reading it.
      namespaceSeat = ctx.inject(['remote.sideChat'], (injected) => {
        namespace.api = createSidechatApi(injected.remote)
      })
      await namespaceSeat
      const activeNamespaceSeat = namespaceSeat
      const api = namespace.api
      if (!api) throw new Error('dsh-sidechat: Remote namespace did not activate')
      await api.ping()
      const state = createSidechatThreadState()
      const fileUpload = /** @type {any} */ (ctx).fileUpload
      const uploads = createUploadDrafts(fileUpload ? (child,file,name,signal,progress) => fileUpload.upload(child,file,name,signal,progress) : undefined)
      const disposeTab = await registerSidechatTab(ctx, { api, state, uploads })

      return async () => {
        try {
          await disposeTab()
        } finally {
          uploads.dispose()
          try {
            await activeNamespaceSeat.dispose()
          } finally {
            await disposeRemote()
          }
        }
      }
    } catch (error) {
      try {
        await namespaceSeat?.dispose()
      } finally {
        await disposeRemote()
      }
      throw error
    }
  }, 'dsh-sidechat/client')
}
