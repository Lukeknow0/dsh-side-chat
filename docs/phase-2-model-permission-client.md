# DSH 0.1.7-rc.2 client model, preset, and permission contract

## Scope and evidence

This note records only the official `dsh-v0.1.7-rc.2` Client contracts relevant to a plugin-native tab. Evidence was checked in the rc.2 application bundle under:

- `@deepseek-ai/dsh-client-ui-model-selection/lib/client.js`
- `@deepseek-ai/dsh-client-ui-permission-presets/lib/client.js`
- `@deepseek-ai/dsh-client-ui-agent-preset/lib/client.js`
- `@deepseek-ai/dsh-client-ui-session/lib/client.js`
- `@deepseek-ai/dsh-api-session-controller/lib/client.js`, `lib/typert.remote-client.js`, and its published `lib/types/client/**/*.d.ts`
- `@deepseek-ai/dsh-permission-presets/lib/typert.remote-client.js`
- `@deepseek-ai/dsh-agent-preset-registry/lib/typert.remote-client.js`

All inspected packages identify themselves as `0.1.7-rc.2`. No rc.1 declarations were used.

## Executive feasibility result

| Control | Selected fork child | Official Client surface | Result |
|---|---|---|---|
| Provider/model/reasoning effort | Yes, for an ordinary retained Session | `ctx.modelDirectories.directoryFor(childId)` | **Supported**, but the Host also saves the successful selection as the global default for later Sessions in the background. |
| Permission preset | Yes, for a retained Session with a `permissions` projection | projection + `permissionPresets.catalog()` + `SessionFace.command('/permission …')` | **Supported**, but there is no exported reusable permission-directory service/component. The side-chat UI must adapt the public catalog/projection/command contracts and preserve the official confirmation UX for risky presets. |
| Agent preset/composition | Read only after a fork | `agentPresets.list()` and the `agentPreset` projection | **Mutation blocked**. Official UI applies `agentPresets.select` only to a blank Session; `session.fork` has no preset parameter, and a forked side-chat already contains inherited history. |

There is no independent provider chooser. A provider is the `group.id` chosen as part of the complete model selection `{ provider, model, reasoningEffort? }`.

## Session scope in a native tab

`@deepseek-ai/dsh-client-ui-session` installs the `session` slot scope. Its built-in source declares:

- hook `session` → standard prop `useSession`
- keyed hook `projection` → standard prop `useProjection(key)`
- prop `sessionId`

It resolves them from one `SessionBinding` as `binding.session`, `binding.session.projections.faceOf(key)`, and `binding.sessionId`. A right-sidebar pane tab is already session-scoped, but that inherited scope is the **parent** Session. It must not be used to mutate the selected child.

For a selected child, use the public `ctx.sessions` service:

```ts
const reference = ctx.sessions.retain(childSessionId, {
  source: 'dshSidechat',
  signal,
})
await reference.ready
const child = reference.binding.session
// release on child switch, hide/unmount if the controls no longer need it
reference.release()
```

The source label must be declared by module augmentation of `SessionReferenceSourceMap`; rc.2's built-in labels are `controllerOperation` and `gateway`. `retain()` accepts only a known/catalogued `SessionId`, creates the child Client scope, opens its shared Session stream, and owns that generation until `release()`. `ctx.sessions.binding(id)` and `ctx.sessions.scope(id)` only borrow an already-retained generation.

Implications:

1. Switching children must release the old reference before retaining the new one.
2. `ctx.modelDirectories.directoryFor(childId)` fails loudly unless the child already has both a Client scope and binding.
3. Retaining the child opens the standard Client Session history/follow stream in addition to side-chat's bounded event polling. This is the cost of reusing the official chooser/projection layer; do not create multiple references per render.
4. If the child has not reached the Client Session list yet, refresh/await the authoritative `ctx.sessions.list` before retaining rather than inventing an unverified identity path.

## Model/provider/reasoning contract

### Shared Client service

`@deepseek-ai/dsh-client-ui-model-selection/client` registers `ModelDirectoryResolver` as:

```ts
ctx.modelDirectories
```

The public runtime exports `ModelDirectory` and `ModelDirectoryResolver`. The official `/model` popup and the composer slot `conversation.input.model` both call:

```ts
const directory = ctx.modelDirectories.directoryFor(sessionId)
```

A `ModelDirectory` exposes:

```ts
directory.store.subscribe(listener)
directory.store.getSnapshot()
directory.load()
directory.select({ provider, model, reasoningEffort? })
```

Its snapshot is:

```ts
{
  current: { provider: string; model: string; reasoningEffort?: string } | null,
  retainedEffort?: string,
  routable: boolean | null,
  groups: Array<{
    id: string,                 // provider id
    name: string,
    models: Array<{
      id: string,
      name: string,
      description?: string,
      reasoning?: {
        efforts: Array<{ id: string; name: string; description?: string }>,
        defaultEffort?: string,
      },
    }>,
  }>,
  failures: Array<{ id: string; name: string; message: string }>,
  status: 'idle' | 'loading' | 'selecting' | 'ready' | 'error',
  pending: { provider: string; model: string; reasoningEffort?: string } | null,
  error: string | null,
}
```

`load()` shares the Host-generation catalog and reads `ctx.remote.session.modelCatalog()`. The exact wire result is:

```ts
{
  default: { provider: string; model: string; reasoningEffort?: string },
  routableProviders: string[],
  groups: ProviderGroup[],
  failures: Array<{ id: string; name: string; message: string }>,
}
```

`select(selection)` calls:

```ts
ctx.remote.session.selectModel({
  sessionId,
  provider,
  model,
  reasoningEffort?,
})
```

and receives:

```ts
RemoteResult<{
  selected: { provider: string; model: string; reasoningEffort?: string }
}>
```

The directory's durable current value comes from the child Session projection `modelSelection`:

```ts
{
  lastUsed: ModelSelection | null,
  next: ModelSelection | null,
}
```

`next` is the next-request selection; a running step keeps the selection with which it started. The directory validates routability against the current catalog, exposes provider failures, and offers only the exact adapter-advertised effort IDs.

### Model blockers and cautions

- `directoryFor()` rejects addressed subagent Sessions. Side-chat fork children are ordinary Sessions, not subagent-address transports, so this restriction does not apply if they are retained by ordinary `SessionId`.
- The Host's `session.selectModel` first installs the Session-local next-request selection, then asynchronously calls `agentDefaultModel.saveSelection(selected)`. Therefore rc.2 has **no model-selection RPC that is child-local without also attempting to change the default for later Sessions**. The parent Session's own projection is not mutated, but the profile default is a side effect that the UI must disclose or accept.
- The model UI package does not expose a standalone React picker component. Reuse its service/store or build a thin side-chat view over the directory; do not copy the official component source.

## Permission contract

### Catalog and current value

The Remote namespace is:

```ts
ctx.remote.permissionPresets.catalog()
```

with the exact result:

```ts
RemoteResult<{
  options: Array<{ value: string; name: string; description?: string }>,
  defaultOptions: Array<{ value: string; name: string; description?: string }>,
  defaultPreset: string,
}>
```

The selected child exposes the current value through:

```ts
child.projections.faceOf('permissions')
// snapshot: { currentValue: string } | undefined
```

`undefined` means the composition does not provide the permission capability. The configured rc.2 presets commonly include `read-only`, `workspace-write`, and `danger-full-access`; an explicitly composed experimental integration may add `auto`. `custom` is a derived current display value and is not a switch target.

The official package listens for `permission-presets/catalog-changed` and connection-generation replacement before replacing its process catalog. A side-chat controller should similarly discard stale options, or reload on each picker open.

### Mutation

There is no `permissionPresets.select` Remote and no `SessionFace.setPermission`. The official current-session UI performs:

```ts
const result = await child.command(`/permission ${preset}`)
```

`SessionFace.command(line)` returns:

```ts
RemoteResult<{ matched: boolean }>
```

Success requires both `result.ok === true` and `result.value.matched === true`. The authoritative `permissions` projection confirms the eventual selected value.

### Permission UI surfaces and blockers

The official package registers:

- composer slot `conversation.input.permission`
- `/permission` command decoration with `kind: 'popupSelect'`
- General-settings default row

It does **not** register a shared `ctx.permissionDirectories` service and its `PermissionCatalogDirectory`/`PermissionSelect` are not exported from the public client entry (runtime exports are only `apply` and `inject`). A native side-chat tab therefore cannot mount the official picker component as a supported public API.

Recommended side-chat adapter:

1. Subscribe to the selected child's `permissions` projection.
2. Load the public permission catalog.
3. Render only catalog `options` (not `defaultOptions`) and call `child.command()`.
4. Require explicit risk acknowledgement for `danger-full-access` and `auto`, matching the official visible picker. Do not silently treat a typed slash command's consent behavior as consent from a custom button.
5. Disable the control when the projection is absent, the child reference is unavailable, or the command returns `matched: false`.

## Agent preset/composition contract

The public Remote namespace supplies:

```ts
ctx.remote.agentPresets.list()
// RemoteResult<{
//   presets: Array<{
//     id: string,
//     isDefault: boolean,
//     name?: string,
//     description?: string,
//     broken?: string,
//   }>
// }>

ctx.remote.agentPresets.read(presetId)
// RemoteResult<{ agentPreset: string; content: string; name?: string; description?: string }>

ctx.remote.agentPresets.select(sessionId, presetId)
// RemoteResult<string>  // selected preset id
```

The current identity is the child projection `agentPreset: string | null | undefined` (and also appears in Session header/snapshot data).

The official `AgentPresetSeatController` is intentionally a **new/blank-session** control:

- it stages a choice for the next Session;
- it applies only when the current Session exists and `session.blank === true`;
- when the Session is nonblank, it clears the staged choice without calling `agentPresets.select`;
- its public Client UI exports no reusable per-existing-session preset controller.

The rc.2 `session.fork` request is exactly `{ sessionId, atSeq? }`; it has no `agentPreset` override. Raw `session.create` accepts `agentPreset?`, but the public `ctx.sessions.create()` face omits that option and side-chat semantics require a forked context rather than an empty created Session.

**Conclusion:** show the inherited child preset read-only. Do not offer a preset chooser for a fork child and do not call `agentPresets.select` after the fork. Supporting a different side-chat preset would require a verified Host creation/fork contract that chooses the preset before any inherited history is installed; rc.2 exposes no such contract.

## Recommended Task 2.2 integration

1. Inject/use `@deepseek-ai/dsh-api-session-controller` and `@deepseek-ai/dsh-client-ui-model-selection`; retain exactly the selected child while its controls are mounted.
2. Drive the model UI from `ctx.modelDirectories.directoryFor(childId).store`, `load()`, and `select()`.
3. Drive permission UI from the retained child's `permissions` projection, `remote.permissionPresets.catalog()`, and `SessionFace.command()`.
4. Surface `agentPreset` as a read-only label with an explanation that forked rc.2 Sessions cannot change composition.
5. Keep parent and child identities explicit in every controller. The inherited native-tab `useSession`/`useProjection` hooks point to the parent and must never be used for child mutations.
6. Treat projection updates as authoritative settlement. Pending model/permission choices may be shown optimistically, but a Remote acknowledgement alone must not overwrite a newer projected child value.

## Unsupported or non-public shortcuts

Do not:

- copy the official chooser components or their private controllers;
- assume a `ctx.permissionDirectories` service exists;
- call a guessed `setPermission`/`setPreset` method;
- reuse the parent tab's `useSession` or `useProjection` for child controls;
- expose model selection as strictly child-only without documenting the global-default save side effect;
- offer agent-preset changes on a forked/nonblank child;
- treat settings-default rows (`defaultOptions`, `writeDefaultPreset`) as current-child controls.
