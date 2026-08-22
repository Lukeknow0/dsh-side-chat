# Adaptive Side Chat Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Side Chat with Better Sidebar when available, retain the standalone drawer as a fallback, separate minimize from destructive end, preserve draft/context across non-destructive transitions, and pause parked expiry while either parent or child is running.

**Architecture:** Keep `SideChatController` responsible for the Host conversation and add a small per-parent `SideChatViewStore` for draft and presentation visibility. A `SideChatPresentation` coordinator selects Better Sidebar or drawer at runtime, while both render one shared `SideChatSurface`. Extend the pure Host lease evaluator so parent and child activity form one `busy` signal.

**Tech Stack:** TypeScript 6, React 18, DSH Cordis client slots/services, optional `dsh-better-sidebar` public service types, Vitest + happy-dom, tsdown, pnpm.

## Global Constraints

- Work only in `/Users/luke/Documents/Codex/dsh-side-chat`; `/Users/luke/deepseek-harness` is read-only reference material.
- The approved specification is `docs/superpowers/specs/2026-08-22-adaptive-side-chat-presentation-design.md`.
- Preserve package name `@lukeknow0/dsh-side-chat` and internal DSH plugin/module id `dsh-side-chat`.
- Better Sidebar is optional; Side Chat must activate and remain fully usable without it.
- Do not register into or replace DSH core `root`, `sidebar`, or `details` single slots.
- Do not change the read-only tool policy, context fork boundary, no-write-back guarantee, or one-retained-child-per-parent invariant.
- Minimize, native Better Sidebar tab close, Escape, and the keyboard shortcut must never call the destructive close remote.
- Only confirmed internal End invokes `controller.close()` and clears the retained draft.
- Parked expiry is eligible only while both parent and child are idle; every busy-to-idle transition starts a fresh full 30-minute TTL.
- Use Better Sidebar public service/capability detection, not DOM discovery or a fixed runtime version.
- Do not push, publish, retag, or create a GitHub release as part of this plan.

---

## File Structure

- Create `src/client/view-store.ts`: stable per-parent draft, send-error, visibility, and preferred presentation state.
- Create `src/client/SideChatSurface.tsx`: presentation-neutral transcript/composer/header and destructive confirmation.
- Create `src/client/presentation.tsx`: optional Better Sidebar registration plus drawer/tab selection and open/minimize/end orchestration.
- Create `tests/view-store.spec.ts`: pure retained view-state tests.
- Create `tests/presentation.spec.tsx`: fake Better Sidebar service integration and fallback tests.
- Create `tests/side-chat-surface.spec.tsx`: minimize/end confirmation and draft retention component tests.
- Modify `src/host/side-chat-service.ts`: parent-aware busy lease.
- Modify `src/client/SideChatDrawer.tsx`: placement-only drawer wrapper around `SideChatSurface`.
- Modify `src/client/SideChatButton.tsx`: presentation toggle instead of destructive close.
- Modify `src/client/index.ts`: construct and wire controller, view store, and presentation coordinator.
- Modify `src/client/locales.ts` and `src/client/side-chat.module.css`: minimize/end/confirmation copy and styles.
- Modify `tests/host-lease.spec.ts`, `tests/controller.spec.ts`, and `tests/overlay-measurement.spec.tsx`: lifecycle and regression coverage.
- Modify `package.json` and `pnpm-lock.yaml`: optional Better Sidebar peer plus pinned development types.
- Modify `README.md`, `README.zh.md`, and `docs/ARCHITECTURE.md`: adaptive presentation and parent-aware lease.

---

### Task 1: Make the Host lease parent-aware

**Files:**
- Modify: `src/host/side-chat-service.ts`
- Test: `tests/host-lease.spec.ts`
- Test: `tests/safe-boundary.spec.ts`

**Interfaces:**
- Produces: `evaluateSideChatLease(input: SideChatLeaseInput): SideChatLeaseDecision`
- `SideChatLeaseInput` uses `wasBusy`, `parentRunning`, and `childRunning`.
- `SideChatLeaseDecision` exposes `busy` instead of the old child-only `running` field.

- [ ] **Step 1: Replace the lease tests with parent/child busy cases**

Update `tests/host-lease.spec.ts` so every call has the new input shape and add the parent-running and restart cases:

```ts
import { describe, expect, it } from 'vitest'
import {
  evaluateSideChatLease, SIDE_CHAT_IDLE_TTL_MS, SIDE_CHAT_LEASE_POLL_MS,
} from '../src/host/side-chat-service.ts'

describe('Side Chat Host idle lease', () => {
  it('expires only when parent and child are idle at the deadline', () => {
    expect(evaluateSideChatLease({
      now: 10_000, expiresAt: 10_000, wasBusy: false,
      parentRunning: false, childRunning: false,
    })).toEqual({ expiresAt: 10_000, busy: false, expire: true, delay: 0 })
  })

  it.each([
    { parentRunning: true, childRunning: false },
    { parentRunning: false, childRunning: true },
    { parentRunning: true, childRunning: true },
  ])('pauses expiry while either task is running: %o', ({ parentRunning, childRunning }) => {
    expect(evaluateSideChatLease({
      now: 20_000, expiresAt: 1, wasBusy: false, parentRunning, childRunning,
    })).toEqual({
      expiresAt: 20_000 + SIDE_CHAT_IDLE_TTL_MS,
      busy: true,
      expire: false,
      delay: SIDE_CHAT_LEASE_POLL_MS,
    })
  })

  it('starts a fresh full TTL when both tasks become idle', () => {
    expect(evaluateSideChatLease({
      now: 30_000, expiresAt: 30_001, wasBusy: true,
      parentRunning: false, childRunning: false,
    })).toEqual({
      expiresAt: 30_000 + SIDE_CHAT_IDLE_TTL_MS,
      busy: false,
      expire: false,
      delay: SIDE_CHAT_LEASE_POLL_MS,
    })
  })

  it('restarts the full TTL after activity resumes during a countdown', () => {
    const resumed = evaluateSideChatLease({
      now: 40_000, expiresAt: 45_000, wasBusy: false,
      parentRunning: true, childRunning: false,
    })
    expect(resumed.busy).toBe(true)
    const stopped = evaluateSideChatLease({
      now: 41_000, expiresAt: resumed.expiresAt, wasBusy: resumed.busy,
      parentRunning: false, childRunning: false,
    })
    expect(stopped.expiresAt).toBe(41_000 + SIDE_CHAT_IDLE_TTL_MS)
    expect(stopped.delay).toBe(SIDE_CHAT_LEASE_POLL_MS)
  })

  it('keeps checking an idle countdown so resumed work cannot pass unnoticed', () => {
    expect(evaluateSideChatLease({
      now: 50_000, expiresAt: 55_000, wasBusy: false,
      parentRunning: false, childRunning: false,
    }).delay).toBe(SIDE_CHAT_LEASE_POLL_MS)

    expect(evaluateSideChatLease({
      now: 54_500, expiresAt: 55_000, wasBusy: false,
      parentRunning: false, childRunning: false,
    }).delay).toBe(500)
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm vitest run tests/host-lease.spec.ts
```

Expected: TypeScript/runtime assertions fail because `wasBusy`, `parentRunning`, `childRunning`, and `busy` are not implemented.

- [ ] **Step 3: Implement the combined busy evaluator**

Replace the old lease interfaces/evaluator with:

```ts
export interface SideChatLeaseInput {
  now: number
  expiresAt: number
  wasBusy: boolean
  parentRunning: boolean
  childRunning: boolean
}

export interface SideChatLeaseDecision {
  expiresAt: number
  busy: boolean
  expire: boolean
  delay: number
}

export const SIDE_CHAT_LEASE_POLL_MS = 1_000

export function evaluateSideChatLease(input: SideChatLeaseInput): SideChatLeaseDecision {
  const busy = input.parentRunning || input.childRunning
  if (busy) {
    return {
      expiresAt: input.now + SIDE_CHAT_IDLE_TTL_MS,
      busy: true,
      expire: false,
      delay: SIDE_CHAT_LEASE_POLL_MS,
    }
  }
  if (input.wasBusy) {
    return {
      expiresAt: input.now + SIDE_CHAT_IDLE_TTL_MS,
      busy: false,
      expire: false,
      delay: SIDE_CHAT_LEASE_POLL_MS,
    }
  }
  if (input.expiresAt <= input.now) {
    return { expiresAt: input.expiresAt, busy: false, expire: true, delay: 0 }
  }
  return {
    expiresAt: input.expiresAt,
    busy: false,
    expire: false,
    delay: Math.max(1, Math.min(SIDE_CHAT_LEASE_POLL_MS, input.expiresAt - input.now)),
  }
}
```

