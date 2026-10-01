# DSH Host/Client API Matrix — 0.1.7-rc.2

Scope: Phase 0 only (native right-sidebar tab + finite unary Typert ping). No session creation, prompts, uploads, SSE, or WebSocket behavior is implemented or exercised here.

## Target pins and evidence boundary

- Desktop target: `/Applications/DeepSeek Harness.app`, 0.1.7-rc.2 (per project instructions).
- API declarations used below are from exact `0.1.7-rc.2` package artifacts; Cordis is `~4.0.4`.
- Immutable source tag: [`dsh-v0.1.7-rc.2`](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.7-rc.2).
- Declaration checks remain separate from runtime evidence. The Web host now cold-starts in an isolated profile and co-loads the package graph; visible tab, ping, and Desktop status remain separately tracked below.

## Phase 0 API matrix

| Surface | Exact public contract used | Declaration/source evidence | Local verification | Web runtime | Desktop runtime |
|---|---|---|---|---|---|
| Cordis lifetime | `Context.effect(execute, label?)` owns sync/async cleanup; it is the plugin fiber lifecycle, not an `'dispose'` event. | `vendor/cordis` (`@deepseek-ai/cordis` 4.0.4), `lib/types/fiber.d.ts`; the Context event map does not declare `'dispose'`. | Client source is checked against `Context`; mount and tab cleanup are tested, including rollback if tab registration fails. | PARTIAL — isolated Web package activated; unload/disposer not exercised | UNKNOWN |
| Host Typert service | `TypertRemoteService(ctx, serviceKey, { namespace? })`; standard `@Remote('ping')` method. | `packages/typert/protocol` 0.1.7-rc.2; `packages/typert/generator` 0.1.7-rc.2. | Generated Host artifact contains `sideChat/ping`, service `sideChatController`, and strict `{ ok: true }` result schema. | UNKNOWN — unary ping has not been invoked over the authenticated gateway | UNKNOWN |
| Client Remote assembly | `ctx.remote.$mount(TypertRemoteContribution): Promise<TypertDisposer>`; mount explicitly, then dispose with the same Cordis effect as the tab. | `packages/api/gateway` and `packages/api/remotes` 0.1.7-rc.2; protocol `TypertClientRemote` declaration. | Type-checked against rc.2 declarations; corrected bundle loads in isolated Web without an activation failure. | PARTIAL — plugin activation only; no unary call or unload | UNKNOWN |
| Right-sidebar type registry | `ctx.sidebarRightTabs.register(definition): () => void`; definition has unique `id`, `kind`, and `title`. | `packages/client/ui-sidebar-right` 0.1.7-rc.2, `client/tab-registry.d.ts`. | Uses unique `id: dsh-sidechat:conversation`, `kind: dsh-sidechat`; no better-sidebar IDs/kinds are reused. | PARTIAL — package activated; session-scoped tab not visually observed | UNKNOWN |
| Tab body slot | `sidebar.right.pane.tab` is keyed by tab definition `id` and session-scoped. Register via `ctx.slots.inject(key, callback)` and `ctx.slots.register({name, key}, component)`; both return disposers. | `packages/client/ui-sidebar-right` `client/contract/slots.d.ts`; `packages/client/ui-slots` and `packages/client/ui-renderer` 0.1.7-rc.2. | Type-checked against rc.2 slot declarations; unit test verifies one registration and idempotent cleanup. | NOT VERIFIED — no session created, so the slot was not rendered | UNKNOWN |
| Bundle contribution | Client injects `@deepseek-ai/dsh-api-remotes` and `@deepseek-ai/dsh-client-ui-sidebar-right`; their rc.2 manifests recursively inject Gateway, Layout, Renderer, and required slot providers. | Exact `dsh.client.inject` fields in the rc.2 package manifests. | Final candidate uses the RC2 lazy-CJS client loader contract and bundles `zod`; it was installed and cold-started in an isolated Web profile. | PASS — both package IDs in boot graph; no failed-plugin banner | UNKNOWN |
| Authentication/transport | Ping must use normal DSH Gateway/Connection authentication; no custom HTTP route or auth bypass. Unary only. | Gateway/Remote package declarations. | Isolated Web host used its normal authenticated browser entry; the unary `sideChat/ping` call itself remains unexercised. | UNKNOWN — ping not invoked | UNKNOWN |

