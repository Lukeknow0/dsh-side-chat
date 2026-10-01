# Phase 2 Host model, preset, and permission contract — DSH 0.1.7-rc.2

## Evidence boundary

This note covers only the immutable DSH `0.1.7-rc.2` installation under `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh` and exact `0.1.7-rc.2` declarations already installed in this repository. Inspection used the installed Electron executable with `ELECTRON_RUN_AS_NODE=1`, because ordinary Node does not read paths inside the ASAR. No DSH process was started, no profile was opened, and no active-profile setting, session, credential, or package was changed.

A read-only export/prototype probe loaded the installed modules and confirmed these exact versions and public methods:

- `@deepseek-ai/dsh-api-session-controller@0.1.7-rc.2`: `modelCatalog`, `projections`, `resolveAgent`, `selectModel`.
- `@deepseek-ai/dsh-agent-preset-registry@0.1.7-rc.2`: `list`, `remoteExportList`, `resolve`, `select`.
- `@deepseek-ai/dsh-permission-presets@0.1.7-rc.2`: `catalog`, `current`, `resolve`, `apply`, `set`.
- `@deepseek-ai/dsh-user-approval@0.1.7-rc.2`: `ApprovalService` and `setApprovalPolicy`.
- `@deepseek-ai/dsh-sandbox-policy@0.1.7-rc.2`: `SandboxPolicyService` and `setSandboxMode`.

## Feasibility summary

| Capability | Read/catalog | Child-local mutation | Persistence | Phase 2 conclusion |
|---|---|---|---|---|
| Provider/model/effort | Supported by `SessionController.modelCatalog()` plus the `modelSelection` projection | Supported by `SessionController.selectModel(request)` before or after turns | `model/selection` and later `request/header` events | **Feasible**, with one global-default side effect documented below |
| Agent preset (capability composition) | Supported by `AgentPresetRegistry.list()` and the `agentPreset` projection | `AgentPresetRegistry.select(agent, id)` works only while the Session is blank | Creation header plus `agent-preset/selected` | **Read-only for forked side chats**: their inherited completed turn makes them locked immediately |
| Permission preset (sandbox + approval) | Supported by `PermissionPresetService.catalog()` and the `permissions` projection | Supported on the Host through `PermissionPresetService.apply(...)` | `permission/preset`, `sandbox/mode`, and `approval/policy` | **Feasible**, but there is no public Session Remote mutation and dangerous choices still require UI risk confirmation |

Agent preset and permission preset are unrelated domains. The former changes the Agent's mounted tools/prompt composition; the latter changes sandbox and approval policy.

## Exact model/provider contract

### Catalog

Host and Typert Remote method:

```ts
SessionController.modelCatalog(): Promise<ModelCatalog>

interface ModelCatalog {
  readonly default: ModelSelection
  readonly routableProviders: readonly string[]
  readonly groups: readonly {
    id: string
    name: string
    models: readonly {
      id: string
      name: string
      description?: string
      reasoning?: {
        efforts: readonly { id: string; name: string; description?: string }[]
        defaultEffort?: string
      }
    }[]
  }[]
  readonly failures: readonly { id: string; name: string; message: string }[]
}

interface ModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}
```

There is no separate provider setter. Provider, model, and optional reasoning effort form one atomic selection. The Host validates that the exact provider/model is currently advertised, then normalizes effort through `ctx.llm.resolveCallConfig(...)`.

### Read current/next selection without activating the child

```ts
SessionController.projections(
  { sessionId },
  signal,
): Promise<{ asOfSeq: number; values: SessionProjectionValues } | null>
```

The relevant value is:

```ts
values.modelSelection?: {
  lastUsed: ModelSelection | null
  next: ModelSelection | null
}
```

Interpretation:

1. `next` is the durable selection intended for the next request.
2. Otherwise `lastUsed` is the most recent recorded request selection.
3. When both are `null`, display `modelCatalog.default`; that is also the live Agent fallback before any request header exists.

### Mutate

```ts
SessionController.selectModel(request: {
  readonly sessionId: SessionId
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}): Promise<{ readonly selected: ModelSelection }>
```

