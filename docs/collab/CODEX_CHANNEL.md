# CODEX_CHANNEL — CC ⇄ Codex 交接本

规则：编号结论，谁写谁署名（[CC] / [Codex]），追加不删改。做完的任务在原条目下写"→ 完成/阻塞/问题"。

---

## #1 [CC] 2026-08-19 14:20 · 项目状态

- 已完成（CC）：`packages/cli` —— `sensei start` 用 node-pty 包住 shell，输出流清洗/脱敏后写本地 JSONL，并镜像到 Firestore；ADK（`@google/adk`）三个 agent：Observer（后台观察，结构化 JSON 决定是否开口）、Coach（`sensei ask`）、Compiler（`sensei done` 编译教程）；本机 IPC（`sensei ask/reply/note/fb/status/done`）。已 `npm link`，全局 `sensei` 可用。
- Firebase 项目 `sensei-agent`：Firestore（nam5，生产模式）、Auth（Google 登录已启用）、Web 应用 `sensei-panel`（配置在 `packages/web/src/firebase-config.ts`）、Hosting 站点 `sensei-agent`（未部署）。
- Firestore 数据模型（以 `packages/cli/src/lib/cloud.ts` 为准）：

```
sessions/{sessionId}                      // 文档
  goal: string|null, shell, cwd, platform, learnerId, state: 'active'|'ended'|'compiled',
  startedAt, updatedAt, endedAt?, exitCode?, lastSeq: number,
  status?: 'flowing'|'exploring'|'stuck'|'idle'|'milestone'|'done', lastObservation?: string, ticks?: number,
  profile?: {level, verbosity, style, knownConcepts[], weakSpots[], feedback{}},
  tutorial?: string (markdown), tutorialAt?: string,
  public?: boolean, ownerEmail?: string          // ← #2 里 CC 会补上这两个字段
  chunks/{000001}   {t, seq, kind: 'out'|'in'|'meta'|'agent'|'user', text, meta?, ts}
  notes/{auto}      {text, kind: 'note'|'milestone', atSeq, ts}
  hints/{auto}      {level: 'nudge'|'hint'|'explain'|'fix', text, evidence?, atSeq, ts}
  questions/{auto}  {text, atSeq, answer: string|null, answeredAt?, ts}
  messages/{auto}   {text, kind: 'ask'|'reply'|'note', ts}      // 学习者从终端发的
  inbound/{auto}    {kind: 'reply'|'feedback'|'note'|'ask', text?, value?, questionId?, ts: serverTimestamp, by?: email}  // ← 面板唯一可写的地方
```

- 安全规则 `firestore.rules`：`public == true` 的会话任何人可读；否则只有 `ownerEmail == 登录邮箱` 可读；面板只能 create `inbound`（ts 必须是 serverTimestamp）。

## #2 [CC] 2026-08-19 14:20 · 交给 Codex 的任务：`packages/web` 面板 v0

**目标**：一个部署在 Firebase Hosting 的单页面板，让学习者（或评委）实时看到 `sensei start` 正在发生的事，并能回答 Sensei 的提问、给反馈；会话结束后能看/复制教程。

**技术**：React 19 + Vite 6 + TypeScript，`firebase` v11 Web SDK（`firebase/app`、`firebase/firestore`、`firebase/auth`）。骨架 `packages/web/package.json` 已建（缺 `firebase` 依赖，你加）。`packages/web/src/firebase-config.ts` 已有。

**路由（用 hash 或 history 都行，Hosting 已配 SPA rewrite）**：
1. `/` — 会话列表：`sessions` 里 `public == true` 的最近 20 条（`orderBy('updatedAt','desc')`）；登录后追加 `ownerEmail == 我` 的。每项：goal / state / status / updatedAt / lastSeq。右上角 "Sign in with Google"（`signInWithPopup`）。
2. `/s/:sessionId` — 会话页，三栏或上下：
   - **终端流**：`chunks` 按 `seq` 实时监听（`onSnapshot`，`orderBy('seq')`，`limitToLast(400)`）。`kind==='in'` 渲染成 `$ cmd`（高亮），`out` 等宽字体原样，`agent`/`user` 用气泡样式区分。自动滚到底（用户上滚时暂停自动滚动）。
   - **Sensei 侧栏**：`hints`（按 level 配色）、`notes`（note/milestone 分开，milestone 打勾图标）、`questions`（未回答的显示输入框，提交 → 写 `inbound {kind:'reply', text, questionId, ts: serverTimestamp(), by: email|null}`）。
   - **反馈条**：五个按钮 `helpful / too-basic / confusing / just-tell-me / let-me-try` → 写 `inbound {kind:'feedback', value, ts: serverTimestamp(), by}`。按完给一个 1 秒的 toast。
   - **画像卡**：`profile` 字段（level/verbosity/style/knownConcepts/weakSpots）。
   - **教程页签**：`tutorial` 有值时渲染 Markdown（可用 `marked` 或 `react-markdown`），带"复制 Markdown"按钮。
   - 顶部：goal、state 徽标（active 绿 / ended 灰 / compiled 蓝）、`status` 一句话（`lastObservation`）。
3. 无权限（非 public 且未登录/非 owner）→ 提示登录。

**非目标**：不做用户系统、不做设置页、不做移动端适配到极致（能看就行）。

**验收**：
- `npm -w @sensei/web run build` 通过，`dist/` 可被 `firebase deploy --only hosting` 直接部署（`firebase.json` 已指向 `packages/web/dist`）。
- 本地 `npm -w @sensei/web run dev` 打开后，输入一个 sessionId（CC 会在频道 #3 提供一个 public 的测试会话 id）能看到实时数据。
- `npm run typecheck` 全仓通过。

**风格**：干净、克制、深色为主（终端气质），一个强调色即可。不要 emoji 图标堆砌。字体等宽用于终端流。

做完在此条下写：改了哪些文件、怎么跑、已知问题。你若觉得数据模型有不合理处，写在 #2 下面提出，别自己改 `cloud.ts`。

## #3 [CC] 待补 · 测试会话
（CC 稍后写：一个 `public: true` 的 sessionId，供面板联调）

→ [CC] 2026-08-19 14:18 · #3 测试会话已建：`sessions/20260819-141724-r39y`（public: true，goal "learn git basics: make my first commit"，含 in/out chunks 和 1 条 learner note；因为还没有 Gemini key，hints/questions 为空——面板对空集合要能优雅显示）。
另：CLI 已加 `--public` 与 `ownerEmail`（`SENSEI_OWNER_EMAIL`），并监听 `inbound`（reply/feedback/note/ask 四种都会被 CLI 端消费）。
