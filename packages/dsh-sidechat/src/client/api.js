/** @param {any} result */
export function unwrapRemoteResult(result) {
  if (result?.ok === true) return result.value
  if (result?.ok === false && result.error !== undefined) throw result.error
  throw new Error('dsh-sidechat: malformed Remote result')
}

/**
 * Create the narrow Client API used by side-chat UI components.
 * @param {{ sideChat: any }} remote
 */
export function createSidechatApi(remote) {
  const sideChat = remote.sideChat
  return {
    async ping() {
      return unwrapRemoteResult(await sideChat.ping())
    },

    /** @param {string} parentSessionId @param {boolean} [includeArchived] */
    async list(parentSessionId, includeArchived = false) {
      const input = includeArchived
        ? { parentSessionId, includeArchived: true }
        : { parentSessionId }
      return unwrapRemoteResult(await sideChat.list(input))
    },

    /** @param {string} parentSessionId */
    async start(parentSessionId) {
      return unwrapRemoteResult(await sideChat.start({ parentSessionId }))
    },

    /** @param {string} childSessionId */
    async info(childSessionId) {
      return unwrapRemoteResult(await sideChat.info({ childSessionId }))
    },

    /** @param {string} childSessionId @param {string} title */
    async rename(childSessionId, title) {
      return unwrapRemoteResult(await sideChat.rename({ childSessionId, title }))
    },

    /** @param {string} childSessionId */
    async archive(childSessionId) {
      return unwrapRemoteResult(await sideChat.archive({ childSessionId }))
    },

    /** @param {string} childSessionId */
    async cancel(childSessionId) {
      return unwrapRemoteResult(await sideChat.cancel({ childSessionId }))
    },

    /** @param {string} childSessionId @param {string} requestId @param {readonly any[]} answers */
    async answerQuestion(childSessionId, requestId, answers) {
      return unwrapRemoteResult(await sideChat.answerQuestion({ childSessionId, requestId, answers }))
    },

    /** @param {string} childSessionId @param {string} interactionId @param {'allowed-once' | 'rejected'} decision */
    async resolveApproval(childSessionId, interactionId, decision) {
      return unwrapRemoteResult(await sideChat.resolveApproval({ childSessionId, interactionId, decision }))
    },

    async configurationCatalogs() {
      return unwrapRemoteResult(await sideChat.configurationCatalogs())
    },

    /** @param {string} childSessionId @param {AbortSignal | undefined} signal */
    async configuration(childSessionId, signal) {
      return unwrapRemoteResult(await sideChat.configuration({ childSessionId }, signal))
    },

    /** @param {string} childSessionId @param {number | undefined} afterSeq @param {AbortSignal | undefined} signal */
    async events(childSessionId, afterSeq, signal) {
      return unwrapRemoteResult(await sideChat.events({
        childSessionId,
        ...(afterSeq === undefined ? {} : { afterSeq }),
      }, signal))
    },

    /** @param {string} childSessionId @param {string} requestId @param {readonly any[]} content @param {AbortSignal | undefined} signal */
    async prompt(childSessionId, requestId, content, signal) {
      return unwrapRemoteResult(await sideChat.prompt({
        childSessionId,
        requestId,
        content,
      }, signal))
    },

    /** @param {string} childSessionId @param {{ provider: string, model: string, reasoningEffort?: string }} selection */
    async selectModel(childSessionId, selection) {
      return unwrapRemoteResult(await sideChat.selectModel({
        childSessionId,
        provider: selection.provider,
        model: selection.model,
        ...(selection.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: selection.reasoningEffort }),
      }))
    },

    /** @param {string} childSessionId @param {string} permissionPreset @param {boolean} riskAcknowledged */
    async selectPermission(childSessionId, permissionPreset, riskAcknowledged) {
      return unwrapRemoteResult(await sideChat.selectPermission({
        childSessionId,
        permissionPreset,
        riskAcknowledged,
      }))
    },
  }
}
