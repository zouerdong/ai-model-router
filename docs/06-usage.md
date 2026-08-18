# 06 — 操作说明手册

状态：当前公开 Latest 稳定版为 `1.5.0`（2026-08-18 发布）
适用范围：Mac 与原生 Windows/WSL

Kimi Code repository implementation candidate is complete.
Real membership Provider validation is pending.
The current public Latest stable release is v1.5.0.

CMR 只在启动 Claude Code 前选择 Provider/Profile，并注入临时子进程环境。进入 Claude Code 后，任务用途、权限模式、会话和参数都遵循 Claude Code 原生行为。

## 1. 安装后第一次使用

先确认命令可用：

```bash
cmr version
```

公开稳定 Release 应输出 `1.5.0`；从本仓库源代码运行时 `cmr version` 同样输出 `1.5.0`。`1.3.0` 用户可运行 `cmr update`；`1.2.1` 或更旧版本先按 README 的 exact-release bootstrap 升级。然后在交互式终端执行：

```bash
cmr
```

首次运行时，无论当前已经保存零个、一个还是全部 Provider Key，CMR 都会先显示 Kimi、DeepSeek、GLM Coding Plan、GLM API 与 Kimi Code 的 `configured/missing` 状态并进入一次 setup：

- `configured`：Key 已保存到本机 CMR Secret Store；不表示已联网验证有效、余额、会员额度或模型权限。
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
cmr glm       # GLM Coding Plan
cmr glm-api   # GLM standard API pay-as-you-go
```

`1.5.0` 稳定版还提供三个 Kimi Code 入口：

```bash
cmr kimi-code              # kimi-for-coding；所有 Kimi Code 会员；262144 上下文
cmr kimi-code-k3-256k      # k3-256k；Moderato 及以上；262144 上下文
cmr kimi-code-k3           # k3[1m]；Allegretto 及以上；1048576 上下文
```

进入后所有操作与正常 Claude Code 相同。用户不需要先写 Brief，也不需要按 `plan`→`build` 顺序使用。

Kimi 启动时只显示一行高费用提示、价格摘要和核验日期，不要求 `[y/N]` 确认。CMR 不记录 Claude Code 参数、prompt、session ID 或完整环境。

无参数 `cmr` 的日常菜单会显示：

- Kimi、DeepSeek、GLM Coding Plan、GLM API 与三个 Kimi Code Profile 及其实时 `configured/missing` 状态。
- `setup`：配置或更换 Key；结束后刷新菜单状态。
- `doctor`：执行只读诊断。
- `exit`：不启动 Claude Code，正常退出。

直接选择一个 `missing` Profile 时，交互式终端只配置当前 Provider；保存成功后继续原启动请求，无需重新输入命令。三个 Kimi Code Profile 共用 `kimi-code` Secret，只需配置一次。非交互环境不会等待输入，而是返回可操作的 missing 错误。

## 3. 配置或更换 Key

常用入口：

```bash
cmr setup
cmr setup kimi
cmr setup deepseek
cmr setup glm
cmr setup glm-api
cmr setup kimi-code
```

已配置 Key 默认保留；只有明确确认替换后才会隐藏输入新值。空值、空白、换行、NUL、超长输入、EOF、Ctrl+C 或原子写入失败都保留旧 Key。只配置一家的情况下，另一家可稍后从 setup 或对应 Profile 启动进入就地配置。

Kimi Code 会员 Key 使用独立的 `kimi-code` Secret；Kimi 开放平台 `kimi` Key 不能代用。两者的 Key 创建入口、Secret 槽位、端点、鉴权变量和账单均不通用：开放平台使用 `https://api.moonshot.cn/anthropic`、`ANTHROPIC_AUTH_TOKEN` 和按 Token 付费；Kimi Code 使用 `https://api.kimi.com/coding/`、`ANTHROPIC_API_KEY` 和会员额度。

Key 只存入仓库外 CMR Secret Store，向导不显示 Key 片段、长度、哈希或账号，不读取剪贴板、不接受 Key 命令参数、不联网验证，也不自动打开 Provider 页面；屏幕上只打印官方 HTTPS 创建入口。

