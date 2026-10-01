# DSH Independent Side Chat Plugin Implementation Plan

> **For agentic workers:** Execute exactly one phase/task at a time. Do not start a later phase until its gate is reviewed and explicitly marked PASS. Apply TDD to every behavior change. This plan is intended to be handed to a low-cost coding model in separate task-sized prompts; the model must not attempt the whole plan in one run.

**Goal:** Build from scratch and publicly release an independent DSH plugin for full-featured side conversations, main-chat selection annotations, and controlled Q/A reflow, while coexisting with `dsh-better-sidebar` on both Web and Desktop.

**Architecture:** A Cordis Host plugin owns authenticated side-session operations through the DSH Typert Remote Gateway, parent/child authorization, and durable association metadata. A Client plugin registers one independently named native right-sidebar tab and renders one active child thread for the current parent session. DSH remains the authority for actual sessions, Agent execution, attachment admission, approvals, and conversation persistence; the plugin never edits DSH session logs directly. Avoid custom `webServer` routes and infinite SSE unless a target-runtime test proves they work on Desktop: the documented server is browser-only, and DSH Desktop `0.1.7-rc.2` has an upstream-reported `dsh-app://` SSE forwarding failure.

**Tech Stack:** TypeScript, pnpm, DSH Cordis plugin/bundle patch, React client plugin, Vitest unit tests, Playwright Web integration tests, DSH package-manager tarball installation. Use dependency versions and commands verified against the target runtime during Phase 0; the globally installed package tree currently visible in this workspace reports DSH internals at `0.1.7-rc.1`, whereas the user's Desktop target is `0.1.7-rc.2`, so never treat that global tree as proof of the Desktop `rc.2` contract.

## Global Constraints

- The plugin owns side-chat features only; `dsh-better-sidebar` continues to own file browser, editor, file preview, Git, and other existing tabs.
- Support both DSH Web and DSH Desktop; the actual `/Applications/DeepSeek Harness.app` Desktop cold-start test is a release gate.
- Do not copy `dsh-sidenote` source, assets, CSS, or tests. Use only the user-approved behavioral requirements in `docs/superpowers/specs/2026-09-28-dsh-sidechat-design.md`.
- Do not modify a signed Desktop app, weaken authorization/CORS/Origin checks, or edit session JSONL/event logs directly.
- Never mutate the currently working Desktop profile before Phase 0 isolation is established and profile/package/lock/patch backups are verified. Desktop profiles are Electron-managed; `dsh plugin --profile desktop ...` is not a valid install route.
- One parent may own multiple durable side threads, but only the selected thread is mounted/polled. Hidden threads continue running and are not cancelled by navigation.
- New side threads inherit parent context/model/permission at creation; subsequent side-thread model/permission changes must not change parent state.
- Child attachments (screenshots/images and host-supported files such as PDF/DOCX) must be admitted/uploaded for that child thread, never borrowed from the parent session.
- Reflow is opt-in per completed Q/A. Clicking Reflow only creates a removable/previewable draft card. No message is sent until the user submits a later parent-session message; no second confirmation dialog appears.
- Keep user data out of test fixtures. Every phase ends with tests, focused review, and a commit/checkpoint before proceeding.

---

## Repository/File Map

Proposed new repository directory: `/Users/luke/Documents/Codex/DSH build/dsh-sidechat` (package working name `dsh-sidechat`; GitHub owner/remote is set only when the user chooses the account/repository name). Keep implementation files focused:

