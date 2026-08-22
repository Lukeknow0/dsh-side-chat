# Adaptive Side Chat Presentation and Retention Design

**Date:** 2026-08-22  
**Status:** Approved  
**Scope:** `dsh-side-chat` client presentation, close/minimize semantics, and Host retention lease

## Summary

Side Chat will use an adaptive presentation strategy:

- When the optional `dsh-better-sidebar` service is available, Side Chat appears as a native Better Sidebar tab.
- Otherwise it continues to use its standalone `shell.overlay` drawer.
- Both presentations expose separate **minimize** and **end** actions.
- Minimizing never closes the Side Chat or discards its transcript or draft.
- Ending requires an explicit confirmation and then invokes the existing close/cleanup path.
- A parked or disconnected Side Chat starts its 30-minute retention countdown only after both the parent task and the Side Chat child are idle.

The core read-only isolation boundary, transcript protocol, one-Side-Chat-per-parent rule, and no-write-back guarantee remain unchanged.

## Context

The current plugin registers its trigger in `conversation.session.header.actions` and its drawer in the additive `shell.overlay` slot. This is portable, but a floating drawer can compete with other UI plugins for screen space.

DSH core also exposes `sidebar` and `details`, but both are `single` slots occupied by core UI. Registering Side Chat directly in either would replace the existing navigation or details surface rather than extend it.

The right-hand tabbed workbench shown in the target environment is provided by `dsh-better-sidebar`, currently brought in through `@linxin666/dsh-web-ui-all`. Better Sidebar publishes the optional `ctx.betterSidebar` service and supports third-party tabs through `registerTab`, `openTab`, `activateTab`, and lifecycle callbacks. Side Chat can therefore integrate through a public contract without modifying or coupling to Better Sidebar internals.

## Goals

1. Prefer a native Better Sidebar tab when the public service is available.
2. Preserve a fully functional standalone drawer when Better Sidebar is absent, disabled, incompatible, or unloaded.
3. Make minimizing non-destructive and reversible.
4. Make ending deliberate, confirmed, and clearly distinct from minimizing.
5. Preserve transcript and unsent draft across presentation changes, tab closure, and minimization.
6. Prevent parked Side Chats from expiring while either the parent task or the Side Chat child is still running.
7. Keep integration HMR-safe and avoid duplicate registrations.

## Non-goals

- Do not replace DSH's core `sidebar`, `details`, or `root` slot occupants.
- Do not add a dependency on `@linxin666/dsh-web-ui-all`.
- Do not require Better Sidebar for installation or activation.
- Do not change the Side Chat model prompt, read-only tool policy, context fork boundary, or no-write-back behavior.
- Do not promise physical erasure of durable DSH session logs where the public DSH API only supports archive/runtime cleanup.
- Do not create a second floating restore pill; the existing conversation-header action remains the stable restore affordance.

## User-visible state model

Presentation and conversation lifetime are separate state axes.

### Presentation states

- **Expanded:** the tab or drawer is visible.
- **Minimized:** the surface is hidden, but the Side Chat remains attached and recoverable.
- **Unavailable:** no presentation host is currently usable; the client falls back to the standalone drawer when possible.

### Conversation states

- **Absent:** no retained Side Chat exists for the parent.
- **Starting:** the child is being created or adopted.
- **Open:** the child exists and can receive questions.
- **Parked:** the child is retained by the Host while its parent is not the visible client attachment.
- **Ended:** explicit close or idle expiry retired the child; it cannot be resumed through Side Chat.

Minimizing changes only the presentation state. It must not call the close remote or clear conversation state.

## Presentation selection

The default preference is `auto`, with three supported values:

- `auto`: use Better Sidebar when its service and required capabilities are available; otherwise use the drawer.
- `drawer`: always use the standalone overlay drawer.
- `better-sidebar`: prefer the native tab, but still fall back to the drawer if the service cannot be used so the user is never locked out of an existing conversation.

The first release keeps this preference internal and defaults to `auto`; adding a user-facing presentation setting is deferred.

### Capability detection

Better Sidebar is an optional runtime enhancement:

- Do not add `betterSidebar` to the Side Chat plugin's mandatory top-level `inject` list.
- Register the adapter only while the service is available through Cordis service injection.
- Use the public service shape and feature list, not DOM inspection or a hard-coded package version.
- Use type-only imports and an optional peer/dev dependency so the client bundle has no runtime `require('dsh-better-sidebar')` edge.
- Dispose the tab descriptor when the service disappears or the plugin reloads.
- If registration throws, the descriptor is disabled, or required methods are missing, log one concise warning and keep the drawer path active.