如果 Claude Code 不在 PATH，向导会保留已经保存的 Key，并显示官方安装文档；不会自动安装、修改 PATH、Settings、Shell 或环境变量。`configured` 只表示 Key 已保存到本机 Store，不表示已联网验证有效性、余额、会员额度或模型权限。

## 4. 继续当前目录最近会话

```bash
cmr kimi --continue
cmr deepseek --continue
cmr glm --continue
cmr glm-api --continue
cmr kimi-code --continue
```

含义是：使用当前选择的 Profile 环境，让 Claude Code 继续当前目录最近会话。CMR 不替用户核对旧会话原 Provider，也不阻止跨 Provider 使用。

## 5. 恢复指定会话或打开选择器

```bash
cmr kimi --resume
cmr deepseek --resume <session-id>
cmr glm --resume <session-id>
cmr glm-api --resume <session-id>
cmr kimi-code --resume <session-id>
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
cmr glm -p "分析这个项目"
cmr glm-api -p "分析这个项目"
cmr kimi-code -p "分析这个项目"
```

`-p/--print` 后的 prompt 原样交给 Claude Code，可能产生 Provider 用量；CMR 不记录或回显 prompt。

## 9. 模型覆盖

```bash
cmr kimi --model <model>
cmr deepseek --model <model>
cmr glm --model <model>
cmr glm-api --model <model>
cmr kimi-code --model <model>
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
cmr setup glm
cmr setup glm-api
cmr setup kimi-code
cmr secret status
cmr secret set kimi
cmr secret set deepseek
cmr secret set glm
cmr secret set glm-api
cmr secret set kimi-code
cmr help
```

- `version`：显示 CMR 版本。
- `list`：显示 Profile、别名、Provider、公开模型映射和价格/权益核验日期，不显示密钥。
- `doctor`：只读检查 Node、Claude Code、配置冲突、Secret Store 和当前目录。
- `config path`：显示仓库配置、本机 Secret Store 和 Setup State 路径。
- `setup`：显示全部 Provider 状态并配置或更换 Key；带 Provider ID 时只处理一家。
- `secret status`：只显示 `configured` 或 `missing`。
- `secret set`：在本机 TTY 隐藏输入，不把 Key 放进参数或历史。
- `help`：只显示 CMR 自己的帮助；查看 Claude Code 帮助请运行任一 Profile 的 `--help`，包括 `cmr kimi-code --help`。

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

运行 `cmr config path` 可查看当前实际路径，但不会读取文件正文。Store 损坏或不可读时 CMR 会停止，避免覆盖现有 Key；不要自行删除文件，应先根据错误和备份方案确认恢复动作。`1.4.0` 写入 `glm` 或 `glm-api` 后，手工降级到 `1.3.0` 可能使旧版拒绝四 Provider Store；`1.5.0` 候选写入第五个 `kimi-code` Secret 后，手工降级到公开 `1.4.0` 可能使旧版拒绝整个五 Provider Store。不得为降级自动删除字段，应先制定脱敏备份与兼容方案。

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
- 裸 `claude` 不再自动进入旧 Kimi 配置：使用 `cmr kimi`、`cmr deepseek`、`cmr glm`、`cmr glm-api` 或本候选的 `cmr kimi-code*` 显式选择本次 Provider。

CMR 不做提示词分类、请求级动态路由、代理层、失败自动回退、精确计费或 Codex 管理，也不修改 Claude Code Settings、Shell、MCP、Skills、Hooks、插件、主题或权限。

## 16. `1.3.0` 自更新

状态：**已发布并通过跨平台验收**。`1.2.1` 用户先用 README 中的一次性 exact-release bootstrap 安装 `1.3.0`；之后使用：

```bash
cmr update --check
cmr update
```

旧版若位于自定义 npm prefix，一次性 bootstrap 必须加 `--prefix <current-prefix>` 并保持原 prefix；不要依赖当前 npm 默认 prefix 猜测安装位置。

`--check` 只读检查固定 Release asset。`update` 只处理当前活动入口对应的实体 npm global package，使用临时 cache、exact prefix、`--ignore-scripts`、`--no-audit`、`--no-fund`，并执行 backup、install、verify、rollback。源码链接、checkout、junction、Homebrew、WinGet 或无法唯一识别来源的安装不自动替换；请按原来源手工维护。

