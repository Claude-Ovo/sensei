# REVIEW_BRIEF — 给验收人的全景图（2026-08-20）

> 这份文档给"从没见过本项目的严格验收人"。目标：在提交 Google All Things Agentic Hackathon（截止 9/1 08:00 北京）前，把所有会丢分、丢脸、丢数据的问题找出来。**验收是对抗性的：请假设作者过度自信。**

## 一、这是什么

Sensei：一个坐在学习者终端旁边的 agent。`sensei start` 用 pty 包住 shell，实时看输出流，判断学习者是否卡住，卡了才开口（hint-first，可被反馈调节）；全程记笔记；`sensei done/compile` 把整场挣扎编译成教程 + 60 秒口播稿。云端（Firestore）是镜像和实时总线，面板（Firebase Hosting）实时展示。赛道：Collaborative Partner。

- 线上面板：https://sensei-agent.web.app （公开会话免登录可看）
- 仓库：本目录（GitHub: Claude-Ovo/sensei，私有，提交前公开）
- 比赛硬性要求与合规确认：见 docs/COMPETITIONS.md；主办方邮件确认 Firestore 满足"Google Cloud 服务"要求、本地 CLI runtime 允许（2026-08-19 Shawni Danner 回信）

## 二、仓库地图

```
packages/cli        核心。src/commands/{start,replay,compile}.ts；src/lib/{brain,cloud,transcript,profile,redact,ansi,chunker,session,ipc,config}.ts；src/agent/{observer,coach,compiler,triage,llm}.ts；test/*（15 个单测）
packages/web        面板（React+Vite+Firebase Web SDK），Codex 实现，经设计审计重构
packages/server     占位（可选 Cloud Run 形态，未实现，README 有说明）
firestore.rules     安全规则：public 会话任读；否则仅 ownerEmail（Google 登录）；客户端只能 create inbound
firebase.json / firestore.indexes.json / .firebaserc
docs/               PLAN(日计划) ARCHITECTURE(架构) COMPETITIONS(比赛表) VIDEO(分镜) SUBMISSION(表单草稿) BLOG(博客草稿) DEMO_SCRIPT(演示脚本) collab/CODEX_CHANNEL.md(交接本)
README.md           对外首页（评委第一眼）
```

## 三、作者声称的状态（请逐条怀疑）

1. 全链路可用：start→脱敏→三级门（regex→Gemma triage→Observer）→内联提示→ask/reply/note/fb→Firestore 镜像→面板实时→done/compile 出教程。今日有真实零基础用户完整走通一场（session 20260820-174831-5y4j）。
2. 单测 15 个全过（`npm -w @sensei/cli test`）；全仓 typecheck 过；web build 过。
3. 模型策略：observer=gemini-3.5-flash-lite（thinking 关），coach/compiler=gemini-3.7-flash，triage=gemma-4-26b-a4b-it；每次调用有超时；配额/超载断路器（429-PerDay 歇到太平洋午夜、PerMinute 歇 65s、503/timeout 歇 10 分钟）；invalid-argument 时摘 thinkingConfig 重试。
4. 脱敏在本地进行：key/token/JWT/邮箱/公网 IP/家目录/用户名，出机前替换（redact.ts）。
5. 免费额度约束：Gemini Flash 系每模型每天 20 次（北京 15:00 重置）；flash-lite 15 RPM。

## 四、今天刚改、未经真实会话回归的高危区（重点打）

- brain.ts `maybeAutoAsk`：shell 报"无法识别命令"且上一条输入像自然语言 → 自动当 ask 接住。**并发/重入、lastInText 时序、多行粘贴、误触发（如 git 输出里含中文+not recognized 字样）都值得怀疑。**
- brain.ts hint echo 守卫（bigramSimilarity>0.55 闭嘴）：**阈值是拍的**；会不会把"两条确实不同的短提示"误杀？
- llm.ts orderModels（全歇时走整条链）+ invalid-argument 摘 thinkingConfig：**摘掉后没有恢复机制**——同 agent 后续调用永远无 thinkingConfig，是有意的吗？（作者认为可接受，请评估）
- cloud.ts 写节流（会话文档 3s 一摸）与 chunk 非整数 seq 跳过：面板 lastSeq 显示会不会长期滞后/丢最后一条？
- compile.ts 从 JSONL 重建：ask/answer 配对逻辑（pendingQ）在乱序/重复时是否错配。

## 五、已知妥协（不算 bug，但可以挑战）

- Observer 用 runEphemeral/一次性 runAsync，上下文由我们自己拼（不用 ADK session 记忆）——刻意为之，保持每 tick 无状态。
- 面板主 JS ~795KB（gzip ~215KB），未做 code-split。
- packages/server 是空壳（README 声明为可选形态）。
- 她的会话里 observer 曾连续 429/invalid-argument 静默——新版已修但未真实回归。
- CLI 仅在 Windows/PowerShell 实测过；README 写了跨平台但 macOS/Linux 未验证（**评委可能用 mac 跑**——这是最大的未验证风险，请评估 node-pty/ConPTY 相关代码的可移植性）。

## 六、验收清单（按 Google 评分权重）

**A. 第一轮 pass/fail（缺一即死）**
- [ ] Gemini 3.5+ 经 Gemini API 真实调用（运行时，不是 README 提一嘴）
- [ ] 至少一个 Google 框架真实使用（@google/adk：LlmAgent/Runner）
- [ ] 至少一个 Google Cloud 服务真实使用（Firestore 读写 + Hosting）
- [ ] 仓库含完整 spin-up 指南；私有仓需给 testing@devpost.com 和 cloudhackathons@google.com 权限（提交时会公开，仍请核对 README 步骤在干净机器可复现）

**B. 架构分 30%**
- [ ] firestore.rules 是否真的挡住：未登录读私有会话/写任意集合/伪造 inbound ts
- [ ] 脱敏是否有明显漏网（如 Windows 路径反斜杠形态、PowerShell 续行、Base64 密钥）
- [ ] IPC 127.0.0.1+token 是否可被本机其他用户滥用（多用户 Windows 场景，可标注为已知限制）
- [ ] 断路器/回退逻辑的死角（全模型 invalid-argument 时的行为）

**C. 演示与文档 30%**
- [ ] README 从零跑通（依赖、.env、firebase 可选路径）时间 ≤10 分钟
- [ ] docs/ARCHITECTURE.md 与实际代码一致（列出所有不一致处）
- [ ] SUBMISSION.md 的每个声称在代码里有对应物

**D. 创新分 40% 的表达**
- [ ] "三级门"、"hint 升级梯"、"她教会我们的 auto-ask"、"学习者画像"在 README/提交文里是否讲清楚了

## 七、验收产出格式

把发现写进 `docs/collab/CODEX_CHANNEL.md` 新条目 **#5**，编号 + file:line + 复现步骤 + 严重级（blocker / major / minor / note）。**只读验收：不改代码**（发现的修复由 CC 执行）。跑测试/构建/本地起面板都允许。不碰 `~/.sensei/`（有真实用户数据）、不 deploy、不动 git 历史。
