import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { SidechatModelPermissionError } from './model-permission.js'
import { SidechatInteractionError } from './interactions.js'
import { SidechatOperationError } from './operations.js'

/**
 * Convert one internal operation failure to the stable public Typert error.
 * Private causes, storage details, titles, and parent identities never cross the wire.
 */
export function mapSidechatRemoteError(error) {
  if (
    !(error instanceof SidechatOperationError)
    && !(error instanceof SidechatModelPermissionError)
    && !(error instanceof SidechatInteractionError)
  ) return error

  const details = error.details ?? {}
  const childSessionId = String(details.childSessionId ?? '')
  switch (error.code) {
    case 'sidechat/not-found':
    case 'sidechat/archived':
    case 'sidechat/session-unavailable':
      return new RemoteError(error.code, error.message, { childSessionId })
    case 'sidechat/cursor-invalid':
      return new RemoteError(error.code, error.message, {
        childSessionId,
        ...(typeof details.committedCursor === 'number'
          ? { committedCursor: details.committedCursor }
          : {}),
      })
    case 'sidechat/model-unavailable':
      return new RemoteError(error.code, error.message, {
        childSessionId,
        provider: String(details.provider ?? ''),
        model: String(details.model ?? ''),
        ...(typeof details.reasoningEffort === 'string'
          ? { reasoningEffort: details.reasoningEffort }
          : {}),
      })
    case 'sidechat/permission-unavailable':
    case 'sidechat/risk-acknowledgement-required':
      return new RemoteError(error.code, error.message, {
        childSessionId,
        permissionPreset: String(details.permissionPreset ?? ''),
      })
    case 'sidechat/child-running':
      return new RemoteError(error.code, error.message, { childSessionId })
    case 'sidechat/interaction-not-found':
    case 'sidechat/interaction-stale':
    case 'sidechat/interaction-response-invalid':
      return new RemoteError(error.code, error.message, {
        childSessionId,
        interactionId: String(details.interactionId ?? ''),
      })
    default:
      return error
  }
}