- `package.json`, `pnpm-lock.yaml`, `cordis.patch.yml`, `tsconfig.host.json`, `tsconfig.client.json`, `tsdown.config.ts`, `vitest.config.ts`, `playwright.config.ts`: public package exports, DSH bundle/module registration, Typert generation and tests.
- `src/index.ts`: Host Loader entry, Host service registration and Cordis-owned lifecycle; no custom `webServer` route.
- `src/sidechat/ownership.ts`: durable parent↔child association, authorization and schema validation.
- `src/sidechat/controller.ts`: `TypertRemoteService` methods for create/list/info/rename/archive/cancel/prompt/paged events; only calls public DSH session/Agent APIs.
- `src/sidechat/seed.ts`: parent snapshot construction and turn/inbox boundary handling.
- `src/sidechat/attachments.ts`: validates child-scoped DSH upload receipts and prompt admission.
- `src/client/index.tsx`: Client plugin entry; explicitly mounts this package's generated Remote contribution.
- `src/client/native-tab.tsx`: native right-sidebar type registration, keyed body/title slots, exact disposer cleanup, and open/close navigation.
- `src/client/api.ts`: typed `ctx.remote` adapter with `RemoteResult` handling and abort/cancellation semantics.
- `src/client/state.ts`: selected parent/child IDs, per-thread draft, attachment state and persisted UI metadata.
- `src/client/SideChatPanel.tsx`, `src/client/Transcript.tsx`, `src/client/Composer.tsx`, `src/client/ThreadList.tsx`: UI responsibility split.
- `src/client/annotations/{model,store,selection,anchor,composer-bridge}.ts(x)`: main-chat selection, annotation state, resilient quote anchors, and send-time serialization.
- `src/client/reflow/{model,store,extract,composer-bridge}.ts(x)`: completed Q/A extraction and pending reflow card lifecycle.
- `tests/host/`, `tests/client/`, `tests/e2e/`: Host Remote/ownership tests, pure client state/extraction, and real Web-host integration tests.
- `scripts/`: deterministic Web mount/E2E helpers; no script may change or erase the user's active profile.
- `README.md`, `LICENSE`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`: public install/use/security docs and release automation.

Do not create the feature implementation before the Phase 0 API inventory and host gates pass. If investigation shows one of these proposed modules conflicts with an actual DSH public contract, update this plan's file map before writing feature code.

## Plugin-Owned Logical API Contract

These are the logical operation names and successful-value semantics, not an HTTP route contract. Host operations are declared with `TypertRemoteService`/`@Remote`; Client calls travel through the DSH Gateway and return `Promise<RemoteResult<T>>`. Domain failures use `RemoteError` codes; do not invent HTTP status or wrapper envelopes. All IDs are opaque strings. The Host resolves and validates DSH-owned parent/child session identity on every child operation.

```ts
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

export interface SidechatThreadSummary {
  readonly childSessionId: string
  readonly parentSessionId: string
  readonly title: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly status: 'idle' | 'running' | 'needs-input' | 'error' | 'archived'
  readonly provider?: string
  readonly model?: string
  readonly permission?: string
}

export type SidechatContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly mediaType: string; readonly data: string; readonly name?: string }
  | { readonly type: 'file'; readonly receiptId: string }

export type SidechatEvent =
  | { readonly seq: number; readonly kind: 'message'; readonly turnId: string; readonly role: 'user' | 'assistant'; readonly source: 'user' | 'assistant' | 'plugin-injection'; readonly content: readonly SidechatContentPart[] }
  | { readonly seq: number; readonly kind: 'turn-start'; readonly turnId: string }
  | { readonly seq: number; readonly kind: 'turn-end'; readonly turnId: string; readonly reason: string }
  | { readonly seq: number; readonly kind: 'tool'; readonly turnId: string; readonly callId: string; readonly name: string; readonly state: 'running' | 'succeeded' | 'failed'; readonly summary?: string }
  | { readonly seq: number; readonly kind: 'interaction'; readonly turnId: string; readonly interactionId: string; readonly interactionKind: 'approval' | 'question'; readonly state: 'pending' | 'resolved' | 'expired'; readonly prompt: string }
  | { readonly seq: number; readonly kind: 'error'; readonly turnId?: string; readonly message: string }

export interface SidechatEventPage {
  readonly events: readonly SidechatEvent[] // Host-normalized child-owned events; never inherited parent seed events.
  readonly nextSeq: number
  readonly live: boolean
}

