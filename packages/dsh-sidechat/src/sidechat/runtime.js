import { installSidechatLiveState } from './live.js'
import { installSidechatInteractions } from './interactions.js'
import { SidechatModelPermissionHost } from './model-permission.js'
import { SidechatOperations } from './operations.js'
import { OwnershipStore } from './ownership.js'
import { SidechatForkService } from './seed.js'
import { makeDomainSpec } from './storage.js'

export async function openSidechatRuntime({
  storageDomainFacility,
  storageDomainApi,
  sessionController,
  agentPresets,
  permissionPresets,
  approval,
  hostContext,
}) {
  const domain = await storageDomainFacility.open(makeDomainSpec(storageDomainApi))
  const ownership = new OwnershipStore(domain.table('threads'))
  let live
  let interactions
  try {
    live = installSidechatLiveState(hostContext, {
      isChildSessionId(childSessionId) {
        try {
          ownership.resolve(childSessionId)
          return true
        } catch {
          return false
        }
      },
    })
    // The live capture must register first so its question snapshot/requestId
    // exists before the response adapter's waterfall hook is reached.
    interactions = installSidechatInteractions(hostContext, {
      ownership,
      liveState: live.state,
    })
  } catch (error) {
    interactions?.close()
    live?.close()
    await domain.close()
    throw error
  }
  const forkService = new SidechatForkService(ownership, sessionController)
  const modelPermission = new SidechatModelPermissionHost({
    ownership,
    sessionController,
    agentPresets,
    permissionPresets,
    approval,
  })
  const operations = new SidechatOperations({
    ownership,
    sessionController,
    forkService,
    interactions: interactions.host,
    modelPermission,
    liveState: live.state,
  })

  let closed = false
  return {
    operations,
    async close() {
      if (closed) return
      closed = true
      interactions.close()
      live.close()
      await domain.close()
    },
  }
}
