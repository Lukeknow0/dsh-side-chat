# GitHub Discoverability Refresh

## Goal

Improve `dsh-side-chat` discovery in GitHub and DSH ecosystem searches, then make the repository's first screen convert relevant visitors more clearly. This change does not alter plugin behavior, dependencies, public APIs, or release versioning.

## Selected approach

Use a metadata-first refresh because GitHub's default repository search indexes the repository name, description, and topics. Pair that with a compact README first-screen update so search impressions lead to a clear value proposition and copyable install command.

## GitHub metadata

Set the repository description to:

> Read-only side chat plugin for DeepSeek Harness (DSH) — ask temporary questions with inherited context while the parent agent keeps running.

Set the topics to this exact deduplicated list:

- `ai-coding`
- `coding-agent`
- `context-management`
- `deepseek-harness`
- `developer-tools`
- `dsh`
- `dsh-plugin`
- `read-only`
- `side-chat`

The repository name and homepage remain unchanged.

## README first screen

Update both `README.md` and `README.zh.md` while preserving their language parity and existing visual identity.

- Replace the English subtitle with: `A read-only side chat plugin for DeepSeek Harness (DSH) — inherit completed context, ask temporary questions, and keep the parent agent running.`
- Replace the Chinese subtitle with: `DeepSeek Harness（DSH）的只读侧边对话插件——继承已完成上下文，处理临时问题，同时保持父智能体继续运行。`
- Insert a `Quick install` / `快速安装` section after the existing campaign statement and before the first product screenshot. It contains `dsh plugin --profile web add @lukeknow0/dsh-side-chat` and the existing restart instruction in the matching language.
- Add one restrained Star call to action immediately after the first product screenshot: `If Side Chat helps you stay focused, consider giving the project a ⭐ — it helps more DSH users find it.` / `如果 Side Chat 能让你的主任务保持专注，欢迎点一个 ⭐；这会帮助更多 DSH 用户发现它。`
- Keep the existing detailed installation section for GitHub and local-checkout alternatives.
- Do not add keyword-stuffed prose, fabricated usage claims, download counts, testimonials, or badges.

The README hero currently renders an incorrect unscoped package name. Update the shared brand-asset renderer to use `@lukeknow0/dsh-side-chat`, then regenerate its deterministic outputs. This necessarily keeps `hero-dark.png`, `hero.png`, and `social-card.png` consistent because all three use the same renderer.

## Verification

- Run the brand-asset renderer and confirm every rendered install command uses the scoped package name.
- Check English and Chinese README first screens for the same value proposition, command, and CTA.
- Run `git diff --check` and `pnpm run check`.
- Read the GitHub repository metadata back after mutation and verify the exact description and topic set.

## Rollback

README and generated-asset changes can be reverted through Git. GitHub metadata can be restored to its previous description and five-topic set recorded in the implementation notes.

## Success signal

The immediate acceptance criterion is correct indexing metadata and a clearer first screen. Star growth remains an observed campaign metric, not a guaranteed result of the metadata change alone.