export interface SidechatApi {
  health(): Promise<RemoteResult<{ ok: true }>>
  start(input: { parentSessionId: string }): Promise<RemoteResult<{ childSessionId: string }>>
  list(input: { parentSessionId: string; includeArchived?: boolean }): Promise<RemoteResult<{ threads: readonly SidechatThreadSummary[] }>>
  info(input: { childSessionId: string }): Promise<RemoteResult<SidechatThreadSummary>>
  rename(input: { childSessionId: string; title: string }): Promise<RemoteResult<{ ok: true }>>
  archive(input: { childSessionId: string }): Promise<RemoteResult<{ ok: true }>>
  prompt(input: { childSessionId: string; requestId: string; content: readonly SidechatContentPart[] }): Promise<RemoteResult<{ accepted: true }>>
  cancel(input: { childSessionId: string }): Promise<RemoteResult<{ accepted: true }>>
  events(input: { childSessionId: string; afterSeq?: number }): Promise<RemoteResult<SidechatEventPage>>
}
```

- `start` receives a parent Session ID from the current native tab; the Host resolves it through DSH's Session Controller and obtains the child Session ID from `session.fork`, never trusting a client-supplied child ID or relationship. Whether a stronger scoped caller identity is available must be confirmed before relying on it.
- `prompt.requestId` is generated once per user submit and passed to the DSH Session prompt API as its idempotency key; retrying cannot create duplicate user messages. Generic files use `ctx.fileUpload.upload(childSessionId, file, ...)` to obtain a DSH receipt; the child prompt sends that receipt ID to DSH admission for the same Session. Images use the documented image prompt-content type. No custom base64 file staging or plugin-owned fake attachment IDs.
- `events` returns only the child's own history/events in bounded unary pages; Host maps real DSH event variants and omits fork-inherited seed records. Unknown DSH event variants are safely skipped or rendered as generic non-actionable events, never treated as a user/assistant turn.
- Model/permission and approval/user-question operations must map to the exact public DSH APIs recorded in `docs/host-api-matrix.md`; unsupported mutation semantics remain a blocker, not a guessed `setPermission` endpoint.
- Main-chat annotations and reflow are serialized as explicitly labelled, visible prompt text/reference content through the supported composer input path. The public composer submit contract does not currently accept an arbitrary structured sidecar; do not claim a hidden metadata payload.

## Phase 0 — Contracts, Isolation, and Coexistence (Hard Stop Gate)

### Task 0.1: Create the repo skeleton and API contract inventory

**Files:** `README.md`, `AGENTS.md`, `.gitignore`, `docs/host-api-matrix.md`, `docs/phase-0-evidence.md`.

- [ ] Record the installed `/Applications/DeepSeek Harness.app` version from its own `Contents/Info.plist`; runtime source/API claims must be pinned to the official immutable `dsh-v0.1.7-rc.2` tag. Record the globally installed CLI/runtime package tree separately as `0.1.7-rc.1`, not as target evidence.
- [ ] Do not inspect or mutate the active Desktop profile in this task. Profile isolation and any necessary package/lock/patch backup happen in Task 0.4 before a probe install.
- [ ] For every API below, record exact package version, exported symbol/type, method shape, lifecycle owner, and separate status labels for Web declarations and Desktop `rc.2` runtime evidence:
  - Right sidebar: `ctx.sidebarRightTabs.register`, keyed `sidebar.right.pane.tab` / optional `.title` slots, guide entry, `ctx.sidebarRight.openTab`, and disposer lifecycle.
  - Typert Remote: `TypertRemoteService`, `@Remote`, `dsh-typert-loader`, package exports `./typert` + `./remote`, generated Client contribution, explicit `ctx.remote.$mount`, and unary `ctx.remote` call. Record external-package build integration gaps as unknown until verified.
  - Desktop client-module bootstrap and `/plugins/events` SSE report; distinguish the reported infinite-SSE failure from finite bundle delivery, unary Remote `/api` calls, and Remote WebSocket streams. Do not claim the report proves unary/stream transport failure.
  - Session/Agent API: explicit `session.fork`/`create`/`prompt` and history pagination; record that no explicit `session.resume` endpoint was found and distinguish Host cold-resume behavior.
  - Per-child model/preset and permission selection; approval and user-question display/lifecycle.
  - Attachment service: `ctx.fileUpload.upload`, image/file receipt admission, limits, and prompt content; explicitly exclude upload from the empty-tab probe.
  - Conversation composer/input extension and submit contract; state whether arbitrary structured annotation/reflow payloads are accepted.
  - Plugin-owned durable storage and the verified `dsh-better-sidebar` setting needed to disable only its old sidechat page; mark uninspected values unknown.
- [ ] Use `docs/host-api-matrix.md` to distinguish verified official declarations, upstream-reported Desktop behavior, local observations, and runtime-unknown behavior. Do not equate upstream `master`, rc.1 types, or documentation with a successful local Desktop call.
- [ ] Stage 0 must-have APIs are native tab registration, package loading, and a finite authenticated Typert unary ping. Stop if the official tag does not support these; otherwise actual Desktop behavior remains gated by Task 0.4.

**Verification:** Reviewer compares every claimed signature and version to the pinned official package declaration/source link; all unknowns and non-runtime-verified claims are labeled explicitly.

### Task 0.2: Build a minimal empty native tab and authenticated Typert Remote ping

**Files:** `package.json`, `pnpm-lock.yaml`, `cordis.patch.yml`, `tsconfig.host.json`, `tsconfig.client.json`, `tsdown.config.ts`, `vitest.config.ts`, `src/index.ts`, `src/client/index.tsx`, `src/client/native-tab.tsx`, `tests/host/remote-health.spec.ts`, `tests/client/native-tab.spec.ts`, `scripts/build-and-pack.sh`.

- [ ] Add failing tests first: Host unary `health()` returns `{ ok: true }` through the generated Client Remote contribution; the Client explicitly mounts and disposes that contribution; tab registration uses a plugin-owned ID/kind and duplicate/disposal behavior is deterministic. Authentication is provided by the normal DSH Connection/Gateway; tests must not bypass auth or fabricate cookies.
- [ ] Implement the smallest valid installable DSH bundle, not just source modules: `dsh.bundle.patch` inserts a Host Loader entry, `dsh.client` declares the Client bundle, `./typert` and `./remote` exports point at generated artifacts, and the Client entry explicitly invokes `ctx.remote.$mount()`.
- [ ] Build Host types before tsdown's `typertPlugin({ mode: 'package', faces: ['host'] })` generation; build the client module using target-version APIs from `docs/host-api-matrix.md`. Do not assume the DSH monorepo `build:lib` command is available in this standalone repository.
- [ ] Use a plugin-owned tab ID `dsh-sidechat:conversation` and kind `dsh-sidechat`; never use a `dsh-better-sidebar:*` ID or `files` kind. Register the definition plus keyed body/title slots under the Client plugin lifecycle so unload/disposal restores the previous guide/file behavior.
- [ ] Do not add a custom `webServer` route, persistent SSE, or WebSocket in this probe. The `health()` method is a finite Typert Remote call through the standard Gateway.
- [ ] Add exact package scripts for `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm pack`; `pnpm pack` must produce the first installable versioned tarball.

**Verification:** From a clean install, `pnpm typecheck && pnpm test && pnpm build && pnpm pack` pass. Inspect the tarball file list and assert it includes only the intended built Host/Client entries, patch and manifest.

### Task 0.3: Pass the Web cold-start coexistence lane

**Files:** `playwright.config.ts`, `tests/e2e/phase0-web.e2e.ts`, `scripts/test-web-mount.sh`, `.github/workflows/ci.yml`.

- [ ] Test against a scratch Web profile, never the user's active profile. Install the tarball with the supported CLI route `dsh plugin --profile web add <tarball>` only after confirming CLI version/command syntax in the API inventory.
- [ ] Start the actual Web host through the existing DSH host test harness. Assert new guide entry appears once; open/close/reopen does not duplicate; health request succeeds; `dsh-better-sidebar` file page and a real file preview remain functional; close/restart preserves plugin activation; uninstall restores baseline.
- [ ] Assert browser Console has no duplicate registration, page errors, rejected generated Client `ctx.remote` health call, 403/405 on the documented Gateway path, or malformed host URL. Preserve test logs as CI artifacts.
- [ ] Add a CI Web lane that runs `pnpm test:e2e:web` against a pinned supported DSH version discovered in Phase 0; do not pin an unverified public version merely because its name looks close.

**Gate:** Phase reviewer signs off the actual scratch profile log and E2E report before any Desktop installation.

### Task 0.4: Pass the Desktop cold-start coexistence lane

**Files:** `docs/phase-0-evidence.md`, `scripts/desktop-smoke-checklist.md`; only touch a Desktop test-profile configuration after its isolation is proven.

- [ ] First verify whether the Desktop app supports a separate `DSH_HOME`/test profile without reading or mutating the production profile. If it does, use that isolated home and install the packed artifact through the Desktop GUI/plugin manager, not `dsh plugin --profile desktop`.
- [ ] If isolation cannot be established, stop and present one concise maintenance-window request before touching the currently working profile. After the user accepts, back up `package.json`, lockfile, `cordis.patch.yml`, relevant compatibility files and plugin-manager operation logs; verify backup hashes; then install only the empty probe and immediately roll back if any check fails.
- [ ] On `/Applications/DeepSeek Harness.app` 0.1.7-rc.2, close the app fully, cold start, and capture evidence for: new entry occurs once; no `dsh-better-sidebar:files` duplicate; file page/file preview/URL opening work; the tab's `useTabInfo()` contains the expected parent-session identity; and the finite Typert Remote unary `health()` succeeds through normal Desktop authentication. Repeat after quit/restart. Record `/plugins/events` SSE behavior if it appears, but do not make this empty-tab gate depend on HMR or a long-lived stream.
- [ ] Test with the old `better-sidebar` sidechat disabled via its verified plugin setting; keep file/editor enabled. Do not infer the setting property name: confirm it from the actual `dsh-better-sidebar` Config/types and write the exact change into evidence.
- [ ] Record all Console and host logs after clearing prior errors; compare with the previous `405`, `403`, `ws:///app/...`, and duplicate-registration signatures.

