# 06 — 操作说明手册

状态：`1.3.0` 本机候选审阅完成、发布门禁未闭环；当前稳定版仍为 `1.2.1`
适用范围：Mac 与原生 Windows/WSL 的当前稳定用法

CMR 只在启动 Claude Code 前选择 Provider/Profile，并注入临时子进程环境。进入 Claude Code 后，任务用途、权限模式、会话和参数都遵循 Claude Code 原生行为。

## 1. 安装后第一次使用

先确认命令可用：

```bash
cmr version
```

当前仓库实现候选应输出 `1.3.0`；`1.2.1` 用户按本文档 bootstrap 升级后再使用候选自更新。然后在交互式终端执行：

```bash
cmr
```

首次运行时，无论当前已经保存零个、一个还是全部 Provider Key，CMR 都会先显示 Kimi 与 DeepSeek 的 `configured/missing` 状态并进入一次 setup：

- `configured`：Key 已保存到本机 CMR Secret Store；不表示已联网验证有效、余额或模型权限。
- `missing`：本机尚未保存该 Provider Key。
- `Configure all missing providers`：按顺序配置全部缺失项。
- `Set or replace ...`：只配置或更换选中的 Provider Key。
- `Not now` / `Keep current API Keys and continue`：保留当前状态并进入日常菜单。

向导会显示 Provider 官方 Key 页面。把 Key 粘贴到隐藏输入提示后按 Enter；终端不会显示字符、星号、长度或末四位。可以只配置一家，另一家以后再设置。

setup 明确完成或选择稍后继续后，CMR 会记录已看过当前 Provider；以后无参数 `cmr` 直接进入带状态的日常菜单。如果后续版本新增需要独立 Key 的 Provider，CMR 会再次显示一次全部 Provider 状态。

Ctrl+C、EOF、输入校验或写入失败不会把本轮误记为完成。多 Provider 配置时按家逐项保存：第二家失败不会回滚第一家已经安全保存的 Key。

## 2. 日常启动

先进入目标项目目录：

```bash
cd /path/to/your-project
cmr kimi
```

或：

```bash
cmr deepseek
```

进入后所有操作与正常 Claude Code 相同。用户不需要先写 Brief，也不需要按 `plan`→`build` 顺序使用。

Kimi 启动时只显示一行高费用提示、价格摘要和核验日期，不要求 `[y/N]` 确认。CMR 不记录 Claude Code 参数、prompt、session ID 或完整环境。

无参数 `cmr` 的日常菜单会显示：

- Kimi 与 DeepSeek Profile 及其实时 `configured/missing` 状态。
- `setup`：配置或更换 Key；结束后刷新菜单状态。
- `doctor`：执行只读诊断。
- `exit`：不启动 Claude Code，正常退出。

直接选择一个 `missing` Profile 时，交互式终端只配置当前 Provider；保存成功后继续原启动请求，无需重新输入命令。非交互环境不会等待输入，而是返回可操作的 missing 错误。

## 3. 配置或更换 Key

常用入口：

```bash
cmr setup
cmr setup kimi
cmr setup deepseek
```

已配置 Key 默认保留；只有明确确认替换后才会隐藏输入新值。空值、空白、换行、NUL、超长输入、EOF、Ctrl+C 或原子写入失败都保留旧 Key。只配置一家的情况下，另一家可稍后从 setup 或对应 Profile 启动进入就地配置。

Key 只存入仓库外 CMR Secret Store，向导不显示 Key 片段、长度、哈希或账号，不读取剪贴板、不接受 Key 命令参数、不联网验证，也不自动打开 Provider 页面；屏幕上只打印官方 HTTPS 创建入口。

如果 Claude Code 不在 PATH，向导会保留已经保存的 Key，并显示官方安装文档；不会自动安装、修改 PATH、Settings、Shell 或环境变量。`configured` 只表示 Key 已保存到本机 Store，不表示已联网验证有效性、余额或模型权限。

## 4. 继续当前目录最近会话

```bash
cmr kimi --continue
cmr deepseek --continue
```

