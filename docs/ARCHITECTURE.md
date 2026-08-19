# Sensei — 架构（v0）

```
┌──────────────┐  chunks (stdout/stderr, cmd, cwd)  ┌─────────────────────────────┐
│  sensei CLI  │ ─────────────────────────────────▶ │  server (Cloud Run, Node)   │
│  (node-pty)  │ ◀───────────────────────────────── │  Express + SSE              │
│  wraps shell │  hints / questions (SSE)           │  ├─ Observer agent (ADK)    │
└──────────────┘                                    │  │   gemini-3.7-flash        │
       ▲                                            │  ├─ Coach agent (ADK)       │
       │ ask / reply / note / done                  │  ├─ Compiler agent (ADK)    │
       │                                            │  └─ Redactor (gemma, cheap) │
┌──────────────┐  live session / notes / feedback   │            │                │
│  web panel   │ ◀────────────────────────────────▶ │       Firestore             │
│  (React)     │                                    │  sessions/chunks/notes/     │
└──────────────┘                                    │  questions/feedback/profile/│
                                                    │  tutorials                  │
                                                    └─────────────────────────────┘
```

## 数据流
1. `sensei start` 用 node-pty 起用户的 shell，镜像 I/O 到本地终端，同时把输出按时间/大小切成 chunk（先本地脱敏：token/密钥/邮箱），POST 到 `/sessions/:id/chunks`。
2. server 端 Observer 以防抖（~2s 无新输出 或 检测到 prompt 回显）触发一次 tick：`runEphemeral`，输入 = 最近 N 行 + 当前笔记 + 学习者画像；输出结构化 JSON：`{state, stuck?: {kind, evidence}, hint?: {level, text}, question?: string, note?: string, milestone?: string}`。
3. hint / question 通过 SSE 推给 CLI（内联彩色一行）和 web 面板；用户在 CLI 用 `sensei reply "..."` 或在面板回答。
4. 反馈按钮（helpful / too-basic / wrong / show-me-why）写入 `feedback`，Coach 下一次 tick 读取并调整（画像字段：verbosity, level, preferred style, known concepts）。
5. `sensei done`：Compiler agent 读整段会话（chunks + notes + questions + milestones），产出 `tutorial.md`（目标 / 前置 / 步骤 / 你踩过的坑与修法 / 复盘）+ 60 秒口播稿。

## 为什么符合赛道
- Collaborative Partner：主动引导、问澄清、记笔记、收反馈并调整。
- "actively synthesize / mutate data"：终端流 → 结构化笔记 → 教程；不是只读。
- "messy unstructured streams"：真实 stdout/stderr（ANSI、堆栈、进度条）。
- Beyond chat loop：Observer 是后台异步的，用户不主动问也会被点拨。

## 三件套对应
- Gemini：`gemini-3.7-flash`（Observer/Coach/Compiler），`gemma-3-27b-it`（脱敏/分类，加分）
- 框架：`@google/adk`（LlmAgent + FunctionTool + Runner）
- Google Cloud：Cloud Run（server + web 静态）、Firestore（所有持久化）