**Hard gate:** If this fails, do not implement session/chat features. Diagnose the exact failing boundary and either (a) add a reviewed, separately tested, reversible `better-sidebar` compatibility patch, then rerun Tasks 0.3–0.4, or (b) report that the current Desktop host blocks safe coinstallation. Never bypass auth or edit the signed app.

**Phase 0 exit:** Web and Desktop evidence both pass, package can be installed/uninstalled safely, `dsh-better-sidebar` file functions still work after cold restart. Only then start Phase 1.

---

## Phase 1 — Durable Side Sessions and Parent/Child Ownership

### Task 1.1: Define and test plugin-owned thread association records

**Files:** `src/sidechat/ownership.ts`, `src/sidechat/storage.ts`, `tests/host/ownership.spec.ts`.

- [ ] Write failing tests for: valid parent→child registration; duplicate idempotent create; two parents cannot claim one child; client-supplied parent mismatch is rejected; delete/archive never deletes DSH session history; corrupt/old schema is handled without adopting unowned sessions.
- [ ] Define versioned record `{ schemaVersion: 1, parentSessionId, childSessionId, createdAt, updatedAt, title, archivedAt? }` with schema validation and stable parent-scoped list ordering.
- [ ] Persist through the public plugin-owned storage service confirmed in Phase 0. Store association/selection metadata only, not a second transcript or raw file bytes.

