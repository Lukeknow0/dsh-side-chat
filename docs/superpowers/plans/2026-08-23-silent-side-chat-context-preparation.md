# Silent Side Chat Context Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Side Chat interactive immediately while the Host silently prepares inherited context and safely queues the first user message.

**Architecture:** `SideChatService.start()` will register and acknowledge an opening entry before `agents.create()` settles. The Host owns a one-message outbox and flushes it after the boundary is injected; the controller only keeps a short optimistic copy to bridge admission and render the user message immediately. `SideChatSurface` treats `starting` as interactive and removes all context-preparation status UI.

**Tech Stack:** TypeScript 6, React 18, Cordis, DSH Agent/Session APIs, Zod remote contracts, Vitest, happy-dom, pnpm

## Global Constraints

- Capture only the completed parent context available when Side Chat is opened.
- Preserve ordering: inherited seed, `SIDE_CHAT_BOUNDARY`, queued user message.
- Do not expose context loading, inheritance, inspection, or preparation as runtime UI status.
- Do not allow more than one concurrent Side Chat turn.
- Do not change the read-only tool policy, retention lease, Better Sidebar public capability contract, or drawer fallback.
- Minimize, Escape, keyboard toggle, and native tab close must not call `controller.close()` or discard queued work.
- Only confirmed End may abort creation and clear transcript, outbox, and draft.
- Keep package name `@lukeknow0/dsh-side-chat` and module id `dsh-side-chat` unchanged.
- Do not modify `/Users/luke/deepseek-harness`.

---

### Task 1: Host-side opening admission and outbox

**Files:**
- Create: `tests/host-opening.spec.ts`
- Modify: `src/host/side-chat-service.ts`

**Interfaces:**
- Consumes: existing `StartSideChatRequest`, `ReadSideChatRequest`, `SendSideChatRequest`, and response schemas without wire changes.
- Produces: `start()` that resolves after entry registration, `read()` that works before a child handle exists, and `send()` that accepts one idempotent queued message.

- [ ] **Step 1: Write the failing Host timing and ordering tests**

Create a Cordis test context with a deferred `agents.create()` result and assert the externally visible contract:

```ts
const child = deferred<AgentHandle>()
const { service, followup, inject } = hostHarness({ create: () => child.promise })
const start = await service.start({ parentSessionId: PARENT, chatToken: TOKEN })

expect(start).toMatchObject({ ok: true, value: { chatToken: TOKEN } })
expect(service.read({ chatToken: TOKEN })).toMatchObject({
  ok: true, value: { messages: [], running: false },
})

const sent = await service.send({ chatToken: TOKEN, requestId: REQUEST, text: 'Explain this.' })
expect(sent).toMatchObject({ ok: true, value: { accepted: true } })
expect(followup).not.toHaveBeenCalled()
expect(service.read({ chatToken: TOKEN })).toMatchObject({
  ok: true,
  value: { messages: [{ role: 'user', text: 'Explain this.' }], running: true },
})

child.resolve(childHandle)
await vi.waitFor(() => { expect(followup).toHaveBeenCalledTimes(1) })
expect(inject.mock.invocationCallOrder[0]).toBeLessThan(followup.mock.invocationCallOrder[0])
```

Add separate cases proving duplicate request ids deliver once, cancel-before-ready prevents delivery, and close-before-ready disposes a late handle without delivery.

- [ ] **Step 2: Run the focused tests to verify RED**

Run: `pnpm exec vitest run tests/host-opening.spec.ts`

Expected: FAIL because `start()` waits for the deferred child and opening entries reject `read()` / `send()`.

- [ ] **Step 3: Add the one-message Host outbox and background settlement**

Extend the live entry with the exact state needed for admission:

```ts
interface PendingSideChatMessage {
  readonly requestId: string
  readonly message: ReturnType<typeof createUserMessage>
  cancelled: boolean
}

interface LiveSideChat {
  // existing fields remain
  readonly pendingByRequest: Map<string, PendingSideChatMessage>
  openingError?: { code: SideChatErrorCode, message: string }
}
```

Register the entry, assign `entry.creation`, and return `startValue(entry)` without awaiting creation. Settle the promise in a guarded continuation:

```ts
entry.creation = parent.ctx.agents.create(options)
void entry.creation.then(async handle => {
  if (entry.closing || this.byToken.get(entry.chatToken) !== entry) {
    await handle.dispose()
    return
  }
  entry.handle = handle
  handle.agent.inject(createUserMessage({ content: boundaryContent, source: boundarySource }))
  for (const pending of entry.pendingByRequest.values()) {
    if (!pending.cancelled) handle.agent.followup(pending.message)
  }
}).catch(error => {
  if (!entry.closing && this.byToken.get(entry.chatToken) === entry) {
    entry.openingError = openingFailure(error)
  }
})
return this.startValue(entry)
```

