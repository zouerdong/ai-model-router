# 09 — 阶段一验收证据包

> 历史基线：本文只证明 `0.1.0` 阶段一通过，不证明 `0.2.0` 透明参数透传已经实现。新版改造的执行合同与待回写证据见 `docs/10-v0.2-transparent-profile-launcher-implementation-brief.md`。

结论：**PASS — 阶段一全部 Blocker 与 Major 验收项已通过，可进入阶段二准备。**

仓库内代码、假密钥测试、两家 Provider 本机密钥写入、用户配置迁移和只读 Doctor 已完成。独立复核确认 `kimi-k3[1m]` 是 Claude Code 1M 选择值，Claude Code 2.1.214 会在发给 Kimi 前剥离后缀并使用上游 API ID `kimi-k3`；真实 `cmr plan` 主请求、只读工具和子 Agent 均已成功。2026-07-19 的正式演练进一步由全新 Kimi 会话产出 Implementation Brief，再由全新 DeepSeek 会话读取、调用真实只读 Agent、运行测试并回写结果，F4/F6 已有完整成功证据。

用户随后明确批准 Gate D。项目已安装到用户级 prefix `$HOME/.local`；全局 `cmr` 的非交互命令和两个 Profile 均从三个不同目录完成验证，G1/G2 已闭环。阶段二仍需按独立计划和用户红线另行授权，本结论不授权 Git、GitHub、CI/CD 或公开发布。

## 执行环境

- 执行日期：2026-07-18 至 2026-07-19
- 设备：macOS Darwin 25.5.0 arm64
- Node.js：Gate D 时仓库目录解析为 `v26.5.0`，其余两个验证目录解析为 `v24.15.0`；均满足 Node.js 18+
- npm：对应解析为 `11.17.0` 与 `11.12.1`
- Claude Code：`2.1.214`
- Claude 路径：`$HOME/.local/bin/claude`
- 实现 commit：N/A，仓库尚未初始化 Git
- 官方参数复核日期：2026-07-18

## 实际变更文件

| 文件 | 目的 |
|---|---|
| `package.json` | Node.js ESM 项目定义、命令和 Node 版本要求 |
| `.gitignore` | 排除密钥、日志、依赖、本机临时文件和 `.DS_Store` |
| `config/providers/*.json` | Kimi、DeepSeek Provider 事实 |
| `config/profiles/*.json` | 仅 `plan` 与 `build` 两个 Profile 的完整模型映射 |
| `config/pricing/*.json` | 价格意识、上下文长度、官方链接和核验日期 |
| `src/config/loader.js` | 只读加载已知配置文件并阻止路径穿越 |
| `src/config/validator.js` | 严格字段、变量、别名、Provider、Profile 和核验日期校验 |
| `src/platform.js` | macOS/Windows 路径、Claude 可执行文件和 `.cmd` 分支 |
| `src/environment.js` | 清除 Router 变量并构建子进程环境副本 |
| `src/launcher.js` | cwd、stdio、信号转发和退出码传递 |
| `src/secret-store.js` | 仓库外 JSON Secret Store、隐藏输入接口和原子写入 |
| `src/redact.js` | 统一字符串、对象和异常脱敏 |
| `src/commands/doctor.js` | 只读本机环境、Settings、Shell 和配置冲突诊断 |
| `src/commands/migrate.js` | 经批准的本机 Settings/Shell 备份、迁移和权限收紧 |
| `src/commands/list.js` | 无密钥 Profile 与映射展示 |
| `src/commands/launch.js` | Profile 启动、费用提示和新会话提醒 |
| `src/cli.js` | 有限命令解析、统一 CLI 入口和 npm 符号链接主模块识别 |
| `scripts/lint.js` | 使用 Node 内置语法检查实现 lint |
| `tests/**` | 配置、环境、密钥、脱敏、Doctor、启动器和 CLI 测试 |
| `tests/migrate.test.js` | 临时目录迁移、备份、保留字段和权限测试 |
| `README.md` | 当前命令、限制和阶段状态 |
| `docs/03-phase-1-mac-execution.md` | 修正本机 Node/npm 版本快照 |
| `docs/06-usage.md` | 当前 Mac 的使用、维护、重装与排错手册 |
| `docs/07-official-sources.md` | 修正本机 Node/npm 快照表述，保留官方事实基线 |
| `docs/09-phase-1-acceptance.md` | 本最终验收证据包 |