### Task 1.2: Fork an independent session with a correct boundary

**Files:** `src/sidechat/seed.ts`, `src/sidechat/controller.ts`, `tests/host/seed.spec.ts`, `tests/host/create-remote.spec.ts`.

- [ ] Write failing tests for a parent with completed turns, a running turn, pending inbox/approval/user input, multiple tool events, and empty/blank parent session.
- [ ] Use the exact DSH `session.fork` contract from `docs/host-api-matrix.md`. Snapshot only up to a documented committed boundary; if the public fork API cannot express a safe boundary, stop rather than simulate one by copying session logs.
- [ ] Atomically create the child and association record, or compensate by disposing only the newly created child if association persistence fails; never erase the parent.
- [ ] Copy the parent's current model and permission settings into child creation options only through verified DSH settings APIs, without retaining a live mutable reference to parent settings.

### Task 1.3: Add scoped child operations and bounded history

**Files:** `src/sidechat/controller.ts`, `src/sidechat/ownership.ts`, `tests/host/controller.spec.ts`, `tests/host/events.spec.ts`.

- [ ] Test every child operation with owner parent, unrelated parent, unknown child, archived child and cold child; cross-parent access must fail with stable `RemoteError` codes and must not reveal foreign titles/events.
- [ ] Add list/info/rename/archive/cancel/prompt/events Remote methods. Derive child ownership server-side from association storage before every operation; do not trust a `parentSessionId` repeated by the renderer.
- [ ] For a cold child, use DSH's verified Host Session/Agent resolver; the inspected public API has no standalone `session.resume` Remote. Event paging uses bounded `afterSeq`/cursor semantics and never requests beyond the Session's committed cursor.
- [ ] Cancel only on explicit stop; closing/hiding/navigating away leaves the Agent running. Archive hides from the active list but preserves DSH child-session events.

**Commands:** `pnpm test -- tests/host/ownership.spec.ts tests/host/seed.spec.ts tests/host/controller.spec.ts tests/host/events.spec.ts`; then `pnpm typecheck && pnpm test`.

### Task 1.4: Build per-parent history and session ID actions

**Files:** `src/client/state.ts`, `src/client/api.ts`, `src/client/ThreadList.tsx`, `src/client/SideChatPanel.tsx`, `tests/client/thread-state.spec.tsx`.

- [ ] Tests verify selected child belongs to active parent; switching parents selects that parent's active child without cancelling the previous Agent; adding a child pushes the prior current child into history; reopening restores the selected child and draft; unknown child is not rendered.
- [ ] Add thread list/history UI; new thread action; reopen, rename and archive actions; loading/empty/error states; one selected child panel only.
- [ ] Display parent ID and child ID in distinct labelled copy buttons; copy uses Clipboard API with an explicit fallback/error state; tests assert copied values never swap.
- [ ] Persist selected child and composer draft per parent/child using plugin UI state; server session events remain the transcript source of truth.

**Gate:** Parent/child Remote-operation tests, cold-resume tests and client switching tests all pass before adding model chooser or rich composer.

---

## Phase 2 — Complete Side-Chat Interaction

### Task 2.1: Render durable transcript and bounded live state

**Files:** `src/client/Transcript.tsx`, `src/client/api.ts`, `src/client/state.ts`, `tests/client/transcript.spec.tsx`.

- [ ] Test user/assistant messages, multiple assistant steps, tool-call/result pairing, errors, approvals, user questions, partial live stream and final settlement; context seed/injection must not be mistaken for a new user request.
- [ ] Render committed session events plus only the current bounded live stream. On settle replace live output with the durable message; polling/push must not duplicate rows.
- [ ] Abort requests and stop polling when the component is hidden/unmounted. Only the currently selected child may poll; hidden Agents keep running host-side.

### Task 2.2: Add model and permission controls scoped to child

**Files:** `src/client/ModelPermissionControls.tsx`, `src/sidechat/controller.ts`, `src/client/api.ts`, `tests/host/model-permission.spec.ts`, `tests/client/model-permission.spec.tsx`.