Make `read()` valid whenever the entry exists and is not closing. Merge queued user messages into `transcript(entry)` by message id and report `running: true` when an undelivered, non-cancelled message exists. Make `send()` record `sentRequests` and either call `followup()` or store the pending message before returning the existing accepted value. Make `cancel()` cancel a live child or mark queued messages cancelled.

- [ ] **Step 4: Run Host tests to verify GREEN**

Run: `pnpm exec vitest run tests/host-opening.spec.ts tests/host-lease.spec.ts tests/safe-boundary.spec.ts tests/remote-contract.spec.ts`

Expected: all selected test files PASS.

- [ ] **Step 5: Commit Host admission**

```bash
git add src/host/side-chat-service.ts tests/host-opening.spec.ts
git commit -m "feat: queue Side Chat prompts while opening"
```

---

### Task 2: Optimistic controller admission

**Files:**
- Modify: `tests/controller.spec.ts`
- Modify: `src/client/controller.ts`

**Interfaces:**
- Consumes: Task 1's immediate `start()` acknowledgement and idempotent opening `send()`.
- Produces: `send(text)` acceptance during `starting`, immediate optimistic transcript state, and Host transcript de-duplication by message id.

- [ ] **Step 1: Write failing controller tests**

Add a deferred start case that submits before registration finishes:

```ts
const start = deferred<ReturnType<typeof success>>()
const send = vi.fn(async ({ chatToken, requestId }: { chatToken: string, requestId: string }) => ({
  ok: true as const,
  value: { ok: true as const, value: {
    chatToken, requestId, accepted: true as const, messageId: 'queued-1',
  } },
}))
const controller = new SideChatController(env.ctx, { start: vi.fn(() => start.promise), send } as never)

void controller.open('parent' as SessionId)
expect(await controller.send('First question')).toEqual({ ok: true })
expect(controller.getSnapshot()).toMatchObject({
  phase: 'starting', running: true,
  messages: [{ role: 'user', text: 'First question' }],
})
expect(send).not.toHaveBeenCalled()

start.resolve(success(controller.getSnapshot().chatToken!))
await vi.waitFor(() => { expect(send).toHaveBeenCalledTimes(1) })
```

Add cases that Host read returning `queued-1` does not duplicate the optimistic message, a start/send rejection keeps recoverable text, and explicit close clears the pending admission.

- [ ] **Step 2: Run the controller tests to verify RED**

Run: `pnpm exec vitest run tests/controller.spec.ts`

Expected: FAIL because `send()` rejects the `starting` phase and publishes no optimistic message.

- [ ] **Step 3: Implement the minimal optimistic outbox**

Add controller-owned metadata for only the active first message:

```ts
interface OptimisticSend {
  readonly parentSessionId: SessionId
  readonly chatToken: string
  readonly requestId: string
  readonly text: string
  messageId: string
  admitted: boolean
}
```

During `starting` or `open`, create one optimistic item, publish its user transcript item with `running: true`, and return `{ ok: true }`. If start acknowledgement is still pending, flush from the successful `open()` continuation; otherwise call the Host immediately. Use the same request id for retries and merge Host messages by id:

```ts
const messages = value.messages.some(message => message.id === optimistic.messageId)
  ? value.messages
  : [...value.messages, { id: optimistic.messageId, role: 'user' as const, text: optimistic.text }]
```

On direct admission rejection, remove the optimistic item and return `{ ok: false, error }` so the surface restores its draft. On late child-opening failure, keep the message in state for retry. Clear it only on confirmed `close()` or once the Host transcript is authoritative and the turn is no longer pending.

- [ ] **Step 4: Run controller tests to verify GREEN**

Run: `pnpm exec vitest run tests/controller.spec.ts tests/view-store.spec.ts`

Expected: all selected test files PASS.

- [ ] **Step 5: Commit controller admission**

```bash
git add src/client/controller.ts tests/controller.spec.ts
git commit -m "feat: accept the first Side Chat prompt immediately"
```

---

### Task 3: Silent interactive surface

**Files:**
- Modify: `tests/side-chat-surface.spec.tsx`
- Modify: `src/client/SideChatSurface.tsx`
- Modify: `src/client/locales.ts`
- Modify: `src/client/side-chat.module.css`

