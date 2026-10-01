# v1.0.0-rc.1 Prerelease Implementation Plan

> **For agentic workers:** Execute this approved release plan inline using executing-plans, then request an independent code review. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the independent Side Chat rewrite as `v1.0.0-rc.1` in the existing GitHub repository with its old history intact and a verified installable tarball.

**Architecture:** An independent clone of the existing remote main is the integration base. Import development commit `362fcd16e0388ae1172ead87f9d7067bf399cba2`, retain the scoped distribution identity and internal resource IDs, and publish only after a batched verification and review gate.

**Tech Stack:** Node.js 22.20+/24, pnpm 11.7.0, Node test runner, TypeScript 6, tsdown, DSH Typert generator, Git/GitHub CLI.

## Global Constraints

- Preserve `main` ancestry and old tags; never force-push.
- Package: `@lukeknow0/dsh-side-chat`; version: `1.0.0-rc.1`; Host: exactly `0.2.0-rc.2`.
- GitHub prerelease and `.tgz` distribution only; do not publish npm or mark stable latest.
- Do not modify the original development checkout or any active DSH profile.
- No new UI features or permission behavior; change only release integration/package resolution and supporting tests/docs.
- Keep Desktop cold-start, coexistence and legacy metadata migration limitations explicit.

---

## Task 1: History-preserving source integration

**Files:** Replace old `src/`, `lib/`, obsolete root TypeScript/Vitest configuration and old tests; import `packages/`, workspace TypeScript configs, `pnpm-workspace.yaml`, new tests and dated development documentation. Preserve `LICENSE`, brand assets and old tags.

**Interfaces:** Consume the immutable source commit and existing remote main; produce a workspace rooted at the existing GitHub ancestry.

- [ ] Record approved design and source/base SHAs in the design document.
- [ ] Import only tracked source from `git archive 362fcd16e0388ae1172ead87f9d7067bf399cba2`; do not copy node_modules, credentials, profiles or development tarballs.
- [ ] Delete only resolved, explicitly inspected obsolete runtime paths in the independent clone. Preserve legacy plans and license.
- [ ] Root workspace package provides these scripts:

```json
{
  "test": "node --test tests/*.test.mjs && pnpm --dir packages/dsh-sidechat test",
  "typecheck": "pnpm --dir packages/dsh-sidechat run typecheck",
  "build": "pnpm --dir packages/dsh-sidechat run build",
  "check": "pnpm run typecheck && pnpm run build && pnpm test",
  "pack:release": "pnpm --dir packages/dsh-sidechat pack --pack-destination ../../artifacts",
  "verify:package": "node scripts/check-package.mjs artifacts/lukeknow0-dsh-side-chat-1.0.0-rc.1.tgz"
}
```

## Task 2: Scoped package identity regression

**Files:** `tests/release-contract.test.mjs`, `tests/workspace-layout.test.mjs`, `packages/dsh-sidechat/package.json`, package Cordis patch, client self-import, generator/build identity tests.

**Interfaces:** Distribution name is scoped; resource kinds, storage keys and tab IDs stay `dsh-sidechat`.

- [ ] Add and run a failing release-contract test before modifying manifest/self-imports:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const text = p => readFileSync(new URL(p, import.meta.url), 'utf8')
test('retains the scoped distribution identity for the v1 prerelease', () => {
  const manifest = JSON.parse(text('../packages/dsh-sidechat/package.json'))
  assert.equal(manifest.name, '@lukeknow0/dsh-side-chat')
  assert.equal(manifest.version, '1.0.0-rc.1')
  assert.equal(manifest.engines.dsh, '0.2.0-rc.2')
  assert.match(text('../packages/dsh-sidechat/src/client/index.js'), /@lukeknow0\/dsh-side-chat\/remote/)
})
```

Run: `node --test tests/release-contract.test.mjs`; expected assertion failure for the unscoped source package.

- [ ] Change manifest name/version/metadata and package self-import/Cordis package name only. Update identity assertions and generator selection to the same name. Keep internal native-tab and storage identifiers unchanged.
- [ ] Include README, changelog, migration guide and MIT license in the tarball; audit every declared export after packing.
- [ ] Install with `pnpm install --frozen-lockfile`; expect successful lockfile reuse without local file/link dependencies.

## Task 3: Release documents, CI and artifact audit

**Files:** Root and package README, `README.zh.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `docs/MIGRATION.md`, `.github/workflows/ci.yml`, `.gitignore`, `scripts/check-package.mjs`.

**Interfaces:** Root `pnpm run check` and `pnpm run verify:package` are the same reproducible gates used by CI; package audit receives the `.tgz` path.

- [ ] Publish English/Chinese install/build instructions, breaking changes, scoped package identity and explicit limitations. Do not advertise automatic legacy migration, read-only guarantees, annotation/reflow acceptance or Desktop coexistence.
- [ ] Add CI jobs on Linux/macOS and Node 22.20/24: frozen install, `pnpm run check`, `pnpm run pack:release`, `pnpm run verify:package`.
- [ ] Artifact audit must verify package name/version, required export/type files, scoped Cordis package resolution, lazy-CJS loader ID and no external self-Remote; reject unsafe archive paths, profiles, credentials and machine-specific source paths.
- [ ] Run the entire batch once: typecheck, build, all tests, pack/audit and `git diff --check`. Investigate failures before rerunning affected gates.
- [ ] If available, install the `.tgz` into a disposable DSH 0.2.0-rc.2 profile without exemptions; preserve active profile and report runtime limits.
- [ ] Write SHA-256 checksums from the exact final `.tgz` and release notes stating the evidence and remaining limits.

## Task 4: Independent review and safe publication

**Files:** Final release commit, annotated `v1.0.0-rc.1` tag, GitHub prerelease and assets.

**Interfaces:** New release/main commits descend from remote main; GitHub prerelease links to the verified tag/artifact.

- [ ] Obtain an independent review of packaging, behavior/compatibility boundaries and documentation. Fix verified blockers and rerun impacted tests.
- [ ] Confirm only intended files are staged and no secrets/local profiles are included. Commit with `chore: prepare v1.0.0-rc.1 rewrite prerelease`.
- [ ] Fetch `origin/main`; require it to be an ancestor of the release commit. Stop/reconcile if remote main has advanced incompatibly.
- [ ] Create annotated tag and push normal fast-forward main, release branch and tag (no force).
- [ ] Create release with `gh release create v1.0.0-rc.1 --prerelease --latest=false --verify-tag`, versioned `.tgz`, `SHA256SUMS` and release notes.
- [ ] Verify GitHub `main`/tag, `isPrerelease: true`, and asset names/sizes. Report the release URL and any explicitly unverified runtime scope.