- [ ] Use only chooser/state APIs whose exact contracts were verified in Phase 0. Before first turn, change the child's selected model/preset/permission as a child-local setting; after a turn, use only a DSH-supported mutation or restart/continue operation that preserves transcript.
- [ ] Tests create parent P and child C, change C model/permission, and assert parent model/permission remain byte-for-byte unchanged; reopen C and assert its choices persist.
- [ ] Disable unsupported choices with a clear explanation rather than calling undocumented APIs. Surface provider/model identity in the child header.

### Task 2.3: Support tool, approval and user-question lifecycles

**Files:** `src/client/Transcript.tsx`, `src/client/InteractionCard.tsx`, `src/client/api.ts`, `src/sidechat/controller.ts`, `tests/host/interaction-remote.spec.ts`, `tests/client/interaction-card.spec.tsx`.

- [ ] Route approvals and user-question answers to their owning child session only; reject stale, duplicate, parent-session and foreign-child response IDs.
- [ ] Add pending/approved/denied/answered/expired UI states and retain tool results in the child transcript.
- [ ] Test a child approval while switching to another parent: action stays scoped to child; parent conversation is not submitted or mutated.
- [ ] If a required interaction surface is not available to plugins, record the exact DSH blocker; do not imitate “approved” state in client-only storage.

### Task 2.4: Send, stop, retry and composer draft correctness

**Files:** `src/client/Composer.tsx`, `src/client/state.ts`, `src/sidechat/controller.ts`, `tests/client/composer.spec.tsx`, `tests/host/prompt-remote.spec.ts`.

- [ ] Tests cover empty text/no attachment rejection, Enter vs Shift+Enter, IME composition, stop while running, network retry, duplicate submit protection, per-child draft restore and switching child during an in-flight request.
- [ ] Disable send while required uploads are pending/failed; preserve text and attachments on rejected send; explicit stop invokes child cancellation only.
- [ ] Keep Composer pure UI state; server validates every prompt and all attachment/interaction references.

**Gate:** Complete text-only multi-turn work on a child, with tools/approval if supported, survives reload and leaves main session unchanged.

---

## Phase 3 — Screenshots and Ordinary File Attachments

### Task 3.1: Add client attachment draft lifecycle

**Files:** `src/client/attachments.ts`, `src/client/AttachmentChips.tsx`, `src/client/Composer.tsx`, `tests/client/attachments.spec.ts`, `tests/client/composer-attachments.spec.tsx`.

- [ ] Add tests for image file selection, clipboard image paste, supported PDF/DOCX file selection, unsupported type, too-large file, remove-before-send, child switch, upload error/retry and two attachments with the same filename.
- [ ] Implement a hidden multiple file input and paste handler. Keep every local draft keyed by opaque UUID and bound to `(parentSessionId, childSessionId)`; filename is display-only and never an identifier or path authority.
- [ ] Show local image preview and file name/type/size with upload state; provide remove and retry controls; block send until all server receipts are ready.
- [ ] Match exact MIME, byte/count/pixel limits to the host contract from Phase 0; reject deceptive extension/MIME mismatches server-side.

### Task 3.2: Use DSH attachment upload/admission for the child

**Files:** `src/client/api.ts`, `src/sidechat/attachments.ts`, `src/sidechat/controller.ts`, `tests/host/attachments.spec.ts`, `tests/host/prompt-attachments.spec.ts`.

- [ ] Test valid image, valid file receipt, malformed/base64 payload, unsupported media, oversize file, foreign-session receipt, expired receipt, duplicate receipt and request cancellation.
- [ ] Use the verified DSH upload/admission service; do not invent a second durable attachment format. Bind the resulting reference/receipt to the exact child at admission and verify its owner before creating the child user message.
- [ ] Support pure attachment prompts and mixed text+attachment prompts; keep content order stable. User message must be recorded once and only after all attachments are admitted.
- [ ] On a rejected partial batch, do not send a partial prompt. Report which draft failed and preserve retry/removal choices. Never reuse parent upload receipts.

### Task 3.3: Attachment integration and storage lifecycle tests

**Files:** `tests/e2e/attachments.e2e.ts`, `tests/host/attachment-retention.spec.ts`, `docs/phase-3-evidence.md`.

- [ ] In a scratch Web session, attach/paste a screenshot and attach one supported ordinary file; verify prompt contains real admitted attachment refs and returned session events reference the same child.
- [ ] Create two children, upload same-named files to each, and assert each receipt resolves only in its owning child.
- [ ] Verify removing a local draft does not delete an already-sent durable DSH attachment; verify unsent failed drafts can be removed without a phantom transcript entry.
- [ ] Record known host/model format limits and the difference between upload accepted, prompt admitted and model actually able to interpret the file.