The 1-second bounded check is required even while the lease is currently idle. Otherwise a parent could resume and finish between two 30-minute timers, and the Host would never observe the activity that must reset the countdown. `touch()` still moves `expiresAt` forward on attached client reads; the monitor only makes the parked transition rules observable.

Rename `LiveSideChat.leaseRunning` to `leaseBusy`. In `scheduleExpiry`, calculate both statuses from public agent state:

```ts
const parentRunning = this.ctx.agents.get(SessionId(entry.parentSessionId))?.status === 'running'
const childRunning = entry.handle?.agent.status === 'running'
const decision = evaluateSideChatLease({
  now: Date.now(),
  expiresAt: entry.expiresAt,
  wasBusy: entry.leaseBusy,
  parentRunning,
  childRunning,
})
entry.expiresAt = decision.expiresAt
entry.leaseBusy = decision.busy
```

A missing/disposed parent evaluates to `false` through optional chaining.

- [ ] **Step 4: Run Host lease and boundary tests**

Run:

```bash
pnpm vitest run tests/host-lease.spec.ts tests/safe-boundary.spec.ts
```

Expected: both files pass; the 30-minute constant remains unchanged.

- [ ] **Step 5: Commit the Host lease change**

```bash
git add src/host/side-chat-service.ts tests/host-lease.spec.ts
git commit -m "fix: pause Side Chat expiry for active parent"
```

---

### Task 2: Add retained per-parent view state

**Files:**
- Create: `src/client/view-store.ts`
- Create: `tests/view-store.spec.ts`

**Interfaces:**
- Produces: `SideChatViewStore`
- Produces: `SideChatViewState = { visible, draft, sendError, presentation }`
- Presentation modes: `'drawer' | 'better-sidebar'`.

- [ ] **Step 1: Write failing pure store tests**

Create `tests/view-store.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { SideChatViewStore } from '../src/client/view-store.ts'

describe('SideChatViewStore', () => {
  it('retains independent draft and visibility by parent session', () => {
    const store = new SideChatViewStore()
    store.show('parent-a', 'drawer')
    store.setDraft('parent-a', 'unfinished A')
    store.show('parent-b', 'better-sidebar')
    store.setDraft('parent-b', 'unfinished B')
    store.minimize('parent-a')

    expect(store.get('parent-a')).toEqual({
      visible: false, draft: 'unfinished A', sendError: null, presentation: 'drawer',
    })
    expect(store.get('parent-b')).toEqual({
      visible: true, draft: 'unfinished B', sendError: null, presentation: 'better-sidebar',
    })
  })

  it('clears only after explicit end', () => {
    const store = new SideChatViewStore()
    const listener = vi.fn()
    store.subscribe(listener)
    store.show('parent', 'drawer')
    store.setDraft('parent', 'keep me')
    store.setSendError('parent', 'temporary failure')
    store.clear('parent')

    expect(store.get('parent')).toEqual({
      visible: false, draft: '', sendError: null, presentation: 'drawer',
    })
    expect(listener).toHaveBeenCalled()
  })

  it('falls visible Better Sidebar views back to the drawer without data loss', () => {
    const store = new SideChatViewStore()
    store.show('parent-a', 'better-sidebar')
    store.setDraft('parent-a', 'unfinished A')
    store.show('parent-b', 'better-sidebar')
    store.setDraft('parent-b', 'unfinished B')

    store.fallbackVisiblePresentation('better-sidebar', 'drawer')

    expect(store.get('parent-a')).toMatchObject({
      visible: true, presentation: 'drawer', draft: 'unfinished A',
    })
    expect(store.get('parent-b')).toMatchObject({
      visible: true, presentation: 'drawer', draft: 'unfinished B',
    })
  })
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
pnpm vitest run tests/view-store.spec.ts
```

Expected: FAIL because `src/client/view-store.ts` does not exist.

- [ ] **Step 3: Implement the complete store**

Create `src/client/view-store.ts`:

```ts
export type SideChatPresentationMode = 'drawer' | 'better-sidebar'

export interface SideChatViewState {
  readonly visible: boolean
  readonly draft: string
  readonly sendError: string | null
  readonly presentation: SideChatPresentationMode
}

const EMPTY_VIEW: SideChatViewState = Object.freeze({
  visible: false,
  draft: '',
  sendError: null,
  presentation: 'drawer',
})

export class SideChatViewStore {
  private readonly entries = new Map<string, SideChatViewState>()
  private readonly listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  get(parentSessionId: string): SideChatViewState {
    return this.entries.get(parentSessionId) ?? EMPTY_VIEW
  }

  show(parentSessionId: string, presentation: SideChatPresentationMode): void {
    this.update(parentSessionId, state => ({ ...state, visible: true, presentation }))
  }

  minimize(parentSessionId: string): void {
    this.update(parentSessionId, state => ({ ...state, visible: false }))
  }

  setDraft(parentSessionId: string, draft: string): void {
    this.update(parentSessionId, state => ({ ...state, draft, sendError: null }))
  }

  setSendError(parentSessionId: string, sendError: string | null): void {
    this.update(parentSessionId, state => ({ ...state, sendError }))
  }

  clear(parentSessionId: string): void {
    if (!this.entries.delete(parentSessionId)) return
    this.publish()
  }

  fallbackVisiblePresentation(
    from: SideChatPresentationMode,
    to: SideChatPresentationMode,
  ): void {
    let changed = false
    for (const [parentSessionId, state] of this.entries) {
      if (!state.visible || state.presentation !== from) continue
      this.entries.set(parentSessionId, Object.freeze({ ...state, presentation: to }))
      changed = true
    }
    if (changed) this.publish()
  }

  private update(parentSessionId: string, change: (state: SideChatViewState) => SideChatViewState): void {
    const previous = this.get(parentSessionId)
    const next = Object.freeze(change(previous))
    if (Object.is(previous, next)) return
    this.entries.set(parentSessionId, next)
    this.publish()
  }

  private publish(): void {
    for (const listener of this.listeners) listener()
  }
}
```

- [ ] **Step 4: Run the store tests**

```bash
pnpm vitest run tests/view-store.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the view store**

```bash
git add src/client/view-store.ts tests/view-store.spec.ts
git commit -m "feat: retain Side Chat presentation state"
```

---

### Task 3: Extract the shared surface and add non-destructive controls

**Files:**
- Create: `src/client/SideChatSurface.tsx`
- Create: `tests/side-chat-surface.spec.tsx`
- Modify: `src/client/SideChatDrawer.tsx`
- Modify: `src/client/locales.ts`
- Modify: `src/client/side-chat.module.css`
- Modify: `tests/overlay-measurement.spec.tsx`

**Interfaces:**
- Consumes: `SideChatController`, `SideChatViewStore`.
- Produces: `SideChatSurface({ parentSessionId, controller, viewStore, t, surfaceMode, onMinimize, onEnd })`.
- `SideChatDrawer` becomes placement chrome and delegates conversation content to the shared surface.

- [ ] **Step 1: Write failing interaction tests**

Create `tests/side-chat-surface.spec.tsx` in happy-dom. Mock DSH primitives the same way as `tests/overlay-measurement.spec.tsx`, including `Modal` as an inline `role="dialog"` wrapper. Cover these exact assertions:

```tsx
it('minimizes without closing and preserves the draft', () => {
  // Render an open surface, type "keep this", click aria-label="drawer.minimize".
  expect(viewStore.get('parent').visible).toBe(false)
  expect(viewStore.get('parent').draft).toBe('keep this')
  expect(controller.close).not.toHaveBeenCalled()
})

it('requires confirmation before destructive end', async () => {
  // The harness wires onEnd through the presentation coordinator. Click
  // aria-label="drawer.end", assert role=dialog, then click drawer.endConfirm.
  expect(controller.close).not.toHaveBeenCalled()
  await act(async () => { confirmButton.click() })
  expect(controller.close).toHaveBeenCalledTimes(1)
  expect(viewStore.get('parent').draft).toBe('')
})