含义是：使用当前选择的 Profile 环境，让 Claude Code 继续当前目录最近会话。CMR 不替用户核对旧会话原 Provider，也不阻止跨 Provider 使用。

## 5. 恢复指定会话或打开选择器

```bash
cmr kimi --resume
cmr deepseek --resume <session-id>
```

`--resume` 是否打开选择器、session ID 格式和查找规则由当前 Claude Code 决定。

项目文件和 Claude Code 保存的会话记录不会被 CMR 修改。普通文本与工具会话通常可以跨 Provider 恢复；少数包含新 Provider 不支持内容块或能力的会话可能自然报错。CMR 不自动判断、不建立 Session Registry，也不转换会话内容。

## 6. 恢复并创建新分支 session

```bash
cmr deepseek --fork-session --resume <session-id>
```

CMR 只按原顺序透传这组参数，不解释或重排组合。

## 7. 用任意 Profile 规划或执行

Profile 不绑定任务角色。例如 DeepSeek 也可以规划：

```bash
cmr deepseek --permission-mode plan
```

这里的 `--permission-mode plan` 是 Claude Code 权限模式；兼容别名 `cmr plan` 是 Kimi Profile，两者属于不同层级：

```bash
cmr plan --permission-mode plan
```

## 8. 非交互执行

```bash
cmr kimi -p "分析这个项目"
cmr deepseek -p "修复测试"
```

`-p/--print` 后的 prompt 原样交给 Claude Code，可能产生 Provider 用量；CMR 不记录或回显 prompt。

## 9. 模型覆盖

```bash
cmr kimi --model <model>
cmr deepseek --model <model>
```

CMR 不拦截 `--model`。若 Provider 不支持该模型，错误由 Claude Code 或 Provider 返回。恢复 Profile 默认模型时，退出并不带 `--model` 重新启动。

未知的未来 Claude Code 参数同样会被原样透传。

## 10. 兼容旧命令

```bash
cmr plan       # kimi 的兼容别名
cmr build      # deepseek 的兼容别名
```

别名支持与规范 Profile 相同的全部参数透传。

## 11. 完全可选的文件交接

CMR 对交接文档零约束。长期项目规则可继续写在 Claude Code 自动读取的 `CLAUDE.md`；具体任务可以使用任意自行命名的文档，并明确要求下一个模型读取。直接续聊或恢复原会话时，不需要额外交接文件。

## 12. 管理命令

```bash
cmr version
cmr list
cmr doctor
cmr config path
cmr setup
cmr setup kimi
cmr setup deepseek
cmr secret status
cmr secret set kimi
cmr secret set deepseek
cmr help
```

- `version`：显示 CMR 版本。
- `list`：显示 Profile、别名、Provider、公开模型映射和价格核验日期，不显示密钥。
- `doctor`：只读检查 Node、Claude Code、配置冲突、Secret Store 和当前目录。
- `config path`：显示仓库配置、本机 Secret Store 和 Setup State 路径。
- `setup`：显示全部 Provider 状态并配置或更换 Key；带 Provider ID 时只处理一家。
- `secret status`：只显示 `configured` 或 `missing`。
- `secret set`：在本机 TTY 隐藏输入，不把 Key 放进参数或历史。
- `help`：只显示 CMR 自己的帮助；查看 Claude Code 帮助请运行 `cmr kimi --help` 或 `cmr deepseek --help`。

在不含 `.gitignore` 的普通目录运行 `doctor` 时可能看到 `.gitignore is missing` 警告；这表示当前目录缺少该文件，不代表 CMR 安装失败。

## 13. 本机文件与安装维护

密钥只存放在仓库外的 CMR Secret Store。不要把真实 Key 写入仓库、命令行参数、日志或聊天。

macOS 默认位置：

```text
~/Library/Application Support/ClaudeModelRouter/secrets.json
~/Library/Application Support/ClaudeModelRouter/state.json
```

