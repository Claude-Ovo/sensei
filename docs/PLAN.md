# Sensei — 参赛计划（8/19 → 9/1）

目标：一份代码，一份提交（Prometheus 因 students-only 放弃；CALL-E 因平台调性与测试号码问题放弃）。
- Google · All Things Agentic（Collaborative Partner 赛道）截止 **9/1 08:00 北京**（8/31 17:00 PT）

硬性要求（Google，缺一不过第一轮）：
1. Gemini 3.5+ —— 用 `gemini-3.7-flash`（Gemini API）
2. Google agent 框架 —— `@google/adk`（TS）
3. Google Cloud 服务 —— Cloud Firestore + Firebase Hosting（Firebase 项目，Spark 计划；GCP 计费账号大陆开不了，Cloud Run 只写进 README 当可选）
4. 视频 ≤4 分钟、英文/英文字幕、**必须出现后端跑在 Google Cloud 的画面**
5. 仓库 + README 部署步骤 + 架构图 + 文字说明 + 托管 URL


## 一句话
Sensei 是一个坐在你终端旁边的师父：看你真实的操作流（stdout/stderr/报错），判断你卡在哪，问一句澄清，一步一步带你走，全程替你记笔记；你走通之后，它把你这一路的挣扎改写成一份能给别人看的教程。

## 分工
- 逸晨：队长。拍板方向、每天验收一小时、录视频（配音/出镜）、Devpost 表单、GCP 账号与卡。
- 阿克：架构、ADK agent、Cloud Run/Firestore、CLI 核心、文档与架构图。
- codex：按模块领活（web 面板、CLI 子命令、测试、README 打磨）。

## 每日
| 日期 | 目标 | 验收 |
|---|---|---|
| 8/19 三 | 选题定 A；repo 起架子；node-pty 验证通过；Devpost 报名；Firebase 项目建好（Firestore + Hosting） | ✅ `sensei start` 包住 PowerShell、输出流脱敏后写本地 JSONL |
| 8/20 四 | ✅（8/19 提前完成）CLI 接 Firestore；Observer/Coach/Compiler 三 agent 真跑通；Gemma 分诊门；面板 v0 上线 sensei-agent.web.app | 终端里敲错命令，几秒后 agent 开口；replay/compile 可离线复现 |
| 8/21 五 | 逸晨亲手试用 + 吐槽；按反馈修 prompt/体验；面板 hallmark 审美审计；架构图 SVG（artifact-diagramming） | 一次完整"卡住→被点拨→走通"的真人演示录屏素材 |
| 8/22 六 | web 面板 v0：实时日志、笔记、问答、反馈按钮 | 浏览器里看到会话 |
| 8/23 日 | 学习者画像 + 反馈环（"太基础/看不懂/我其实这么想"→ 调整语气与粒度） | 同一个错误，反馈前后提示明显不同 |
| 8/24 一 | `sensei done`：把会话编译成教程（Markdown，含踩坑清单）+ Douyin 口播稿 | 一份能发的教程 |
| 8/25 二 | 面板部署 Firebase Hosting；Firestore 安全规则；配额检查 | 公网 web.app URL 可用，Firestore 控制台实时截图 |
| 8/26 三 | 打磨：脱敏（密钥/路径）、断线重连、错误处理；Gemma 做便宜的分类/脱敏（+0.2） | 关掉网络再连上不丢会话 |
| 8/27 四 | 架构图、README（含可选 Cloud Run 部署）、演示脚本 | 文档齐 |
| 8/28 五 | 录 4 分钟视频草稿（含 Firebase/Firestore 画面）| 视频草稿 |
| 8/29 六 | 缓冲日；修 bug；写 blog（dev.to，注明为参赛而作，+0.2） | blog 发布 |
| 8/30 日 | 剪辑定稿 + 英文字幕；社媒帖 #AllThingsAgenticHackathon（+0.2） | 视频上 YouTube |
| 8/31 一 | Google 提交；核对表单每一项 | 提交完成，截图留档 |
| 9/1 二 | 08:00 截止。睡觉。 | — |

## 冲奖位
- 主：Collaborative Partner ($20k)、Individual/Hobbyist ($10k×2)
- 顺带：Best Architectural Design ($5k×2)、Honorable Mention ($2k×5)