it('cancels destructive end on Escape', () => {
  // Open confirmation and dispatch Escape.
  expect(controller.close).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
```

- [ ] **Step 2: Run surface and existing overlay tests to verify RED**

```bash
pnpm vitest run tests/side-chat-surface.spec.tsx tests/overlay-measurement.spec.tsx
```

Expected: the new test fails because the shared surface and minimize/end controls do not exist; the existing scrim test still expects destructive close and must later be updated.

- [ ] **Step 3: Extract `SideChatSurface` and move draft ownership**

Move the current drawer header, parent status, transcript, composer, loading/error states, send logic, and cancel logic into `SideChatSurface.tsx`. Replace local `useState('')` draft/send-error ownership with a stable per-parent snapshot:

```tsx
const view = useSyncExternalStore(
  viewStore.subscribe,
  () => viewStore.get(String(parentSessionId)),
  () => viewStore.get(String(parentSessionId)),
)
const draft = view.draft
const sendError = view.sendError
```

The send path must preserve the draft on failure:

```tsx
const send = async (): Promise<void> => {
  if (!canSend) return
  const text = draft.trim()
  viewStore.setDraft(String(parentSessionId), '')
  const result = await controller.send(text)
  if (!result.ok) {
    viewStore.setDraft(String(parentSessionId), text)
    viewStore.setSendError(String(parentSessionId), result.error)
  }
}
```

Add explicit local confirmation state and a single destructive path:

```tsx
const [confirmEnd, setConfirmEnd] = useState(false)
const [ending, setEnding] = useState(false)

const end = async (): Promise<void> => {
  if (ending) return
  setEnding(true)
  try {
    await onEnd()
    setConfirmEnd(false)
  } finally {
    setEnding(false)
  }
}
```

`surfaceMode` is `'drawer' | 'better-sidebar'` and controls presentation chrome only; transcript, draft, send/cancel behavior, and confirmation semantics stay identical. `SideChatSurface` must not call `controller.close()` or clear the store directly. The coordinator-supplied `onEnd` is the sole destructive boundary; in the component tests, wire that callback through a fake coordinator so the assertions still observe `controller.close()` and store clearing.

Use DSH `Modal` with localized title/body and safe/destructive footer buttons. Focus the Cancel button on open and handle Tab cycling between the two footer actions so the dialog remains keyboard-contained.

- [ ] **Step 4: Convert `SideChatDrawer` to placement-only chrome**

`SideChatDrawer` keeps `useOverlayPlacement`, the safe-area probe, scrim, and `<aside>`. It accepts `viewStore`, `parentSessionId`, `onMinimize`, and `onEnd`; it renders null unless the controller state belongs to that parent and the view state is `{ visible: true, presentation: 'drawer' }`.

The scrim and Escape paths call `onMinimize`, never `controller.close()`:

```tsx
<button
  className={css.mobileScrim}
  data-dsh-side-chat-scrim
  aria-label={t('drawer.minimize')}
  onClick={onMinimize}
/>
```

Render `<SideChatSurface ... />` inside the positioned `<aside>`.

- [ ] **Step 5: Add exact locale keys and styles**

Add keys to both dictionaries:

```ts
'drawer.minimize': 'Minimize Side Chat' / '收起侧边对话'
'drawer.end': 'End Side Chat' / '结束侧边对话'
'drawer.endTitle': 'End Side Chat?' / '结束侧边对话？'
'drawer.endBody': "Ending removes this Side Chat's retained context and draft from the plugin, so it cannot be resumed. The main conversation is not affected." / '结束后，这段侧边对话的上下文和草稿将无法继续恢复；主会话不会受到影响。'
'drawer.endCancel': 'Cancel' / '取消'
'drawer.endConfirm': 'End and clear' / '结束并清除'
'drawer.ending': 'Ending…' / '正在结束…'
```

Add a two-button header action group, destructive button treatment, and compact confirmation footer styles without changing the existing placement dimensions.

- [ ] **Step 6: Update existing overlay expectations and run tests**

Change the 375px scrim test to assert minimization and `close` not called. Keep geometry and responsive-draft tests green.

```bash
pnpm vitest run tests/side-chat-surface.spec.tsx tests/overlay-measurement.spec.tsx tests/overlay-placement.spec.ts
```

Expected: all selected files pass.

- [ ] **Step 7: Commit the shared surface**

```bash
git add src/client/SideChatSurface.tsx src/client/SideChatDrawer.tsx src/client/locales.ts src/client/side-chat.module.css tests/side-chat-surface.spec.tsx tests/overlay-measurement.spec.tsx
git commit -m "feat: separate Side Chat minimize and end"
```

---

### Task 4: Add the optional Better Sidebar presentation adapter

**Files:**
- Create: `src/client/presentation.tsx`
- Create: `tests/presentation.spec.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `SideChatController`, `SideChatViewStore`, `ctx.betterSidebar`.
- Produces: `SideChatPresentation` with `show`, `toggle`, `minimize`, `end`, `attachBetterSidebar`, `subscribe`, and `getSnapshot`.
- Stable Better Sidebar type/tab id: `dsh-side-chat:conversation`.

- [ ] **Step 1: Add optional compile-time dependency metadata**

Add:

```json
"peerDependencies": {
  "dsh-better-sidebar": ">=0.12.0 <1.0.0"
},
"peerDependenciesMeta": {
  "dsh-better-sidebar": { "optional": true }
},
"devDependencies": {
  "dsh-better-sidebar": "0.14.0"
}
```

Merge these entries into the existing objects rather than replacing them. Run `pnpm install` to update the lockfile.

- [ ] **Step 2: Write failing adapter tests with a fake public service**

Create `tests/presentation.spec.tsx` with a minimal fake implementing `registerTab`, `isTabEnabled`, `openTab`, `closeTab`, `activateTab`, `features`, and state subscription. Assert:

```ts
it('uses the drawer without Better Sidebar', () => {
  presentation.show('parent')
  expect(viewStore.get('parent').presentation).toBe('drawer')
})

it('registers one native tab and opens it with session scope', () => {
  const dispose = presentation.attachBetterSidebar(service)
  presentation.show('parent')
  expect(service.registerTab).toHaveBeenCalledTimes(1)
  expect(service.openTab).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'dsh-side-chat:conversation', path: 'side-chat:parent' }),
    { sessionId: 'parent' },
  )
  dispose()
})

it('treats native tab close as minimize', () => {
  // Call the captured descriptor.onClose with sessionId parent.
  expect(viewStore.get('parent').visible).toBe(false)
  expect(controller.close).not.toHaveBeenCalled()
})

it('falls back without losing draft when the service disposes', () => {
  viewStore.setDraft('parent', 'unfinished')
  dispose()
  expect(viewStore.get('parent')).toMatchObject({
    presentation: 'drawer', draft: 'unfinished',
  })
})

```

Add three more cases using the same fake: `isTabEnabled` returns false, `registerTab` throws a duplicate-id error, and the runtime object is missing one required capability. In every case attachment/opening must not throw, `show('parent')` must choose the drawer, and a registration failure must log no more than one concise warning.

- [ ] **Step 3: Run the adapter tests and verify RED**

```bash
pnpm vitest run tests/presentation.spec.tsx
```

Expected: FAIL because `SideChatPresentation` does not exist.

- [ ] **Step 4: Implement `SideChatPresentation`**

Use type-only imports:

```ts
import type {} from 'dsh-better-sidebar'
import type {
  BetterSidebarService, SessionScope, TabComponentProps, TabDescriptor,
} from 'dsh-better-sidebar/client/service'
```

The coordinator owns only runtime presentation selection. Its public behavior is:

```ts
export const SIDE_CHAT_TAB_TYPE = 'dsh-side-chat:conversation'

show(parentSessionId: string): void {
  const service = this.betterSidebar
  const native = service !== undefined && service.isTabEnabled(SIDE_CHAT_TAB_TYPE)
  this.viewStore.show(parentSessionId, native ? 'better-sidebar' : 'drawer')
  void this.controller.open(parentSessionId as SessionId)
  if (native) {
    service.openTab(
      { type: SIDE_CHAT_TAB_TYPE, id: SIDE_CHAT_TAB_TYPE, path: `side-chat:${parentSessionId}` },
      { sessionId: parentSessionId },
    )
  }
}

minimize(parentSessionId: string): void {
  const mode = this.viewStore.get(parentSessionId).presentation
  this.viewStore.minimize(parentSessionId)
  if (mode === 'better-sidebar') {
    this.betterSidebar?.closeTab(SIDE_CHAT_TAB_TYPE, { sessionId: parentSessionId })
  }
}

async end(parentSessionId: string): Promise<void> {
  await this.controller.close()
  this.betterSidebar?.closeTab(SIDE_CHAT_TAB_TYPE, { sessionId: parentSessionId })
  this.viewStore.clear(parentSessionId)
}
```

`toggle` minimizes a visible surface or delegates to `show`. Public `minimize` closes an owned native tab after marking it hidden; the descriptor's `onClose` callback calls `viewStore.minimize(scope.sessionId)` directly so it cannot recursively request another native close. `end` closes the native tab before clearing the store, because `onClose` is non-destructive and would otherwise recreate an empty minimized entry after `clear`.

`attachBetterSidebar` registers exactly one descriptor and returns an idempotent disposer that unregisters it, clears the service reference, and calls `viewStore.fallbackVisiblePresentation('better-sidebar', 'drawer')` so every affected visible entry moves to the fallback without losing its draft. A second attachment first disposes the previous registration; a duplicate tab id, thrown registration, disabled descriptor, or runtime object missing `registerTab`, `openTab`, `closeTab`, `isTabEnabled`, or targeted-open capability produces at most one concise warning and leaves the drawer usable.

The descriptor:

- uses `single: true`;
- is visible in the `+` menu;
- uses the Side Chat sign as its icon;
- calls `viewStore.minimize(scope.sessionId)` from `onClose`;
- uses a component wrapper that subscribes to locale changes and mirrors `TabComponentProps.visible` into view state (`show(..., 'better-sidebar')` when true, store-only `minimize` when false); when visible it idempotently calls `controller.open(scope.sessionId)` if no conversation exists;
- does not call `presentation.show()` from render/effect because that would re-enter `openTab`; switching to another native tab or collapsing the panel updates `aria-pressed` through the store but does not close the retained child or stop its heartbeat;
- renders `SideChatSurface` with `surfaceMode="better-sidebar"`, public `minimize`, and coordinator-owned `end` callbacks;
- supplies a badge only when `service.features.includes('badge')`.

The `path: side-chat:<sessionId>` value is an owned content seed used only to trigger Better Sidebar's documented reveal behavior; the Side Chat tab never passes it to a filesystem API.

- [ ] **Step 5: Run adapter, type, and package tests**

```bash
pnpm vitest run tests/presentation.spec.tsx tests/package-contract.spec.ts
pnpm run typecheck
```

Expected: all commands pass and the client bundle has no runtime `require("dsh-better-sidebar")` edge.

- [ ] **Step 6: Commit the optional adapter**

```bash
git add src/client/presentation.tsx tests/presentation.spec.tsx package.json pnpm-lock.yaml
git commit -m "feat: integrate Side Chat with Better Sidebar"
```

---

### Task 5: Wire the adaptive presentation into plugin entry points

**Files:**
- Modify: `src/client/index.ts`
- Modify: `src/client/SideChatButton.tsx`
- Modify: `src/client/SideChatDrawer.tsx`
- Modify: `tests/controller.spec.ts`
- Modify: `tests/presentation.spec.tsx`

**Interfaces:**
- Consumes: `SideChatPresentation`, `SideChatViewStore`.
- Header action and keyboard shortcut call presentation methods, never destructive controller close.

- [ ] **Step 1: Add failing entry-point behavior tests**

Extend `tests/presentation.spec.tsx` to assert:

```ts
it('header toggle minimizes without ending and restores the same child', () => {
  presentation.show('parent')
  presentation.toggle('parent')
  expect(viewStore.get('parent').visible).toBe(false)
  expect(controller.close).not.toHaveBeenCalled()
  presentation.toggle('parent')
  expect(viewStore.get('parent').visible).toBe(true)
  expect(controller.open).toHaveBeenCalledWith('parent')
})
```

Add a controller regression test proving repeated `open` for the same active parent remains idempotent and does not start a second child.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
pnpm vitest run tests/presentation.spec.tsx tests/controller.spec.ts
```

Expected: the entry point still calls `controller.close()` for active toggles or lacks the new injected props.

- [ ] **Step 3: Construct the presentation stack in `src/client/index.ts`**

Inside `installSideChat`:

```ts
const controller = new SideChatController(ctx, ctx.remote.sideChat)
const viewStore = new SideChatViewStore()
const presentation = new SideChatPresentation(ctx, controller, viewStore)
```

Inject `{ controller, viewStore, presentation }` into the header action and drawer registrations. Keep the drawer in `shell.overlay`; it renders null while Better Sidebar owns the active presentation.

Install optional service integration without making it mandatory:

```ts
ctx.inject(['betterSidebar'], betterSidebarCtx => {
  betterSidebarCtx.effect(
    () => presentation.attachBetterSidebar(betterSidebarCtx.betterSidebar),
    'side-chat: Better Sidebar adapter',
  )
})
```

Keep the existing remote mount lifecycle. Cordis owns the adapter disposer returned by `attachBetterSidebar`; the controller disposer stops polling and subscriptions. Do not invent a second unmanaged presentation subscription.

- [ ] **Step 4: Change header and keyboard semantics**

`SideChatButton` subscribes to controller and view store. Its active styling means a retained conversation exists; `aria-pressed` means the surface is currently visible. Its click handler is:

```tsx
onClick={() => { presentation.toggle(String(sessionId)) }}
```

The global `Cmd/Ctrl+Shift+.` shortcut also calls `presentation.toggle(String(current))`. Escape handling belongs to the shared surface and calls `presentation.minimize`, never `controller.close()`.

- [ ] **Step 5: Run the complete client-focused suite**

```bash
pnpm vitest run tests/controller.spec.ts tests/view-store.spec.ts tests/side-chat-surface.spec.tsx tests/presentation.spec.tsx tests/overlay-measurement.spec.tsx tests/overlay-placement.spec.ts
```

Expected: all selected tests pass with no React act warnings or leaked observers.

- [ ] **Step 6: Commit the entry-point wiring**

```bash
git add src/client/index.ts src/client/SideChatButton.tsx src/client/SideChatDrawer.tsx tests/controller.spec.ts tests/presentation.spec.tsx
git commit -m "feat: adapt Side Chat presentation at runtime"
```

---

### Task 6: Update documentation and run release-grade verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `CHANGELOG.md`
- Generated: `lib/client.js`, `lib/index.js`, declarations/chunks produced by `pnpm run build`

**Interfaces:**
- Documents the final user-visible contract and known cleanup limitation.

- [ ] **Step 1: Update English and Chinese lifecycle documentation**

State these exact facts in both READMEs:

- Better Sidebar integration is automatic and optional.
- Without Better Sidebar, Side Chat uses the collision-aware overlay drawer.
- Minimize, Escape, native tab close, and the visibility shortcut preserve transcript and draft.
- Internal End requires confirmation and removes resumability immediately.
- Parked countdown starts only when parent and child are both idle.
- If either becomes active during a countdown, the next both-idle transition starts a fresh 30 minutes.
- Durable physical erasure still depends on public DSH cleanup support.

Update `docs/ARCHITECTURE.md` client presentation and Host lifecycle sections to match the approved spec. Add a changelog entry under the current release section.

- [ ] **Step 2: Run textual contract checks**

```bash
rg -n "Better Sidebar|Minimize|30 minutes|parent.*running|侧边栏|收起|30 分钟|主任务" README.md README.zh.md docs/ARCHITECTURE.md CHANGELOG.md
git diff --check
```

Expected: both languages cover the same lifecycle; `git diff --check` prints nothing.

- [ ] **Step 3: Run the full project gate**

```bash
pnpm run check
```

Expected:

- oxlint: 0 errors and 0 warnings;
- all TypeScript projects pass;
- all Vitest files pass;
- tsdown builds Host and browser bundles;
- smoke build passes;
- publint reports `All good!`.

- [ ] **Step 4: Inspect generated bundle contracts and working tree**

```bash
node --check lib/client.js
sed -n '1,4p' lib/client.js
rg -n "dsh-better-sidebar" lib/client.js
git status --short
git diff --stat
```

Expected:

- `lib/client.js` starts with `window.__ModuleLoader__.load({ id: "dsh-side-chat"` formatting-equivalent output;
- no runtime `require("dsh-better-sidebar")` call appears;
- generated changes correspond only to this feature;
- no conflict markers or unrelated files are present.

- [ ] **Step 5: Commit documentation and generated artifacts**

Stage only files changed by this feature:

```bash
git add README.md README.zh.md docs/ARCHITECTURE.md CHANGELOG.md lib
git commit -m "docs: explain adaptive Side Chat retention"
```

- [ ] **Step 6: Produce the implementation report**

Report:

- files created and modified;
- focused and full verification results;
- Better Sidebar versions/capabilities tested;
- whether real DSH browser validation was performed;
- known limitation that durable physical deletion depends on DSH public cleanup support;
- final `git status --short` and commit list;
- explicitly state that nothing was pushed, published, or released.
