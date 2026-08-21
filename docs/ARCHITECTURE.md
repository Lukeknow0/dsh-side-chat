# Architecture

## Product boundary

Side Chat is a temporary, read-only child conversation owned by a right-side drawer. It is not a second main conversation view and it never reports its result to the parent.

## Host lifecycle

The Host keeps one in-memory record per opaque client token and one retained Side Chat per parent session. Each record carries a 30-minute parked-and-idle lease; attachment heartbeats and active generation pause that countdown. A fresh client token may adopt the same retained child after a page reload without copying or restarting its transcript.

1. Resolve the live parent agent.
2. Freeze the event prefix through the last `turn/end`.
3. Derive official subagent metadata, then omit its durable `parentSession` catalog link while retaining `origin: subagent`; this keeps the temporary runtime out of both normal and child catalogs.
4. Append child-local read-only and approval overrides after the seed.
5. Apply a read-only visible tool set and an execution-time deny-by-default guard.
6. Inject a hidden boundary notice that tells the model all inherited history is reference-only.
7. Return the child session id, inherited seed length, and lease expiry.
8. Treat visible transcript reads as attachment heartbeats. Parking stops those reads, while active generation keeps moving the deadline forward; the full 30-minute lease starts only once the child is detached and idle.

Explicit close removes admission before awaiting work. Background idle expiry follows the same path after 30 minutes. Visible clients refresh the lease through reads, and a generating child is monitored until it becomes idle before its full lease begins. Cleanup aborts creation, disposes any published handle, and calls the public workspace archive service when available.

## Client lifecycle

A module-level controller is shared by the header action and the root overlay. It stores open snapshots by parent session. A parent switch parks the visible snapshot and restores any snapshot owned by the destination parent; it does not call the Host close remote. Opening after a page reload uses a fresh UUID token, which the Host may adopt onto the retained child. Explicit close marks an in-flight attempt as retired so late results cannot republish.

After start succeeds, the controller starts an adaptive transcript loop: 220 ms while the child runs and 700 ms while idle. The Host's `read` remote projects only child-local user and assistant events after `seedLength`, including partial text deltas. Prompts travel through the host-owned `send` remote, which calls `Agent.followup`; standard SessionFace prompting is intentionally blocked for `origin: subagent` sessions by DSH routing.

## Client overlay placement

The drawer remains an additive `shell.overlay` entry. Its root is an absolute, frame-sized, click-through measuring layer; only the drawer and mobile scrim accept pointer events. The pure `computeOverlayPlacement` solver receives viewport/frame rectangles, safe-area insets, the desired/minimum drawer widths, and occupied rectangles. It quantizes geometry to a 4px grid and chooses, in order, a 448px right rail, a 360–400px compact rail, or a bottom sheet. Native panels and small right-edge controls are expanded by the 12px safety gap before candidate selection.

`useOverlayPlacement` resolves the nearest `[data-shell-overlay]`, measures its AppFrame parent and rendered sidebar/details columns, then best-effort measures visible sibling entries. ResizeObserver tracks the frame, panes, siblings, and explicitly selected portals. MutationObserver is restricted to AppFrame attributes, the overlay slot subtree, direct body portal mounts, and known avoid targets; callbacks are coalesced through one animation frame and ignore Side Chat's own transcript mutations. Every observer, listener, and queued frame is released on unmount.

There is no public rendered-geometry or collision API in DSH rc.8. Stable markers are preferred when present; core class/DOM-order fallbacks are deliberately isolated in the hook. Portal compatibility is explicit: third parties can mark a real interactive region with `data-dsh-side-chat-avoid`, or supply selectors through `window.__DSH_SIDE_CHAT_AVOID_SELECTORS__`. CSS reserves `--dsh-side-chat-reserve-top/right/bottom/left` are added to browser safe-area insets. These paths are best-effort rather than a promise to identify arbitrary portal DOM. See [OVERLAY-PLACEMENT.md](OVERLAY-PLACEMENT.md) for the verified root-cause audit.

## Lifecycle race table

| Race | Resolution |
| --- | --- |
| Close while start is creating | Host abort controller plus closing tombstone; a late handle is immediately disposed |
| Start response after client close | Opening attempt is marked closed; client sends an idempotent close and ignores the response |
| Read overlaps close | Host tombstone rejects reads after admission is removed; stale client epochs ignore responses |
| Late mux frames after close | Drawer unmounts and the retired epoch cannot publish |
| Multiple rapid opens | One token per attempt and one active token per parent |
| Send during close | Client retires its token first; Host disposal or `not-open` wins |
| Parent switch | Client parks by parent without a remote close; switching back restores the same token and transcript |
| Unknown future tool | Visibility allowlist omits it and execution guard rejects it |

## Cleanup limitation in rc.7

`AgentHandle.dispose()` removes the live agent/session and drains its loop. DSH 0.1.0-rc.7 persistence retires that session by flushing its durable log; it does not expose public physical deletion. Side Chat therefore archives through the public workspace API and does not claim secure erasure.

## Public extension points

- Host: AgentRegistry, AgentHandle, child composition helpers, ToolRegistry guard, WorkspaceRegistry archive
- Transport: Typert direct remotes `sideChat/start`, `sideChat/read`, `sideChat/send`, `sideChat/cancel`, and `sideChat/close`
- Client: `conversation.session.header.actions` and `shell.overlay`
- Runtime: ISessions only for parent status; Agent `followup`, `cancel`, and Session events for the owned child
