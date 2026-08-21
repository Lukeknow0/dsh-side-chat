# Architecture

## Product boundary

Side Chat is a temporary, read-only child conversation owned by a right-side drawer. It is not a second main conversation view and it never reports its result to the parent.

## Host lifecycle

The Host keeps one in-memory record per opaque client token and one active token per parent session.

1. Resolve the live parent agent.
2. Freeze the event prefix through the last `turn/end`.
3. Derive official subagent metadata, then omit its durable `parentSession` catalog link while retaining `origin: subagent`; this keeps the temporary runtime out of both normal and child catalogs.
4. Append child-local read-only and approval overrides after the seed.
5. Apply a read-only visible tool set and an execution-time deny-by-default guard.
6. Inject a hidden boundary notice that tells the model all inherited history is reference-only.
7. Return the child session id and inherited seed length.

Closing removes admission before awaiting work. It aborts creation, disposes any published handle, and calls the public workspace archive service when available.

## Client lifecycle

A module-level controller is shared by the header action and the root overlay. Every open attempt increments an epoch and allocates a UUID token. Async results may publish state only while both epoch and token still match.

After start succeeds, the controller starts an adaptive transcript loop: 220 ms while the child runs and 700 ms while idle. The Host's `read` remote projects only child-local user and assistant events after `seedLength`, including partial text deltas. Prompts travel through the host-owned `send` remote, which calls `Agent.followup`; standard SessionFace prompting is intentionally blocked for `origin: subagent` sessions by DSH routing.

## Lifecycle race table

| Race | Resolution |
| --- | --- |
| Close while start is creating | Host abort controller plus closing tombstone; a late handle is immediately disposed |
| Start response after client close | Epoch mismatch; client sends an idempotent close and ignores the response |
| Read overlaps close | Host tombstone rejects reads after admission is removed; stale client epochs ignore responses |
| Late mux frames after close | Drawer unmounts and the retired epoch cannot publish |
| Multiple rapid opens | One token per attempt and one active token per parent |
| Send during close | Client retires its token first; Host disposal or `not-open` wins |
| Parent switch | Session-list listener closes the owned Side Chat |
| Unknown future tool | Visibility allowlist omits it and execution guard rejects it |

## Cleanup limitation in rc.7

`AgentHandle.dispose()` removes the live agent/session and drains its loop. DSH 0.1.0-rc.7 persistence retires that session by flushing its durable log; it does not expose public physical deletion. Side Chat therefore archives through the public workspace API and does not claim secure erasure.

## Public extension points

- Host: AgentRegistry, AgentHandle, child composition helpers, ToolRegistry guard, WorkspaceRegistry archive
- Transport: Typert direct remotes `sideChat/start`, `sideChat/send`, `sideChat/cancel`, and `sideChat/close`
- Client: `conversation.session.header.actions` and `shell.overlay`
- Runtime: ISessions only for parent status; Agent `followup`, `cancel`, and Session events for the owned child
