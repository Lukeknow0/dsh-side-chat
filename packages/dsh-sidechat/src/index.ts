import type { Context } from '@deepseek-ai/cordis'
import * as storageDomainApi from '@deepseek-ai/dsh-storage-domain'
import { SidechatController } from './sidechat/controller.js'
import { openSidechatRuntime } from './sidechat/runtime.js'

export { SidechatController }

export const name = 'dsh-sidechat'
export const inject = ['storage', 'storageDomain', 'sessionController', 'agentPresets', 'permissionPresets', 'approval']

declare module '@deepseek-ai/cordis' {
  interface Context {
    sideChatController: SidechatController
  }
}

interface SidechatSessionController {
  fork(request: { sessionId: string }): Promise<{ sessionId: string }>
  prompt(request: unknown, signal: AbortSignal): Promise<{ accepted: true }>
  resolveAgent(sessionId: string): Promise<{ agent: unknown } | { error: unknown }>
  cancel(request: { sessionId: string }): { accepted: true }
  inspect(sessionId: string, signal?: AbortSignal): Promise<{ inheritedEventCount: number; events: readonly unknown[] }>
  modelCatalog(): Promise<unknown>
  projections(request: { sessionId: string }, signal?: AbortSignal): Promise<unknown>
  selectModel(request: { sessionId: string; provider: string; model: string; reasoningEffort?: string }): Promise<unknown>
}

interface SidechatHostServices {
  readonly sessionController: SidechatSessionController
  readonly agentPresets: { remoteExportList(): Promise<unknown> }
  readonly permissionPresets: {
    catalog(): unknown
    apply(session: unknown, preset: string, setApproval: (policy: unknown) => void): Promise<unknown>
  }
  readonly approval: { setPolicy(agent: unknown, policy: unknown): unknown }
}

export async function apply(ctx: Context): Promise<void> {
  const services = ctx as Context & SidechatHostServices
  const sessionController = services.sessionController
  const runtime = await openSidechatRuntime({
    storageDomainFacility: ctx.storage.domain,
    storageDomainApi,
    sessionController,
    agentPresets: services.agentPresets,
    permissionPresets: services.permissionPresets,
    approval: services.approval,
    hostContext: ctx,
  })

  ctx.effect(
    () => () => runtime.close(),
    'dsh-sidechat: storage domain',
  )
  ctx.plugin(SidechatController, runtime.operations)
}
