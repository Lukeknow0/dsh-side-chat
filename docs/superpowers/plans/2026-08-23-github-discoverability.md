# GitHub Discoverability Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve GitHub and DSH ecosystem discovery for `dsh-side-chat`, and make the bilingual README first screen convert relevant visitors with accurate copy and installation instructions.

**Architecture:** Treat GitHub metadata as the search-index surface and the bilingual README plus generated hero as the conversion surface. Keep implementation behavior untouched; verify text placement and deterministic asset outputs through the existing Vitest sign-contract suite, then mutate and read back GitHub metadata with `gh`.

**Tech Stack:** GitHub repository metadata, Markdown, Python 3 with Pillow, TypeScript/Vitest, GitHub CLI.

## Global Constraints

- Do not change plugin behavior, dependencies, public APIs, release versioning, repository name, homepage, or `package.json`.
- Preserve English/Chinese README parity and the existing visual identity.
- Use the scoped install package `@lukeknow0/dsh-side-chat` everywhere.
- Do not add fabricated usage claims, download counts, testimonials, keyword stuffing, or new badges.
- Preserve unrelated working-tree changes; stage only files named in this plan.

---

### Task 1: Lock the README and hero discovery contract

**Files:**
- Modify: `tests/sign-contract.spec.ts`
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `scripts/render-brand-assets.py`
- Modify: `docs/assets/hero-dark.png`
- Modify: `docs/assets/hero.png`
- Modify: `docs/assets/social-card.png`

**Interfaces:**
- Consumes: the existing `render_hero(size, output)` renderer and `COMMITTED_RENDERER_OUTPUTS` byte-contract map.
- Produces: bilingual first-screen copy and three deterministic hero derivatives containing the scoped npm install command.

- [ ] **Step 1: Add a failing first-screen contract test**

Add this test inside `describe('Parallel Side Branch sign contract', ...)` in `tests/sign-contract.spec.ts`:

```ts
it('keeps first-screen discovery copy and the scoped install command aligned', async () => {
  const [readme, readmeZh, renderer] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../README.zh.md', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/render-brand-assets.py', import.meta.url), 'utf8'),
  ])
  const command = 'dsh plugin --profile web add @lukeknow0/dsh-side-chat'
  const englishQuickInstall = readme.indexOf('## Quick install')
  const chineseQuickInstall = readmeZh.indexOf('## 快速安装')

  expect(readme).toContain('A read-only side chat plugin for DeepSeek Harness (DSH) — inherit completed context, ask temporary questions, and keep the parent agent running.')
  expect(readmeZh).toContain('DeepSeek Harness（DSH）的只读侧边对话插件——继承已完成上下文，处理临时问题，同时保持父智能体继续运行。')
  expect(englishQuickInstall).toBeGreaterThan(readme.indexOf('> **Ask aside. Stay on track.**'))
  expect(englishQuickInstall).toBeLessThan(readme.indexOf('docs/assets/installed-overview-en.png'))
  expect(chineseQuickInstall).toBeGreaterThan(readmeZh.indexOf('> **临时问一句，主任务不跑偏。**'))
  expect(chineseQuickInstall).toBeLessThan(readmeZh.indexOf('docs/assets/installed-overview-en.png'))
  expect(readme).toContain('If Side Chat helps you stay focused, consider giving the project a ⭐ — it helps more DSH users find it.')
  expect(readmeZh).toContain('如果 Side Chat 能让你的主任务保持专注，欢迎点一个 ⭐；这会帮助更多 DSH 用户发现它。')
  expect(readme).toContain(command)
  expect(readmeZh).toContain(command)
  expect(renderer).toContain(`"$  ${command}"`)
  expect(renderer).not.toContain('"$  dsh plugin --profile web add dsh-side-chat"')
})
```

- [ ] **Step 2: Run the focused test and confirm the new contract fails**

Install the locked dependencies in the isolated worktree first:

```bash
pnpm install --frozen-lockfile
```

Expected: installation succeeds without changing `pnpm-lock.yaml`.

Run:

```bash
pnpm exec vitest run tests/sign-contract.spec.ts
```

Expected: FAIL in `keeps first-screen discovery copy and the scoped install command aligned` because the current subtitle and renderer still use the old copy.

- [ ] **Step 3: Update the English first screen**

Replace the centered subtitle in `README.md` with:

```html
<p align="center">
  A read-only side chat plugin for DeepSeek Harness (DSH) — inherit completed context, ask temporary questions, and keep the parent agent running.
</p>
```

Insert this block after the campaign statement and before the first product screenshot:

````markdown
## Quick install

```bash
dsh plugin --profile web add @lukeknow0/dsh-side-chat
```

Restart the running `dsh web` process after installation, then refresh the existing Harness page.
````