## Local test evidence

- Package tests: `pnpm --dir packages/dsh-sidechat test` — PASS, 15/15. Package build: `pnpm --dir packages/dsh-sidechat run build` — PASS.
- Tests cover generated `sideChat/ping` artifacts and code-level mount/tab cleanup. The Client bundle test also executes the DSH lazy-CJS registration and materializes it without external `zod` or a self-package Remote request.
- The final candidate tarball was installed through the app-bundled RC2 CLI into a scratch Web profile. No package was installed in the active DSH profile.

## Runtime evidence and remaining unknowns

- The shell has no `dsh` command on `PATH`; the target app's bundled CLI was invoked through its Electron executable with `ELECTRON_RUN_AS_NODE=1`. Version `0.1.7-rc.2`, Web profile add, and isolated loopback host startup were verified. Its `--help` exposes Host profile boot/install options only, not a separate Electron `userData` path.
- The final scratch Web cold start included both `dsh-sidechat` and `dsh-better-sidebar` in `window.__DSH_BOOT__.entries` and showed no failed-plugin banner. This verifies package startup/co-loading, not the visible session-scoped tab or Better Sidebar file/preview behavior.
- No session was created, and the unary authenticated `sideChat/ping` request was not invoked. Both remain unverified.
- The Desktop bootstrap was extracted read-only from `app.asar` with matching SHA-256 integrity. It defines `DSH_HOME` and resolves Desktop profile state under `$DSH_HOME/profiles/desktop`.
- A scratch `HOME`/`DSH_HOME`/XDG launch did not create a second Desktop window/profile; direct `--user-data-dir` was rejected as `bad option`. The app-bundled CLI also rejects `plugin --profile desktop add` because that profile is managed exclusively by Electron. A graceful quit, `cmd+Q`, and the app menu did not terminate the current process; no force quit or active-profile write was attempted, so the Desktop smoke was not started. Any retry must install through the Electron UI and confirm Electron `app.getPath('userData')` is under `/tmp` as well as `$DSH_HOME`.
- Session create/fork/prompt/history, model/permission inheritance, approval/user-question state, file upload/admission, composer integration, and durable plugin storage remain outside Phase 0.

## Gate status

**Code/package: PASS. Isolated Web startup/boot-graph co-loading: PASS; visible empty tab and authenticated ping: NOT VERIFIED. Desktop isolated runtime: NOT RUN. Overall Phase 0 exit gate: OPEN / NOT PASSED.** Do not begin session/chat feature implementation until both runtime lanes are evidenced.

---

## Phase 1 API matrix — Storage and Session (inventory only; no runtime evidence yet)

Extracted from `/Applications/DeepSeek Harness.app/Contents/Resources/app.asar` via `ELECTRON_RUN_AS_NODE=1` read of compiled `lib/index.js` files. No d.ts files are present in the asar; all signatures below are reverse-engineered from JS source comments and exports.

### `@deepseek-ai/dsh-storage` (storage hub)

| Symbol | Shape | Notes |
|---|---|---|
| `Storage` (service key `"storage"`) | `extends Service`; `backend: BackendRegistry`; `mount(form, facility): () => void` | Hub only; no IO. Plugins inject `["storage"]`. |
| `BackendRegistry` | `.register(name, backend): () => void`; `.get(name): Backend`; `.names(): string[]` | Throws `StorageError("duplicate-backend")` on dupe; disposer unregisters. |
| `storageBackendServiceKey(name)` | `(name: string) => string` → `"storage.backend.<name>"` | Lifecycle service key injected by backend plugins. |
| `StorageError` | `extends Error`; `.code: string`; stable codes: `"duplicate-backend"`, `"backend-not-found"`, `"closed"`, `"malformed-medium"`, `"version-mismatch"` | Pass-through from hub to domain layer. |
| `UNIT_NAME_RE` | `/^[a-z][a-z0-9_]*$/` | Enforced on domain/table names at `defineDomain` time. |

