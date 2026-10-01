# Migrating from v0.4 to v1.0.0-rc.1

This is a major independent rewrite, not a compatible patch. The distribution name remains `@lukeknow0/dsh-side-chat`, but the architecture, Host API target, permissions and retained-state model change.

## Breaking changes

| v0.4 behavior | v1.0.0-rc.1 behavior |
| --- | --- |
| DSH `>=0.1.0-rc.7 <0.2.0` | Exactly DSH `0.2.0-rc.2` |
| Optional Better Sidebar tab integration with overlay fallback | DSH-native right-sidebar service; no legacy overlay fallback |
| One retained side chat per parent | Multiple native child-conversation tabs |
| Fixed read-only policy, tool allowlist and execution guard | Host child permission presets/approval flow; **not always read-only** |
| Explicit End and 30-minute parked idle expiry | Closing a tab leaves its child intact; no automatic parked expiry |
| Token/lease retention metadata | Plugin-owned parent/child associations and native resource addresses |
| English and Chinese interface | Current interface copy is Chinese; bilingual release documentation |

The old metadata is not automatically imported. This release does not delete old Session logs or pretend to convert them. A v0.4 chat is not guaranteed to appear in the new history list. Record anything you need from the old plugin before changing versions.

## Safe adoption

1. Back up your DSH profile using your normal backup process. Do not copy its credentials into an isolated test profile.
2. Keep the old release available together with its original compatible Host. Do not install v1 on DSH 0.1, or force v0.4 into the new Host by ignoring peer constraints.
3. Download and verify the v1 GitHub Release `.tgz` using `SHA256SUMS`; this prerelease is not published to npm.
4. Test in a disposable DSH `0.2.0-rc.2` Web profile first. Desktop profiles must be managed through the app; Desktop cold-start/coexistence still require separate acceptance.
5. Do not load the old scoped plugin and an unscoped development `dsh-sidechat` build together. They may claim overlapping internal services or tabs. This package preserves the scoped distribution name, not a parallel side-by-side upgrade mode.
6. Check the child permission preset before prompting. Do not rely on the old fixed read-only guard.

## New lifetime and attachment rules

Opening an empty native page creates no Session; first send creates it. Choosing a file creates the child needed for an upload receipt without sending a prompt. Each native page/child has independent drafts and retry identities. Closing the tab is non-destructive and does not stop generation; use explicit cancellation when you mean to stop it. Reopen known history from the empty page.

Unsent files are retained in process memory across tab navigation, not across a reload. Limits are 10 files and 20 MB per file, subject to stricter Host admission. Successful sends remove only the attachments that were actually sent; failed sends retain them for retry.

Successful child model choices do not rewrite the existing parent Session, but DSH may save them as defaults for subsequently created unconfigured Sessions. Annotations and answer return remain development-only; no accepted automatic write-back feature is promised.

## Rollback and old history

All existing Git tags and `main` ancestry are preserved. The new release is an ordinary descendant commit, not a force-push. [v0.4.0](https://github.com/Lukeknow0/dsh-side-chat/releases/tag/v0.4.0) remains the stable release when this prerelease is published. Roll back using a known compatible old Host and your backup; the new and old state formats are not interchangeable. Historical documents and branding screenshots describe those old versions, not current runtime behavior.

---

## 中文摘要

本版是面向 DSH `0.2.0-rc.2` 的独立架构重写，仅在 GitHub 预发布，包名仍为 `@lukeknow0/dsh-side-chat`。原生多标签替代旧抽屉；不再强制只读，不再停放 30 分钟自动过期。关闭标签不等于取消或删除子会话，旧版侧聊元数据也不会自动迁移。请选择合适的子会话权限，并先在隔离配置中验证。Desktop 冷启动与 Better Sidebar 共存尚未验收。旧版 tag 和历史保留，回退需要与旧版兼容的 Host 及你自己的备份。