## 17. GLM-5.3 Coding Plan（当前仓库候选）

当前仓库候选提供：

```bash
cmr glm [claude args...]
cmr glm-5.3 [claude args...]
cmr glm-5.2 [claude args...]
cmr glm-plan [claude args...]
```

四种入口等价。当前 `glm` Coding Plan 使用 GLM-5.3：Opus/Sonnet 为 `glm-5.3[1m]`，Haiku 为 `glm-4.7`。它只使用 `ANTHROPIC_AUTH_TOKEN`、`https://open.bigmodel.cn/api/anthropic` 和独立 `glm` Secret Store 槽位；费用提示使用通用 subscription quota 话术，不显示标准 API 单价。它不是 `glm-api`、`glm-payg` 或标准按量 API；CMR 不识别 Key 类型、不查询余额，也不会在套餐额度耗尽、401、1113 或任何失败后自动切换到按量 API。

`configured` 只表示 GLM Key 已保存到本机 Store，不表示 CMR 会持续联网验证有效性、套餐状态或费用通道。`1.4.0` 中 GLM-5.2 Coding Plan 的 Provider 验收与发布历史见 `docs/16-v1.4-unified-glm-release.md`；当前 GLM-5.3 候选尚未执行真实 Provider 或发布门禁。

## 18. `1.4.0` GLM 标准 API 按量付费

稳定版新增：

```bash
cmr glm-api [claude args...]
cmr glm-payg [claude args...]
```

`glm-api` 是规范入口，`glm-payg` 是唯一别名。它与 `glm`（GLM Coding Plan）共享 `https://open.bigmodel.cn/api/anthropic`，但它们不是同一费用或鉴权通道：

| 入口 | 凭据变量 | Secret Store 槽位 | 费用语义 |
|---|---|---|---|
| `cmr glm` | `ANTHROPIC_AUTH_TOKEN` | `glm` | Coding Plan |
| `cmr glm-api` / `cmr glm-payg` | `ANTHROPIC_API_KEY` | `glm-api` | 智谱标准 API 按量计费 |

`glm-api` 启动前会显示一行标准 API 直接计费提示；其 GLM-5.2 cache hit、input、output 参考价从公开配置读取，不估算会话费用、不查询余额，也不要求 CMR 二次确认。Claude Code 自己首次检测到 API Key 时可能出现原生确认提示，CMR 不拦截或代答。

截至 2026-08-16，智谱官方仍将 GLM-5.3 模型 API 标为即将上线；因此 Coding Plan 已使用 GLM-5.3 不代表 `glm-api` 已迁移。标准 API 继续使用 GLM-5.2、`ANTHROPIC_API_KEY` 和现有 2/8/28 CNY/M Pricing。

不要把 Coding Plan Key 写入 `glm-api`，也不要把标准 API Key 写入 `glm`。CMR 不探测 Key 类型，不会同时注入两种鉴权变量；Plan 额度、401/403/429、欠费或任意 Provider 错误都不会触发 `glm` 与 `glm-api` 之间的自动 fallback。请通过命令显式选择费用通道。

非 TTY 缺少 `glm-api` Key 会立即提示：

```text
missing GLM Standard API (Pay-as-you-go) secret; run cmr secret set glm-api
```

交互式终端可以执行 `cmr setup glm-api` 或直接运行 `cmr glm-api` 进行仅该槽位的隐藏输入配置；取消时不会启动 Claude Code。

## 19. `1.5.0` Kimi Code 会员

本节描述 `1.5.0` 公开稳定版中的 Kimi Code 会员 Profile。三个 Profile 如下：

| 规范 Profile | 兼容别名 | Claude Code 选择值 | 最低已知会员档位 | 上下文 |
|---|---|---|---|---:|
| `kimi-code` | `kimi-membership` | `kimi-for-coding` | 所有 Kimi Code 会员 | `262144` |
| `kimi-code-k3-256k` | `kimi-membership-k3-256k` | `k3-256k` | Moderato 及以上 | `262144` |
| `kimi-code-k3` | `kimi-membership-k3` | `k3[1m]`（上游 `k3`） | Allegretto 及以上 | `1048576` |

