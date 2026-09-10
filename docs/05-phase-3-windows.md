# 05 — 阶段三：公司 Windows 拉取与配置计划

状态：公开稳定版 `2.0.0` 已通过第 16 节 Windows T4 双档追加门并完成 Release 回读
核心原则：先验证 DeepSeek V4.1 Flash 单入口，再验证其他 Profile；升级验证可回退到前一稳定版，不在 `2.0.0` 内保留旧模型别名。

> `1.0.0` 的规范入口是 `cmr deepseek` 与 `cmr kimi`；Windows 阶段同时验证 `cmr build` 与 `cmr plan` 兼容别名。Profile 只选择 Provider，不限制任务用途或 Claude Code 参数。

## 1. 阶段三目标

在公司 Windows 台式机上：

1. 从 GitHub 拉取阶段一已经验收的同一份源码。
2. 保留现有 DeepSeek Key、Base URL 与本机 Secret，不迁移凭据。
3. 让 `cmr deepseek` 使用官方 V4.1 Flash 映射，并确认旧品牌入口已拒绝。
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
- 前一稳定版 `v1.8.2` 与当前 `v2.0.0` V4.1 Flash 的无密钥模型映射快照。

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
2. 如需复核迁移基线，checkout 前一稳定版 `v1.8.2` tag，并在独立目录与当前 `v2.0.0` 比较。
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
4. `/status` 应显示 `deepseek-flash[1m]` 和 DeepSeek Base URL。
5. Profile 快照必须显示 Opus/Sonnet=`deepseek-flash[1m]`、Haiku/子 Agent=`deepseek-flash`、compact=`786432`、max-context=`1048576`。
6. 将行为与 Step 2 基线比较。

如果永久 Settings 覆盖 CMR，停止并展示迁移预览。不能直接删旧配置。

## 9. Step 6 — 再验证 `cmr kimi`

DeepSeek V4.1 Flash 通过后，再在临时目录测试 Kimi：

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

- [ ] Windows 在独立目录比较前一稳定版 `v1.8.2` 与当前 `v2.0.0`。
- [ ] `cmr deepseek` 使用 DeepSeek V4.1 Flash 精确映射，`cmr build` 快照等价。
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

## 14. `1.2.1` 已闭环问题与剩余范围

2026-07-24，公司原生 Windows 使用暴露出 Claude 已安装但 CMR 无法发现，以及 Doctor 对 Windows Settings 输出 POSIX 权限警告的问题。根因分别是环境副本保留 `Path` 键名而发现逻辑只读取 `PATH`，以及 Doctor 未在用户 Settings 权限分支排除 `win32`。

`1.2.1` 已完成：

- Windows PATH 键名大小写不敏感查找。
- `%USERPROFILE%\.local\bin\claude.exe` 官方原生安装目录后备查找。
- 目标平台路径 delimiter/join，允许非 Windows 主机可靠模拟。
- Windows 用户 Settings 不再显示 POSIX mode 警告。
- 对上述分支的独立自动化回归与 Mac 全量回归。

仍未完成、不得提前标记 PASS：

- 在公司电脑重新 checkout `v1.2.1` 后复跑 PowerShell、CMD 与 Git Bash。
- 隐藏输入、Ctrl+C、`%APPDATA%` ACL、Secret/State 原子替换的实机证据。
- DeepSeek/Kimi `/status`、最小请求、子 Agent 与现有公司工作流对照。
- 旧永久配置的迁移预览、备份、用户确认与回退演练。

## 15. `1.3.0` 自更新状态

状态：**PASS — Windows T4 GitHub-hosted Windows VM 验收完成；正式 Release 门禁另行执行**。

Updater 已提供 Windows `.cmd`/`.bat` 的显式 `cmd.exe /d /c` argv 边界、Windows global package 识别、junction/source-link fail-closed、exact prefix 与 install 后绝对入口验证。GitHub Actions [run 30094641599](https://github.com/zouerdong/ai-model-router/actions/runs/30094641599) 在 `windows-2025` x64 VM 上，以 Node `18.20.8` 与 Node `24.18.0` 分别完成 PowerShell 全量回归，并在 PowerShell、CMD、Git Bash 三种 shell 中重复通过 5/5 T4 E2E；候选包打包 hash 在两档 Node 下相同。该结果闭环 self-update 的 Windows T4，但不替代本文件中的真实 Provider、凭据 ACL、公司旧配置迁移等完整阶段三工作。

## 16. `2.0.0` DeepSeek V4.1 Flash Windows 追加门

绑定合同：`docs/25-v2.0-deepseek-v4.1-flash-migration.md`。在 Node 18.20.x 与当前 Node LTS 双档完成 PowerShell、CMD、Git Bash T4，并额外验证：

- catalog 只展示 `deepseek` 一个 DeepSeek Profile；`build` 仍解析到它。
- `deepseek-auto`、`deepseek-vision`、`deepseek-flash-vision` 均返回 unknown profile，且不启动 Claude Code。
- 假 Claude 快照精确包含 `deepseek-flash[1m]` / `deepseek-flash`、compact `786432`、max-context `1048576`，不包含 `[text]` / `[image]`。
- 现有 `%APPDATA%\ClaudeModelRouter\secrets.json` 中的 `deepseek` Key 可直接沿用；测试不得打印或移动真实 Key。
- `1.8.2 -> 2.0.0` 实体 `cmr update` 在发布门执行，并回读版本、list 与旧入口拒绝行为；本次已成功完成，失败场景仍必须能恢复 `1.8.2`。

2026-09-10 首轮结论：候选 commit `7aa8e18b3576988244468771dfc8657fc011f7ef` 在 [Windows T4 run 34455293821](https://github.com/zouerdong/ai-model-router/actions/runs/34455293821) 的 Windows Server 2025 x64 / Node `18.20.8` 与 `24.20.0` 双档全绿；两档均通过 PowerShell T4 E2E、PowerShell 全量回归、CMD 与 Git Bash 假 Key E2E、pack 和证据上传。两档 tarball 均为 41 files、48,556 bytes，SHA-256 同为 `4d66f5f3d8a896a57d7be43149cf17cfd55d6b09a4cb89d9a4f7b65ead088622`。

该结果闭环 Windows 代码、shell 与候选包兼容性，并以隔离假 Secret 证明既有 `deepseek` 槽位合同未改变；未读取公司电脑或用户真实 `%APPDATA%`。

发布前 staging 随后发现 `7aa8e18` 打包的 README 仍保留候选状态与 `v1.8.2` exact 安装 URL。运行时 Windows PASS 不受影响，但 README 属于 npm payload，因此最终 release commit `2f4ce292085a76255b81e02a2b2fb6b48459c54e` 已修正该口径，并由 [Windows T4 run 34472718163](https://github.com/zouerdong/ai-model-router/actions/runs/34472718163) 重新完成双档矩阵：全部步骤 PASS；两档 tarball 均为 41 files、48,519 bytes、196,900 unpacked bytes，SHA-256 同为 `fb78d4bfe51a56f4c2e7c8efb99a86cab8bb13c207c3957d0fb3bc1ecbcae54c`。

最终结论：**PASS — `v2.0.0` WINDOWS + RELEASED**。tag 固定指向上述最终提交；公开 fixed asset SHA-256 为 `49cd63654634c8995721df5e46bb840788bde0ac7289a121ee3fe71562921cdf`。exact/latest 字节一致，公开隔离安装与 `update --check` 通过，隔离 prefix 内的 `1.8.2 -> 2.0.0` 真实完整更新成功，更新后版本、单一 DeepSeek 入口、三个旧入口拒绝及更新锁清理均回读通过。
