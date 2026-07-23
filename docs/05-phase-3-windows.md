# 05 — 阶段三：公司 Windows 拉取与配置计划

状态：`1.1.0` 已通过 Mac 独立验收；Windows 实机阶段尚未执行
核心原则：先复现现有 DeepSeek Auto，再引入 Kimi；旧工作流在验证期保持可回退。

> `1.0.0` 的规范入口是 `cmr deepseek` 与 `cmr kimi`；Windows 阶段同时验证 `cmr build` 与 `cmr plan` 兼容别名。Profile 只选择 Provider，不限制任务用途或 Claude Code 参数。

## 1. 阶段三目标

在公司 Windows 台式机上：

1. 从 GitHub 拉取阶段一已经验收的同一份源码。
2. 不破坏现有 DeepSeek V4 Pro/Flash 稳定工作流。
3. 让 `cmr deepseek` 先复现现有 Auto 映射。
4. 再让 `cmr kimi` 接入 Kimi K3。
5. 本机单独保存 Key，不从 GitHub 或 Mac 复制密钥文件。

## 2. 先确定运行形态

进入公司电脑后的第一步不是安装，而是确认当前 Claude Code 运行在：

- 原生 Windows + PowerShell/Git Bash；或
- WSL。

默认应跟随当前稳定工作流，不擅自从原生 Windows 迁到 WSL，也不反向迁移。`platform.js` 的路径和启动方式必须与实际形态一致。

## 3. 公司环境红线

- 遵守公司 IT、代理、软件安装与代码托管政策。
- 不把公司 API Key、代理凭据、项目代码或环境快照发到个人 GitHub。
- 不修改注册表、系统环境变量、PowerShell Profile 或 CI/CD，除非当次得到用户明确确认且不违反公司政策。
- 不删除现有 DeepSeek 配置；先并行保留。
- 不在公司项目上直接做第一轮真实测试，先用独立临时目录。

## 4. Step 1 — 只读审计

记录并脱敏：

- Windows 版本、架构、Shell 形态。
- Node/npm/Git/Claude Code 版本。
- `where.exe claude` 或 WSL `command -v claude` 的真实路径。
- `%USERPROFILE%\.claude\settings.json` 及项目 Settings 中的冲突键。
- PowerShell Profile、用户/系统环境变量中的相关变量名。
- Git for Windows / WSL 依赖状态。
- 公司代理和证书是否影响 Provider 连接，只记录“configured/required”，不记录凭据。
- 当前 DeepSeek Auto 的无密钥模型映射快照。

生成本机私有审计文件，默认不提交到 Git。

## 5. Step 2 — 建立旧工作流基线

在任何 CMR 安装前，使用现有方式完成一个最小测试：

- `/status` 的 Base URL 与主模型。
- 简单文本请求。
- 一个轻量子 Agent。
- MCP/Skills/Plugins 是否正常。
- 速度与退出行为。

基线用于判断 CMR 是否真正“复现”，不能只看命令能启动。

## 6. Step 3 — 从 GitHub 获取

用户确认目标目录和仓库 URL 后：

1. clone Private 仓库。
2. checkout 已在 Mac 验收的 `v1.1.0` tag，不直接追逐未知最新提交。
3. 本地运行 `npm test`、`npm run lint`。
4. 先用 `node src/cli.js` 或项目定义的本地命令运行 Doctor。

若公司不能访问个人 GitHub，应停止并选择符合公司政策的迁移方式；不得通过私自上传公司配置来绕过。

## 7. Step 4 — Windows 本机密钥