按门禁 A 已写入仓库外 Kimi/DeepSeek Secret Store；按门禁 B 已修改：`~/.claude/settings.json`、`~/.zshrc`。未修改：`~/.codex/**`、系统环境、Git 历史、CI/CD 和远端仓库。

## 自动化验证

```text
npm test       exit 0 — 21 tests, 21 passed, 0 failed
npm run lint   exit 0 — all JavaScript files passed node --check
```

额外只读验证：

- `node src/cli.js version`：exit 0
- `node src/cli.js list`：exit 0
- `node src/cli.js doctor`：exit 0，输出仅显示键名和 configured/missing/set 状态
- `node src/cli.js config path`：exit 0
- 初始门禁 A 后 `node src/cli.js secret status`：exit 0；当时为 `deepseek: configured`、`kimi: missing`
- 门禁 C 前后 `secret status`：当前 Kimi、DeepSeek 均为 `configured`
- Gate D 后 `command -v cmr`：`$HOME/.local/bin/cmr`
- `npm ls --global --depth=0 --prefix "$HOME/.local"`：仅 `claude-model-router@0.1.0`，无额外全局依赖
- 仓库根目录、`$HOME/CodexProjects`、`/private/tmp` 中的 `cmr version`、`cmr doctor`、`cmr list`：共 9 次，全部 exit 0
- 常见 Key 模式扫描：无匹配

## 无密钥 Profile 快照

### `plan` — Kimi K3

```text
ANTHROPIC_BASE_URL=https://api.moonshot.cn/anthropic
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

### `build` — DeepSeek Auto

```text
ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
ANTHROPIC_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_OPUS_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_SONNET_MODEL=deepseek-v4-pro[1m]
ANTHROPIC_DEFAULT_HAIKU_MODEL=deepseek-v4-flash
CLAUDE_CODE_SUBAGENT_MODEL=deepseek-v4-flash
CLAUDE_CODE_EFFORT_LEVEL=max
```

鉴权值未写入快照；子进程测试只记录 `hasAuthToken/hasApiKey` 布尔值。

## 真实 Provider 验收

### Kimi `plan`

- 仓库目录启动：成功。
- 本地 `/status` 配置检查：显示 Base URL 为 `https://api.moonshot.cn/anthropic`，Model 为 `kimi-k3[1m]`，Auth 为 `ANTHROPIC_AUTH_TOKEN`，cwd 正确。
- 新 Key 的官方 `/v1/models` 只读请求：HTTP `200`，返回 12 个模型；这证明 Key 有效，且未输出 Key。
- Anthropic 兼容端点用裸模型名 `kimi-k3` 的最小请求：HTTP `200`，约 3.3 秒返回 1 个内容块。
- 同一端点手工使用 `kimi-k3[1m]` 曾返回 HTTP `404`。独立复核确认这是协议层级错误：`[1m]` 属于 Claude Code 选择后缀，不是 Kimi API 原生 model；该 404 不再作为 CMR 失败证据。
- 本地脱敏协议探针捕获到 Claude Code 2.1.214 接收 `kimi-k3[1m]` 后，向 `/v1/messages?beta=true` 发出流式请求，实际 model 为 `kimi-k3`。
- 真实 `cmr plan` 交互 TTY 约 27 秒返回精确 `OK`，随后 `/exit`，退出码 0。
- 同一 Profile 的安全模式与默认非交互请求分别约 28.5 秒、29 秒返回精确 `OK`，退出码均为 0。
- 只读工具验收实际调用 `Read`，约 47.9 秒完成；子 Agent 验收实际调用 `Agent`，约 76 秒完成；二者均返回预期结果且退出码 0。
- 2026-07-19 以 `node src/cli.js plan` 启动全新真实 Kimi 会话；该会话按规范读取仓库文件，约 12 分钟后生成符合模板的真实 Implementation Brief，并返回 `KIMI_BRIEF_OK`。

