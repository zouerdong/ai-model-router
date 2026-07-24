# Claude Model Router

当前稳定版：**`1.2.1`。** 当前仓库实现候选为 **`1.3.0`**；仓库、Mac 隔离 prefix、Node 18/npm 9 与 GitHub-hosted Windows Server 2025 T4 审阅已通过。正式 Release asset/checksum、tag、immutable 发布与公开 bootstrap/readback 尚未完成，因此整体仍不是可发布结论。

`1.3.0` 的自更新只从固定 GitHub Release asset 获取候选包，并只替换当前活动入口对应的实体 npm global package。源码链接、checkout、junction、Homebrew、WinGet 或无法唯一识别 prefix 的安装会安全拒绝自动替换。

`1.2.1` 不改变 Profile、模型映射、Secret Store 或 Claude argv 合同。完整 Windows 实机阶段仍需继续验证 PowerShell/CMD/Git Bash 终端行为、`%APPDATA%` 权限和真实 Provider 工作流；详见 `docs/12-v1.2.1-windows-compatibility-patch.md`。

Claude Model Router（`cmr`）是一个跨平台 Claude Code Profile 启动器。它只在启动前选择 Kimi 或 DeepSeek，注入对应的临时 Provider 环境，然后把后续 Claude Code argv 原样交给 Claude Code。

Profile 不绑定规划或执行角色，也不管理 Codex、会话、提示词分类、动态路由或代理层。

首次交互运行 `cmr` 时会显示全部 Provider 的 `configured/missing` 状态并进入 setup。Key 只通过隐藏 TTY 输入保存到仓库外 CMR Secret Store；非 TTY 不会等待输入。

## 安装

前置条件：

- Node.js 18 或更高版本。
- 已安装并可从终端运行的 Claude Code。安装方式以 [Claude Code 官方文档](https://code.claude.com/docs/en/installation) 为准。
- Kimi 或 DeepSeek 的 API Key；Key 在首次运行时由本机隐藏输入接收，不应写入命令或仓库。

从 GitHub 安装稳定标签：

```bash
npm install --global "git+https://github.com/zouerdong/ai-model-router.git#v1.2.1"
cmr version
cmr
```

`1.2.1` 用户在 `v1.3.0` Release 正式发布后的一次性 bootstrap：

```bash
npm install --global "https://github.com/zouerdong/ai-model-router/releases/download/v1.3.0/claude-model-router.tgz"
cmr version
```

如果旧版安装使用自定义 prefix，bootstrap 必须显式使用同一个 prefix，避免把新版本装到另一处而终端继续命中旧命令：

```bash
npm install --global --prefix <current-prefix> "https://github.com/zouerdong/ai-model-router/releases/download/v1.3.0/claude-model-router.tgz"
```

候选 Release 发布后，也可以安装最新固定资产：

```bash
npm install --global "https://github.com/zouerdong/ai-model-router/releases/latest/download/claude-model-router.tgz"
```

需要可复现的版本时，使用上面的 `releases/download/v1.3.0/claude-model-router.tgz` 精确资产，而不是 `latest`。在 `1.3.0` 正式 Release 前，上述 Release asset 尚未可用。

从源码检查后安装：

```bash
git clone https://github.com/zouerdong/ai-model-router.git
cd ai-model-router
npm test
npm run lint
npm install --global .
cmr
```

全局安装会在当前 npm prefix 中创建 `cmr` 命令。卸载：

```bash
npm uninstall --global claude-model-router
```

## 快速开始

在目标项目目录执行：

```bash
cmr kimi
cmr deepseek
```

Profile 后的参数全部透明透传：

```bash
cmr kimi --continue
cmr deepseek --resume <session-id>
cmr deepseek --fork-session --resume <session-id>
cmr kimi -p "分析并修改这个项目"
cmr deepseek --permission-mode plan
cmr kimi --model <provider-supported-model>
```

`plan` 是 `kimi` 的兼容别名，`build` 是 `deepseek` 的兼容别名：

```bash
cmr plan [claude args...]
cmr build [claude args...]
```

跨 Provider `--continue`/`--resume` 是用户显式选择。项目文件和 Claude Code 会话记录不会被 CMR 修改；普通文本与工具会话通常可以直接恢复，少数包含新 Provider 不支持内容块的会话可能由 Claude Code 或 Provider 报错。

CMR 不规定交接流程或文档名称。你可以继续使用项目级 `CLAUDE.md`、任意自行命名的任务文档，或者直接恢复原会话。

Kimi 启动时显示一行价格意识提示，不要求二次确认；CMR 不记录 prompt、session ID 或透传参数。

## 管理命令

```bash
cmr version
cmr list
cmr doctor
cmr update --check
cmr update
cmr config path
cmr secret status
cmr secret set kimi
cmr secret set deepseek
cmr help
```

配置向导入口：

```bash
cmr setup
cmr setup kimi
cmr setup deepseek
```

向导只做本地格式校验与原子保存，不联网验证 Key，也不会自动打开浏览器或修改 Claude Settings、Shell 或环境变量。

`cmr update --check` 只检查固定 GitHub latest Release asset，不修改安装；`cmr update` 会在当前实体 npm global package 上备份、安装并验证候选包，失败时尝试恢复。它不会执行 lifecycle scripts、修改 Provider 配置或切换到 npm 默认 prefix。源码链接安装不支持自动更新，请按源码工作流手工维护。

`cmr help` 只显示 CMR 帮助。查看 Claude Code 帮助请执行 `cmr kimi --help` 或 `cmr deepseek --help`。

密钥通过本机 TTY 隐藏输入写入仓库外 Secret Store，不进入仓库、参数、日志或聊天。

## 安全与开源

- 许可证：[MIT](LICENSE)。
- 安全问题：[Security Policy](SECURITY.md)。不要在公开 Issue 中提交 Key、Token、日志或本机配置。
- 参与开发：[Contributing](CONTRIBUTING.md)。
- Issues：[GitHub Issues](https://github.com/zouerdong/ai-model-router/issues)。

## 文档入口

1. [产品范围](docs/01-product-scope.md)
2. [系统架构](docs/02-architecture.md)
3. [阶段一：Mac 实施记录](docs/03-phase-1-mac-execution.md)
4. [阶段二：GitHub 计划](docs/04-phase-2-github.md)
5. [阶段三：Windows 计划](docs/05-phase-3-windows.md)
6. [操作说明手册](docs/06-usage.md)
7. [官方参数与事实基线](docs/07-official-sources.md)
8. [阶段一验收与修复兜底](docs/08-acceptance-and-recovery.md)
9. [阶段一历史验收证据](docs/09-phase-1-acceptance.md)
10. [0.2.0 实施合同与当前运行时验收证据](docs/10-v0.2-transparent-profile-launcher-implementation-brief.md)
11. [1.1.0 首次运行配置向导实施与验收记录](docs/11-v1.1-first-run-setup-implementation-brief.md)
12. [1.2.1 Windows 兼容性补丁与发布证据](docs/12-v1.2.1-windows-compatibility-patch.md)
13. [1.3.0 GitHub Release 自更新实施与验收合同（跨平台审阅通过，待 Release 门禁）](docs/13-v1.3-self-update-implementation-brief.md)

运行时无第三方依赖。公开仓库以 `main` 为默认分支，当前稳定标签为 `v1.2.1`。本补丁包含由公司 Windows 实机问题触发的修复，但自动化与局部实机证据不等于完整 Windows 阶段验收。