三个 Profile 共用 `kimi-code` Secret，并将主模型、Opus、Sonnet、Haiku、Fable 与子 Agent 映射到各自的 Kimi Code 模型。`k3[1m]` 只是 Claude Code 选择层值；CMR 不把它当成上游模型 ID。

Kimi Code 是订阅额度通道：官方规则包括按订阅日每 7 天刷新且不结转、独立滚动 5 小时限流窗口、设备和 API Key 共用相关额度，以及月度总额度耗尽后可能冻结。启用 Extra Usage 后，订阅额度耗尽可能从共享余额按实际用量扣费；CMR 不查询用量、不启用 Extra Usage、不修改月度支出上限，也不承诺无限额度或绝不额外扣费。

Kimi Code 仅用于官方允许的个人交互式开发场景。企业集成、商业服务和非交互式批处理不属于本候选的授权范围，应另行按官方政策评估，必要时使用 Kimi 开放平台等适合的产品通道。

Kimi Code 会员 Key 与 Kimi 开放平台 Key、Secret、端点、鉴权变量、额度和账单均不通用：

| 通道 | CMR 入口 / Secret | Base URL | 鉴权变量 | 费用 |
|---|---|---|---|---|
| Kimi 开放平台 | `cmr kimi` / `kimi` | `https://api.moonshot.cn/anthropic` | `ANTHROPIC_AUTH_TOKEN` | 开放平台按 Token 付费 |
| Kimi Code 会员 | `cmr kimi-code*` / `kimi-code` | `https://api.kimi.com/coding/` | `ANTHROPIC_API_KEY` | 会员额度；显式开启 Extra Usage 后可能额外扣费 |

不要交叉填入 Key；CMR 不识别 Key 类型、不复制 Key、不查询余额，也不在失败后自动切换 Provider。

真实 Provider 验收已于 2026-08-18 完成（用户授权，Allegretto+ 档，Extra Usage 全程关闭，脱敏回读）：三个 Profile 均判 `PROVIDER PASS`——无头环境直启、最小主请求、工具调用、子 Agent、`--model` 显式切换全部通过；`/status` 证实 Base URL 与 API Key 通道；`k3[1m]` 1M 窗口实测可用；`CLAUDE_CODE_EFFORT_LEVEL=high` 注入生效且优先于会话内 `/effort`。归属闭环：Kimi Code Console weekly 0%→1%、5 小时窗 7%，Moonshot 开放平台当日零请求。详见 `docs/17` §14 与 `docs/08` §16。

HighSpeed 决策（2026-08-18，决策 2 —— 仅文档化显式切换）：`--model kimi-for-coding-highspeed` 已真实验证可用，可作为经 CMR 透传的显式切换方式；不新增 `kimi-code-fast` Profile，Claude Code `/fast` 不作为 Kimi HighSpeed 入口（其交互行为与持久化本轮未实测）。交互式 `/model` 与 `/effort` 会写入新会话默认（Claude Code 原生行为）；`--model` 与 CMR 环境映射只作用于本次启动。

### 首次交互启动（全新 Claude 配置）

以下界面每个 Claude 配置目录只出现一次；日常已初始化的 `~/.claude` 不会出现，无头 `-p` 模式完全不出现：

1. 主题选择——任选后回车。
2. `Detected a custom API key in your environment — Do you want to use this API key?`——**选 `1. Yes`**。默认推荐是 `2. No`；一旦拒绝，Claude Code 会记住该拒绝并进入登录方式选择界面（该界面没有 Esc 出口）。若已误入：Ctrl+C 退出后用 `/config` 的 "Use custom API key" 开关恢复，或换一个全新配置目录重来。
3. 信任目录——回车。
4. 首跑还会对 `api.anthropic.com` 做一次性连通性检查；代理瞬断会直接退出（`Unable to connect to Anthropic services`），链路恢复后重试即可。日常 Kimi Code 流量走 `api.kimi.com`，不依赖该检查。

发布状态（2026-08-18）：

```text
Kimi Code membership is part of the public v1.5.0 Latest stable release.
Real membership Provider validation passed on 2026-08-18 (all three profiles).
Windows, GitHub, and release gates all closed; public readback verified.
```
