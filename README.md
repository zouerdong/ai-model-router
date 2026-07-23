# Claude Model Router

当前状态：**`1.1.0` 已在 Mac 通过独立验收。** `1.0.0` 是透明 Profile 启动器的历史稳定基线；Windows 实机阶段尚未执行。

`1.1.0` 增加首次运行配置向导、随时更换 Key 和缺 Key 就地配置。最终验收证据见 `docs/11-v1.1-first-run-setup-implementation-brief.md` 第 17 节。

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
npm install --global "git+https://github.com/ErdongZou-ai/ai-model-router.git#v1.1.0"
cmr version
cmr
```

从源码检查后安装：

```bash
git clone https://github.com/ErdongZou-ai/ai-model-router.git
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

`cmr help` 只显示 CMR 帮助。查看 Claude Code 帮助请执行 `cmr kimi --help` 或 `cmr deepseek --help`。

密钥通过本机 TTY 隐藏输入写入仓库外 Secret Store，不进入仓库、参数、日志或聊天。

## 安全与开源

- 许可证：[MIT](LICENSE)。
- 安全问题：[Security Policy](SECURITY.md)。不要在公开 Issue 中提交 Key、Token、日志或本机配置。
- 参与开发：[Contributing](CONTRIBUTING.md)。
- Issues：[GitHub Issues](https://github.com/ErdongZou-ai/ai-model-router/issues)。

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

运行时无第三方依赖。公开仓库以 `main` 为默认分支，当前稳定标签为 `v1.1.0`。Windows 实机阶段尚未执行；自动化中的 Windows 分支覆盖不等于 Windows 实机验收。