工具先验证 `%APPDATA%\ClaudeModelRouter\` 的位置与权限。

用户门禁后，由用户在本机交互式输入：

- DeepSeek Key。
- Kimi Key。

不得从 Mac 的 `secrets.json` 复制；两台设备各自管理和轮换凭据。

若公司安全政策要求 Windows Credential Manager，先更新 `SecretStore` 架构和测试，再实施，不能把凭据退回仓库或 PowerShell 历史。

## 8. Step 5 — 先验证 `cmr deepseek`

1. 不清理旧配置，先运行 `cmr doctor` 识别冲突。
2. 通过假 Claude 测试确认 Windows `.cmd`、cwd、信号、退出码。
3. 在临时目录运行 `cmr deepseek`。
4. `/status` 应显示 `deepseek-v4-pro[1m]` 和 DeepSeek Base URL。
5. Profile 快照必须显示 Haiku/子 Agent 为 `deepseek-v4-flash`。
6. 将行为与 Step 2 基线比较。

如果永久 Settings 覆盖 CMR，停止并展示迁移预览。不能直接删旧配置。

## 9. Step 6 — 再验证 `cmr kimi`

DeepSeek Auto 通过后，再在临时目录测试 Kimi：

- `/status` 为 Kimi Base URL 和 `kimi-k3[1m]`。
- 最小请求与只读工具调用正常。
- 子 Agent 不报模型不存在。
- 公司网络允许 Kimi 端点；不通过修改系统代理绕过公司策略。

## 10. Step 7 — 是否迁移旧永久配置

CMR 与旧方式至少完成一轮并行验收后，执行者提供：

- 旧 Settings/环境变量的脱敏差异。
- 备份位置。
- 清理后裸 `claude` 的行为变化。
- 回退步骤。

用户明确确认后才迁移。验证完成前，旧启动方式必须保持可用。

## 11. Step 8 — 本机安装

全局安装会改变本机命令环境，必须单独确认。确认后安装本项目而非额外全局依赖，并验证：

```text
cmr version
cmr doctor
cmr kimi
cmr deepseek
cmr plan       # compatibility alias for kimi
cmr build      # compatibility alias for deepseek
```

## 12. 完成定义

- [ ] Windows checkout Mac 已验收的 `v1.1.0` tag。
- [ ] `cmr deepseek` 与原稳定 DeepSeek Auto 行为一致。
- [ ] `cmr kimi` 正确使用 `kimi-k3[1m]`。
- [ ] 两个规范 Profile 及其兼容别名均继承当前项目目录并透明透传 Claude Code 参数。
- [ ] 公司 MCP、Skills、Plugins、代理与权限没有被 CMR 修改。
- [ ] 密钥未进入 Git、PowerShell 历史或日志。
- [ ] 旧方式仍可回退，或用户已明确接受迁移完成。
- [ ] Windows 实机验收记录已形成。

## 13. `1.1.0` setup 在公司 Windows 上的追加验收

如果阶段三执行时 `1.1.0` 已经通过 Mac 独立验收，则 Step 4 不再要求用户分别记忆 `cmr secret set` 命令，改用一次 `cmr setup` 完成新机密钥配置，并追加验证：

- 全新 `%APPDATA%\ClaudeModelRouter\state.json` 不存在时，首次交互运行无论已有零个、一个还是全部 Key，都先显示所有当前 Provider 的状态并进入 setup。
- 用户可只配置 DeepSeek，先完成旧工作流复现；之后再次运行 `cmr setup` 增加 Kimi。
- 用户可在 `cmr setup` 中随时更换 DeepSeek 或 Kimi Key；取消、输入失败或写入失败时旧 Key 保持可用。
- Key 不进入 PowerShell/CMD argv、命令历史或输出。
- setup 使用 `%APPDATA%` 的 Schema v1 Secret Store，不从 Mac/GitHub 复制凭据。
- PowerShell、CMD、Git Bash 的隐藏输入和 Ctrl+C 均能恢复终端状态。
- Setup State 只保存 `seenProviderIds`；以后版本新增 Provider 时，Windows 会再次显示全量状态并进入一次引导。

setup 只解决 CMR 自有 Secret Store，不自动清理公司电脑上已经存在的 Settings、PowerShell Profile 或用户/系统环境变量。阶段三仍须先执行 Step 1/2/8 的只读审计和并行验证；发现覆盖冲突时按 Step 10 提供预览、备份和回退，并在用户确认后处理。不得把“setup 已保存 Key”误报为“旧永久配置已安全迁移”。
