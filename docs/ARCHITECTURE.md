# Sensei — 架构（v1，2026-08-19 定稿）

> v0 设想过"server 跑在 Cloud Run"。因为 Google Cloud 计费账号不对中国大陆开放（免费试用国家列表里没有大陆），改为：**agent 在 CLI 本机进程里跑，Firestore 当共享大脑和实时总线，网页面板部署在 Firebase Hosting**。Cloud Run 保留为 README 里的可选部署方式，不做演示。

```
 你的终端                                Google Cloud（Firebase 项目，Spark 计划）
┌────────────────────────────────┐        ┌──────────────────────────────────────┐
│ sensei CLI（Node 24）           │        │ Cloud Firestore                       │
│ ├─ node-pty 包住 shell          │ chunks │  sessions/{id}                        │
│ ├─ 清洗 ANSI + 本地脱敏         │ ─────▶ │   ├─ chunks/{seq}   终端流（脱敏后）    │
│ ├─ Observer agent（ADK，后台）  │        │   ├─ notes/{id}     agent 记的笔记      │
│ │   gemini-3.7-flash            │ hints  │   ├─ questions/{id} 澄清问题 + 回答     │
│ ├─ Coach agent（ADK，问答）     │ ◀───── │   ├─ hints/{id}     提示（等级/正文）    │
│ ├─ Compiler agent（ADK，编译）  │        │   ├─ feedback/{id}  helpful/too-basic… │
│ └─ Redactor（gemma，二次脱敏）  │        │   └─ tutorial       编译出的教程        │
└────────────────────────────────┘        │  learners/{uid}     学习者画像          │
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
1. `sensei start` 用 node-pty 起用户的 shell，镜像 I/O 到真实终端；输出按"400ms 安静或 4KB"切 chunk，先本地脱敏（key/token/邮箱/公网 IP/家目录），写本地 JSONL，同时写 Firestore `sessions/{id}/chunks`。
2. Observer 在 CLI 进程里作为后台循环跑：防抖触发（新输出后 ~2s 无动静，或识别到 prompt 回显）→ `runner.runEphemeral`，输入 = 最近 N 行 + 当前笔记 + 学习者画像 + 目标；输出结构化 JSON：`{state, stuck?: {kind, evidence}, hint?: {level, text}, question?: string, note?: string, milestone?: string}`。
3. hint / question 写 Firestore，并在终端里内联打印一行（灰色前缀 `[sensei]`）；用户 `sensei reply "..."` 或在面板里回答。
4. 反馈（helpful / too-basic / wrong / show-me-why）写 `feedback`，Coach 下一轮读取并调整画像（verbosity / level / style / known concepts）。
5. `sensei done`：Compiler agent 读整段会话（chunks + notes + questions + milestones），产出 `tutorial.md`（目标 / 前置 / 步骤 / 踩过的坑与修法 / 复盘）+ 60 秒口播稿，写 Firestore，面板可预览导出。

## 为什么符合 Collaborative Partner
- 主动引导、问澄清、记笔记、收反馈并调整——四件事都在环里。
- "actively synthesize / mutate data"：终端流 → 结构化笔记 → 教程；不是只读。
- "messy unstructured streams"：真实 stdout/stderr（ANSI、堆栈、进度条）。
- Beyond chat loop：Observer 是后台异步的，用户不主动问也会被点拨。

## 三件套对应
- Gemini：`gemini-3.7-flash`（Observer/Coach/Compiler），`gemma-3-27b-it`（二次脱敏/分类，加分）
- 框架：`@google/adk`（LlmAgent + FunctionTool + Runner）
- Google Cloud：Cloud Firestore（全部持久化 + 实时）、Firebase Hosting（面板）；可选 Cloud Run（README 里给部署脚本）

## 视频里要出现的 Google Cloud 画面
- Firebase 控制台 Firestore 页：终端一敲命令，chunks/notes 实时冒出来
- Hosting 面板的 `*.web.app` 地址栏
- （如果主办方回信要求更多）Google Cloud Console 里同一项目的 Firestore 页面