### `@deepseek-ai/dsh-storage-domain` (domain form)

| Symbol | Shape | Notes |
|---|---|---|
| Plugin config | `z.object({ backend: z.string().required(), routes: z.dict(z.string()).default({}) })` | `backend` = default backend name; `routes` = per-domain override map. |
| `inject` | `["storage"]` | Hub must be present first. |
| `defineDomain(spec)` | Validates and returns the spec narrowed to its literal type. Throws on bad name/version/table/global. | Call once at module load. |
| `domainTable(schema)` | `(schema: ZodType) => { valueSchema: ZodType }` | Declare one table inside a spec. |
| `DomainFacility` (service key `"storageDomain"`, mounted as `ctx.storage.domain`) | `.open(spec): Promise<Domain>`; `.get(name): Domain \| undefined`; `.closeAll(): Promise<void>` | Caller owns the returned `Domain` handle and closes via `Domain.close()` in a `ctx.effect` disposer. |
| `Domain` | `.table(name): KvTable`; `.global: { get(): V; set(v: V): Promise<void> }`; `.close(): Promise<void>`; `.name: string` | Reads are synchronous from memory. Writes queue on a serial chain; backend durability first, then memory update, then `domain/changed` emit. |
| `KvTable` | `.get(key): V \| undefined`; `.put(key, value): Promise<void>`; `.delete(key): Promise<boolean>`; `.update(key, fn): Promise<V>`; `.entries(): Iterator<[string,V]>`; `.keys(): Iterator<string>`; `.size: number` | All write methods queue on the domain chain. |
| `DomainError` | `.code`: `"already-open"`, `"closed"`, `"missing-key"`, `"invalid-record"`, `"backend-not-found"` (pass-through), `"facet-unsupported"` | `"invalid-record"` carries `.detail: { table, key }`. |
| `domain/changed` event | `{ domain, table, key, operation: "put" \| "deleted", value? }` | Emitted on `ctx` after every committed write. |

**Domain spec shape:**
```ts
defineDomain({
  name: string,            // matches /^[a-z][a-z0-9_]*$/
  version: number,         // non-negative integer
  tables: { [name]: domainTable(zodSchema) },
  global?: { schema: ZodType, initial: V },  // schema must not accept null
  layout?: 'single' | 'per-record',
  compatibleVersions?: number[],
  invalidRecords?: 'backup-and-skip',
})
```

**Usage pattern for a plugin:**
```ts
// In host plugin apply():
ctx.effect(async () => {
  const domain = await ctx.storage.domain.open(MY_DOMAIN_SPEC)
  // use domain.table('foo').get/put/delete
  return () => domain.close()
})
```

### `@deepseek-ai/dsh-storage-json` (JSON backend)

| Symbol | Shape | Notes |
|---|---|---|
| Plugin config | `z.object({ root: z.string().required() })` | `root` = file-tree root directory for all units. |
| `inject` | `["storage"]` | Registers backend name `"json"` on the hub. |
| `apply(ctx, config)` | Instantiates `JsonStorageBackend(config.root)`, registers it as `"json"`, provides `storageBackendServiceKey("json")`. | Each unit is a JSON file (single layout) or a directory of JSON files (per-record layout). |

**Plugin wiring to use storage in dsh-sidechat:**

The host app already loads `dsh-storage`, `dsh-storage-domain`, and `dsh-storage-json` (all visible in the asar `@deepseek-ai` package list). The plugin injects `["storageDomain", "sessionController"]` and calls `ctx.storage.domain.open(spec)`. Its domain uses `layout: "per-record"`, so `invalidRecords: "backup-and-skip"` is supported by the JSON backend. No separate plugin installation is needed — these are first-party DSH services.

