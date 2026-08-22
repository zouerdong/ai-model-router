# Claude Model Router 项目规则

## 1. 项目目标

本项目为 Claude Code 提供跨平台的“启动前 Provider/Profile 选择”，不修改或管理 Codex，也不接管 Claude Code 自身的会话与命令语义。

当前稳定版为 `1.6.0`（2026-08-21 发布，Latest，tag `v1.6.0` 指向门禁 commit 718ccd1）：`docs/20` DSV-1~4 DeepSeek-V4-Flash-Vision 接入——`deepseek` Auto 的 Haiku/子 Agent 槽切换为 `deepseek-v4-flash-vision-exp`（多模态实验模型，官方与 flash 同价），新增 `deepseek-vision` Profile 全槽位该模型；并入原未发布 `1.5.2` 候选的内部启动路径清理。前一稳定版 `1.5.1`（2026-08-18）：`1.5.0` 同日的 Secret Store 前向兼容补丁——旧版读取密钥库时忽略并原样保留较新版本写入的未知 Provider Key，恢复「旧版可继续使用旧通道」合同（`docs/19` SSFC-1~3）；无新增 Provider/Profile/价格。前一稳定版 `1.5.0`（2026-08-18 公开发布）：在 `1.4.0` 基线上新增 Kimi Code 会员三 Profile（真实验收通过）与 GLM-5.3 Coding Plan 升级。`1.4.0` 在 `1.3.0` GitHub Release 自更新基线上，一次发布 GLM Coding Plan 与 GLM 标准 API 按量付费两个显式 Profile，并保持独立的凭据、鉴权和费用边界。`1.1.0` 的 Mac 独立验收见 `docs/11-v1.1-first-run-setup-implementation-brief.md` 第 17 节；`1.2.1` 发布证据见 `docs/12-v1.2.1-windows-compatibility-patch.md`；`1.3.0` 发布与公开回读证据见 `docs/13-v1.3-self-update-implementation-brief.md` 第 19 节；`1.4.0` 统一发布证据见 `docs/16-v1.4-unified-glm-release.md`。

`1.5.0` 已于 2026-08-18 完成 `docs/17` 全部九张任务卡并公开发布（Windows 实机 9.1 run 32112918053 全绿；GitHub 候选 9.2 通过；9.3 发布与公开回读闭环：exact/latest 双 URL 字节一致、隔离 prefix 安装 `1.5.0`、真机 `cmr update --check` 正确探测 1.5.0）。Kimi Code 三个首批 Profile 均真实验收 `PROVIDER PASS`（2026-08-18 用户授权，Allegretto+ 档，Extra Usage 关闭，脱敏回读；归属闭环：会员 Console 0%→1%，开放平台当日零请求）；HighSpeed 按决策 2 处理（仅文档化显式 `--model` 切换，不新增 Profile，`/fast` 不是入口）。治理模式：项目负责人于 2026-08-18 指令撤销 Luna/Sol 双角色审阅循环，改为单一执行者 + 自动化验证（全量 `npm test`/`npm run lint` + 脱敏证据记录）+ 项目负责人门禁（commit/push/tag/Release 逐项授权）。`docs/17-v1.5-kimi-code-membership-implementation-guide.md` 为 Kimi Code 绑定执行指导，`docs/18-v1.5-glm-5.3-upgrade-implementation-guide.md` 为 GLM-5.3 绑定执行指导，`docs/20-deepseek-v4-flash-vision-implementation-guide.md` 为 DeepSeek Vision 绑定执行指导。

`1.3.0` 引入的 GitHub Release 自更新继续作为 `1.4.0` 的稳定更新通道。PowerShell、CMD、Git Bash 的隔离 prefix、自替换、回滚、junction 与中断场景均已通过；固定 Release 资产、checksum、tag、immutable 发布、exact/latest 下载、临时 prefix bootstrap 与公开 `cmr update --check` 已闭环。

`1.6.0` 提供八个数据化 Profile（前七个自 `1.5.0`，`deepseek-vision` 自 `1.6.0`）：

