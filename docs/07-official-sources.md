# 07 — 官方参数与事实基线

核验日期：2026-07-24
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
