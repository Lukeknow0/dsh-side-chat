# DSH Side Chat

[English](README.md) · [简体中文](README.zh.md)

Independent side conversations in DeepSeek Harness's native right sidebar. Keep each side question in its own conversation tab, with its own draft, transcript and child-session controls.

> **v1.0.0-rc.1 is a major rewrite prerelease, not a stable upgrade.** It requires exactly **DSH `0.2.0-rc.2`**. Desktop cold-start and coexistence with Better Sidebar remain unverified. This version is distributed through GitHub as an installable tarball, **not published to npm**. Read the [migration guide](MIGRATION.md) before replacing v0.4.

## Install the prerelease

Download **`lukeknow0-dsh-side-chat-1.0.0-rc.1.tgz`** and **`SHA256SUMS`** from the [v1.0.0-rc.1 Release](https://github.com/Lukeknow0/dsh-side-chat/releases/tag/v1.0.0-rc.1). Verify the checksum in the download directory:

```sh
shasum -a 256 -c SHA256SUMS
```

Try an isolated disposable profile first. For the DSH Web CLI, in a separate terminal:

```sh
export DSH_HOME="$(mktemp -d)"
dsh plugin --profile web add /absolute/path/lukeknow0-dsh-side-chat-1.0.0-rc.1.tgz
```

Then start that isolated Web profile and use its normal authentication. Do not grant a version exemption. The Desktop profile is managed by the Desktop app's plugin manager, not by the Web CLI. Back up your profile before opting into this prerelease; do not treat the Web checks as Desktop acceptance.

The package remains **`@lukeknow0/dsh-side-chat@1.0.0-rc.1`**. Installing the package name from npm, or installing the workspace root directly, does **not** install this GitHub-only prerelease.

## What changed

- **Native conversation tabs:** use the sidebar's add/guide entry, “新建侧聊”, to open an independent blank page. Multiple child conversations can be open at once.
- **Deferred child creation:** opening an empty page does not create a Session. Its first send creates the child; adding a file also creates the child needed for an upload receipt, without sending a prompt.
- **Separate drafts and history:** each tab addresses only its own child. Reopen saved conversations from the blank page. Closing a tab does not cancel, archive or delete its Session.
- **Child controls:** Host catalog-backed model/permission choices, child questions and approval decisions, plus explicit cancellation of generation.
- **Web attachments:** upload, drag-and-drop or paste supported clipboard images; see progress, remove files or retry. File receipts stay child-scoped; images use native image content. Attachment-only messages are supported.
- **No automatic write-back:** side-chat messages are not appended to the parent. A model selection does not rewrite the existing parent Session, but the Host may save it as the default for subsequently created unconfigured Sessions.

Interface copy is currently Chinese. Attachment admission is at most 10 files and 20 MB per file; the Host may enforce stricter limits. Unsent files remain in memory during tab navigation, **not across browser reloads**. Annotations and answer return are development-only, not accepted runtime features in this prerelease.

## Permissions and retained data

**This rewrite is not an always-read-only child agent.** It uses the Host's child-session model, permission presets and approval flow. Review the child's selected permissions before sending a prompt; the legacy fixed tool allowlist/deny guard is not carried over. Full-access/automatic presets require the Host's risk-acknowledgement path.

Tabs are a UI lifetime, not a data-erasure boundary. Closing a tab does not end its child or erase its persisted history. There is no v0.4-style automatic 30-minute parked expiry. The old metadata model is not automatically imported. See [security guidance](SECURITY.md) and [migration notes](MIGRATION.md).

## Compatibility and verification

| Component | Prerelease target |
| --- | --- |
| DeepSeek Harness | Exactly `0.2.0-rc.2` |
| Node.js plugin runtime | `>=22.19.0` |
| Development / CI | Node `22.20.0` or `24`, pnpm `11.7.0` |
| Client | DSH Web native right-sidebar services |
| Desktop cold-start / Better Sidebar coexistence | Not verified |

See [release verification evidence](https://github.com/Lukeknow0/dsh-side-chat/blob/v1.0.0-rc.1/docs/RELEASE-VERIFICATION.md) for the exact checks run. Older phase documents and brand screenshots describe earlier builds; they are not proof of this prerelease's runtime compatibility.

## Build from source

```sh
git clone https://github.com/Lukeknow0/dsh-side-chat.git
cd dsh-side-chat
git checkout v1.0.0-rc.1
pnpm install --frozen-lockfile
pnpm run check
pnpm run pack:release
pnpm run verify:package
```

`check` runs Host/Client typechecking, builds the generated Typert faces and lazy-CJS browser bundle, then runs workspace and plugin tests. `pack:release` creates the versioned archive under `artifacts/`; `verify:package` checks its identity, exports and loader wiring. Neither command publishes npm or installs into a DSH profile. Host/Remote declarations are generated before checking Client self-imports, so a clean checkout needs no cached build output. Signed managed Node runtimes that cannot load third-party native addons can use `NAPI_RS_FORCE_WASI=1 pnpm run check`; the lockfile/workspace includes Rolldown's official optional WASI fallback.

```text
packages/dsh-sidechat/  installable plugin, Host/Client source and tests
packages/.codegen/     type-only Typert analysis shim
tests/                 workspace and release/package contracts
scripts/               installable archive audit and legacy brand renderer
docs/                  migration, verification and historical design evidence
```

[Contributing](https://github.com/Lukeknow0/dsh-side-chat/blob/v1.0.0-rc.1/CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

This independent rewrite does not modify Better Sidebar or copy `dsh-sidenote` source. DeepSeek Harness and Codex are trademarks of their respective owners; this project is not affiliated with DeepSeek or OpenAI.