The target profile currently contains standalone 0.13.x and aggregate-provided 0.14.x package copies. Runtime capability detection is therefore authoritative; package-directory discovery is not.

## Better Sidebar mode

Register one tab descriptor with these semantics:

- Stable type id: `dsh-side-chat:conversation`.
- Single instance per Better Sidebar session scope.
- Native title and Side Chat sign.
- Visible in the Better Sidebar `+` menu.
- Session-scoped content: the tab receives the current Better Sidebar session scope and binds it to the corresponding parent Side Chat.
- Optional running/error badge only when the runtime advertises the badge capability.

The shared Side Chat surface renders inside the tab. Opening from the main conversation header starts or restores the Side Chat and calls the documented `openTab` path with the active session scope. A harmless Side-Chat-owned content seed may be supplied so Better Sidebar expands a collapsed panel through its public content-open behavior; it must never be interpreted as a filesystem path by Side Chat.

Opening from the Better Sidebar `+` menu creates or focuses the tab for the current session. If that parent has no retained Side Chat, the surface starts it using the same precondition and error handling as the conversation-header action.

Closing the native Better Sidebar tab is treated as **minimize**. Its `onClose` callback must not invoke the Side Chat close remote. Reopening from the header or `+` menu restores the same retained Side Chat and draft.

Because Better Sidebar has no public pre-close cancellation hook, destructive confirmation lives inside the Side Chat surface rather than trying to intercept the native tab close button.

## Standalone drawer mode

The current `shell.overlay` registration remains the fallback and continues using the collision-aware placement solver.

The drawer header gains two distinct controls:

- **Minimize (`—`):** hide the drawer and retain the Side Chat.
- **End (`×`):** open the destructive confirmation dialog.

The conversation-header action becomes a visibility/open action rather than a destructive toggle:

- If no Side Chat exists, start one and show it.
- If a retained Side Chat is minimized, restore and show it.
- If it is already visible, minimize it.

No edge pill is added. A retained/minimized visual state on the existing header action is sufficient and avoids creating another overlay collision target.

## Destructive confirmation

The internal `×` control in both presentations opens an accessible modal confirmation.

Recommended copy:

**Title:** `End Side Chat?` / `结束侧边对话？`

**Body:** `Ending removes this Side Chat's retained context and draft from the plugin, so it cannot be resumed. The main conversation is not affected.` / `结束后，这段侧边对话的上下文和草稿将无法继续恢复；主会话不会受到影响。`

**Actions:** `Cancel` / `取消`, and destructive `End and clear` / `结束并清除`.

Requirements:

- Focus starts on the safe cancel action.
- Escape and backdrop dismissal cancel the operation.
- Only the destructive confirmation invokes `controller.close()`.
- While close is pending, disable repeated confirmation and show progress.
- If Host cleanup returns a warning, end the live Side Chat but surface a non-blocking warning; do not claim secure physical deletion.

## Draft and transcript ownership

The drawer and Better Sidebar tab must render one shared `SideChatSurface` instead of duplicating conversation UI.

Unsent draft state must move out of presentation-local React state and into a controller-owned or dedicated view-state store keyed by parent session id. The retained view state includes:

- composer draft;
- send error relevant to that draft;
- presentation visibility for the active parent;
- close-confirmation state only while its surface is mounted.

Transcript, partial output, run state, and Host token remain owned by `SideChatController` as today.

The following transitions must not clear draft or transcript:

- drawer minimize and restore;
- Better Sidebar tab close and reopen;
- automatic drawer-to-tab or tab-to-drawer fallback;
- resizing or narrow-layout mode changes;
- HMR disposal and re-registration while the controller survives.

Explicit confirmed close clears the retained draft and conversation state for that parent.

## Retention lease

The 30-minute lease applies only to a Side Chat that is detached/parked and fully idle.

Define:

```text
busy = parent task is running OR Side Chat child is running
eligibleForCountdown = detached/parked AND NOT busy
```

Rules:

1. While a minimized Side Chat remains attached to the current page, the existing transcript heartbeat continues; no countdown starts.
2. Switching the main conversation, closing/reloading the page, or losing the client attachment stops heartbeats and makes the Side Chat parked.
3. A parked Side Chat does not count down while the parent task is running.
4. A parked Side Chat does not count down while the Side Chat child is running.
5. When both parent and child become idle, start a fresh full 30-minute countdown.
6. If either becomes running during the countdown, cancel the countdown.
7. When both later become idle again, restart a fresh full 30-minute countdown rather than resuming the previous remainder.
8. Explicit confirmed close bypasses the lease and ends immediately.

The Host is the lease authority. It should resolve the live parent through the existing agent registry using `parentSessionId`, combine parent and child run states into one `busy` input, and keep the lease evaluator pure and unit-tested. A missing/disposed parent counts as not running.

