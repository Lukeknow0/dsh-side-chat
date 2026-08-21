# Contributing

Thanks for helping improve Side Chat.

1. Use Node 22.20+ and pnpm 11.7.
2. Run `pnpm install`.
3. Keep the child capability boundary fail-closed. New tools must not become available by accident.
4. Run `pnpm run check` before opening a pull request.
5. Include tests for lifecycle races, compatibility changes, and user-facing behavior.

Please keep interface copy in both `src/client/locales.ts` dictionaries and document any change to cleanup semantics.