- `kimi`：Kimi K3 的完整 Claude Code 模型映射。
- `deepseek`：DeepSeek Auto；主会话由 V4 Pro 承担，Haiku 档与子 Agent 由 V4 Flash Vision 实验模型（`deepseek-v4-flash-vision-exp`，多模态）承担。
- `deepseek-vision`：DeepSeek V4 Flash Vision；全部模型映射使用 `deepseek-v4-flash-vision-exp`，复用 `deepseek` Provider 与 Secret。
- `glm`：GLM-5.3 Coding Plan；使用独立 `glm` Secret 与 `ANTHROPIC_AUTH_TOKEN` 及订阅额度提示。
- `glm-api`：GLM 标准 API 按量付费；使用独立 `glm-api` Secret 与 `ANTHROPIC_API_KEY`。
- `kimi-code`：Kimi Code 会员（`kimi-for-coding`，256K）。
- `kimi-code-k3-256k`：Kimi Code 会员 K3 256K。
- `kimi-code-k3`：Kimi Code 会员 K3 1M（`k3[1m]`）。

Profile 只决定 Claude Code 子进程启动时使用哪套 Provider 环境。Kimi 适合规划、DeepSeek 适合执行只是推荐工作流，不是功能限制；用户可用任一 Profile 进行规划、编码、续聊或其他 Claude Code 支持的操作。两个 GLM Profile 不自动互相 fallback，也不共享或识别 Key 类型。

## 2. 规范优先级

开始工作前按以下顺序阅读：

1. 本文件。
2. `docs/01-product-scope.md`。
3. `docs/02-architecture.md`。
4. 当前阶段的执行文档；实施首次运行向导时必须读取 `docs/11-v1.1-first-run-setup-implementation-brief.md`，实施自更新时必须读取 `docs/13-v1.3-self-update-implementation-brief.md`，实施或发布 GLM 时必须读取 `docs/14`、`docs/15` 与 `docs/16`，实施 Kimi Code 会员 Provider 时必须读取 `docs/17-v1.5-kimi-code-membership-implementation-guide.md`，修改 Secret Store 行为时必须读取 `docs/19-secret-store-forward-compatibility-implementation-guide.md`，实施或发布 DeepSeek Vision 接入时必须读取 `docs/20-deepseek-v4-flash-vision-implementation-guide.md`，实施安全加固（settings 预检、隐藏输入、自更新完整性、密钥回显）时必须读取 `docs/21-security-hardening-implementation-guide.md`。
5. `docs/07-official-sources.md`。
6. `docs/08-acceptance-and-recovery.md`。
7. `docs/09-phase-1-acceptance.md`，用于核对已完成的 Mac 基线。

`docs/10-v0.2-transparent-profile-launcher-implementation-brief.md` 是 `1.0.0` 稳定运行时的历史实施与验收依据。`docs/11-v1.1-first-run-setup-implementation-brief.md` 是 `1.1.0` 的实施与验收依据。`docs/12-v1.2.1-windows-compatibility-patch.md` 是 `1.2.1` 的发布依据。`docs/13-v1.3-self-update-implementation-brief.md` 是自更新功能的实施、验收与首次发布依据。`docs/14` 与 `docs/15` 分别记录两个 GLM Profile 的实施合同，`docs/16` 是二者统一进入 `1.4.0` 的版本决策、验收与发布依据。`docs/17` 是 `1.5.0` Kimi Code 会员 Provider 的逐卡实施、审阅与发布门禁依据。`docs/19` 是 `1.5.1` Secret Store 前向兼容修复的实施合同与发布门禁依据。GitHub 与 Windows 阶段分别按 `docs/04-phase-2-github.md` 和 `docs/05-phase-3-windows.md` 执行。

冲突时，以编号更靠前的现行文档为准。发现规范需要改变时，先修改对应文档并说明理由，再修改实现。

## 3. 目录与维护约定

- `00_background/`：仅限维护者本机的历史背景资料，Git 忽略且不得公开；不属于产品规格或发布内容。
- `docs/`：产品、架构、阶段计划、使用手册与最终验收文档。
- `src/`：已验收的运行时代码。
- `config/`：Provider、Profile 与价格事实；不得存密钥。
- `tests/`：自动化回归测试与假 Claude 夹具。
- `scripts/`：项目级验证脚本。

文档使用两位数字前缀排序；文件名使用小写英文和连字符。废弃文档不得静默删除，应先标记 `Superseded` 并指向替代文档；删除仍需用户确认。维护责任由修改相关功能的执行者承担。

## 4. 当前技术基线

- 运行时：Node.js 18.20+（`>=18.20.0`，2026-08-22 安全加固候选起；18.20.0 是包含 libuv BatBadBut `.cmd`/`.bat` spawn 参数转义修复的首个 18.x 补丁版，见 `docs/21` §7）。
- 实现语言：标准 JavaScript（ESM）。当前版本不引入 TypeScript 编译链。
- 核心逻辑优先使用 Node.js 标准库。
- 配置格式：JSON，避免为 YAML/TOML 解析引入依赖。
- 测试：Node.js 内置 `node:test`。
- 核心逻辑不得依赖 Bash、PowerShell、Unix 路径或 Windows 注册表。

