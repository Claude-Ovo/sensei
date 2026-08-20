# Sensei — 架构（v1，2026-08-19 定稿）

> v0 设想过"server 跑在 Cloud Run"。因为 Google Cloud 计费账号不对中国大陆开放（免费试用国家列表里没有大陆），改为：**agent 在 CLI 本机进程里跑，Firestore 当共享大脑和实时总线，网页面板部署在 Firebase Hosting**。Cloud Run 保留为 README 里的可选部署方式，不做演示。

```
 你的终端                                Google Cloud（Firebase 项目，Spark 计划）
┌────────────────────────────────┐        ┌──────────────────────────────────────┐
│ sensei CLI（Node 24）           │        │ Cloud Firestore                       │
│ ├─ node-pty 包住 shell          │ chunks │  sessions/{id}                        │
│ ├─ 清洗 ANSI + 本地脱敏         │ ─────▶ │   ├─ chunks/{seq}   终端流（脱敏后）    │
│ ├─ Observer agent（ADK，后台）  │        │   ├─ notes/{id}     agent 记的笔记      │
│ │   gemini-3.5-flash-lite       │ hints  │   ├─ questions/{id} 澄清问题 + 回答     │
│ ├─ Coach agent（3.7-flash）     │ ◀───── │   ├─ hints/{id}     提示（等级/正文）    │
│ ├─ Compiler agent（3.7-flash）  │        │   ├─ messages/{id}  学习者→sensei       │
│ └─ Triage 分诊（gemma-4）       │        │   ├─ inbound/{id}   面板→CLI            │
└────────────────────────────────┘        │   └─ tutorial       编译出的教程(字段)  │
        ▲  inline hint / question          └──────────────────────────────────────┘
        │  sensei reply / ask / note / done                 ▲ realtime listeners
        │                                                   │
┌────────────────────────────────┐        ┌──────────────────────────────────────┐
│ 你（在终端里学东西）            │        │ Firebase Hosting：web 面板（React）    │
└────────────────────────────────┘        │  实时日志 / 笔记 / 问答 / 反馈按钮 /   │
                                          │  教程预览与导出                        │
                                          └──────────────────────────────────────┘
```

## 数据流
1. `sensei start` 用 node-pty 起用户的 shell，镜像 I/O 到真实终端；输出按"400ms 安静或 4KB"切 chunk，先本地正则脱敏（key/token/JWT/私钥/邮箱/公网 IP/家目录/运行时 IPC token），写本地 JSONL，同时写 Firestore `sessions/{id}/chunks`；ask/reply/note/goal 等用户文本同样先过脱敏再落盘/上云。
2. Observer 在 CLI 进程里作为后台循环跑：三级门（本地正则 → Gemma 分诊 → Observer）防抖触发（新输出后 ~2.5s 无动静）→ `InMemoryRunner.runAsync` 一次性运行（上下文由我们拼，不用 ADK 会话记忆）；输出结构化 JSON：`{status, confidence, what_happened, stuck_reason, hint?: {level, text}, question, note, milestone, profile_update}`。
3. hint / question 写 Firestore，并在终端里内联打印一行（灰色前缀 `[sensei]`）；用户 `sensei reply "..."` 或在面板里回答。
4. 反馈（helpful / too-basic / confusing / too-deep / just-tell-me / let-me-try）经 IPC 或面板 `inbound` 进来，直接调整本地学习者画像（~/.sensei/profile.json，跨会话），并同步到会话文档的 `profile` 字段。
5. `sensei done`：Compiler agent 读整段会话（chunks + notes + questions + milestones），产出 `tutorial.md`（目标 / 前置 / 步骤 / 踩过的坑与修法 / 复盘）+ 60 秒口播稿，写 Firestore，面板可预览导出。

## 为什么符合 Collaborative Partner
- 主动引导、问澄清、记笔记、收反馈并调整——四件事都在环里。
- "actively synthesize / mutate data"：终端流 → 结构化笔记 → 教程；不是只读。
- "messy unstructured streams"：真实 stdout/stderr（ANSI、堆栈、进度条）。
- Beyond chat loop：Observer 是后台异步的，用户不主动问也会被点拨。

## 三件套对应
- Gemini：`gemini-3.5-flash-lite`（Observer 高频观察，thinking 关）、`gemini-3.7-flash`（Coach/Compiler），带超时+回退+配额断路器；`gemma-4-26b-a4b-it`（分诊门，加分模型）
- 框架：`@google/adk`（`LlmAgent` + zod `outputSchema` + `InMemoryRunner`）
- Google Cloud：Cloud Firestore（全部持久化 + 实时）、Firebase Hosting（面板）；Cloud Run 形态只是 README 提到的可能方向（packages/server 为空壳占位）

## 视频里要出现的 Google Cloud 画面
- Firebase 控制台 Firestore 页：终端一敲命令，chunks/notes 实时冒出来
- Hosting 面板的 `*.web.app` 地址栏
- （如果主办方回信要求更多）Google Cloud Console 里同一项目的 Firestore 页面