### DeepSeek `build`

- 新临时目录启动：成功。
- 本地 `/status` 配置检查：显示 Base URL 为 `https://api.deepseek.com/anthropic`，Model 为 `deepseek-v4-pro[1m]`，Auth 为 `ANTHROPIC_AUTH_TOKEN`，cwd 正确。
- 带本机 Key 的最小非流式请求：HTTP `200`，约 1.9 秒返回；响应正文未记录。
- 2026-07-19 以 `node src/cli.js build` 启动全新真实 DeepSeek 会话；Model 显示为 `deepseek-v4-pro[1m]`。该会话读取 Kimi 生成的 Brief，逐键核对两个 Profile 与 Provider 映射，并真实派发一个独立只读 Agent 核对 build Profile。
- 独立 Agent 返回 `AGENT_VERDICT: PASS`；DeepSeek 会话运行 `npm test`（20/20，exit 0）与 `npm run lint`（exit 0），回写脱敏结果，最终返回 `DEEPSEEK_F6_OK — PASS` 并以 exit 0 退出。
- 第一次正式 DeepSeek 启动受当前 Codex 沙箱下 Claude Code 用户态目录写入失败影响，出现 `session-env` 的 `EPERM` 与 task lock 的 `ENOENT`；当次会话虽成功完成一次真实只读 Agent 调用，但未运行 npm、未写结果文件，因此不作为 F6 成功证据。复跑通过临时 `CLAUDE_CONFIG_DIR` 隔离 Claude 运行态后错误消失，未修改用户 Settings、Shell、密钥或全局环境。

早期诊断会话曾观察到 Claude Code 启动时的 `SessionStart` hook `EPERM` mkdir 错误和 MCP server failed；同时检测到本机代理配置，具体端口未纳入公共证据。正式成功复跑使用临时 Claude 运行态目录规避本机沙箱写入冲突，证明该错误不属于 Router、Provider 映射或 F6 文件交接失败。没有输出或记录任何 Key。

不带 Key 的 HTTP 可达性检查：Kimi 端点返回 HTTP `404`，DeepSeek 端点返回 HTTP `401`；这只能证明端点可达。后续带 Key 的最小请求显示 DeepSeek 为 HTTP `200`，Kimi 的裸 `kimi-k3` 为 HTTP `200`，而手工原样发送 `kimi-k3[1m]` 为 HTTP `404`。最后一项现已确认为跨层误用的预期结果，不再作为失败证据。

## Doctor 迁移前后摘要

迁移前只读 Doctor 发现：