Insert this line immediately after the first product screenshot:

```markdown
_If Side Chat helps you stay focused, consider giving the project a ⭐ — it helps more DSH users find it._
```

- [ ] **Step 4: Update the Chinese first screen**

Replace the centered subtitle in `README.zh.md` with:

```html
<p align="center">
  DeepSeek Harness（DSH）的只读侧边对话插件——继承已完成上下文，处理临时问题，同时保持父智能体继续运行。
</p>
```

Insert this block after the campaign statement and before the first product screenshot:

````markdown
## 快速安装

```bash
dsh plugin --profile web add @lukeknow0/dsh-side-chat
```

安装后重启正在运行的 `dsh web` 进程，再刷新现有 Harness 页面。
````

Insert this line immediately after the first product screenshot:

```markdown
_如果 Side Chat 能让你的主任务保持专注，欢迎点一个 ⭐；这会帮助更多 DSH 用户发现它。_
```

- [ ] **Step 5: Correct and regenerate the shared hero assets**

In `scripts/render-brand-assets.py`, replace:

```python
"$  dsh plugin --profile web add dsh-side-chat"
```

with:

```python
"$  dsh plugin --profile web add @lukeknow0/dsh-side-chat"
```

Then run:

```bash
python3 scripts/render-brand-assets.py
```

Expected final line:

```text
Rendered hero-dark.png, hero.png, social-card.png, installed overviews, and supporting brand crops
```

- [ ] **Step 6: Refresh the deterministic hash contract**

Run:

```bash
shasum -a 256 docs/assets/hero-dark.png docs/assets/hero.png docs/assets/social-card.png
```

Replace only the `hero-dark.png`, `hero.png`, and `social-card.png` values in `COMMITTED_RENDERER_OUTPUTS` with the exact hashes printed by that command. Keep the identical hash for `hero-dark.png` and `hero.png` because the renderer copies one to the other.

- [ ] **Step 7: Run focused and full validation**

Run:

```bash
pnpm exec vitest run tests/sign-contract.spec.ts
pnpm run check
git diff --check
```

Expected: the focused suite and full validation pass; `git diff --check` prints no output.

- [ ] **Step 8: Commit only the conversion-surface files**

```bash
git add README.md README.zh.md scripts/render-brand-assets.py tests/sign-contract.spec.ts docs/assets/hero-dark.png docs/assets/hero.png docs/assets/social-card.png
git commit -m "docs: improve GitHub discovery surface"
```

Expected: no unrelated source, test, cache, or package files are staged.

### Task 2: Apply and verify GitHub search metadata

**Files:**
- Modify: none; this task updates repository metadata through GitHub's API.

**Interfaces:**
- Consumes: authenticated `gh` access to `Lukeknow0/dsh-side-chat`.
- Produces: the approved description and exact nine-topic set on the public repository.

- [ ] **Step 1: Push the verified documentation commit**

```bash
git push origin HEAD:main
```

Expected: the remote `main` advances to the verified implementation commit without pushing unrelated local work.

- [ ] **Step 2: Update the description and add the four missing topics**

```bash
gh repo edit Lukeknow0/dsh-side-chat \
  --description 'Read-only side chat plugin for DeepSeek Harness (DSH) — ask temporary questions with inherited context while the parent agent keeps running.' \
  --add-topic coding-agent \
  --add-topic context-management \
  --add-topic dsh-plugin \
  --add-topic read-only
```

The existing topics `ai-coding`, `deepseek-harness`, `developer-tools`, `dsh`, and `side-chat` remain in place.

- [ ] **Step 3: Read the public metadata back**

```bash
gh api repos/Lukeknow0/dsh-side-chat --jq '{description,topics:(.topics|sort),stargazers_count}'
```

Expected description:

```text
Read-only side chat plugin for DeepSeek Harness (DSH) — ask temporary questions with inherited context while the parent agent keeps running.
```

Expected sorted topics:

```text
ai-coding, coding-agent, context-management, deepseek-harness, developer-tools, dsh, dsh-plugin, read-only, side-chat
```

- [ ] **Step 4: Verify the public README commit and working-tree isolation**

```bash
gh api repos/Lukeknow0/dsh-side-chat/commits/main --jq '.sha'
git rev-parse HEAD
git status --short
```

Expected: the two SHAs match. The isolated implementation worktree is clean; the original worktree's unrelated changes remain untouched.

If metadata read-back fails after the mutation, restore the previous metadata before stopping:

```bash
gh repo edit Lukeknow0/dsh-side-chat \
  --description 'Codex-style temporary side conversations for DeepSeek Harness' \
  --remove-topic coding-agent \
  --remove-topic context-management \
  --remove-topic dsh-plugin \
  --remove-topic read-only
```
