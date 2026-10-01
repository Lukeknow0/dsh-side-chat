# Sidechat Native Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the approved inline implementation. Steps use checkbox syntax for tracking.

**Goal:** Replace the nested sidechat manager with one native DSH tab per conversation and remove ID/rename/archive UI.

**Architecture:** Register one multiple-instance page/resource type and one live title slot. Resolve existing conversations by stable plugin-owned resource addresses; persist only pending blank-page bindings, UI labels and drafts in the existing parent-scoped thread state. Keep Host APIs and metadata unchanged.

**Tech Stack:** JavaScript with checked JSDoc, React 18, DSH 0.2.0-rc.2 public slots/sidebar contracts, Node test runner and react-test-renderer.

## Global Constraints

- Native implementation ID `dsh-sidechat:conversation`; kind `dsh-sidechat`.
- Do not change better-sidebar, active DSH profiles, installed applications, authentication or Host Session data.
- Opening a blank page must not create or prompt a real Host Session.
- Existing concurrent edits to SidechatComposer are outside this change's write scope.
- Preserve child-scoped model, permission, prompt, question, approval and cancellation behavior.
- Batch related edits, then verify together; use failing tests before implementation.
- Base checkpoint: `6f58ae4`.

---

### Task 1: Specify native identity and persistence behavior

**Files:**
- Modify `packages/dsh-sidechat/tests/native-tab.test.mjs`
- Modify `packages/dsh-sidechat/tests/client-registration.test.mjs`
- Modify `packages/dsh-sidechat/tests/client/thread-state.spec.mjs`
- Modify `packages/dsh-sidechat/tests/client/panel.spec.mjs`
- Create `packages/dsh-sidechat/tests/client/tab-title.spec.mjs`

**Interfaces:** Existing `createSidechatThreadState` gains `tabChild(parentId, contentId)`, `bindTab(parentId, contentId, childId)`, `ensureTabChild(parentId, contentId, create)`, `label(parentId, childId)` and `setLabel(parentId, childId, text)`. Native identity exports `sidechatAddress(childId)` and `childFromSidechatAddress(address)`.

- [ ] Add native identity assertions:

```js
assert.equal(definition.multiple, true)
assert.deepEqual(definition.patterns, ['dsh-resource://dsh-sidechat/**'])
assert.equal(childFromSidechatAddress(sidechatAddress('child/a')), 'child/a')
assert.equal(childFromSidechatAddress('sidebar://dsh-sidechat/new'), undefined)
```

- [ ] Add state behavior assertions using the real in-memory storage fixture:

```js
state.setDraft('parent-a', 'new:page-a', 'first draft')
state.setDraft('parent-a', 'new:page-b', 'second draft')
state.bindTab('parent-a', 'page-a', 'a-1')
state.bindTab('parent-a', 'page-b', 'a-2')
assert.equal(state.tabChild('parent-a', 'page-a'), 'a-1')
assert.equal(state.draft('parent-a', 'a-1'), 'first draft')
assert.equal(state.draft('parent-a', 'a-2'), 'second draft')
```

- [ ] Replace tests for removed management gestures with tests that expand settings and verify none of ID/rename/archive/new/history navigation remain. Retain prompt/model/permission/approval/question tests; switch their target through the parent-scoped state or native tab hook rather than deleted buttons.
- [ ] Add native-tab fixtures with distinct content IDs and actions. Assert opening empty tabs calls only `list`, drafts stay independent, first sends create separate children, retry creates no extra child, recovery calls `openResource` with the owned child address and `replaceTab: true`, and unmount never calls archive/cancel.
- [ ] Run focused tests and confirm expected failures for absent multi-instance behavior and management UI still present:

```bash
node --test packages/dsh-sidechat/tests/native-tab.test.mjs packages/dsh-sidechat/tests/client-registration.test.mjs packages/dsh-sidechat/tests/client/thread-state.spec.mjs packages/dsh-sidechat/tests/client/panel.spec.mjs
```

### Task 2: Implement native pages and simplify the panel

**Files:**
- Modify `packages/dsh-sidechat/src/client/native-tab.js`
- Modify `packages/dsh-sidechat/src/client/register-tab.js`
- Modify `packages/dsh-sidechat/src/client/state.js`
- Modify `packages/dsh-sidechat/src/client/SideChatPanel.js`
- Create `packages/dsh-sidechat/src/client/SidechatTabTitle.js`

**Interfaces:** The existing body receives slot-bound `useTabInfo` automatically. Both body and title resolve `tab.contentId`; the title slot receives `state` and `parentSessionId`. `ensureTabChild` deduplicates creation promises by parent and blank-page content identity, persists successful identity before returning, and releases rejected promises so a later retry is possible.

- [ ] Add complete identity helpers and the multiple-instance definition:

```js
export function sidechatAddress(childSessionId) {
  return `dsh-resource://dsh-sidechat/${encodeURIComponent(childSessionId)}`
}
export function childFromSidechatAddress(address) {
  const prefix = 'dsh-resource://dsh-sidechat/'
  if (typeof address !== 'string' || !address.startsWith(prefix)) return undefined
  try {
    const id = decodeURIComponent(address.slice(prefix.length))
    return id === '' ? undefined : id
  } catch {
    return undefined
  }
}
```

Register `multiple: true`, the stated resource patterns, a cheap `canOpen` using the parser, and the existing guide entry. Add the keyed `sidebar.right.pane.tab.title` slot with the same implementation ID and effect-scoped cleanup as the body.

- [ ] Extend valid parent state with sanitized `tabChildren` and `labels` records without discarding v1 selection/history/drafts. Reconcile labels from authoritative list titles, preserve `new:` blank-page drafts, and keep bindings for undo/reopen. Copy the blank draft into a child when binding; no close path removes a draft or calls a Host mutation. Cache pending creation promises in memory only.
- [ ] Resolve panel identity from native content address or its persisted blank binding. Keep legacy `sidebar://dsh-sidechat` selection restoration. Verify any resource-address child against the current parent's list before polling or displaying it.
- [ ] Remove copy/rename/archive handlers, state and styles; remove nested header/history rendering. Keep transcript, composer, retries and child settings. Render recoverable threads as a plain list only on an empty page; recovery calls the native action, not `start`.
- [ ] Use the page content ID as the prompt retry scope until the first prompt succeeds. On first send: deduplicate fork, persist binding, seed the child draft, send to that child, clear only unchanged drafts, then navigate to the stable child address unless the tab lifetime is already aborted. Do not cancel when hidden or closed.
- [ ] Render a live native title from the child label; cache a normalized, bounded first-question label locally without calling `rename`.
- [ ] Run the focused suite after the complete related batch and fix failures against the accepted behavior.

### Task 3: Verify and document the change

**Files:**
- Modify `packages/dsh-sidechat/README.md`
- Modify this plan's checkboxes after verification

**Interfaces:** No new dependencies or Host operations. Build remains the existing package script.

- [ ] Update README to describe native tabs, retained history and removed management controls.
- [ ] Run all verification commands using the bundled Node executable and pnpm script:

```bash
pnpm --filter dsh-sidechat test
pnpm test
pnpm --filter dsh-sidechat typecheck
pnpm --filter dsh-sidechat build
git diff --check
```

Expected: exit 0, no failing tests or type errors, fresh Host/Client bundles.
- [ ] Review final diffs and independently review native lifecycle, draft isolation and removed actions. Do not stage another concurrent change to SidechatComposer.
- [ ] Report the source changes, actual test/build results, checkpoint hash, and that this change has not been installed into the active GUI. Do not claim Desktop E2E or hot reload was verified.
