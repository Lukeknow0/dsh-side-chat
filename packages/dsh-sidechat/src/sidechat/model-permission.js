/**
 * Child-owned model and permission configuration Host adapter.
 */

export class SidechatModelPermissionError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'SidechatModelPermissionError'
    this.code = code
    this.details = details
  }
}

export class SidechatModelPermissionHost {
  constructor({ ownership, sessionController, agentPresets, permissionPresets, approval }) {
    this.ownership = ownership
    this.sessionController = sessionController
    this.agentPresets = agentPresets
    this.permissionPresets = permissionPresets
    this.approval = approval
  }

  activeOwnedRecord(childSessionId) {
    let record
    try {
      record = this.ownership.resolve(childSessionId)
    } catch (cause) {
      if (cause?.code !== 'not-found') throw cause
      throw new SidechatModelPermissionError(
        'sidechat/not-found',
        'Side chat was not found.',
        { childSessionId },
      )
    }
    if (record.archivedAt !== undefined) {
      throw new SidechatModelPermissionError(
        'sidechat/archived',
        'Side chat is archived.',
        { childSessionId },
      )
    }
    return record
  }

  async configurationCatalogs() {
    const [models, agentPresets] = await Promise.all([
      this.sessionController.modelCatalog(),
      this.agentPresets.remoteExportList(),
    ])
    const permissions = this.permissionPresets.catalog()
    return { models, agentPresets, permissions }
  }

  async configuration(childSessionId, signal) {
    this.activeOwnedRecord(childSessionId)
    const [projection, models] = await Promise.all([
      this.sessionController.projections({ sessionId: childSessionId }, signal),
      this.sessionController.modelCatalog(),
    ])
    if (projection === null) {
      throw new SidechatModelPermissionError(
        'sidechat/session-unavailable',
        'Side chat session is unavailable.',
        { childSessionId },
      )
    }
    const modelSelection = projection.values.modelSelection
    return {
      model: modelSelection.next ?? modelSelection.lastUsed ?? models.default,
      agentPreset: projection.values.agentPreset ?? null,
      permissionPreset: projection.values.permissions.currentValue,
      agentPresetMutable: false,
    }
  }

  async selectModel(input) {
    this.activeOwnedRecord(input.childSessionId)
    const catalog = await this.sessionController.modelCatalog()
    const provider = catalog.groups.find((group) => group.id === input.provider)
    const model = provider?.models.find((candidate) => candidate.id === input.model)
    const effortAvailable = input.reasoningEffort === undefined
      || model?.reasoning?.efforts.some((effort) => effort.id === input.reasoningEffort) === true

    if (model === undefined || !effortAvailable) {
      throw new SidechatModelPermissionError(
        'sidechat/model-unavailable',
        'Requested model selection is unavailable.',
        {
          childSessionId: input.childSessionId,
          provider: input.provider,
          model: input.model,
          ...(input.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: input.reasoningEffort }),
        },
      )
    }

    try {
      return await this.sessionController.selectModel({
        sessionId: input.childSessionId,
        provider: input.provider,
        model: input.model,
        ...(input.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: input.reasoningEffort }),
      })
    } catch (cause) {
      if (cause?.code !== 'session/model-unavailable') throw cause
      throw new SidechatModelPermissionError(
        'sidechat/model-unavailable',
        'Requested model selection is unavailable.',
        {
          childSessionId: input.childSessionId,
          provider: input.provider,
          model: input.model,
          ...(input.reasoningEffort === undefined
            ? {}
            : { reasoningEffort: input.reasoningEffort }),
        },
      )
    }
  }

  async selectPermission(input) {
    this.activeOwnedRecord(input.childSessionId)
    const catalog = this.permissionPresets.catalog()
    const available = catalog.options.some(
      (option) => option.value === input.permissionPreset,
    )
    if (!available || input.permissionPreset === 'custom') {
      throw new SidechatModelPermissionError(
        'sidechat/permission-unavailable',
        'Requested permission preset is unavailable.',
        {
          childSessionId: input.childSessionId,
          permissionPreset: input.permissionPreset,
        },
      )
    }

    if (
      (input.permissionPreset === 'danger-full-access'
        || input.permissionPreset === 'auto')
      && input.riskAcknowledged !== true
    ) {
      throw new SidechatModelPermissionError(
        'sidechat/risk-acknowledgement-required',
        'Permission preset requires explicit risk acknowledgement.',
        {
          childSessionId: input.childSessionId,
          permissionPreset: input.permissionPreset,
        },
      )
    }

    const resolved = await this.sessionController.resolveAgent(input.childSessionId)
    if (resolved === null || typeof resolved !== 'object' || 'error' in resolved) {
      throw new SidechatModelPermissionError(
        'sidechat/session-unavailable',
        'Side chat session is unavailable.',
        { childSessionId: input.childSessionId },
      )
    }
    const { agent } = resolved
    if (agent.status === 'running') {
      throw new SidechatModelPermissionError(
        'sidechat/child-running',
        'Side chat is running.',
        { childSessionId: input.childSessionId },
      )
    }

    this.permissionPresets.apply(
      agent.session,
      input.permissionPreset,
      (policy) => this.approval.setPolicy(agent, policy),
    )
    return { selected: input.permissionPreset }
  }
}