- 当前进程有 `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL`；输出显示是否 set，未显示值。
- `~/.claude/settings.json` 的 `env` 含 Router 管理键及旧顶层 `model`。
- `~/.zshrc` 第 11–13 行含 Anthropic 相关 export。
- `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 被标记为 legacy/unverified。
- `~/.claude/settings.json` 权限为 `0644`，并含非 Router 敏感配置。
- 迁移初期 DeepSeek Secret Store 为 `configured`、Kimi 为 `missing`；用户随后通过隐藏输入补录并覆盖了 Kimi Key，当前两者均为 `configured`。
- 未发现项目级或 Mac 文件式 Managed Settings。

迁移后验证：

- Settings 的 Router 环境键为空，顶层旧 `model` 不存在。
- `.zshrc` 不再含 Anthropic export。
- 新干净 Shell 无 Router 变量。
- Settings 与 `.zshrc` 权限均为 `0600`。
- 原 Settings 与 `.zshrc` 已备份，备份文件权限为 `0600`，备份目录为 `0700`。
- Doctor 的临时目录测试验证了只读运行前后 Settings 与 Shell 文件 SHA-256 不变。

## 门禁状态

| 门禁 | 状态 | 说明 |
|---|---|---|
| A — 真实密钥 | 已批准、已执行 | Kimi/DeepSeek 通过本机隐藏输入写入；目录 `0700`、文件 `0600`，没有 Key 进入对话 |
| B — Settings/Shell 迁移 | 已批准、已执行 | 已备份、删除 Router 键、移除旧 Shell export，并将两个文件设为 `0600` |
| C — 真实 API | 已批准、已执行、F6 PASS | Kimi 主请求、工具、Agent 与真实 Brief 生成成功；全新 DeepSeek 会话读取 Brief、调用独立只读 Agent、测试并回写 PASS 结果；F4/F6 均闭环 |
| D — 全局安装 | 已批准、已执行、PASS | 避免向 root 管理的默认 `/usr/local` 写入；以单次 `--prefix "$HOME/.local"` 安装，不修改 npm 配置或 PATH；三个目录的 G2 验证全部通过 |

## 启动器证据

- 假 Claude 收到调用目录作为 cwd。
- 路径含空格和中文时通过。
- 父进程环境在启动前后不变。
- Profile 间 Router 变量无残留；非 Router 的 legacy 变量按规范保留并由 Doctor 警告。
- 假 Claude 退出码 `7` 原样返回。
- SIGINT、SIGTERM、SIGHUP 均有显式转发测试。
- Windows `.cmd` 使用显式平台分支，普通可执行文件不启用 shell。
- 首次 Gate D 验证发现 npm 符号链接入口会因路径直接比较被误判为模块导入，表现为命令 exit 0 但无输出。根因已在 `src/cli.js` 修复为真实路径比较，并新增 npm 符号链接回归测试；修复后测试为 21/21。
- 全局 `cmr plan` 与 `cmr build` 分别从仓库根目录、`$HOME/CodexProjects`、`/private/tmp` 启动；六次 `/status` 均显示调用目录为 cwd，Kimi 为官方 Base URL + `kimi-k3[1m]`，DeepSeek 为官方 Base URL + `deepseek-v4-pro[1m]`，随后均以 exit 0 退出。验证只查看 `/status`，未提交模型任务。

## Brief 交接

真实文件式交接已完成：全新 Kimi `plan` 会话生成 Implementation Brief 后退出；全新 DeepSeek `build` 会话不读取旧聊天，仅依据仓库规范与 Brief 执行，派发真实只读 Agent，并回写 PASS 结果。两次会话独立、未跨供应商恢复旧会话，符合 V1 交接约束。

原始 Brief、执行结果和多轮交接任务书属于阶段一过程文件。2026-07-19 经用户逐项确认后删除；F6 的关键命令、标记、测试计数、Agent 结论和偏差说明已收敛在本证据包，不依赖过程文件维持最终结论。

## 项目清理记录

2026-07-19 经用户确认，永久删除六份阶段一交接/演练过程文档和两个 `.DS_Store`；新增 `docs/06-usage.md`，并将本文件规范化为两位数字前缀。原始讨论记录只在维护者本机保留，不属于公共仓库；正式规格、源码、配置和测试进入公共发布候选。

## 备份与回退

备份路径：

```text
$HOME/Library/Application Support/ClaudeModelRouter/backups/phase-1-20260718-before-migration/
```

其中包含原始 `settings.json` 和 `.zshrc`，文件权限为 `0600`。如需回退，必须再次获得用户确认，然后从该目录恢复对应文件，并重新运行 `cmr doctor`；不可直接覆盖用户文件。

## 未决项与风险

- 裸运行的 `claude` 不再自动进入旧 Kimi 配置；后续应使用 `cmr plan` / `cmr build`。
- Kimi/DeepSeek `/status` 已通过；Kimi `[1m]` 选择后缀、主请求、工具和子 Agent 已闭环。手工直连带后缀的 404 已确认为错误验收方法，不再是风险。
- F4/F6 已闭环，不再是 Blocker；关键证据已收敛在本文件。
- Gate D 与 G2 已闭环，阶段一无剩余 Blocker 或 Major。
- 用户级 npm 安装链接到当前仓库；若未来移动或删除仓库目录，应先执行记录中的卸载命令，再从新路径重新安装。
- F6 与 Gate D 验收使用的隔离 Claude 运行态目录位于 `/private/tmp/cmr-f6-runtime.bvFw59`；未获删除授权，因此保留给系统临时目录清理机制处理。
- 阶段二 GitHub、CI/CD、首次 push 和阶段三 Windows 实机动作明确未执行。
