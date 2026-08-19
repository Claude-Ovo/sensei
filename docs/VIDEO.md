# Demo video — storyboard（≤ 4 min，英文字幕，必须出现 Google Cloud 画面）

评委看的是三件事：**摩擦是真的吗 · agent 真的自己在动吗 · 跑在 Google Cloud 上吗**。所以视频不是功能巡礼，是一次真实的学习过程 + 三处"证据镜头"。

## 场景选择：学做一个 MCP server（Node）

理由：是逸晨的真实摩擦（Bring Your Own Friction）；报错真实且有层次（缺依赖 → ESM/CJS → 端口占用 → 握手协议）；和她的抖音教程计划直接接上（sensei done 产出的 60 秒口播稿就是下一条视频的稿子）。

## 分镜（目标 3:30–3:50）

| # | 时长 | 画面 | 旁白（英文，逸晨配音或 TTS） | 证据 |
|---|---|---|---|---|
| 0 | 0:00–0:15 | 黑底白字一句话：*Learning a CLI tool is mostly doing. Nobody watches you do it.* → 切到一个空文件夹的终端 | The friction: you type, it errors, you google, you try again — and when it finally works, the knowledge evaporates. | — |
| 1 | 0:15–0:35 | `sensei start -g "build my first MCP server" --public`，banner 出现；右半屏浏览器开 sensei-agent.web.app，会话出现在列表 | Sensei wraps the shell. Everything is captured, redacted locally, and mirrored to Firestore. | 面板 URL 栏 `sensei-agent.web.app` |
| 2 | 0:35–1:20 | 真的动手：`npm init -y`、装 SDK、写 server.ts、`node server.ts` 报 ERR_MODULE_NOT_FOUND；**几秒后终端里冒出一行 [sensei] 提示**（hint-first：指方向不给答案）；接着又错一次，第二次提示更具体 | It watches the stream and stays quiet until there's evidence I'm stuck. First a nudge, then — because I failed again — the cause. | 终端内联提示 |
| 3 | 1:20–1:45 | `sensei ask "stdio 和 http 我该用哪个"`；Sensei 反问一个澄清问题（或直接回答）；`sensei reply "先 stdio"`；提示随之调整 | It asks before it assumes. | 问答 |
| 4 | 1:45–2:05 | 按 `sensei fb too-basic`；下一条提示明显变短变硬；面板"画像"卡片里 level/verbosity 变了 | Feedback changes how it talks to me — and it remembers across sessions. | 面板画像卡 |
| 5 | 2:05–2:35 | **切到 Firebase 控制台 Firestore 页**：sessions/{id}/chunks、notes、hints 在实时冒出来；再切回面板，笔记/里程碑时间线在动 | Every chunk, note and hint lands in Cloud Firestore in real time; the panel is a pure client of it, hosted on Firebase Hosting. | **Google Cloud 画面 ①②** |
| 6 | 2:35–3:10 | server 终于跑起来（inspector 握手成功）→ `sensei done` → 教程 Markdown 打在终端；面板"编译教程"页签渲染出来，滚到 "Pitfalls we hit" 表和 60 秒口播稿 | The whole struggle — commands, errors, notes, Q&A — compiles into a tutorial with a pitfalls table and a 60-second script. I learned it; now I can teach it. | 教程 |
| 7 | 3:10–3:35 | 架构图（docs/architecture.svg）15 秒：三级门（regex → Gemma → Gemini 3.7 Flash via ADK）、Firestore、Hosting；一句 why-local | Gemini 3.7 Flash through the Google ADK, a Gemma triage gate in front of it, Firestore as the shared brain, Firebase Hosting for the panel. The agent runs beside the terminal because that's where the data — and the key — should live. | 架构 |
| 8 | 3:35–3:50 | 收尾：仓库地址 + 面板地址 + "Sensei — learn it, then teach it." | — | — |

## 录制要点
- 分辨率 1920×1080，终端字号调大（16–18px），面板缩放 110%。
- 终端用 Windows Terminal 深色主题；提示颜色（青/黄/绿）要看得清。
- 场景 2 的报错要**真**：不要事先修好；如果模型开口太慢（>15s），剪辑时压缩等待，但保留"我又敲了一次才被点拨"的时序。
- 场景 5 必须出现 Firebase 控制台的项目名 `sensei-agent` 和 Firestore 文档路径。
- 全程英文字幕（.srt），旁白可中可英；口播 150 词以内一场景。
- 视频结束前 5 秒把架构图静帧多留一会儿。

## 用 video-shotcraft 的部分
- 片头 0（15 秒）与片尾 8（15 秒）、架构图段 7（15 秒）用 Remotion 做 2.5D 运镜 + 卡点；中间 1–6 全部是真实录屏（OBS），只做剪辑与字幕。
- 音乐：轻、无歌词、结尾收干净；音量压在旁白下 -18dB。

## 素材清单
- [ ] 终端录屏（场景 1–4、6），一镜到底再剪
- [ ] 面板录屏（同一时段的第二屏）
- [ ] Firebase 控制台录屏（场景 5）
- [ ] 架构图 SVG → PNG 1920×1080
- [ ] 旁白音轨 + 英文 SRT
- [ ] 片头/片尾 Remotion 渲染