- `secrets.json`：Secret Store Schema v1，保存 Provider Key；不要手工打印、复制到仓库或编辑。
- `state.json`：只保存 Schema 版本和已看过的 Provider ID，不含 Key、账号、时间、路径或使用记录。

运行 `cmr config path` 可查看当前实际路径，但不会读取文件正文。Store 损坏或不可读时 CMR 会停止，避免覆盖现有 Key；不要自行删除文件，应先根据错误和备份方案确认恢复动作。

验收所用 Mac 的用户级 `cmr` 位于 `$HOME/.local/bin/cmr`，链接到本项目。移动、卸载或重新安装会改变本机命令环境，应先确认准确的安装位置和回退方式。

## 14. 退出码

| 场景 | 退出码 |
|---|---:|
| setup 成功、保留现有 Key、选择稍后或正常退出菜单 | `0` |
| setup 参数、配置、Store、输入初始化或写入失败 | `1` |
| setup 被 Ctrl+C/EOF 取消 | `130` |
| setup 成功后启动 Claude Code | Claude Code 的原退出码 |

自动化脚本不要依赖交互式 setup。应先在本机 TTY 完成配置，再在非 TTY 环境运行已配置的 Profile；缺 Key 时非 TTY 会快速失败而不是挂起。

## 15. 故障排查与边界

依次运行：

```bash
cmr version
cmr doctor
cmr list
cmr secret status
```

- `cmr: command not found`：检查用户级 bin 目录是否仍在 PATH，以及项目目录是否被移动。
- Windows 上 Claude 已安装但 CMR 报 `executable was not found`：升级到 `1.2.1`，再用 `Get-Command claude | Select-Object Source` 核对实际路径；CMR 会兼容任意大小写的 PATH 键，并后备检查 `%USERPROFILE%\.local\bin\claude.exe`。
- `missing ... secret`：交互式终端会就地配置当前 Provider 后继续原命令；非 TTY 请在本机 TTY 执行 `cmr setup <provider>` 或兼容的 `cmr secret set <provider>`。
- `setup requires an interactive terminal`：当前 stdin/stdout 不是完整 TTY；回到本机交互式终端运行 setup，不要通过管道传 Key。
- `setup could not be completed`：运行 `cmr config path` 定位 Store，再检查文件权限或损坏情况；不要直接覆盖或删除现有 Secret Store。
- setup 被取消：已成功保存的 Provider 保持 configured，未完成的 Provider 仍为 missing；重新运行 `cmr setup` 会从实时状态继续。
- `/status` 显示错误 Provider 或模型：退出会话并运行 `cmr doctor` 检查 Settings、Shell 和环境冲突；是否使用 `/model` 由用户按 Claude Code 原生规则决定，CMR 不拦截。
- 裸 `claude` 不再自动进入旧 Kimi 配置：使用 `cmr kimi` 或 `cmr deepseek` 选择本次 Provider。

CMR 不做提示词分类、请求级动态路由、代理层、失败自动回退、精确计费或 Codex 管理，也不修改 Claude Code Settings、Shell、MCP、Skills、Hooks、插件、主题或权限。

## 16. `1.3.0` 自更新（实现候选）

状态：**实现候选已完成本机审阅，但尚未发布**。`1.2.1` 用户须在 `v1.3.0` Release 正式发布后，先用 README 中的一次性 exact-release bootstrap 安装候选版本；之后才使用：

```bash
cmr update --check
cmr update
```

旧版若位于自定义 npm prefix，一次性 bootstrap 必须加 `--prefix <current-prefix>` 并保持原 prefix；不要依赖当前 npm 默认 prefix 猜测安装位置。

`--check` 只读检查固定 Release asset。`update` 只处理当前活动入口对应的实体 npm global package，使用临时 cache、exact prefix、`--ignore-scripts`、`--no-audit`、`--no-fund`，并执行 backup、install、verify、rollback。源码链接、checkout、junction、Homebrew、WinGet 或无法唯一识别来源的安装不自动替换；请按原来源手工维护。Release 尚未创建前，不要把上述命令当作当前可用的公开升级通道。
