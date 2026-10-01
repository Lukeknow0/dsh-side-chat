# v1.0.0-rc.1 release verification — 2026-10-01

Package: `@lukeknow0/dsh-side-chat@1.0.0-rc.1`. Target Host: exactly DSH `0.2.0-rc.2`.

The independent rewrite was imported from development commit `362fcd16e0388ae1172ead87f9d7067bf399cba2` into a separate release clone descended from existing main `ba64e40b5279acff0c41a8a37e786b409c5af9f9`. The original development checkout and active DSH profile were not edited.

## Completed local checks

| Check | Evidence |
| --- | --- |
| Frozen lockfile install | pnpm `11.7.0`, success |
| Host/Client typecheck and build | Success; clean Host/Remote generation now precedes Client self-import checking |
| Plugin tests | 253 passed, 0 failed |
| Workspace/release/package contracts | Final 17 passed, 0 failed (including 12 archive fixtures) |
| Total current tests | 270 passed across the two suites |
| Versioned pack | `lukeknow0-dsh-side-chat-1.0.0-rc.1.tgz` |
| Actual archive audit | Passed: 29 entries, 8 runtime/type export targets, scoped Cordis and lazy-CJS loader identity |
| Distribution contents | Runtime/Remote/types, English/Chinese docs, migration/security guidance, MIT and bundled Zod license notices |

The local managed Node `24.21.0` cannot load third-party native Rolldown addons because of macOS Team-ID library validation. Its official lockfile-pinned WASI fallback was used with `NAPI_RS_FORCE_WASI=1`; no signatures, app files or security settings were changed. Expected WASI experimental/CommonJS recommendation warnings are not build failures. CI uses the same checked-in commands on normal Node `22.20.0`/`24` runners.

## Exact final artifact: isolated Web check

The final archive (including the bundled dependency's license notice) was installed through the official app-bundled DSH `0.2.0-rc.2` CLI into a disposable Web profile, without a compatibility exemption. The profile manifest contains the canonical scoped package and bundle layer. pnpm emitted a peer warning for Host-provided peers; the following real cold-start probe verifies Host loading rather than treating installation alone as acceptance.

- Spawned loopback origin: `http://127.0.0.1:55470` (disposed after the finite probe).
- Authentication: the disposable Host's normal one-time login URL and its own cookies; no active-profile credentials were copied or authentication weakened.
- Authenticated HTML: HTTP 200, canonical `@lukeknow0/dsh-side-chat` present in the Client boot graph.
- Unary Remote `sideChat/ping`: HTTP 200; the normal RPC `client-request` envelope yielded `result: { ok: true, value: { ok: true } }`.
- Prompts sent: **0**. Sessions created by the probe: **0**.
- The probe terminated its own spawned Host. The existing `19387` GUI was not replaced or refreshed.

## Explicitly not accepted by these checks

- Desktop cold-start or real Desktop coexistence with Better Sidebar.
- Full real-browser acceptance of this exact prerelease's conversation/model/permission/upload UI. Unit coverage and earlier development Web evidence do not replace that acceptance.
- Automatic import of legacy v0.4 metadata, old fixed read-only guarantees, parked expiry or physical session-log erasure.
- Annotations/answer return as accepted runtime features.

This is why the release is an **RC prerelease**, not stable v1.0.0. SHA-256 for the exact distributed archive is attached to the GitHub Release as `SHA256SUMS`.
