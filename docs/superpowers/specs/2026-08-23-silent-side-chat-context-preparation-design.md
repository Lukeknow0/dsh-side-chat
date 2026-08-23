# Silent Side Chat Context Preparation Design

**Date:** 2026-08-23  
**Status:** Approved  
**Scope:** Side Chat opening, first-message admission, and context-preparation feedback

## Summary

Opening Side Chat must make the surface interactive immediately. Context capture and child-agent creation still begin when the user opens the surface, but they run silently in the background. The UI must not show an opening or context-reading status.

If the user sends the first message before the child is ready, the Host accepts it into a per-Side-Chat outbox immediately. The user message appears in the transcript immediately. Once child creation finishes, the Host injects the existing Side Chat boundary and then delivers the queued message exactly once. The first response can therefore take longer without blocking message entry or exposing initialization as a user-facing phase.

## Goals

1. Show and focus the Side Chat composer as soon as the drawer or native tab opens.
2. Capture the completed parent context at open time and prepare the child in the background.
3. Let one initial user message be accepted while preparation is still running.
4. Preserve strict ordering: captured context, Side Chat boundary, then the queued user message.
5. Remove `Forking context…` / `正在继承上下文…` and `Inspecting context…` / `正在查看上下文…` from the runtime UI.
6. Preserve the accepted message, transcript, and draft state across minimize, tab closure, and presentation fallback.
7. Keep explicit End as the only action that discards the Side Chat and its pending work.

## Non-goals

- Do not change which parent events are inherited; the seed still ends at the latest completed turn visible when Side Chat is opened.
- Do not merge later parent events into an already opening Side Chat.
- Do not allow multiple concurrent Side Chat turns. After the first message is accepted, the existing running/stop interaction applies until it completes or is cancelled.
- Do not change the read-only tool policy, model prompt, retention lease, Better Sidebar capability contract, or drawer fallback.
- Do not claim that Codex uses the same internal implementation. Its public material does not specify Side Chat initialization internals; only the immediate-interaction UX principle is being adopted.

## User-visible behavior

### Open before sending

- The selected drawer or Better Sidebar tab becomes visible immediately.
- The empty state and composer render immediately, including during the short start-admission round trip.
- The composer receives focus through the existing focus behavior.
- No spinner, banner, or text mentions context loading, inheritance, inspection, or preparation.
- Background preparation does not create a synthetic assistant message.

### Send before preparation finishes

- The draft clears as soon as the message is accepted locally for admission.
- The user message appears immediately in the transcript.
- A very short client-side admission buffer covers the race before the Host has registered the new chat token.
- After registration, the Host owns the pending message and acknowledges it without awaiting child creation.
- The composer then follows the normal single-turn busy behavior. The assistant area remains quiet until real assistant output exists.
- The stop action may cancel a queued first message before child creation completes.

### Send after preparation finishes

The existing path remains unchanged: the Host forwards the user message directly to the child agent and the client polls/streams the resulting transcript.

### Failure

- A transport or admission rejection restores the text to the draft, as today.
- If child creation fails after admission, the already accepted user message remains visible and recoverable.
- The surface shows the existing actionable error/retry UI, but never reframes the failure as a context-reading status.
- Retry starts a fresh child from the same parent boundary and resubmits the retained initial outbox message once.
- Explicit confirmed End cancels creation, discards the outbox, and clears the draft.

## Host state and ordering

`LiveSideChat` gains an opening lifecycle and a single-turn outbox. The public remote schemas can remain compatible; this change primarily alters when existing operations resolve.

### Start

1. Resolve the live parent and capture `completedTurnSeed(parent.session.events)` synchronously.
2. Allocate the child id and register the `LiveSideChat` under its chat token and parent id.
3. Start `agents.create(...)` and retain its promise on the entry.
4. Return the existing successful start value immediately after registration, without awaiting the child handle.
5. On resolution, verify that the entry is still owned and not closing, store the handle, inject `SIDE_CHAT_BOUNDARY`, and flush the outbox.

Duplicate start/adoption while the same entry is opening returns the same registered chat instead of waiting for creation.

### Read

`read` remains a valid attachment heartbeat while the entry is opening. Before the child handle exists it returns an otherwise normal transcript containing any accepted optimistic user message, no partial assistant output, and a busy value when a first message is queued. It must not return `not-open` solely because creation is unfinished.

When the child transcript contains the real user event, transcript assembly de-duplicates it against the outbox message id.

### Send

`send` validates and records the existing idempotent request id before checking child readiness:

- if the handle exists, forward the message immediately;
- if creation is pending, retain it in the entry outbox and return the existing accepted response immediately;
- if opening has failed or the entry is closing/absent, return an actionable error.

The current one-turn-at-a-time client rule bounds the outbox to one undelivered user message.

### Cancel and close

- Cancel during preparation marks the pending message cancelled and prevents it from being delivered after creation.
- Close aborts creation and removes the entry and outbox. A late creation resolution must dispose its handle and must not inject the boundary or queued message.
- Minimize, Escape, keyboard toggle, and native tab close continue to affect presentation only and do not touch the outbox.

## Client state

The controller continues exposing its existing `starting` phase for lifecycle correctness, but the shared surface treats both `starting` and `open` as interactive presentation states.

The controller keeps only enough optimistic outbox metadata to bridge the pre-registration race and preserve an accepted message across a late startup failure:

- request id;
- message id once acknowledged by the Host;
- submitted text;
- parent id and chat token;
- admission/delivery status.

After the Host transcript contains the message id, the Host is authoritative and the optimistic copy is de-duplicated. Presentation adapters remain stateless and continue sharing the same controller and per-parent view store.

## UI changes

- Render the composer for `starting` and `open`.
- Permit a non-empty first send during `starting`.
- Render an optimistic user message immediately after submission.
- Remove the starting loader block.
- Remove the context-reading activity row. Real partial assistant output continues to stream normally.
- Keep the normal stop button while an accepted message is queued or the child is running.
- Remove the unused transient-status locale keys and styles when no longer referenced.

## Test strategy

Implementation follows focused RED/GREEN slices:

1. Host start returns before a deferred `agents.create` resolves, while read remains valid.
2. Send during creation is accepted immediately, appears in read, and is not delivered early.
3. On creation resolution, the boundary precedes the queued user message and duplicate request ids deliver once.
4. Cancel/close during creation prevents queued delivery; a late handle is disposed.
5. Controller accepts and renders a starting-phase first message, handles the registration race, and de-duplicates the Host transcript.
6. Surface tests verify an immediately available composer and absence of all context-preparation status copy.
7. Existing minimize/end, Better Sidebar fallback, retention lease, protocol, build, and full `pnpm run check` suites remain green.

## Acceptance criteria

- Clicking Side Chat never presents a context-loading state.
- The user can type and send before child-agent creation completes.
- Sending does not await child-agent creation before visibly accepting the message.
- The captured context and boundary are installed before the first user message reaches the child.
- The first message is delivered no more than once.
- Background creation failure does not silently lose accepted text.
- Presentation-only close paths still never call `controller.close()`.
- Confirmed End remains the only destructive UI action.