The method explicitly resumes a cold ordinary Session, validates availability, appends `model/selection`, installs it as the Agent's selection for the next prompt-assembly boundary, and returns the normalized value. A selection made while a step is already assembled does not split that step; it applies to a later step. It is therefore valid both before the first child turn and after completed turns.

Failures include ordinary Session resolution errors and `RemoteError('session/model-unavailable', ..., { provider, model })`.

### Persistence and fork inheritance

The durable projection folds:

- `model/selection` into `pending`/wire `next`.
- `request/header` into `lastUsed`, clearing a matching pending selection.

A fork clones the parent event prefix. Although `SessionController.fork()` initially supplies the deployment default in its Agent creation options, the installed selection is reconstructed from the cloned `modelSelection` projection and latest request header. Consequently the child inherits the parent's last-used or still-pending selection at the fork boundary. Later child selection events are appended only to the child Session and do not change the parent's selection.

**Global side effect:** `selectModel()` also calls `ctx.agentDefaultModel.saveSelection(selected)` in the background. This changes the default for subsequently unconfigured Sessions. There is no public Session Controller model mutation that suppresses this save. The child and parent remain Session-isolated, but a product requirement forbidding any global-default change would block use of this public API.

## Exact Agent preset contract

### Catalog and current value

Host service:

```ts
AgentPresetRegistry.list(): Promise<AgentPreset[]>
// AgentPreset = { id, name?, description?, order?, broken? }

AgentPresetRegistry.remoteExportList(): Promise<{
  presets: readonly {
    id: string
    isDefault: boolean
    name?: string
    description?: string
    broken?: string
  }[]
}>
```

`SessionController.projections({ sessionId }, signal)` exposes:

```ts
values.agentPreset?: string | null
```

That projection is authoritative. The creation header records only the starting preset; a blank Session can later append `agent-preset/selected`, and resume/fork must use the projection rather than the header alone.

### Mutation and lock

```ts
AgentPresetRegistry.select(
  agent: Agent,
  agentPreset: string,
): Promise<string>
```

A Host adapter obtains the ordinary live Agent with `SessionController.resolveAgent(sessionId)`, then calls `ctx.agentPresets.select(agent, agentPreset)`. Selection serializes concurrent switches, mounts the new composition, emits `tools/change`, appends `agent-preset/selected`, and returns the committed ID.

It rejects with `RemoteError('agent-preset/locked', ..., { sessionId, agentPreset })` when the `turnBoundary` projection reports either an open turn or `lastTurn > 0`. Other declared failures are `agent-preset/not-found` and `agent-preset/invalid`.

### Forked-sidechat blocker

`SessionController.fork()` composes the child from `presetForObservation(source)`, so the child correctly inherits the parent's current preset. However every supported side-chat fork is cut after a completed parent turn. Those inherited turn events advance the child's `turnBoundary.lastTurn`, so the child is already nonblank and `AgentPresetRegistry.select()` is locked before its first child-authored prompt.

Therefore Phase 2 may display the inherited Agent preset, but it must not offer preset mutation for forked side chats. The public fork request has no `agentPreset` override, and creating a separate blank Session with another preset would lose the required inherited conversation prefix.

## Exact permission preset contract

### Catalog and current value

Host and Typert Remote catalog method:

```ts
PermissionPresetService.catalog(): {
  options: { value: string; name: string; description?: string }[]
  defaultOptions: { value: string; name: string; description?: string }[]
  defaultPreset: string
}
```

`options` includes configured presets and the process-local `auto` preset only while its integration is live. `custom` is a derived display value, never a valid switch target. `defaultOptions` excludes `auto`.

The non-activating Session projection is:

```ts
values.permissions?: { currentValue: string }
```

Internally it folds this bounded state:

```ts
{
  preset: string | null
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access' | null
  approval: 'ask' | 'never' | null
  seeded: boolean
}
```

The wire exposes only the derived `currentValue`. The current installed defaults are configured presets `workspace-write` (`sandbox: workspace-write`, `approval: ask`) and `danger-full-access` (`sandbox: danger-full-access`, `approval: never`), but callers must use the live catalog rather than hard-code these rows.

### Mutation

There is no public `session/selectPermission` Remote method. The installed permission Typert contribution exports only `permissionPresets/catalog`.

The correct Host path for a live child is:

