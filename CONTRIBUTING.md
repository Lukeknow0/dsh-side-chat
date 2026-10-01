# Contributing

1. Use Node `22.20.0` or `24` and pnpm `11.7.0`.
2. Run `pnpm install --frozen-lockfile` from the workspace root.
3. Keep changes in the independent plugin under `packages/dsh-sidechat`; do not copy `dsh-sidenote` source or modify Better Sidebar.
4. Write focused failing regression tests before behavior changes. Preserve parent/child ownership, retry identity and native-tab isolation.
5. Run `pnpm run check`, `pnpm run pack:release`, `pnpm run verify:package` and `git diff --check` before a pull request.
6. Runtime checks must use a disposable profile with normal DSH authentication. Do not copy credentials, bypass compatibility checks or modify an active profile.
7. Keep English/Chinese documentation accurate, including permission and retention changes. UI localization beyond the current Chinese copy requires a separate tested change.

The installable package retains `@lukeknow0/dsh-side-chat`; its internal sidebar/storage IDs remain `dsh-sidechat`. Keep these roles distinct when editing generated Remote imports, Cordis patches or native resource addresses. Generated output, local verification profiles and tarballs are git-ignored. Release publication is GitHub-only unless npm is separately requested.