**Interfaces:**
- Consumes: Task 2's interactive `starting` state and optimistic transcript message.
- Produces: an immediately usable composer with no visible context-preparation status.

- [ ] **Step 1: Write failing surface tests**

Render a mutable `starting` snapshot and verify the composer works without status copy:

```tsx
currentSnapshot = { ...snapshot, phase: 'starting', chatToken: 'opening-token' }
renderSurface()

const textarea = mount.querySelector('textarea') as HTMLTextAreaElement
expect(textarea).not.toBeNull()
expect(mount.textContent).not.toContain('drawer.opening')
expect(mount.textContent).not.toContain('drawer.reading')

act(() => { input(textarea, 'Send immediately') })
await act(async () => {
  mount.querySelector<HTMLElement>('[aria-label="drawer.send"]')?.click()
})
expect(controller.send).toHaveBeenCalledWith('Send immediately')
```

Add an `open`, `running: true`, empty-partial case proving `drawer.reading` is absent while the stop control remains available.

- [ ] **Step 2: Run the surface test to verify RED**

Run: `pnpm exec vitest run tests/side-chat-surface.spec.tsx`

Expected: FAIL because the starting surface renders a loader and omits the composer.

- [ ] **Step 3: Remove transient context status UI**

Use one interactive predicate throughout the component:

```ts
const interactive = state.phase === 'starting' || state.phase === 'open'
const canSend = interactive && !running && draft.trim() !== ''
```

Render the composer when `interactive` is true, focus it in both interactive phases, remove the starting loader and empty-partial reading row, and keep the stop control for `running`. Remove `IconLoadingOutline16`, the `drawer.opening` / `drawer.reading` locale keys and translations, plus unreferenced `.loadingState`, `.loadingMark`, and `.readingState` CSS.

- [ ] **Step 4: Run surface and presentation tests to verify GREEN**

Run: `pnpm exec vitest run tests/side-chat-surface.spec.tsx tests/presentation.spec.tsx tests/view-store.spec.ts`

Expected: all selected test files PASS.

- [ ] **Step 5: Commit the silent surface**

```bash
git add src/client/SideChatSurface.tsx src/client/locales.ts src/client/side-chat.module.css tests/side-chat-surface.spec.tsx
git commit -m "feat: make Side Chat immediately interactive"
```

---

### Task 4: Documentation, build, and full verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `CHANGELOG.md`
- Rebuild: `lib/**`

**Interfaces:**
- Consumes: completed Host, controller, and surface behavior from Tasks 1–3.
- Produces: user documentation and checked distributable output.

- [ ] **Step 1: Update user-facing documentation**

Add one concise usage sentence in both READMEs:

```markdown
Side Chat opens with an immediately usable composer. It prepares the completed parent context silently in the background; if you send at once, your message is accepted immediately and the first response may take slightly longer.
```

```markdown
Side Chat 打开后输入框立即可用。父会话已完成上下文会在后台静默准备；如果立刻发送，消息会立即被接收，但第一条回复可能稍慢。
```

Add an `Unreleased` changelog section recording immediate composition, silent preparation, and queued first-message admission. Do not bump the package version.

- [ ] **Step 2: Run the focused regression set**

Run: `pnpm exec vitest run tests/host-opening.spec.ts tests/controller.spec.ts tests/side-chat-surface.spec.tsx tests/presentation.spec.tsx tests/host-lease.spec.ts tests/remote-contract.spec.ts`

Expected: all selected test files PASS.

- [ ] **Step 3: Run the full project gate**

Run: `pnpm run check`

Expected: lint, three TypeScript projects, all Vitest tests, build, smoke test, and publint PASS.

- [ ] **Step 4: Inspect generated syntax and working-tree hygiene**

Run: `node --check lib/client.js`

Expected: exit code 0 with no output.

Run: `git diff --check`

Expected: exit code 0 with no output.

Run: `git status --short`

Expected: only the intended source, test, documentation, plan, and rebuilt `lib/**` paths are listed.

- [ ] **Step 5: Commit documentation and generated output**

```bash
git add README.md README.zh.md CHANGELOG.md lib
git commit -m "docs: document silent Side Chat preparation"
```

- [ ] **Step 6: Report without publishing**

Report changed files, RED/GREEN commands, `pnpm run check`, Better Sidebar/drawer regression results, known environment limits, final `git status --short`, and local commit list. Do not push, publish npm, or create a GitHub Release unless the user separately requests those release actions after verification.