Visible/minimized attachment is still represented by regular `read` heartbeats. No new client `keepalive` remote is required.

## Data flow

### Open from the conversation header

1. Resolve the active parent session id.
2. Start or restore its Side Chat through `SideChatController`.
3. Presentation adapter chooses Better Sidebar or drawer.
4. Better Sidebar mode opens/focuses the session-scoped tab; drawer mode marks the overlay visible.
5. The shared surface subscribes to the same controller snapshot and draft store.

### Minimize

1. Set presentation visibility to minimized.
2. Do not call `sideChat/close`.
3. Do not clear the draft or transcript.
4. Keep polling/heartbeats while this remains the connected current parent.

### Confirmed end

1. Disable destructive controls.
2. Call `controller.close()` once.
3. Host removes live admission, disposes the child, and archives when supported.
4. Clear the retained draft and presentation state for the parent.
5. Close the tab/drawer and return focus to the conversation header action.

## Failure behavior

- Better Sidebar absent at boot: drawer only, without warnings.
- Better Sidebar appears later: register the tab and use it on the next open; do not forcibly move a user who is actively typing.
- Better Sidebar disappears while its tab is visible: preserve state and reveal the drawer fallback.
- Duplicate tab id: keep the drawer and log one actionable warning.
- Tab type disabled in Better Sidebar settings: keep the drawer available.
- Host restore reports `not-open`: show the existing expired state and explicit restart action.
- Confirmation close fails at transport level: keep the UI ended locally, surface the warning, and preserve the existing idempotent cleanup behavior.

## Accessibility and interaction

- Minimize and End have distinct labels, titles, and icons; neither relies on color alone.
- Header action exposes whether a Side Chat exists and whether it is currently visible.
- Keyboard shortcut toggles visibility, not destructive close.
- Escape minimizes the visible surface; it never ends the Side Chat.
- Confirmation dialog traps focus and restores focus on exit.
- Better Sidebar narrow/mobile drawer behavior remains owned by Better Sidebar.
- Standalone narrow/mobile behavior remains owned by the existing placement system.

## Verification

### Controller and view-state tests

- Minimize preserves transcript, token, draft, and send error.
- Restore reuses the retained child rather than starting another.
- Confirmed close clears retained state and calls the close remote once.
- Canceling confirmation performs no close or state clearing.
- Keyboard shortcut and Escape minimize without closing.

### Better Sidebar adapter tests

- Service absent produces no runtime import failure and leaves the drawer active.
- Compatible service registers exactly one HMR-safe descriptor.
- Header and `+` menu converge on the same session-scoped tab.
- Native tab close minimizes without calling the close remote.
- Service disposal falls back to the drawer without losing draft or transcript.
- Disabled or duplicate descriptor degrades to the drawer.
- Optional capabilities such as badges are used only when advertised.

### Host lease tests

- Detached + parent idle + child idle expires after 30 minutes.
- Parent running pauses expiry even when child is idle.
- Child running pauses expiry even when parent is idle.
- Transition from either running state to both idle starts a fresh full TTL.
- Running resumes during countdown and cancels it; the next both-idle transition restarts a full TTL.
- Missing parent is treated as idle.
- Explicit close remains immediate and idempotent.

### Component and integration tests

- Drawer and tab render the same shared surface behavior.
- Minimize and End controls have distinct accessible names.
- Confirmation copy explains loss of resumability without promising physical erasure.
- Draft survives drawer/tab remounts and automatic presentation fallback.
- Existing overlay geometry, responsive placement, read-only policy, remote contract, build smoke, and package-publication checks remain green.

## Documentation changes

Update English and Chinese README lifecycle sections to state:

- Better Sidebar integration is optional and automatic.
- Minimize preserves the Side Chat and draft.
- Explicit confirmed End removes resumability immediately.
- Parked retention starts only after both parent and Side Chat are idle.
- The 30-minute countdown resets after new parent or child activity.

Update `docs/ARCHITECTURE.md` with the adaptive presentation layer and the parent-aware Host lease.

## Acceptance criteria

The feature is complete when:

1. The same package works with and without Better Sidebar.
2. Better Sidebar mode appears as a native tab and the standalone overlay does not compete for space.
3. Minimize, native tab close, Escape, and visibility shortcut never invoke destructive close.
4. Transcript and unsent draft survive every non-destructive presentation transition.
5. Only confirmed internal End destroys resumability.
6. A parked Side Chat cannot expire while either parent or child is running.
7. A fresh 30-minute countdown begins only when both become idle.
8. All focused tests and the full `pnpm run check` pass.
