# 黑客松作战表（2026-08-20 04:30 阿克整理）

> 原则：能合规参加 + 有现金 + 和 Sensei 有交集。每条都读过 rules 原文，"不能报"的原因写明，别再翻。
> 时间全部已换算成北京时间。

## 一、已决定参加

### 1. Google · All Things Agentic Hackathon ——【主线】
- 截止：**9 月 1 日（周二）08:00 北京**
- 奖：$180,000 总池；Collaborative Partner 赛道 $20k；**个人/业余组 $10k × 2**（我们真正的目标）；最佳架构 $5k×2；荣誉提名 $2k×5
- 条件：Gemini 3.5+（用 3.7 flash / 3.5 flash-lite ✅）+ Google agent 框架（ADK ✅）+ Google Cloud 服务（Firestore + Firebase Hosting ✅，已发邮件向主办方确认，等回信）
- 交付：仓库 + README + 架构图（已有）+ ≤4 分钟英文字幕视频（含 Firebase 控制台画面）+ 文字说明 + 托管 URL（https://sensei-agent.web.app）
- 加分：博客（已有草稿 docs/BLOG.md）+ 社媒帖 #AllThingsAgenticHackathon + 多接一个 Google 模型（Gemma 已接）
- 状态：已报名 ✅。仓库 github.com/Claude-Ovo/sensei（私有，提交前公开）
- 注意：Gemini 免费层每模型每天 20 次，**北京 15:00 重置**；录视频排在 15:00 之后

### 2. 魔搭 × Intel · Production AI Skills 大赛（第三期）——【国内分身，顺手投】
- 截止：**8 月 31 日 23:59**（魔搭页显示 15:59 为 UTC，按北京 23:59）
- 奖：TOP 10 各 **1000 元现金**（含税）；前 50 名完整提交有周边；入选《AI PC Skills Collections》
- 条件：个人可报，不看学历；做一个能被 Qoder / WorkBuddy / TRAE Work 调用的**本地 Skill**，模型必须纯本地跑（≤35B），推荐 OpenVINO；发到魔搭 Skills 中心（打 AI PC 标签）+ 魔搭研习社写一篇技术文章（Intel AI PC 专题）
- 评分：场景价值 30% / 商用潜力 30% / 工具集成 20% / 文章 10% / 创新 10% / 小红书传播 +5
- 和 Sensei 的交集：把"看终端流 → 判断卡没卡 → 给一句提示"这一层切出来做成本地 Skill（本地小模型做分诊），方向=开发辅助
- 计划：8/25 Google 主体成型后，花 2–3 天切出来投；8/30 前交
- 状态：未报名（魔搭账号要你登一下）
- 链接：https://www.modelscope.cn/events/289

### 3. OpenCV AI Competition 2026 (powered by AWS) ——【备选，10 月】
- 截止：**10 月 27 日 14:59 北京**（10/26 23:59 PT）；报名/提案 8/12 起；9 月初前交提案可申请 $150 云额度（50 个名额）
- 奖：$12,000；一等 $5k / 二等 $3k / 三等 $2k；Best Use of COOL $1k；**Agentic Vision Award $1k**
- 条件：成年即可，"所有国家/地区，标准例外"（无中国排除）；必须用 OpenCV 5 做实质图像/视频分析 + 在 AWS 上跑一个有意义的组件（AWS 开账号要国际卡，这是卡点）；5 分钟视频；技术报告
- 为什么列着：主办方明写欢迎"把 COOL 集成进 Codex / Claude Code / MCP 的开发者 agent"——我们的强项；但要先解决 AWS 账号
- 状态：观望。9 月 Google 交完再决定

## 二、查过、不能报（别再翻）
| 比赛 | 原因 |
|---|---|
| TikTok TechJam 2026 | rules 明写：必须**居住新加坡 + 新加坡大学在读** |
| Prometheus August / September AI Challenge | Students only |
| Agentic Cinema (Google, $75k) | 规则明写排除中国 |
| CALL-E ($10k) | 平台是 AI 外呼/催收（你爸说得对），且不支持 +86 测试号码 |
| GOAI 世界人工智能开源大赛（杭州，500 万池，个人可报）| **初赛 8/16 已截止**，9/22 杭州决赛。明年主场，记日历 |
| Amazon Agents for Humans ($40k) | 大陆可报，但我们没 AWS 账号（同 OpenCV 卡点）；如果解决了卡点，9/15 截止，Strands SDK |
| 腾讯云黑客松·游戏赛 | 高校生 |
| AI Builders / GatewayHacks / Hacksocial / Galuxium / VoltHacks / Hack the Habitat / NextStep / Proof of Possible / GIBC | Devpost 上这一档全是 **Students only** |
| Africa Deep Tech | 仅非洲国家 |
| Rice Urban Sustainability | 美国在校生 |
| Reverie Hacks "$1,302,600" | 额度奖注水 |
| RevenueCat Shipaton ($740k) | 做手机 App 上架（要开发者账号/收款），与 Sensei 不搭，可做可不做 |

## 三、日历
- 8/20–8/24：Sensei 打磨（demo 场景、面板细节、真录一次）；等主办方回信
- 8/25：Google 主体冻结 → 切魔搭 Skill
- 8/27–8/28：录 Google 视频（15:00 后）；写博客
- 8/30：魔搭提交
- 8/31：Google 提交（别拖到 9/1 早上）
- 9/1 08:00：Google 截止
- 9/22–23：GOAI 杭州决赛（看热闹，明年来）
- 10/27：OpenCV（如果做）

## 四、和找工作的关系
不投"岗位名"简历。Sensei 交完 = 一份能给人看的作品；魔搭 TOP10 = 第一笔用作品挣的奖金。拿着这两样去敲小公司/独立开发者/AI 工具工作室。
