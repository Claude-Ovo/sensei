# Sensei — 参赛计划（8/19 → 9/1）

目标：一份代码，两份提交。
- Google · All Things Agentic（Collaborative Partner 赛道）截止 **9/1 08:00 北京**（8/31 17:00 PT）
- Prometheus August AI Challenge（教育工具）截止 **8/29 晚**（rules 写 8/29 23:59，页面写 8/30 14:45 北京；按早的算）

硬性要求（Google，缺一不过第一轮）：
1. Gemini 3.5+ —— 用 `gemini-3.7-flash`（Gemini API）
2. Google agent 框架 —— `@google/adk`（TS）
3. Google Cloud 服务 —— Cloud Run（后端）+ Firestore（数据）
4. 视频 ≤4 分钟、英文/英文字幕、**必须出现后端跑在 Google Cloud 的画面**
5. 仓库 + README 部署步骤 + 架构图 + 文字说明 + 托管 URL

Prometheus：视频 ≤2 分钟 + 仓库；代码窗口 8/17–8/29。

## 一句话
Sensei 是一个坐在你终端旁边的师父：看你真实的操作流（stdout/stderr/报错），判断你卡在哪，问一句澄清，一步一步带你走，全程替你记笔记；你走通之后，它把你这一路的挣扎改写成一份能给别人看的教程。

## 分工
- 逸晨：队长。拍板方向、每天验收一小时、录视频（配音/出镜）、Devpost 表单、GCP 账号与卡。
- 阿克：架构、ADK agent、Cloud Run/Firestore、CLI 核心、文档与架构图。
- codex：按模块领活（web 面板、CLI 子命令、测试、README 打磨）。

## 每日
| 日期 | 目标 | 验收 |
|---|---|---|
| 8/19 三 | 选题定 A；repo 起架子；node-pty 验证通过；Devpost 报名 ×2；GCP 开号 + 领 $150 表单 | `sensei` 能包一个 PowerShell 并把输出流打到本地文件 |
| 8/20 四 | server 骨架：Express + Firestore + ADK agent（observer）；CLI 把 chunk 流上传 | 本地跑：终端里敲错命令，server 日志里看到 agent 的判断 |
| 8/21 五 | 核心闭环：agent 提示 → CLI 内联显示；`sensei ask/reply`；notes 落 Firestore | 一次完整"卡住→被点拨→走通"演示 |
| 8/22 六 | web 面板 v0：实时日志、笔记、问答、反馈按钮 | 浏览器里看到会话 |
| 8/23 日 | 学习者画像 + 反馈环（"太基础/看不懂/我其实这么想"→ 调整语气与粒度） | 同一个错误，反馈前后提示明显不同 |
| 8/24 一 | `sensei done`：把会话编译成教程（Markdown，含踩坑清单）+ Douyin 口播稿 | 一份能发的教程 |
| 8/25 二 | 部署 Cloud Run（server + web 静态）；Firestore 规则；预算告警 | 公网 URL 可用，Cloud Run 面板截图 |
| 8/26 三 | 打磨：脱敏（密钥/路径）、断线重连、错误处理；Gemma 做便宜的分类/脱敏（+0.2） | 关掉网络再连上不丢会话 |
| 8/27 四 | 架构图、README、演示脚本；录 Prometheus 2 分钟版 | 视频草稿 |
| 8/28 五 | 剪辑、英文字幕；Prometheus 提交（不要拖到 29 号） | Prometheus 已提交 |
| 8/29 六 | 缓冲日；修 bug；写 blog（dev.to，注明为参赛而作，+0.2） | blog 发布 |
| 8/30 日 | Google 4 分钟视频（含 GCP 画面）；社媒帖 #AllThingsAgenticHackathon（+0.2） | 视频上 YouTube |
| 8/31 一 | Google 提交；核对表单每一项 | 提交完成，截图留档 |
| 9/1 二 | 08:00 截止。睡觉。 | — |

## 冲奖位
- 主：Collaborative Partner ($20k)、Individual/Hobbyist ($10k×2)
- 顺带：Best Architectural Design ($5k×2)、Honorable Mention ($2k×5)
- Prometheus：一等 $1000