**Verification status:** Compiled-contract extraction plus plugin-layer unit tests using an in-memory `KvTable` double. Real JSON-backend integration and installed-host runtime calls remain pending.

### `@deepseek-ai/dsh-api-session-controller` (Host Session authority)

The exact `0.1.7-rc.2` compiled implementation and generated Typert schemas were inspected from the app asar. The side-chat plugin calls the Host service directly; it does not edit Session JSONL files.

| Method | Exact shape used | Lifecycle / safety notes |
|---|---|---|
| `fork` | `fork({ sessionId, atSeq? }): Promise<{ sessionId }>` | When `atSeq` is omitted, Host chooses `latestCompletedPrefixBoundary`: latest `turn/end` plus following non-turn metadata, stopping before a new appended user message, `turn/start`, or `agent/inbox/spliced`. Host writes `session/end-seed`, synthetic fork closers, `meta.parentSession`, `meta.isSeeded: true`, and `inheritedEventCount`. |
| `inspect` | `inspect(sessionId, signal?): Promise<{ meta, inheritedEventCount, events }>` | Cold-safe snapshot; attached sessions use `snapshotEvents()`, cold sessions use persistence inspection without activating an Agent. The current Session's inherited cut is the **last** `session/end-seed` event tagged `{ inherited: true }`; older tagged markers may be inherited from ancestor forks. Used for bounded plugin responses after ownership lookup. |
| `resolveAgent` | `resolveAgent(sessionId): Promise<{ agent } | { error }>` | Host-only resolver that resumes a cold ordinary Session when necessary. There is no standalone `session.resume` Remote. Used before explicit cancel. |
| `prompt` | `prompt({ requestId, sessionId, mode: "queue" | "steer", content, clientTimeZone? }, signal): Promise<{ accepted: true }>` | The `AbortSignal` is required and is injected by the outer Typert call. Prompt rejects empty content, resolves/resumes the Agent internally, and uses `requestId` as the idempotency key. File receipts are resolved for this same child Session. |
| `cancel` | `cancel({ sessionId }): { accepted: true }` | Operates only on an attached live Agent and retains pending inbox work. Side-chat first calls `resolveAgent`; hiding or navigating never calls cancel. |
| `page` | `page({ address, throughSeq, beforeSeq?, maxMessages?, turnWindow? }, signal): Promise<{ records, hasMore }>` | Cold-safe, message-aligned backward page. `throughSeq` must not exceed the committed cursor. The plugin currently exposes forward `afterSeq` pages from a cold-safe `inspect` snapshot and caps each response at 100 normalized events. |

Generated prompt content schema is exactly text, one of PNG/JPEG/WebP/GIF inline image, or a same-Session staged file receipt. Persisted history is different: image and file blocks contain durable `attachment` references, which the side-chat event API preserves as bounded metadata without returning base64 bytes or temporary receipt IDs. DSH turn IDs are numeric and are serialized as strings on the plugin wire. Unknown Session event variants are skipped rather than coerced into messages. The returned `nextSeq` is an exclusive cursor that can be passed back directly as `afterSeq` without skipping a newly committed event.

**Typert caller-scope finding and boundary:** `RemoteScope` scopes a receiver Context by a wire identity; it does not expose the currently visible native-tab parent Session as authenticated caller metadata. Repeating a renderer-supplied `parentSessionId` on child operations would therefore create a bypassable appearance of authorization. Child operations instead accept only the opaque `childSessionId`, resolve its parent from the plugin-owned association, and use that stored parent for mutations; `list` and `start` remain parent-addressed. This enforces one stored parent per child and prevents reassignment, but it is **not** an authorization boundary against another authenticated plugin/renderer in the same DSH profile that already knows arbitrary Session IDs. Strong current-tab-to-parent authorization is unavailable in the confirmed RC2 public Typert contract and must not be claimed.