---

## Phase 4 — Main-Chat Selection Annotations and Q/A Reflow

### Task 4.1: Define annotation and quote-anchor behavior

**Files:** `src/client/annotations/model.ts`, `src/client/annotations/anchor.ts`, `src/client/annotations/store.ts`, `tests/client/annotation-anchor.spec.ts`, `tests/client/annotation-store.spec.ts`.

- [ ] Unit tests cover unique quote, repeated quote with prefix/suffix disambiguation, changed/deleted source message, empty selection, source message replacement, edit/delete, parent separation and reload restore.
- [ ] Define stable record with `id`, `parentSessionId`, `sourceMessageId`, `quote`, bounded `prefix`/`suffix`, selected range, editable annotation text, timestamps and `anchorState: 'resolved' | 'needs-review'`.
- [ ] Re-anchor only with verified unique evidence. Ambiguous/missing anchor becomes `needs-review`; never silently move annotation onto unrelated text.
- [ ] Keep annotations in a plugin-owned local/persistent store; do not mutate original assistant messages or composer draft at selection time.

### Task 4.2: Attach annotation selection to main assistant messages

**Files:** `src/client/annotations/selection.tsx`, `src/client/annotations/AnnotationPopover.tsx`, `src/client/index.tsx`, `tests/client/annotation-selection.spec.tsx`, `tests/e2e/annotations.e2e.ts`.

- [ ] Inspect public DSH message-renderer/selection slots from the Phase 0 matrix. Register only over assistant-message text; do not intercept user text, code editors, sidebar transcript or file preview.
- [ ] Tests select across text nodes, select in a code block, select after rerender, cancel popover, edit annotation, save, delete, and switch parent while popover is open.
- [ ] Selection UI captures source message identity and quote context, opens edit UI, and creates the annotation object only on explicit Save.
- [ ] E2E asserts the main assistant text remains unchanged and draft remains byte-identical after creating/editing an annotation.

### Task 4.3: Extract only completed child Q/A pairs for reflow

**Files:** `src/client/reflow/extract.ts`, `tests/client/reflow-extract.spec.ts`.

- [ ] Test user event before `turn/start`, boundary/inherited injection exclusion, multiple assistant messages in one turn, reasoning/tool exclusion, cancellation/error/incomplete turn rejection, empty answer rejection, and most-recent completed turn selection.
- [ ] Extract from durable child own-events, not rendered DOM or live token stream. Require both a real user question and settled assistant text for one completed turn; cap output by rejecting an over-limit pair with an explicit UI message instead of silently truncating.
- [ ] Include source child ID, title and turn identity in the returned immutable value; escape/quote all body content as data, never as system/developer instructions.

### Task 4.4: Add removable pending cards and send-time single-consumption

**Files:** `src/client/reflow/model.ts`, `src/client/reflow/store.ts`, `src/client/reflow/composer-bridge.tsx`, `src/client/annotations/composer-bridge.tsx`, `tests/client/composer-serialization.spec.ts`, `tests/client/reflow-lifecycle.spec.ts`.

- [ ] Tests verify add/preview/remove/reload, parent isolation, no immediate send, one send includes each selected annotation/reflow exactly once, rejected send retains all objects, accepted send consumes only objects captured by that submission, concurrent second edit is not erased, and parent switch never carries cards across sessions.
- [ ] Integrate with a confirmed DSH pre-submit/send payload extension. Serialize annotations and reflow as an explicitly labelled reference/context content block with source metadata; never directly append the data into `session.log` or send on card click.
- [ ] If DSH lacks a supported pre-submit extension, stop this task and document the missing contract rather than monkey-patching private React internals or silently polluting draft text.
- [ ] Show reflow cards above the main composer, each with source, Q/A preview, expand/collapse and remove. Clicking Reflow creates the card only; sending remains an explicit user action.

**Gate:** Full Web test proves selection annotation and Q/A reflow are one-shot, parent-scoped and lossless on failed sends.

---

## Phase 5 — Performance, Regression, Documentation, and Installable Release

### Task 5.1: Add full system regression coverage

**Files:** `tests/e2e/sidechat-lifecycle.e2e.ts`, `tests/e2e/sidechat-recovery.e2e.ts`, `tests/e2e/better-sidebar-coexistence.e2e.ts`, `scripts/desktop-smoke-checklist.md`, `docs/release-evidence.md`.