如果执行者认为必须改变这套技术路线，应先写出替代方案、迁移成本和跨平台影响，等待用户确认后再改规范。

## 5. 安全与自主边界

以下操作必须停下来获得用户明确确认：

- 修改 `~/.claude/settings.json`、`.zshrc`、PowerShell Profile、用户/系统环境变量。
- 创建、导入、移动或修改 API Key、Token、`.env` 或本机密钥存储。
- 删除文件、目录或 Git 历史。
- 全局安装本项目或依赖，包括 `npm install -g`、`npm link`。
- 初始化远端仓库、公开仓库、修改 CI/CD、执行 `git push`。
- 用户通用红线中规定的其他操作。

在取得确认前，只能做脱敏的只读审计、仓库内代码与测试、使用假密钥的模拟验证。

## 6. 密钥规则

- 真实密钥不得进入 Git、源码、Profile、测试、日志、命令行参数或错误堆栈。
- 测试只使用明显的假值，例如 `test-kimi-key`。
- 状态输出只允许显示 `configured` / `missing`，默认不显示末四位。
- 本机密钥文件必须位于仓库外，并限制为当前用户可读写。
- 执行者不得要求用户把真实密钥发到对话中；应由工具在本机交互式接收。

## 7. 配置与启动原则

- 所有模型参数来自数据化 Profile，不写死在 CLI 分支中。
- 每次启动先从继承环境中清除 Router 管理的变量，再注入所选 Profile。
- 不默认永久修改 Claude Code、Shell 或系统环境。
- 必须继承用户运行 `cmr` 时的当前目录、交互终端、Ctrl+C 行为和 Claude Code 退出码。
- `1.0.0` 的规范入口为 `cmr kimi [claude args...]` 与 `cmr deepseek [claude args...]`；`plan`、`build` 只作为兼容别名保留。
- Profile 选择器之后的参数必须保持顺序和值，原样传给 Claude Code。CMR 不拦截 `--continue`、`--resume`、`--fork-session`、`--model`、`--permission-mode`、`-p` 或未来新增的 Claude Code 参数。
- 是否继续、恢复或跨 Provider 打开旧会话由用户显式选择。CMR 不跟踪会话归属、不推断原 Provider、不建立 Session Registry，也不替 Claude Code 校验这些参数。
- CMR 不规定跨模型交接方式或文档名称。用户可直接恢复 Claude Code 会话，也可按原有习惯使用 `CLAUDE.md` 或任意自行命名的文档。
- CMR 不记录或回显透传参数，因为其中可能包含提示词、路径或其他敏感内容。
- 不实现提示词分类、动态跨供应商路由、本地代理或精确计费。
- 安装生命周期不得读取 API Key；首次配置只能在用户主动启动 `cmr` 的交互式 TTY 中发生。不得使用 `preinstall/install/postinstall` 收集凭据。

## 8. 官方事实验证

模型 ID、Base URL、环境变量、上下文长度和价格都属于可变外部事实。开始实现和每次发布前：

1. 重新检查 `docs/07-official-sources.md` 中列出的官方页面。
2. 更新核验日期和发生变化的参数。
3. 不得依据旧对话或记忆猜测参数。

## 9. 实施纪律

- 先完成只读 `doctor` 与环境快照，再做启动逻辑。
- 每个阶段只做当前阶段执行文档指定的最小范围；`0.1.x` 基线记录在 `docs/03-phase-1-mac-execution.md` 与 `docs/09-phase-1-acceptance.md`，当前稳定运行时的实现证据记录在 `docs/10-v0.2-transparent-profile-launcher-implementation-brief.md`。
- 不借机重构 Codex、Claude Code 插件、MCP、Skills、Hooks、主题或权限。
- 发现用户已有配置时保留原状；需要迁移时先生成脱敏预览和备份方案。
- 不通过注释报错、跳过校验或绕过测试来交付。

## 10. 验证基线

每次实现改动至少运行：

```bash
npm test
npm run lint
```

若项目尚未提供对应脚本，先按阶段计划建立最小脚本。涉及启动器时还要用假 Claude 可执行文件验证环境、工作目录、信号和退出码。真实 API 冒烟测试必须在用户确认使用本机密钥后进行。
