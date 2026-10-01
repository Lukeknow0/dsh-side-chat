# Changelog

## 1.0.0-rc.1 — 2026-10-01

Major rewrite prerelease for DSH `0.2.0-rc.2`. Distributed as a GitHub Release tarball; not published to npm.

- Replace the legacy overlay/lease implementation with one native right-sidebar tab per child conversation, independent drafts, reopenable history and child-only transcript routing.
- Add Host catalog-backed model/permission controls, child-owned questions/approvals and explicit generation cancellation.
- Add child-session file upload receipts, image attachments, drag-and-drop and clipboard-image paste, with upload progress, removal and retry.
- Retain the published package identity `@lukeknow0/dsh-side-chat`; import the independent rewrite as new commits while preserving previous releases and Git history.
- Add a self-contained source workspace, package identity regressions, build/package checks and CI on Linux/macOS.

**Breaking changes:** requires DSH `0.2.0-rc.2`; no legacy overlay fallback, 30-minute parked expiry or automatic legacy metadata migration. Child capabilities follow Host permission controls: this rewrite is **not** the legacy always-read-only agent. Closing a tab does not cancel, archive or delete its Session. Interface copy is currently Chinese. Annotations/answer return remain development-only. Desktop cold-start and Better Sidebar coexistence remain unverified; use an isolated profile first. See [migration notes](MIGRATION.md).

## 0.4.0

- Make the Side Chat composer interactive immediately while completed parent context is prepared silently in the background.
- Accept and retain the first message before child creation finishes, then deliver it exactly once after the Side Chat boundary.
- Respect Better Sidebar's requested icon size so the Side Chat mark matches native cards and tabs.
- Refresh GitHub discovery metadata, README entry points, and corrected hero/social-card branding.

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
