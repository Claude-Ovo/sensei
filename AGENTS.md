# AGENTS.md — Sensei 项目（给 Codex）

这是逸晨的参赛项目（Google "All Things Agentic" 黑客松，Collaborative Partner 赛道，截止 2026-09-01 08:00 北京）。
Claude Code（CC）负责架构、CLI 与 agent 层；你（Codex）负责 CC 在频道里点名交给你的模块。全局 `~/.codex/AGENTS.md` 的红线照旧生效。

## 先读
1. `docs/ARCHITECTURE.md` — 架构 v1（CLI 内跑 ADK agent + Firestore + Firebase Hosting）
2. `docs/PLAN.md` — 每日计划
3. `docs/collab/CODEX_CHANNEL.md` — **交接本**：编号结论，谁写谁署名。你的任务在这里，做完把结果写回这里。
4. `packages/cli/src/lib/cloud.ts` — Firestore 数据模型的唯一事实来源（集合名、字段名以此为准）
5. `firestore.rules` — 面板能读什么、能写什么

## 约定
- 语言：TypeScript，ESM，Node 24，npm workspaces。React 19 + Vite 6（web）。不引入 UI 框架大礼包，能手写就手写；允许小依赖（比如 markdown 渲染）。
- 中文注释可以，用户可见文案默认中文、术语保留英文。
- 别动 `packages/cli/`（CC 的地盘）除非频道里明确让你改；要改就在频道写清楚为什么。
- 不 commit `.env`、service-account、任何密钥。仓库根 `.gitignore` 已配。
- 跑测试/构建：`npm run typecheck`、`npm -w @sensei/web run build`。
- 提交：小步 commit，message 用英文 conventional 风格（`feat(web): ...`）。
- 交叉审查：你也审 CC 的代码。发现问题写进频道（file:line + 复现场景）。