- [ ] E2E sequence: create two children under parent A; switch to parent B while one child runs; verify no cancellation/poll storm; return to A; reopen child; quit/restart host; verify same child IDs, transcript, model/permission, drafts and reflow objects.
- [ ] E2E sequence: file page/editor/file preview/web URL plus sidechat tab concurrently; switch/toggle tabs repeatedly; assert exactly one registration and no blank previews/console errors.
- [ ] Stress test 20 archived children and 3 active parent sessions; only selected child fetches live events. Record API call counts and ensure closed tabs clean up subscriptions and AbortControllers.
- [ ] Run unit/type/build/Web E2E from clean dependencies and preserve logs/screenshots/video in `docs/release-evidence.md` or CI artifacts.

### Task 5.2: Make release docs and artifacts

**Files:** `README.md`, `LICENSE`, `SECURITY.md`, `.gitignore`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `scripts/build-release.sh`, `docs/install-web.md`, `docs/install-desktop.md`, `docs/rollback.md`.

- [ ] Write docs that distinguish supported Host version, Web installation via CLI, Desktop installation via Electron/plugin manager, and the unsupported Desktop CLI profile mutation. Include feature list, permissions, data retention, attachment limits, uninstall behavior and known limitations.
- [ ] Add CI: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e:web`; ensure tests do not touch real user profile or use external binaries without checking availability.
- [ ] Build versioned tarball with `pnpm pack --pack-destination artifacts`; inspect tarball contents; generate SHA-256 checksum; attach package/checksum/source commit to GitHub Release. Do not publish to npm in this first release.
- [ ] Use MIT only if user confirms the project's license choice before publishing; do not copy third-party assets/source. Add copyright/attribution notices only for code/assets actually incorporated under their licenses.
- [ ] Add rollback instructions: disable/uninstall only the new plugin through the supported manager, restore `better-sidebar` old sidechat setting if desired, preserve DSH sessions and plugin-owned metadata unless the user explicitly requests deletion.

### Task 5.3: Final Web + Desktop release gate

- [ ] Install the packed artifact into a clean Web profile and verify create/reopen/switch/model/permission/attachment/annotation/reflow/uninstall.
- [ ] Install the exact same packed artifact into an isolated Desktop test profile or, if impossible, the one-time backed-up maintenance profile described in Task 0.4. Record app version, package SHA, profile route, and full Console/host logs.
- [ ] Re-run file browser/editor/file preview/URL opening after a complete Desktop restart; assert no new 405/403, `ws:///app/...`, duplicate `dsh-better-sidebar:files`, React render error, or file preview failure.
- [ ] If any release gate fails, do not publish/ship the artifact; uninstall/rollback and attach failing evidence. A GitHub Release is created only after both Web and Desktop lanes pass and the user chooses repository name, owner, and license.

## Low-Cost Model Handoff Rules

Give the implementing model one task at a time with the following prompt skeleton, replacing only the named task number and deliverables:

```text
You are implementing one task from docs/superpowers/plans/2026-09-28-dsh-sidechat-implementation.md.
Read docs/superpowers/specs/2026-09-28-dsh-sidechat-design.md, this plan's Global Constraints, Plugin-Owned Logical API Contract, and Task <N> in full.
Work only in /Users/luke/Documents/Codex/DSH build/dsh-sidechat and only on Task <N>. Do not continue to the next task or modify the user's active DSH profile.
Use TDD: add a behavior test, run it and show the expected failure, implement the minimum change, then run the named test plus pnpm typecheck, pnpm test, and pnpm build when applicable.
Do not copy dsh-sidenote source/assets/tests. Do not invent DSH interfaces: use docs/host-api-matrix.md; if the required signature is absent, stop and report the missing contract.
Before editing, report the exact files you plan to touch. At completion, report changed files, full verification commands/output, any unverified assumptions, and commit hash. Do not push to GitHub, publish npm, install into the active Desktop profile, alter a signed app, weaken auth, or delete sessions.
```

The controller sends the exact task text and test names alongside this prompt. A second reviewer compares the diff to the task and global constraints before the next task is issued. Do not let the model push to GitHub, modify the active Desktop profile, publish npm, edit the signed app, or delete any session/profile data.

## Plan Self-Review / Coverage Matrix

- Coexistence and error-root tracing: Tasks 0.1–0.4 and 5.1.
- Parent-scoped child session, seed boundary, persistence, list/reopen, IDs: Tasks 1.1–1.4.
- Independent model/permission, tools/approval/questions, draft/stop/retry: Tasks 2.1–2.4.
- Screenshot paste, image attachment and ordinary PDF/DOCX receipt isolation: Tasks 3.1–3.3.
- Main assistant selection annotations and source-safe anchors: Tasks 4.1–4.2.
- Completed Q/A extraction, preview/remove and send-time exactly-once reflow: Tasks 4.3–4.4.
- Performance, restart, Web/Desktop package install, GitHub artifact and rollback: Tasks 5.1–5.3.
- Unverified DSH interfaces are explicitly assigned to Phase 0; no task below Phase 0 assumes a guessed runtime method signature.
