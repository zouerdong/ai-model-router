# 07 — 官方参数与事实基线

核验日期：2026-08-16
实现状态：`1.5.0` 已公开发布（2026-08-18）：Kimi Code 官方事实已复核，真实 Provider 验收完成（三 Profile `PROVIDER PASS`），HighSpeed 按决策 2 文档化；`1.4.0` 历史发布证据见 `docs/16-v1.4-unified-glm-release.md`
用途：实现者不得用历史对话或记忆替代本文件中的官方来源；开始实现与发布前必须重新核验。

## 1. Kimi K3 Profile

官方来源：[在 Claude Code 中使用 Kimi](https://platform.kimi.com/docs/guide/claude-code-kimi)

当前官方配置：

```text
ANTHROPIC_BASE_URL=https://api.moonshot.cn/anthropic
ANTHROPIC_AUTH_TOKEN=<Kimi API Key>
ANTHROPIC_MODEL=kimi-k3[1m]
ANTHROPIC_DEFAULT_OPUS_MODEL=kimi-k3[1m]
ANTHROPIC_DEFAULT_SONNET_MODEL=kimi-k3[1m]
ANTHROPIC_DEFAULT_HAIKU_MODEL=kimi-k3[1m]
ANTHROPIC_DEFAULT_FABLE_MODEL=kimi-k3[1m]
CLAUDE_CODE_SUBAGENT_MODEL=kimi-k3[1m]
ENABLE_TOOL_SEARCH=false
CLAUDE_CODE_AUTO_COMPACT_WINDOW=1048576
CLAUDE_CODE_EFFORT_LEVEL=max
```

官方还明确说明：

- K3 上下文为 1M。
- `settings.json` 的 `env` 会覆盖终端中同名 `export`。
- Kimi 使用 `ANTHROPIC_AUTH_TOKEN`；旧 `ANTHROPIC_API_KEY` 应避免同时存在。
- 必须完整设置各档位模型，否则后台任务或子 Agent 可能失败。
- `/status` 应显示 Base URL 和 `kimi-k3[1m]`。

### 1.1 `[1m]` 的两层语义

`kimi-k3[1m]` 是 **Claude Code 的模型选择值**，不是 Kimi API 的原生模型 ID。Claude Code 官方模型配置文档明确说明：对支持 1M 上下文的完整模型名追加 `[1m]` 后，Claude Code 会用它选择 1M 上下文，并在向 Provider 发送请求前剥离该后缀。

因此本项目必须同时保持下面两个事实，不能二选一：

```text
CMR 注入、Claude Code /status：kimi-k3[1m]
Claude Code 发给 Kimi API 的 model：kimi-k3
```

官方来源：[Claude Code Model Configuration — Extended context / pinned models](https://code.claude.com/docs/en/model-config)

这也意味着：用手工 HTTP 请求把 `model` 原样写成 `kimi-k3[1m]` 并得到 404，是符合上述协议分层的结果，不能据此判定 CMR Profile 错误。供应商直连冒烟应使用 Kimi 模型列表中的原生 ID `kimi-k3`；CMR 端到端验收仍必须用 `kimi-k3[1m]` 启动 Claude Code，并验证 Claude Code 实际发出的上游 model 为 `kimi-k3`。

模型能力来源：[Kimi K3](https://platform.kimi.com/docs/guide/kimi-k3-quickstart)

价格来源：[Kimi K3 定价](https://platform.kimi.com/docs/pricing/chat-k3)

价格只保存在外部配置并带核验日期，不写死在运行逻辑中。

## 2. DeepSeek Auto Profile

官方来源：[Integrate with AI Tools](https://api-docs.deepseek.com/guides/coding_agents)

当前官方 Claude Code 配置：

```text
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_AUTH_TOKEN=<DeepSeek API Key>
ANTHROPIC_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash
CLAUDE_CODE_EFFORT_LEVEL=max
```

这是 V1 的 DeepSeek Auto 唯一基线。不要自行添加 DeepSeek 官方示例未列出的变量，除非先用官方资料或真实验收证明必要性，并更新本文件。

补充来源：[Anthropic API Compatibility](https://api-docs.deepseek.com/guides/anthropic_api)

- `claude-opus*` 映射到 V4 Pro。
- `claude-sonnet*` 和 `claude-haiku*` 映射到 V4 Flash。
- 不支持的模型名会自动落到 V4 Flash，因此误用未知别名可能静默降低能力。

模型与价格来源：[DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)

- V4 Pro 与 V4 Flash 当前均为 1M 上下文。
- 旧 `deepseek-chat` / `deepseek-reasoner` 计划于 2026-07-24 15:59 UTC 下线；本项目不得使用旧模型名。

## 3. Claude Code 配置事实

官方来源：[Claude Code Model Configuration](https://code.claude.com/docs/en/model-config)

主模型选择优先级为：

1. 会话内 `/model`。
2. 启动参数 `--model`。
3. `ANTHROPIC_MODEL` 环境变量。
4. Settings 中的 `model`。

官方来源：[Claude Code Settings](https://code.claude.com/docs/en/settings)

Settings 范围优先级为 Managed → 命令行 → Local → Project → User。实现者必须考虑项目级或公司 Managed Settings 可能造成的覆盖，并由 `cmr doctor` 报告。

## 4. 2026-07-18 Mac 脱敏快照

本轮实现前只读审计确认：

- 项目目录尚未初始化 Git。
- 项目只有背景讨论文件和 `.DS_Store`，没有代码。
- macOS 上 Claude Code 版本为 `2.1.214`。
- 实际可执行文件为 `$HOME/.local/bin/claude`。
- Node.js 为 `v24.15.0`，npm 为 `11.12.1`。
- Python 为 `3.14.6`，但 V1 选择复用 Claude Code 已要求的 Node.js 环境。
- `~/.claude/settings.json` 的 `env` 当前包含永久 Kimi Base URL、模型映射、上下文与 effort 配置。
- Settings 顶层 `model` 当前为 `kimi-k3`。
- 当前 Kimi 模型值是 `kimi-k3`，与官方当前要求的 `kimi-k3[1m]` 不一致。
- `.zshrc` 中存在 Anthropic 相关永久变量。
- `~/.claude/settings.json` 包含非 Router 管理的敏感配置，当前权限为 `0644`；只读审计未读取或记录其值。
- 任何密钥值均未写入本仓库或本文档。

因此阶段一不能直接在旧配置上叠加启动器。必须先让 `cmr doctor` 证明冲突，再经过用户确认备份并迁移模型相关设置。

## 5. 实现前复核清单

- [x] Kimi Claude Code 页面仍使用相同 Base URL 与模型 ID。
- [x] DeepSeek Claude Code 页面仍使用 Pro/Flash 相同映射。
- [x] Claude Code 当前版本仍支持这些环境变量。
- [x] K3 与 DeepSeek V4 上下文说明未变化。
- [x] 当前价格数据已更新核验日期。
- [x] 新增变量有官方出处；没有用经验补齐。
- [x] `[1m]` 仍由当前 Claude Code 版本在发给 Provider 前剥离；没有在 CMR 中重复实现转换。

独立验收于 2026-07-19 再次完成上述复核；官方映射与仓库配置一致。

发布前于 2026-07-23 再次复核 Kimi、DeepSeek 与 Claude Code 官方页面。两套 Claude Code 映射、Provider Base URL、Bearer 认证方式、1M 上下文和价格均与仓库配置一致；配置记录的 `verifiedOn` 已更新为本次核验日期。

## 6. `1.1.0` 首次设置事实与官方入口

本节为已验收的 `1.1.0` setup 提供来源；`1.0.0` 历史基线尚未包含向导。

2026-07-19 实施复核：Kimi API 文档与控制台、DeepSeek API 文档与控制台、Claude Code 安装文档均已重新打开；本候选版本使用的 API Key 入口 URL 未发生需要改写的变化。

### 6.1 API Key 创建入口

- Kimi API 概述：[认证与 API Key 安全说明](https://platform.kimi.com/docs/api/overview)
- Kimi 官方控制台：[API Keys](https://platform.kimi.com/console/api-keys)
- DeepSeek API Reference：[Bearer Authentication](https://api-docs.deepseek.com/api/deepseek-api/)
- DeepSeek 官方控制台：[API Keys](https://platform.deepseek.com/api_keys)
- DeepSeek Claude Code 接入：[接入 Agent 工具](https://api-docs.deepseek.com/zh-cn/guides/coding_agents/)

截至 2026-07-19，Kimi 与 DeepSeek 官方文档都要求用户先在各自平台创建 API Key，并通过 Bearer/`ANTHROPIC_AUTH_TOKEN` 使用。向导只能显示上述官方 URL；不得代理账号登录、创建 Key、充值或把 Key 发送到 CMR 自有服务。

Provider 配置已增加：

```json
{
  "apiKeyUrl": "https://<official-provider-console>/api-keys"
}
```

该值属于可变外部事实，实施与发布前必须重新打开官方文档中的控制台链接确认。只允许 `https:` 绝对 URL；不得使用搜索结果页、短链、第三方教程或联盟链接。

### 6.2 Claude Code 安装入口

Claude Code 当前官方推荐安装方式与平台要求见：[Claude Code Advanced setup](https://code.claude.com/docs/en/installation)。官方排错文档明确列出 Windows 原生安装目标为 `%USERPROFILE%\.local\bin\claude.exe`。CMR setup 只检查 `claude` 是否可发现并显示官方文档链接，不自行下载、执行安装脚本或修改 PATH。

Claude Code 的安装方式已经从旧版“只依赖全局 npm 包”演进为原生安装、Homebrew、WinGet 与 npm 等多种方式。因此 CMR 的首次设置不能把 `npm root`、某个固定 Claude 路径或 `@anthropic-ai/claude-code` 是否存在当作唯一成功条件；继续使用 `platform.js` 的可执行文件发现边界。

`1.2.1` 仍优先使用 PATH，只在 Windows PATH 未找到 Claude 时检查上述官方原生目录。来源：[Claude Code 安装与登录排错](https://code.claude.com/docs/en/troubleshoot-install)。该后备查找不安装、更新或修改 PATH。

### 6.3 为什么不用 npm 安装生命周期收集 Key

npm 官方文档：

- [Scripts / Lifecycle Operation Order](https://docs.npmjs.com/cli/using-npm/scripts/)
- [`foreground-scripts` 与 `ignore-scripts`](https://docs.npmjs.com/cli/v11/commands/npm-run/)
- [`npm install` 配置](https://docs.npmjs.com/cli/install/)

官方合同表明安装脚本可以不在前台共享标准输入输出，并可被 `ignore-scripts` 或脚本审批策略跳过；同一生命周期还会在 install/ci/升级等上下文出现。因此 `preinstall/install/postinstall` 不是稳定的凭据输入界面。CMR 的 Key 配置必须发生在用户主动运行的交互式 `cmr`/`cmr setup` 中。

### 6.4 在线 Key 验证事实

Kimi 官方列出 `GET https://api.moonshot.cn/v1/models`，DeepSeek 官方列出 `GET https://api.deepseek.com/models`，二者理论上都可用于非生成式鉴权检查：

- [Kimi API 端点一览](https://platform.kimi.com/docs/api/overview)
- [DeepSeek Lists Models](https://api-docs.deepseek.com/api/list-models/)

`1.1.0` 首版仍明确不调用这些接口。原因不是接口不存在，而是当前项目没有统一的代理、证书、超时与网络故障分类层；自动网络检查可能在公司环境中把有效 Key 误报为无效。若后续增加显式网络验证，必须先更新产品范围与架构，并保证不发起模型生成请求、不记录响应正文或 Key。

## 7. `1.3.0` GitHub Release 与 npm 自更新事实

核验日期：2026-07-24。以下页面在自更新实现与发布前重新打开；GitHub Release、immutable policy 与公开下载均已按这些机制完成。

- [GitHub About releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)：Release 是基于 Git tag 的可分发软件迭代，并可附带手工资产。
- [GitHub Linking to releases](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases)：`/releases/latest` 指向最新 Release，固定手工资产可使用 `/releases/latest/download/<asset-name>`。
- [GitHub Managing releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)：Release 可先创建 draft、附加资产后发布。
- [GitHub Immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)：immutable Release 发布后保护关联 tag 与资产；官方建议先以 draft 准备完整资产。
- [npm install](https://docs.npmjs.com/cli/v11/commands/npm-install)：npm 支持从 tarball URL 或本地 tarball 安装，并提供 `--prefix`、`--ignore-scripts` 等选项。
- [npm pack](https://docs.npmjs.com/cli/v11/commands/npm-pack)：`npm pack` 可对 package spec 生成 tarball，并以 JSON 输出 pack metadata。
- [npm folders](https://docs.npmjs.com/cli/v11/configuring-npm/folders)：global package 与 bin 在 Unix/Windows prefix 下具有不同目录结构。
- [npm prefix](https://docs.npmjs.com/cli/v11/commands/npm-prefix) 与 [npm config](https://docs.npmjs.com/cli/v11/using-npm/config)：`npm prefix --global` 和 npm 配置只描述 npm 当前配置上下文，不能替代从活动命令入口识别安装的逻辑。

运行时只使用固定 canonical asset URL：

```text
https://github.com/zouerdong/ai-model-router/releases/latest/download/claude-model-router.tgz
```

不使用 GitHub REST Release API、`main`、最高 tag 猜测、npm registry `latest` 或用户提供的任意 URL。实现与发布前仍需用临时 prefix、固定资产和 checksum 验证实际候选包。

## 8. `1.3.0` 实现状态

状态：**PASS — `1.3.0` RELEASED**。运行时严格使用本节 canonical asset URL；`v1.3.0` tag、固定资产、checksum、immutable 发布、exact/latest 下载、临时 prefix bootstrap 与公开 `cmr update --check` 均已通过。npm 默认 cache、prefix 与配置事实仅用于理解 npm 行为，不被 updater 当作当前活动 CMR 安装的唯一真相源。完整发布证据见 `docs/13-v1.3-self-update-implementation-brief.md` 第 19 节。

## 9. Windows T4 托管验收事实

核验日期：2026-07-24。

- [GitHub-hosted runners reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)：标准 `windows-2025` runner 是 GitHub 托管的全新 Windows x64 VM，可提供实际 Windows OS、文件系统和 shell 语义。
- [GitHub Actions billing and usage](https://docs.github.com/en/actions/concepts/billing-and-usage)：公开仓库使用标准 GitHub-hosted runner 免费。
- [Windows 11 Arm ISO overview](https://learn.microsoft.com/en-us/windows/arm/iso)：Apple Silicon Mac 也可运行 Windows 11 Arm64 VM，但本项目优先选择可重复、无需维护本地 VM 的 GitHub-hosted x64 runner。

T4 的本质约束是测试必须运行在实际 Windows OS 中，而不是必须使用物理 Windows 电脑。有效证据包括物理机、本地 Windows VM 或 GitHub-hosted Windows VM；macOS 上仅注入 `platform: "win32"` 无效。

2026-07-24 实施结果：GitHub Actions [run 30094641599](https://github.com/zouerdong/ai-model-router/actions/runs/30094641599) 在 `win25-vs2026` image `20260714.173.1`、Windows NT `10.0.26100.0`、AMD64 上通过；矩阵为 Node `18.20.8`/npm `10.8.2` 与 Node `24.18.0`/npm `11.16.0`，Git 均为 `2.55.0.windows.2`。两档均通过 PowerShell 全回归与 PowerShell/CMD/Git Bash T4 E2E。英文 README 的最终 release commit `515d7160055c53ab76c10dc9967c5950e139ab82` 又由 [run 30095977923](https://github.com/zouerdong/ai-model-router/actions/runs/30095977923) 复跑两档 Windows 矩阵并全绿。

## 10. GLM-5.2 Coding Plan 事实（2026-07-28 发布复核）

状态：**OFFICIAL FACTS RECHECKED FOR `1.4.0` RELEASE**。

绑定实施合同：`docs/14-v1.4-glm-5.2-coding-plan-implementation-brief.md`。

### 10.1 Coding Plan Claude Code 接入

主来源：[智谱 Claude Code 接入](https://docs.bigmodel.cn/cn/guide/develop/claude)。

当前中国区配置：

```text
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
ANTHROPIC_AUTH_TOKEN=<GLM Coding Plan Key>
ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.2[1m]
ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.2[1m]
ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-4.7
CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
API_TIMEOUT_MS=3000000
```

Key 与套餐来源：

- [Coding Plan 快速开始](https://docs.bigmodel.cn/cn/coding-plan/quick-start)
- [Coding Plan FAQ](https://docs.bigmodel.cn/cn/coding-plan/faq)

个人版从个人编程套餐概览创建 Key；团队成员使用团队套餐 Key，且官方明确团队套餐 Key 与平台其他 API Key 不通用。Coding Plan 只允许官方支持的工具/产品。2026-07-28 复核标准 API 错误码后发现，1316–1321 已列出与余额、子账号或企业消费上限有关的“无法使用超额按量付费”情形；具体套餐是否允许超额及其费用规则以用户账户和官方当日规则为准。CMR 不探测、配置或自动切换该机制。

### 10.2 标准 API 与 Coding Plan 不能合并

标准 API 来源：

- [智谱 Claude API 兼容](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction)
- [智谱标准 API 快速开始](https://docs.bigmodel.cn/cn/api/introduction)
- [Claude Code Authentication](https://code.claude.com/docs/en/team)
- [Claude Code Environment Variables](https://code.claude.com/docs/en/env-vars)

标准 Claude 兼容 API 也给出 `https://open.bigmodel.cn/api/anthropic`，但建议 `ANTHROPIC_API_KEY`。Claude Code 当前语义为：

```text
ANTHROPIC_AUTH_TOKEN -> Authorization: Bearer
ANTHROPIC_API_KEY    -> X-Api-Key
```

相同 Base URL 不证明凭据、账单或额度通道相同。`1.4.0` 候选只实现 Coding Plan `glm`；标准按量 API 不得作为隐藏 fallback，后续若实现必须使用独立显式 Profile。

### 10.3 模型与价格

来源：

- [GLM-5.2 模型页](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.2)
- [智谱产品价格](https://bigmodel.cn/pricing)
- [Claude Code Model Configuration](https://code.claude.com/docs/en/model-config)

当前事实：

```text
Provider 原生模型 ID=glm-5.2
上下文=1000000 tokens
最大输出=128K tokens
标准 API 缓存命中=2 CNY/M tokens
标准 API 普通输入=8 CNY/M tokens
标准 API 输出=28 CNY/M tokens
```

`glm-5.2[1m]` 是 Claude Code 选择层值，标准 API 原生模型仍为 `glm-5.2`。Pricing 配置只能标为标准 API 参考，不能用于估算 Coding Plan 的精确费用或剩余额度。

### 10.4 已知文档冲突

智谱完整 Claude Code 指南当前使用 `glm-4.7` 作为 Haiku 映射；另一个“如何切换模型”页面仍出现 `GLM-4.5-Air`/`glm-4.5-air`。本候选以完整 Claude Code 指南的小写 `glm-4.7` 为主基线。实施与发布前必须重查；若主指南变化则先更新本文与实施合同，若冲突无法从官方来源消解则阻断真实 Provider PASS。

当前完整配置未列出 `ANTHROPIC_MODEL`、Fable、Subagent、Effort 或 Tool Search 变量。候选实现未凭 Kimi/DeepSeek 经验补齐；真实验收发现问题时先更新事实与规格。

## 11. GLM 标准 API 按量付费事实（2026-07-28 发布复核）

状态：**OFFICIAL FACTS RECHECKED FOR `1.4.0` RELEASE**。

绑定实施合同：`docs/15-v1.5-glm-standard-api-payg-implementation-brief.md`。以下为官方事实；`glm-api` 复用 Coding Plan 模型/运行映射是本合同的受约束设计推断，不是官方单独发布的一份完整 Profile。

### 11.1 标准 Anthropic 兼容鉴权

主来源：[智谱 Claude API 兼容](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction) 与 [Claude Code Environment variables](https://code.claude.com/docs/en/env-vars)。2026-07-28 重新打开后，二者共同支持：

```text
Anthropic-compatible Base URL=https://open.bigmodel.cn/api/anthropic
智谱标准 API Key 环境变量=ANTHROPIC_API_KEY
智谱兼容 Messages 请求 Header=x-api-key
Claude Code ANTHROPIC_API_KEY -> X-Api-Key
Claude Code ANTHROPIC_AUTH_TOKEN -> Authorization: Bearer <value>
```

因此标准 API 必须拥有独立的 `glm-api` Provider、Profile 和 Secret Store 槽位；共享 Base URL 不允许把标准 API Key 与 Coding Plan Key 放进同一槽位或同一子进程鉴权集合。标准 API Key 页面为 [智谱标准 API Keys](https://bigmodel.cn/usercenter/proj-mgmt/apikeys)。

### 11.2 模型、选择层与费用

来源：[GLM-5.2 模型页](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.2)、[GLM-4.7 模型页](https://docs.bigmodel.cn/cn/guide/models/text/glm-4.7)、[Claude Code Model configuration](https://code.claude.com/docs/en/model-config) 与 [智谱产品价格](https://bigmodel.cn/pricing)。实施日复核结果：

```text
GLM-5.2 native ID=glm-5.2; context=1,000,000; maximum output=128K
GLM-4.7 native ID=glm-4.7; context=200,000; maximum output=128K
GLM-5.2 standard API input=8 CNY/M; output=28 CNY/M; cache hit=2 CNY/M
GLM-5.2 cache storage=限时免费（活动事实，不能作为长期承诺）
```

Claude Code 将 `[1m]` 用于 Opus/Sonnet 的 1M 选择层，并在向 Provider 发送 model ID 前剥离该后缀。故候选环境使用 `glm-5.2[1m]`，而上游标准 API model 仍为 `glm-5.2`。

### 11.3 受约束推断与非目标

智谱标准 Claude API 兼容页明确提供标准 API 的 Base URL、Key 与 native model；完整 Claude Code 指南明确现有 Opus/Sonnet/Haiku、compact、traffic 和 timeout 映射。本候选仅据此复用相同映射，并将鉴权边界替换为标准 API Key。真实标准 API 验收必须在用户逐项授权后，验证直连、`cmr glm-api` 主请求、工具、子 Agent 与费用明细；结果不符合时先更新本文件与 `docs/15`，再改实现。

CMR 不发起 Key 类型检测、余额/用量查询、费用估算、Plan 超额按量设置、自动 fallback 或认证重试。标准 API 的 401/403/429 与 Coding Plan 的 1316–1321 等错误都按 Claude Code/Provider 原样失败；用户通过 `cmr glm` 或 `cmr glm-api` 显式决定费用通道。

## 12. `1.5.0` Kimi Code 会员 Provider 事实（2026-08-12 任务卡 1 复核）

本节只使用 Kimi/Moonshot 与 Claude Code 官方页面。它把可变事实、设计推断和页面冲突分开记录；没有真实 Kimi Code Key，本节不构成 Provider 可用性或额度归属验收。

### 12.1 当前 Kimi Code 官方产品事实

主来源：

- [Kimi Code Overview](https://www.kimi.com/code/docs/en/)
- [Kimi Code — Claude Code](https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html)
- [Kimi Code Model Configuration](https://www.kimi.com/code/docs/en/kimi-code/models.html)
- [Kimi Code Membership Benefits](https://www.kimi.com/code/docs/en/kimi-code/membership.html)
- [Kimi Code FAQ](https://www.kimi.com/code/docs/en/kimi-code/faq.html)
- [Kimi Code Community Guidelines](https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html)

官方当前将 Kimi Code 定义为 Kimi 会员权益中的开发者编程服务，并允许会员在 Kimi Code Console 创建 API Key 供第三方工具使用。Anthropic-compatible Base URL 为：

```text
https://api.kimi.com/coding/
```

当前官方 Claude Code 接入页为 K3-256K 与 K3-1M 直接给出的完整环境变量如下：

```text
ANTHROPIC_BASE_URL=https://api.kimi.com/coding/
ANTHROPIC_API_KEY=<Kimi Code Console API Key>
ANTHROPIC_MODEL=<profile model>
ANTHROPIC_DEFAULT_FABLE_MODEL=<profile model>
ANTHROPIC_DEFAULT_OPUS_MODEL=<profile model>
ANTHROPIC_DEFAULT_SONNET_MODEL=<profile model>
ANTHROPIC_DEFAULT_HAIKU_MODEL=<profile model>
CLAUDE_CODE_SUBAGENT_MODEL=<profile model>
CLAUDE_CODE_EFFORT_LEVEL=high  # K3 / K3-256K 配置
CLAUDE_CODE_AUTO_COMPACT_WINDOW=<context limit>
CLAUDE_CODE_MAX_CONTEXT_TOKENS=<context limit>
```

Kimi Code 官方页没有要求为这条接入默认增加 `ENABLE_TOOL_SEARCH=false`。Claude Code 官方说明：当 `ANTHROPIC_BASE_URL` 指向非 Anthropic 一方主机时，MCP Tool Search 默认禁用；只有代理确实转发 `tool_reference` blocks 时，才可显式设置 `ENABLE_TOOL_SEARCH=true`。因此 CMR 候选不自行补齐 Tool Search 变量。

同一接入页列出了 `kimi-for-coding` 的模型 ID、256K 上下文和会员档位，但没有提供它的第三套完整 Claude Code 环境示例。候选 `kimi-code` Profile 将官方 K2.7 模型/上下文事实代入同一套 Claude Code 前后台映射，并不额外注入 effort；这是为了避免后台任务回落的受约束设计推断，不是官方已经发布的完整 Profile，仍须真实 Provider 验收。

### 12.2 三个首批模型、上下文和最低会员档位

| Kimi Code Model ID | 官方产品含义 | 最低已知会员档位 | 上下文事实 | Claude Code 选择层 |
|---|---|---|---:|---|
| `kimi-for-coding` | Kimi K2.7 Code 标准版 | 所有 Kimi 会员（Andante 起） | `262144` | `kimi-for-coding` |
| `k3-256k` | Kimi K3 256K 版本 | Moderato 及以上 | `262144` | `k3-256k` |
| `k3` | Kimi K3 | Moderato 及以上；Allegretto 及以上解锁最高 1M | `1048576`（Allegretto+） | `k3[1m]` |

同一官方 Claude Code 页同时给出了档位矩阵：Andante 只列 `kimi-for-coding`；Moderato 列 `k3`、`k3-256k`、`kimi-for-coding`；Allegretto 及以上再列 `kimi-for-coding-highspeed`，并将 K3 的上限提升到 1M。`k3[1m]` 只用于 Claude Code 环境变量；Kimi Code API 请求和其他第三方工具使用原生 `k3`。因此 CMR 必须保留两层值，不得在 Router 中重复剥离后缀。

K3/K3-256K 的完整映射是官方接入页的直接事实：主模型、Opus、Sonnet、Haiku、Fable 和 Subagent 都使用同一个候选模型，并设置 `CLAUDE_CODE_EFFORT_LEVEL=high`。Kimi 官方还说明 K3 支持 `low/high/max`，K2.7 Code 系列保持 Thinking 开启。`CLAUDE_CODE_MAX_CONTEXT_TOKENS` 在官方 256K 与 1M 示例中与 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 同值出现，故 `1.5.0` 候选将其纳入 Router 管理变量；`kimi-for-coding` 的完整映射则按上一段明确标为受约束推断。任务卡 2 已实现该变量的清理与回注，任务卡 3–7 已完成隔离回归。

2026-08-18 回读增量（[Model Configuration](https://www.kimi.com/code/docs/en/kimi-code/models.html)，其中 k3-256k 推荐说明晚于 2026-08-12 事实快照）：

- 官方在 k3-256k 推荐说明中标注 `k3`（1M）消耗额度约为 `k3-256k` 的 2 倍；同一说明建议切换模型前先 compact 并开新会话，且 256K→1M 方向切换不影响缓存。
- 官方使用说明明确：K3/K2.7 Code 关闭 Thinking 时请求会被路由到 K2.6；K2.6 没有独立模型 ID，会员通道无法显式选择。
- `kimi-for-coding` 相对 K3/K3-256K 的会员额度倍率未在官方页面公布；官方已公布的分模型速率仅 HighSpeed 的 3 倍额度（见 §12.5 冲突表）。

### 12.3 会员额度、滚动窗口和 Extra Usage

Kimi Code 官方会员页给出以下事实：

- 额度从订阅日期起每 7 天自动刷新，未用额度不结转。
- 除周额度外，还有独立的滚动 5 小时限流窗口；短时间请求过多会触发限流，窗口滚动后恢复。
- 已登录设备和 API Key 共用额度；Kimi 会员月度总额度耗尽时，Kimi Code 额度可能被冻结。
- 订阅用户可以显式开启 Extra Usage；Kimi Web 与 Kimi Code 共用该余额，订阅额度耗尽后才按实际用量从 Extra Usage 扣除。
- Extra Usage 支持用户设置月度支出上限；官方说明未设置时没有上限。余额可累积且不自动过期；退款等账户规则以平台当日说明为准，CMR 不作承诺。
- 官方使用说明还给出约 300–1,200 次请求/5 小时、最多 30 个并发的产品级概览数字；该数字会变动，不进入 CMR Schema、提示或费用计算。

官方 [Kimi Code Community Guidelines](https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html) 将订阅限定为个人交互式使用，允许通过 Claude Code 等主流工具调用，但不允许非交互式批处理、转售账号/API 或将能力包装为服务；企业集成和商业服务应转向 Kimi Platform。CMR 因此只能文档化使用边界，不以代码强行推断用户场景，也不自动开启 Extra Usage、读取余额、估算费用、切换额度通道或在错误后 fallback。

### 12.4 Claude Code 鉴权、模型和 Fast mode 事实

主来源：[Claude Code Authentication](https://code.claude.com/docs/en/team)、[Environment variables](https://code.claude.com/docs/en/env-vars)、[Model configuration](https://code.claude.com/docs/en/model-config)、[Commands](https://code.claude.com/docs/en/commands) 与 [Fast mode](https://code.claude.com/docs/en/fast-mode)。

- `ANTHROPIC_API_KEY` 由 Claude Code 发送为 `X-Api-Key`；`ANTHROPIC_AUTH_TOKEN` 的值会被加上 `Bearer ` 后发送为 `Authorization`。认证优先级中 `AUTH_TOKEN` 高于 `API_KEY`，所以 Kimi Code 子进程必须只有 API Key 这条鉴权变量，Kimi 开放平台子进程必须只有 Auth Token。
- `ANTHROPIC_BASE_URL` 改变请求发送端点，不负责决定模型；CMR 仍通过数据化 `ANTHROPIC_MODEL` 与各档位环境变量注入模型选择值。
- Claude Code 当前模型选择优先级是会话内 `/model`、启动参数 `--model`、`ANTHROPIC_MODEL`、Settings。`--model` 和环境变量只作用于本次启动；交互式 `/model <name>` 或 picker 的 Enter 会把选择写入用户 Settings，作为后续新会话默认，picker 的 `s` 才只切换当前会话。CMR 继续把这些参数作为 opaque argv，不解析、不记录、不改写，但必须记录 `/model` 的持久化风险。
- `ANTHROPIC_CUSTOM_MODEL_OPTION` 只是在 Claude Code `/model` picker 增加一个自定义选项；它不等于 CMR 的 Provider/Profile 注册，当前候选不引入它。
- Kimi Code 官方接入页把 `/status` 的 Base URL 作为成功判据，并明确模型栏仍可能显示 Claude 名称。静态环境快照可证明选择层配置，但真实上游模型 ID 必须通过 Provider/协议证据验证，不能只凭 `/status` 文案判定。
- Claude Code `/fast` 当前是 Anthropic Opus 5/4.8 的研究预览快速配置，不是单独模型；启用时若当前模型不受支持会自动切到 Opus 5，交互式启用默认跨会话持久化。网关/代理下的资格检查直接请求 `api.anthropic.com`，不跟随 `ANTHROPIC_BASE_URL`，网关 Key 可能导致检查失败；跳过客户端检查也不证明上游支持。Kimi Code 的 `kimi-for-coding-highspeed` 是独立模型 ID，不能把 `/fast` 当成该模型的入口或可用性证据。

### 12.5 Kimi 新旧/不同产品页面冲突登记

以下页面均为官方页面，但不能作为一套环境变量或模型映射拼接：

| 冲突 | 官方页面证据 | 处理 | 级别 |
|---|---|---|---|
| Kimi Code 当前页与旧/开放平台 Claude Code 页的通道、鉴权和模型 ID 不同 | 当前 [Kimi Code Claude Code](https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html) 使用 `api.kimi.com/coding/`、`ANTHROPIC_API_KEY`、`kimi-for-coding`/`k3`；[Kimi 开放平台 Claude Code](https://platform.kimi.com/docs/guide/claude-code-kimi) 使用 `api.moonshot.cn/anthropic`、`ANTHROPIC_AUTH_TOKEN`、`kimi-k3`，并仍出现 `kimi-k2.7-code`/旧 HighSpeed 命名 | 由产品边界消解：前者只绑定 `kimi-code`，后者只绑定既有 `kimi`；任何交叉使用均阻断实现 | Blocker |
| Kimi Code 显式模型切换与 Claude Code `/fast` 的高速语义不同 | Kimi Code [Model Configuration](https://www.kimi.com/code/docs/en/kimi-code/models.html) 将 `kimi-for-coding-highspeed` 作为独立 Model ID、标为约 6 倍速度与 3 倍额度；Claude Code [Fast mode](https://code.claude.com/docs/en/fast-mode) 是 Opus 5/4.8 的 API 配置，可能切换到 Opus 并持久化，网关资格检查还会直连 `api.anthropic.com` | HighSpeed 不进入首批 Profile；任务卡 8 真实验证后只能三选一：显式 Profile、只文档化经验证的显式模型 ID 切换、继续延后；禁止把 `/fast` 写成 Kimi HighSpeed 入口 | Blocker |
| Kimi Code 跳过登录脚本与 CMR 无持久修改边界不同 | 当前 [Kimi Code Claude Code](https://www.kimi.com/code/docs/en/third-party-tools/claude-code.html) 要求直接接入前写入 `~/.claude.json` 标记并清理 `~/.claude/settings.json` 的旧模型项；Claude Code [Authentication](https://code.claude.com/docs/en/team) 说明设置 `ANTHROPIC_API_KEY` 会跳过登录并提示批准 | CMR 不执行脚本、不写用户配置；任务卡 3 先做隔离配置验证，任务卡 8 再做真实环境变量直启。若仍必须写持久配置，阻断候选并回到产品决策 | Blocker |
| 会员额度的刷新周期与会员月度总额度同时存在 | Kimi Code [Membership Benefits](https://www.kimi.com/code/docs/en/kimi-code/membership.html) 同时说明每 7 天刷新、滚动 5 小时窗口和月度总额度冻结 | 视为不同维度，不折算为单一“每周额度”或精确费用；实现只显示脱敏提示 | Blocker（若被错误合并） |

结论：当前 Kimi Code 官方页面足以支持 `1.5.0` 的规格与实现，但旧/开放平台页面冲突禁止运行时自行猜测。实现按独立 Provider、Secret、鉴权和账单边界完成，真实 Provider 验收与全部发布门禁已于 2026-08-18 通过并公开发布。

### 12.6 真实验证补充（2026-08-18，任务卡 8）

以下为真实请求证据（非官方页面事实；用户授权，Allegretto+ 档，Extra Usage 关闭，全部脱敏）：

- `kimi-for-coding`、`k3-256k`、`k3[1m]`（上游 `k3`）与 `kimi-for-coding-highspeed` 四个模型 ID 均经 `https://api.kimi.com/coding/` + `ANTHROPIC_API_KEY` 通道真实调用成功；Claude Code sdk 层遥测证实各选择值原样到达请求层，CMR 不剥离 `[1m]` 的设计得到实测确认。
- `/status` 在真实会话中显示 Base URL `https://api.kimi.com/coding/`、API Key 通道、Auth token 为 none；模型栏显示 `k3[1m]`（与"允许显示 Claude 名称"的官方说明一致层级的客户端呈现）。
- 用量归属：Kimi Code Console weekly 0%→1%、5 小时滚动窗 7%；Moonshot 开放平台当日 API 请求为零。跳过登录脚本经实测不必要（无头直启与 TUI 首跑均不依赖它，见 `docs/06` §19）。
- HighSpeed 冲突行按"只文档化经验证的显式模型 ID 切换"结案（决策 2）：`--model kimi-for-coding-highspeed` 可用并已文档化；`/fast` 行为未实测，仍不得作为入口。

## 13. GLM-5.3 Coding Plan 与标准 API 分界（2026-08-16）

绑定实施合同：[docs/18-v1.5-glm-5.3-upgrade-implementation-guide.md](18-v1.5-glm-5.3-upgrade-implementation-guide.md)。本节是 2026-08-16 的当前事实增量；第 10、11 节的 2026-07-28 `1.4.0` 发布复核保留为历史证据，不做全局替换。

主来源：

- [GLM-5.3 模型页](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3)
- [智谱 Claude Code 接入](https://docs.bigmodel.cn/cn/guide/develop/claude)
- [智谱 Claude API 兼容](https://docs.bigmodel.cn/cn/guide/develop/claude/introduction)
- [GLM-5.2 模型页](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.2)
- [智谱产品价格](https://bigmodel.cn/pricing)

官方事实：GLM-5.3 页面声明 GLM Coding Plan 已全量上线 GLM-5.3，支持 1M 上下文、最大输出 128K；同页同时声明模型 API 将于近期上线。其列出的 Anthropic Message Base URL 是未来 API 协议信息，不能当作当前标准 API 可用性证明。当前 Claude Code 接入页仍给出 GLM-5.2 的 Coding Plan 示例环境；本轮在 `cmr glm` 的 Claude Code 选择层使用用户绑定的 GLM-5.3 目标值，并保留既有 `glm-4.7`/compact/timeout/disable-nonessential 运行参数。

标准 API 边界：当前 Claude API 兼容页面仍以原生 `glm-5.2` 为示例，并使用 `ANTHROPIC_API_KEY`/`x-api-key`；标准价格仍按现有记录为缓存命中 2、输入 8、输出 28 CNY/M。故 `glm-api` 继续使用 `glm-5.2[1m]`、`glm-4.7`、`ANTHROPIC_API_KEY` 和 `config/pricing/glm-5.2.json`，不得因为 Coding Plan 已支持 5.3 而提前迁移。

设计合同而非标准 API 事实：`glm-5.3[1m]` 是 Claude Code 选择层值，CMR 不剥离 `[1m]`；`glm` 的 Opus/Sonnet 选择值、别名和 subscription-quota entitlement 由 `docs/18` 绑定。真实 Provider 请求、API 请求与账单回读均未执行。