```ts
const resolved = await ctx.sessionController.resolveAgent(childSessionId)
if ('error' in resolved) throw resolved.error
const { agent } = resolved

ctx.permissionPresets.apply(agent.session, permissionPreset, (policy) => {
  ctx.approval.setPolicy(agent, policy)
})
```

`PermissionPresetService.apply(session, name, setApproval)`:

1. Validates and resolves the preset bundle.
2. Runs the live Auto admission gate when `name === 'auto'`.
3. Appends `permission/preset` if the effective identity changed.
4. Appends `sandbox/mode` when its effective sandbox differs.
5. Uses the supplied approval setter when its effective approval policy differs.

For a live Agent, the callback must use `ApprovalService.setPolicy(agent, policy)`, not only the lower-level `setApprovalPolicy(session, policy)`. The live setter appends `approval/policy` and injects the user-visible transition notice into the Agent's next model step. `PermissionPresetService.set(session, name)` is appropriate to initialization-style direct Session mutation but omits that live transition notice.

The service itself imposes no first-turn lock. Sandbox changes take effect on the next confined filesystem/bash call. Approval changes take effect on subsequent approval decisions and the next model step sees the transition notice. The shipped client disables its selector while the Session is locked/running; the sidechat Host adapter should likewise reject or defer changes while the child is running rather than race an active tool call or pending approval.

Unknown preset names throw `Error('permission: unknown preset ...')`. Auto may reject through its admission hook or be unavailable. The UI must explicitly confirm `danger-full-access` and `auto`; a Host call must not be treated as permission to bypass that risk gate.

### Persistence and parent isolation

`permission/preset`, `sandbox/mode`, and `approval/policy` are Session-log events. Fork seeding copies the parent's effective permission history; `session/end-seed` marks the state as seeded, and `pinInitialPermission()` preserves seeded effective knobs instead of replacing them with the current user default. Later calls append only to the child's Session. Parent sandbox and approval state remain unchanged.

## Proposed standalone Host adapter

A later TDD implementation can keep these details behind one child-owned adapter. It should first resolve the plugin's ownership record and never accept a renderer-supplied parent identity as authorization.

```ts
interface SidechatModelPermissionHost {
  catalogs(signal?: AbortSignal): Promise<{
    models: ModelCatalog
    agentPresets: AgentPresetRoster
    permissions: PermissionCatalog
  }>

  read(childSessionId: string, signal?: AbortSignal): Promise<{
    model: ModelSelection
    agentPreset: string | null
    permissionPreset: string
    agentPresetMutable: false // true only for a genuinely blank non-fork Session
  }>

  selectModel(input: {
    childSessionId: string
    provider: string
    model: string
    reasoningEffort?: string
  }): Promise<{ selected: ModelSelection }>

  selectPermission(input: {
    childSessionId: string
    permissionPreset: string
    riskAcknowledged: boolean
  }): Promise<{ selected: string }>
}
```

Do not expose `selectAgentPreset` for ordinary forked sidechat threads. If a generic helper exists for future blank Sessions, it must still call `AgentPresetRegistry.select()` and faithfully return `agent-preset/locked` rather than trying to rewrite headers or logs.

Adapter rules:

1. Validate child ownership and reject archived children before all reads/mutations.
2. Read selection state through `sessionController.projections`; do not activate a child merely to render selectors.
3. Re-read live catalogs before mutation; never trust a stale renderer option.
4. Use `sessionController.selectModel` for model mutation and document its global-default save.
5. For permission mutation, resolve the ordinary Agent, reject a running child, enforce risk acknowledgement for `danger-full-access`/`auto`, then call `permissionPresets.apply(..., approval.setPolicy)`.
6. Return stable domain errors for unavailable services, missing/archived children, unavailable models, locked presets, unknown permissions, and risk acknowledgement.
7. Never mutate the parent Session or any profile configuration directly.

## Concrete release decision

- **Provider/model/effort selector:** supported for sidechat children, with durable child state and next-step semantics. Accept the unavoidable DSH behavior that the same selection becomes the future-session default, or defer this feature if global-default isolation is mandatory.
- **Agent preset selector:** not supported for forked sidechat children; display inherited value only.
- **Permission selector:** supported through a Host-only adapter, not through a public Session Remote method. It remains child-local and durable, but needs normal running-state serialization and the same explicit risk confirmation as the shipped UI.
