# v1.0.0-rc.1 prerelease design

## Approved scope

The user selected the `v1.0.0-rc.1` GitHub prerelease approach on 2026-10-01 after considering a stable v1 release and a branch-only upload. This document records that approved approach, not a request for additional functionality.

- Repository: `https://github.com/Lukeknow0/dsh-side-chat`.
- Preserve the existing `main` ancestry and tags, including `v0.4.0`; never force-push.
- Import the independent rewrite from development commit `362fcd16e0388ae1172ead87f9d7067bf399cba2` as new commits descended from the existing remote `main` (`ba64e40b5279acff0c41a8a37e786b409c5af9f9`). The source checkout remains untouched.
- Publish `@lukeknow0/dsh-side-chat@1.0.0-rc.1` with an installable `.tgz`, checksums and release notes as a GitHub prerelease. Do not publish to npm or replace the stable latest release.
- Support exactly DSH `0.2.0-rc.2`. Do not claim support for old 0.1 hosts or for unverified Desktop cold-start/coexistence.
- Do not install into or change the user's active DSH profile.

## Integration design

Use a separate clone of the existing GitHub repository on `release/v1.0.0-rc.1`. Retain license, branding assets and legacy history. Replace the old implementation and tracked build output with the rewrite's self-contained workspace, source and tests. Keep the existing published package name, while retaining the rewrite's internal sidebar/storage identifiers (`dsh-sidechat`) to avoid gratuitous behavioral changes. Update package self-imports, Typert generation, Cordis package resolution and package-identity tests to the scoped published name.

The root becomes a private development workspace. The installable plugin lives under `packages/dsh-sidechat`; root commands provide deterministic build, test, typecheck and tarball verification. CI runs the same commands on Linux/macOS with supported Node versions. Generated bundles and verification profiles are not committed.

## Compatibility and documentation

Document this as a major architectural and compatibility change: native independent conversation tabs replace the legacy overlay/expiry lifecycle; DSH 0.2 APIs replace 0.1 dependencies; permissions follow Host-supported child controls rather than the legacy hard-coded read-only tool boundary. Closing a tab is not session deletion or cancellation. Do not claim automatic migration of old Side Chat metadata. Keep old tags available, but note that old packages require their original compatible Host.

Update English/Chinese README, changelog, contributing/security guidance and a migration guide. Historical plans/evidence and brand assets remain explicitly historical. Annotations/reflow remain development-only, not advertised as an accepted runtime feature.

## Verification and publication gates

1. Add package-identity/release-contract regression tests first and observe expected failures before changing package configuration or self-imports.
2. Install with the checked-in lockfile; typecheck and build the exact release source, then run workspace and all plugin tests.
3. Pack the versioned tarball; audit every runtime/type export, Cordis name, module-loader ID and bundled Remote; exclude local credentials, profiles and machine-specific paths.
4. Exercise installation in a disposable profile when supported, without compatibility exemptions or active-profile changes. Any runtime scope not verified stays prominently documented.
5. Obtain an independent code review and resolve blocking findings. Verify the final diff and artifact checksum.
6. Fetch remote state before publishing. Push only normal fast-forward commits/branches and the new tag. If main changed, reconcile safely; do not overwrite it.
7. Create the prerelease with `.tgz` and SHA-256 assets, then verify its tag, prerelease flag and uploaded assets through GitHub.
