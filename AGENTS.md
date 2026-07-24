# Claude Model Router 项目规则

## 1. 项目目标

本项目为 Claude Code 提供跨平台的“启动前 Provider/Profile 选择”，不修改或管理 Codex，也不接管 Claude Code 自身的会话与命令语义。

当前稳定版为 `1.2.1`：它在 `1.1.0` 首次运行配置向导基线上修复原生 Windows 的 Claude 可执行文件发现与 Doctor POSIX 权限误报警告，并补齐针对性跨平台回归。`1.1.0` 的 Mac 独立验收见 `docs/11-v1.1-first-run-setup-implementation-brief.md` 第 17 节；`1.2.1` 发布证据见 `docs/12-v1.2.1-windows-compatibility-patch.md`。完整 Windows 实机验收仍属于阶段三。

`1.2.1` 继续只提供两个数据化 Profile：

- `kimi`：Kimi K3 的完整 Claude Code 模型映射。
- `deepseek`：DeepSeek Auto；主会话由 V4 Pro 承担，Haiku 档与子 Agent 由 V4 Flash 承担。

Profile 只决定 Claude Code 子进程启动时使用哪套 Provider 环境。Kimi 适合规划、DeepSeek 适合执行只是推荐工作流，不是功能限制；用户可用任一 Profile 进行规划、编码、续聊或其他 Claude Code 支持的操作。

## 2. 规范优先级

开始工作前按以下顺序阅读：

1. 本文件。
2. `docs/01-product-scope.md`。
3. `docs/02-architecture.md`。
4. 当前阶段的执行文档；实施首次运行向导时必须读取 `docs/11-v1.1-first-run-setup-implementation-brief.md`。
5. `docs/07-official-sources.md`。
6. `docs/08-acceptance-and-recovery.md`。
7. `docs/09-phase-1-acceptance.md`，用于核对已完成的 Mac 基线。

`docs/10-v0.2-transparent-profile-launcher-implementation-brief.md` 是 `1.0.0` 稳定运行时的历史实施与验收依据。`docs/11-v1.1-first-run-setup-implementation-brief.md` 是 `1.1.0` 的实施与验收依据。`docs/12-v1.2.1-windows-compatibility-patch.md` 是当前补丁版的发布依据。GitHub 与 Windows 阶段分别按 `docs/04-phase-2-github.md` 和 `docs/05-phase-3-windows.md` 执行。

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

- 运行时：Node.js 18+。
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
