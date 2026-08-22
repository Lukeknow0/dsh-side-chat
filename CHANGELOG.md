# Changelog

## 0.3.0

- Integrate Better Sidebar native tabs automatically when available, while keeping the collision-aware overlay drawer as the optional-integration fallback.
- Preserve transcript and draft when Side Chat is minimized, dismissed with Escape, closed as a native tab, or toggled with the visibility shortcut.
- Require confirmation for the internal End action, which removes resumability immediately once confirmed.
- Start parked expiry only when both parent and child are idle; any activity restarts the next both-idle interval at a full 30 minutes.
- Limit durable physical deletion claims to public DSH cleanup support.

## 0.2.0

- Publish the package as `@lukeknow0/dsh-side-chat`.
- Park Side Chats per parent instead of closing them when tasks switch.
- Restore retained transcripts automatically when returning to a parent task.
- Reattach refreshed clients to the retained Host child with token adoption.
- Expire Side Chats only after 30 minutes parked and idle; visible attachment heartbeats and active generation pause the countdown.
- Keep explicit close as the immediate cancellation, disposal, and archive boundary.
- Replace viewport-fixed positioning and z-index competition with collision-aware AppFrame-relative placement.
- Avoid native sidebar/details, visible overlay siblings, marked portal controls, browser safe areas, and configured CSS reserves.
- Add deterministic right/compact-right/bottom-sheet placement plus ResizeObserver and cleanup coverage.

## 0.1.0

- Initial Side Chat drawer for DeepSeek Harness.
- Completed-turn context fork with hidden child sessions.
- Read-only sandbox, approval denial, tool allowlist, and execution guard.
- Host-owned prompt, cancel, and child-only live transcript transport.
- Close-time cancellation, runtime disposal, and archive cleanup fallback.
- English and Chinese interface and documentation.
