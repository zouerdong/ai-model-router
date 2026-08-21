# 01 — 产品范围

状态：`1.5.0` 公开 Latest 稳定发布（2026-08-18）；Kimi Code 会员 Provider 已真实验收并发布，GLM-5.3 Coding Plan 升级同版发布
更新时间：2026-08-16

## 1. 一句话定义

Claude Model Router（命令 `cmr`）是一个跨平台 Claude Code Profile 启动器：用户先选择 Kimi 或 DeepSeek，工具只为随后启动的 Claude Code 子进程注入对应第三方模型配置。

“Router”只表示**启动前选择**，不表示任务角色限制、请求级动态路由或 Claude Code 会话管理。

## 2. 要解决的原始问题

当前第三方模型配置永久分散在 Claude Code Settings、Shell 环境变量和不同电脑中。直接手改容易出现四类问题：

1. 旧 Base URL、密钥和模型映射互相覆盖。
2. 主模型切换成功，但后台任务或子 Agent 仍请求错误模型。
3. Mac 与 Windows 配置无法安全复用。
4. Profile 名称与工作角色绑定后，简单使用被迫变成“先规划、再执行”的固定流程。

根因是 `0.1.x` 把“推荐用 Kimi 规划、DeepSeek 执行”写成了 CLI 限制：命令名是 `plan/build`，拒绝透传 Claude Code 参数，并禁止正常的 `--continue`、`--resume` 工作方式。这超出了启动器应承担的职责。

最直接的解法不是建立智能网关或 Session Registry，而是把两套官方映射做成透明 Profile：CMR 只选 Provider 并清理/注入环境，随后完全遵循 Claude Code 原生参数、会话与交互习惯。仓库文件式交接继续作为复杂跨模型协作的推荐方法，但不强制。

## 3. `1.0.0` 最终工作形态

### 3.1 先选择 Profile，再使用原生 Claude Code

用户在目标项目目录执行：

```bash
cmr kimi
cmr deepseek
```

- `kimi`：注入 Kimi K3 的完整映射；可用于规划，也可编码、调试、运行工具或续聊。
- `deepseek`：注入 DeepSeek Auto 的完整映射；可用于编码，也可规划、分析或续聊。

CMR 不根据任务内容决定角色，不更改权限模式，不限制会话用途。Profile 只回答“这次启动 Claude Code 时连接哪套 Provider”。

### 3.2 Claude Code 参数透明透传

Profile 选择器之后的每一个参数都属于 Claude Code，CMR 必须保持顺序和值并原样传递，例如：

```bash
cmr kimi --continue
cmr kimi --resume <session-id>
cmr deepseek --fork-session --resume <session-id>
cmr deepseek --permission-mode plan
cmr kimi -p "分析并修改这个项目"
cmr deepseek --model <provider-supported-model>
```

CMR 不解析、拒绝、改写或记录这些参数。参数是否合法、如何选择会话、模型是否被当前 Provider 支持，均由当前安装的 Claude Code 与 Provider 返回结果决定。

### 3.3 续聊与跨 Provider 恢复

- `--continue`：由 Claude Code 按当前工作目录继续最近会话；本次进程使用用户刚选择的 Profile 环境。
- `--resume [value]`：由 Claude Code 打开选择器或指定会话；本次进程使用用户刚选择的 Profile 环境。
- `--fork-session`：与 Claude Code 原生命令组合使用，CMR 不增加特殊逻辑。
- 用户可显式选择与旧会话不同的 Provider。CMR 不阻止，也不承诺历史会话中的模型名、工具状态或上下文一定与新 Provider 兼容。
- CMR 不建立 Session Registry，不保存会话 ID，不推断旧会话原 Provider，也不自动替用户选择 Profile。

普通文本与工具会话通常可以跨 Provider 恢复。项目文件与本地会话记录不会被 CMR 修改；少数包含新 Provider 不支持内容块的会话可能由 Claude Code 或 Provider 报错。CMR 不规定交接文档名称或流程。

## 4. `1.0.0` 用户命令

| 命令 | 作用 |
|---|---|
| `cmr` | 显示 Kimi、DeepSeek、Doctor 与退出选项 |
| `cmr kimi [claude args...]` | 以 Kimi K3 启动 Claude Code，并透传全部后续参数 |
| `cmr deepseek [claude args...]` | 以 DeepSeek Auto 启动 Claude Code，并透传全部后续参数 |
| `cmr plan [claude args...]` | `kimi` 的兼容别名，不再代表功能限制 |
| `cmr build [claude args...]` | `deepseek` 的兼容别名，不再代表功能限制 |
| `cmr list` | 显示 Profile、别名和模型映射，不显示密钥 |
| `cmr doctor` | 只读检查安装、密钥状态与配置冲突 |
| `cmr config path` | 显示本机配置和密钥文件位置 |
| `cmr secret set <provider>` | 在本机交互式写入 Provider 密钥 |
| `cmr secret status` | 只显示 Provider 为 configured/missing |
| `cmr version` | 显示版本 |

Profile 规范 ID 为 `kimi`、`deepseek`。`kimi-k3`、`deepseek-auto` 继续作为数据化兼容别名；管理命令名不得被 Profile 或别名占用。

`cmr help` 只说明 CMR 自己的选择器和管理命令。查看 Claude Code 帮助应执行 `cmr kimi --help` 或 `cmr deepseek --help`，其输出由 Claude Code 负责。

## 5. `1.0.0` 功能范围

### 必须完成

- 两个 Profile 的数据化配置与校验。
- 临时子进程环境注入，不污染父终端。
- 当前目录继承、交互终端继承、Ctrl+C 与退出码传递。
- Mac 上的只读冲突诊断、假 Claude 全链路验收与真实 Claude 非计费 `--help/--version` 透传检查。
- 仓库外的本机密钥存储，密钥全链路脱敏。
- Kimi 启动前显示一行高费用信息和价格数据核验日期，但不再增加 `[y/N]` 二次确认。
- 完整透传 Claude Code 参数，包括当前已知和未来新增参数。
- 保留 `plan/build` 兼容别名，避免破坏现有脚本与习惯。
- 使用假 Claude 进程完成自动化测试。
- 核心实现不依赖 Mac 专用 Shell，提前保留 Windows 平台适配点。

### 明确不做

- Kimi K2.7 Code 或 HighSpeed。
- DeepSeek Pro-only、Flash-only 等额外 Profile。
- 同一 Claude Code 进程内动态切换 Provider 或按请求跨供应商路由。
- 提示词分类器、LiteLLM、本地 API 代理、失败自动降级。
- 精确 Token 计费、预算硬阻断、用量代理。
- Codex 模型管理。
- MCP、Skills、Hooks、插件、主题或权限管理。
- GUI、托盘菜单、云端密钥同步。
- 自动清理用户已有 Claude Code 或 Shell 配置。
- 会话列表、会话 Provider 归属数据库、跨 Provider 兼容性翻译或自动恢复策略。
- 对 Claude Code 参数进行安全代理、语义校验或白名单过滤。

## 6. 费用边界

`1.0.0` 只做“价格意识”，不声称能够计算真实会话费用：

- Profile 保存费用等级、官方定价链接与最后核验日期。
- `kimi` 启动前显示 K3 为高费用模式，但不要求额外确认。
- 不记录提示词内容。
- 不根据会话时长估算 Token。

逐请求精确费用需要可靠 usage 数据或代理层，会增加流式转发、Tool Call 与公司网络故障面，故不属于当前产品范围。

## 7. 成功标准

`1.0.0` 在 Mac 上成功，需要同时满足：

1. Codex 的配置和运行方式完全未改动。
2. `cmr kimi --help` 到达真实 Claude Code；假 Claude 环境快照显示 Kimi 官方 Base URL 和 `kimi-k3[1m]`。
3. `cmr deepseek --help` 到达真实 Claude Code；假 Claude 环境快照显示 DeepSeek 官方 Base URL 和 `deepseek-v4-pro[1m]`。
4. DeepSeek Profile 生成的环境快照严格匹配官方 Auto 映射。
5. 从任意测试项目目录启动后，Claude Code 仍在该目录。
6. Claude Code 退出后，父终端原有环境没有被改变。
7. 日志、错误、测试与 Git 候选文件中没有真实 API Key。
8. 当前 Mac 已完成的永久配置迁移保持不变，本轮没有再次修改用户 Settings、Shell 或 Secret Store。
9. `--continue`、`--resume`、`--fork-session`、`--permission-mode`、`--model`、`-p` 等代表性参数通过假 Claude 逐参数透传测试。
10. 透传参数不会出现在 CMR 自己的日志、错误或费用提示中。
11. `plan/build` 作为兼容别名与 `kimi/deepseek` 产生相同环境与参数行为。
12. Kimi 不再出现额外确认；一次命令即可进入 Claude Code。

## 8. 三阶段总览

| 阶段 | 目标 | 完成门槛 |
|---|---|---|
| 1. Mac `0.1.x` | 已完成 CLI、配置迁移与两 Provider 验收 | 见 `docs/09-phase-1-acceptance.md` |
| 1R. `0.2.0` | 改为透明 Profile 启动器并恢复 Claude Code 原生使用习惯 | 本文第 7 节及 `docs/10-v0.2-transparent-profile-launcher-implementation-brief.md` 全部通过 |
| 2. GitHub | 建立唯一源码仓库并安全首次推送 | 密钥扫描通过，用户批准 push，远端校验通过 |
| 3. Windows | 复现公司 DeepSeek 工作流并接入 Kimi | 旧方式仍可回退，两 Profile 在原工作环境验收 |

## 9. `1.1.0` 首次运行配置向导（已实现并通过 Mac 独立验收）

> 本节描述 `1.1.0` 已验收行为。实施合同、Luna 交接证据与 Sol 最终验收记录见 `docs/11-v1.1-first-run-setup-implementation-brief.md`。

### 9.1 要解决的问题

`1.0.0` 已经能够安全保存密钥，但首次使用者必须分别理解并执行：

```bash
cmr secret set kimi
cmr secret set deepseek
cmr secret status
```

这暴露了内部管理命令，而没有完成“安装后第一次打开即可配置”的产品闭环。根因不是缺少 Secret Store，而是现有 CLI 没有把“发现缺失密钥 → 解释获取位置 → 隐藏输入 → 保存 → 给出下一步”编排成一个状态明确的交互流程。

### 9.2 用户可见合同

`1.1.0` 必须增加以下行为：

1. 新用户在交互式终端首次执行无参数 `cmr` 时，无论当前是零个、一个还是全部 Provider Key 已配置，都先显示全部 Provider 的 `configured/missing` 状态并进入简短配置向导。
2. `cmr setup` 可随时显式进入管理向导；允许配置两家、只配置 Kimi、只配置 DeepSeek，也允许更换任一已配置 Provider 的 API Key。
3. 用户直接执行 `cmr kimi` 或 `cmr deepseek` 而对应密钥缺失时，交互式终端只引导配置当前 Provider；保存成功后继续原启动请求，不要求用户重新输入命令。
4. 首次引导完成或用户看过状态后明确选择“稍后配置”，才记录本机已完成 onboarding；后续无参数 `cmr` 进入带状态的普通菜单，不反复强制引导。
5. `cmr setup kimi` / `cmr setup deepseek` 是配置或更换单个 Key 的直达入口。已配置的 Key 默认保留；只有用户明确选择目标并确认替换后才读取新 Key，新值校验和原子写入失败时旧值必须保持可用。
6. 非交互环境永不等待输入。无参数 `cmr` 保持打印帮助；缺密钥的 Profile 启动返回脱敏、可操作的错误。
7. 向导完成后只报告 `configured/missing`、Claude Code 是否可发现、可运行的下一条命令；不显示密钥、前后缀、长度或透传参数。

### 9.3 “首次”的定义

首次使用与 Key 是否缺失是两个不同状态，不能互相代替：

- **首次使用状态**：由仓库外的非敏感 `state.json` 记录用户已经看过哪些 Provider 的 setup 引导。
- **密钥状态**：继续由 Secret Store 实时返回各 Provider 的 `configured/missing`。

目标状态 Schema：

```json
{
  "version": 1,
  "seenProviderIds": ["deepseek", "kimi"]
}
```

每次无参数 TTY 启动时，从数据化 Provider 配置取得当前 ID 集合：

- `state.json` 不存在：这是当前本机用户上下文的首次运行，无条件进入向导并显示全量 Key 状态。
- 当前 Provider 中存在尚未出现在 `seenProviderIds` 的 ID：说明版本新增了 Provider，再次进入向导并显示全量状态；不能只显示新增项而隐藏已有状态。
- 全部当前 Provider 已 seen：进入日常带状态菜单；Key 后来变为 missing 也不重复强制 onboarding，用户可从菜单、`cmr setup` 或缺 Key Profile 启动进入配置。
- 用户完成配置或在看过状态后明确选择“稍后”：原子写入当前 Provider ID 与既有 seen 集合的并集。
- Ctrl+C、EOF 或状态写入失败：不把本轮记录为已完成，下次仍应引导。

`state.json` 不含 Key、账号、完成时间、使用记录或遥测，位置与 Secret Store 同属仓库外 CMR 应用数据目录。卸载/重装 CMR 时如果用户保留该应用数据，向导状态也保留；这是用户级首次使用状态，不依赖脆弱的安装脚本。

onboarding 以“需要独立 API Key 的 Provider”为单位，不以模型/Profile 数量为单位。以后在 Kimi 或 DeepSeek 下新增共用现有 Key 的模型/Profile，不需要重复引导；新增需要新凭据的 Provider 时才形成 unseen ID 并再次引导。

允许只配置一家 Provider。首次向导结束后，缺失的其他 Provider 可在日常菜单被选中时就地引导；已经全部 configured 的用户首次运行也仍会看到一次状态总览，并可选择保留或更换。

### 9.4 安装与首次运行边界

向导必须发生在**安装完成后的首次交互式运行**，而不是 npm 安装生命周期：

- 不增加 `preinstall`、`install` 或 `postinstall` 凭据采集脚本。
- 安装动作不读取、不创建、不移动 API Key。
- Git clone、本地全局安装、未来 GitHub 安装或其他分发方式最终都汇合到相同的 `cmr` 首次运行体验。
- 安装器可以在成功文案中提示“运行 `cmr` 完成设置”，但安装成功本身不能依赖用户是否当场提供 Key。

### 9.5 安全与范围

`1.1.0` 复用现有仓库外 Secret Store、隐藏输入和原子写入，不引入第三方依赖。向导不得：

- 把 Key 放入 argv、Shell 历史、`.env`、仓库、Claude Settings、日志或错误文本。
- 自动修改 `.zshrc`、PowerShell Profile、用户/系统环境变量或 `~/.claude/settings.json`。
- 自动打开外部程序、自动安装 Claude Code、自动充值或创建 Provider 账号。
- 为验证 Key 发起计费模型请求。
- 把网络验证失败等同于本地保存失败。

首版只做本地格式校验、原子保存、配置 Schema 校验、Claude 可执行文件发现与状态汇总。在线 Key 验证明确留待后续独立功能，避免公司代理、离线环境或 Provider 临时故障制造假失败。

因此 `configured` 的精确定义是“Key 已安全保存在本机 CMR Secret Store”，不表示 CMR 已联网证明 Key 有效、有余额或有目标模型权限。实际 Provider 可用性由首次 Claude Code 启动自然验证。

### 9.6 成功标准

`1.1.0` 只有同时满足以下条件才可发布：

1. 全新临时 HOME 中，无论预置零个、一个或全部 Provider Key，无参数 `cmr` 的首次交互场景都显示全量状态并进入向导。
2. 直接 `cmr <profile> [claude args...]` 的缺 Key 就地配置成功后，原 argv、cwd、TTY、信号与退出码合同不变。
3. onboarding state 缺失/已完成/新增 Provider、非 TTY、取消、EOF、无效选择、重复设置、第二家写入失败、State Store 与 Secret Store 损坏均有自动化覆盖。
4. 任何成功与失败输出都不含 Key 或敏感哨兵。
5. `npm test`、`npm run lint` 和 `npm pack --dry-run` 通过；发布包不含本机状态或密钥。
6. README、使用手册、帮助、版本和实际行为一致。
7. Sol 已按 `docs/08-acceptance-and-recovery.md` 与执行合同完成独立复核；最终 PASS 与修复证据记录在 `docs/11` 第 17 节。

## 10. `1.2.1` Windows 兼容性补丁

`1.2.1` 解决公司原生 Windows 使用中暴露的两个启动前问题：

1. Windows 环境变量名大小写不稳定，子进程环境副本可能保存 `Path` 而不是 `PATH`，导致 CMR 找不到已经安装的 Claude Code。
2. Doctor 把 POSIX mode bits 用于 Windows 用户 Settings，产生无意义的权限警告。

本补丁允许 Windows PATH 键使用任意大小写，并在 PATH 未包含 Claude 时检查官方原生安装目录 `%USERPROFILE%\.local\bin\claude.exe`。路径解析使用目标平台的 delimiter 与 join 规则，使 Windows 分支可以在非 Windows 主机上可靠自动化。

补丁不改变 Provider/Profile、模型映射、Secret Store、Setup State、Claude argv、cwd、TTY、信号或退出码合同，也不修改用户 Settings、Shell、系统环境或真实 Key。

`1.2.1` 只声明上述兼容性问题已修复并有自动化证据，不把完整 Windows 阶段标记为 PASS。PowerShell/CMD/Git Bash 隐藏输入、`%APPDATA%` ACL、原子替换、真实 Provider 工作流与旧配置迁移仍按 `docs/05-phase-3-windows.md` 验收。

## 11. `1.3.0` GitHub Release 自更新（已发布）

`1.3.0` 提供两个显式管理命令：

```bash
cmr update
cmr update --check
```

它们只面向当前被调用的、由 npm 安装形成的实体 CMR global package。更新源固定为 canonical GitHub 仓库最新正式 Release 的手工资产：

```text
https://github.com/zouerdong/ai-model-router/releases/latest/download/claude-model-router.tgz
```

`--check` 只报告当前版本与最新稳定版本，不写 prefix；`update` 会从当前命令入口反推出实际 package root/prefix，在覆盖前打包本地 rollback 件，将候选包下载到隔离临时目录并禁用 lifecycle scripts，随后用同一个绝对入口验证新版本，失败时恢复旧包。

源码链接、junction、checkout、Homebrew、WinGet、独立二进制及无法唯一确定安装映射的来源均 fail closed，不执行 `git pull`、不切换到 npm 默认 prefix、不提权。更新不读取或修改 Secret Store、Setup State、Claude Settings、Shell、Provider Key、Claude argv、Codex 或系统环境。

`1.2.1` 用户必须先按 README 的一次性 exact-release bootstrap 命令安装 `1.3.0`；之后才进入 `cmr update` 闭环。`v1.3.0` 已以 immutable GitHub Release 发布，固定资产、checksum、Mac/Windows T4、公开 bootstrap 与 latest `--check` 均通过。实现、测试与发布证据见 `src/updater.js`、`src/commands/update.js`、`tests/update*.test.js` 与 `docs/13-v1.3-self-update-implementation-brief.md` 第 15、18、19 节。

## 12. `1.4.0` GLM-5.2 Coding Plan 范围

> 本节描述 `1.4.0` 中的 Coding Plan 入口。实施合同见 `docs/14-v1.4-glm-5.2-coding-plan-implementation-brief.md`；与标准 API 的统一版本决策和发布证据见 `docs/16-v1.4-unified-glm-release.md`。

`1.4.0` 新增第三个规范 Profile：

```bash
cmr glm [claude args...]
```

- `glm` 只表示智谱中国区 GLM Coding Plan。
- `glm-5.2`、`glm-plan` 是数据化兼容别名。
- Sonnet/Opus 档按当前官方 Claude Code 配置映射到 `glm-5.2[1m]`，Haiku 档映射到 `glm-4.7`。
- GLM 使用独立 Provider/Secret ID `glm`；升级用户现有 Setup State 会因 unseen Provider 再显示一次全量状态。
- 所有 Claude Code 参数继续透明透传；CMR 不建立 GLM 专用会话、任务角色或路由逻辑。

`glm` 本身不实现 Plan/PAYG 自动识别、额度查询、账单代理或余额 fallback。Coding Plan 与标准 API 即使使用相同 Anthropic 兼容 Base URL，也存在凭据 Header 和计费语义差异；按量 API 以同一版本中的独立显式 `glm-api` Profile 提供。

运行时代码不识别或回显真实 Key；`configured` 只表示本机 Store 已保存凭据。Provider 验收、Windows 回归与发布证据统一记录在 `docs/16`。

## 13. `1.4.0` GLM 标准 API 按量付费范围

> 该功能最初按独立 `1.5.0` 候选规划。维护者在两种模式均完成实现与 Provider 验收后，决定与 Coding Plan 统一进入 `1.4.0`；运行时的独立凭据和费用边界不变。

`1.4.0` 新增一个独立、显式的标准 API 入口：

```bash
cmr glm-api [claude args...]
cmr glm-payg [claude args...]
```

- `glm-api` 是规范入口；`glm-payg` 是唯一兼容别名。
- `glm`、`glm-5.2` 与 `glm-plan` 继续且只表示 GLM Coding Plan，绝不改绑到按量 API。
- `glm-api` 使用独立 Provider/Profile/Secret ID `glm-api`，通过 `ANTHROPIC_API_KEY` 连接 `https://open.bigmodel.cn/api/anthropic`；Claude Code 对此变量发送 `X-Api-Key`。
- `glm` 保持独立的 `ANTHROPIC_AUTH_TOKEN`/Bearer 鉴权。每次启动只能注入本次 Profile 所需的一种鉴权变量，不能让两种变量或其混合大小写残留共同进入子进程。
- 按量 Profile 的 Opus/Sonnet 映射为 `glm-5.2[1m]`，Haiku 为 `glm-4.7`；此映射是基于标准 Claude API 兼容事实和当前完整 Claude Code 映射的受约束推断，仍须由获批的真实标准 API 验收确认。
- `glm-api` 启动前显示一行直接标准 API 按量计费警告，价格只读取既有 `glm-5.2` Pricing 记录；CMR 不读取余额、不估算会话费用，也不为警告增加二次确认。

按量 API 与 Coding Plan 即使共享 Base URL，也有不同的 Key 来源、Header、Secret 槽位与费用通道。CMR 不识别 Key 类型、不查询额度、不在 401/403/429 或任意 Provider 失败后进行自动 fallback、重试或费用通道切换；用户必须在命令行明确选择本次使用 `glm` 或 `glm-api`。

新增第四个正式 Provider 后，动态 Setup State 差集会使已有三家均已 seen 的用户看到一次全量四家 onboarding；用户可选择 Not now，`cmr setup glm-api` 与缺 Key 的 TTY inline setup 只处理该独立槽位。Schema 仍为 v1，旧三 Provider Store 可读，但写入 `glm-api` 后手工降级到不识别第四槽位的旧版本可能拒绝整个 Store；不得为降级自动删除或静默忽略该字段。

两种 GLM 模式共享一次版本发布，但 CMR 仍不合并 Secret、不检测 Key 类型、不查询账单，也不在任意错误后自动切换费用通道。

## 14. `1.5.0` Kimi Code 会员 Provider 范围

> 本节源自 `docs/17-v1.5-kimi-code-membership-implementation-guide.md` 任务卡 1 的产品合同。任务卡 1–9 已全部完成：三个首批 Profile 真实验收 `PROVIDER PASS`，随 `1.5.0` 于 2026-08-18 公开发布。

### 14.1 独立产品与凭据边界

现有 `kimi` 继续表示 Kimi/Moonshot 开放平台按量 API：

```text
Base URL=https://api.moonshot.cn/anthropic
Claude Code auth=ANTHROPIC_AUTH_TOKEN → Authorization: Bearer
Secret ID=kimi
Billing=开放平台按 Token 付费
```

候选 `kimi-code` 表示 Kimi Code 会员权益通道：

```text
Base URL=https://api.kimi.com/coding/
Claude Code auth=ANTHROPIC_API_KEY → X-Api-Key
Secret ID=kimi-code
Billing=会员额度；用户显式启用 Extra Usage 后才可能产生额外按量扣费
```

两者是两个独立 Provider，不共享 Secret、Key 创建入口、Base URL、鉴权变量、额度或错误后的 fallback。CMR 不识别 Key 类型、不复制 Key、不自动开启 Extra Usage，也不把任何一条通道改绑到另一条通道。官方 Kimi Code 页面还要求保留客户端真实身份标识；CMR 不伪造或覆盖该身份。

### 14.2 首批三个 Profile

| 规范 Profile | 兼容别名 | Claude Code 选择值 | 上游原生模型 | 上下文 | 最低已知会员权益 |
|---|---|---|---|---:|---|
| `kimi-code` | `kimi-membership` | `kimi-for-coding` | `kimi-for-coding` | `262144` | 所有 Kimi 会员 |
| `kimi-code-k3-256k` | `kimi-membership-k3-256k` | `k3-256k` | `k3-256k` | `262144` | Moderato 及以上 |
| `kimi-code-k3` | `kimi-membership-k3` | `k3[1m]` | `k3` | `1048576` | Allegretto 及以上 |

三个 Profile 共用 `kimi-code` Provider 和 Secret，但每个 Profile 都必须完整映射主模型、Opus、Sonnet、Haiku、Fable 与子 Agent，避免 Claude Code 后台任务落回其他模型。`k3[1m]` 只属于 Claude Code 选择层；发送给 Kimi Code API 的原生模型 ID 是 `k3`。CMR 不自行剥离 `[1m]`。

K3-256K 与 K3-1M 的完整环境映射来自 Kimi Code 官方 Claude Code 示例。`kimi-for-coding` 的模型 ID、256K 上下文和会员可用性是官方事实；其完整档位映射与 compact/max-context 值是为了保持 Claude Code 前后台一致而采用的受约束设计推断，必须在后续真实 Provider 验收中验证，不能写成官方已给出的第三套完整示例。

Kimi Code 官方当前还提供独立模型 ID `kimi-for-coding-highspeed`，需要 Allegretto 及以上，且与普通 K2.7 Code 的编码能力相同但速度和额度消耗不同。它是本候选的明确非目标：Claude Code 官方 `/fast` 是 Anthropic Opus 的独立快速配置，默认会持久化并可能切换到 Opus，不是 Kimi HighSpeed 的入口。任务卡 8 才能在真实会员环境中决定新增显式 Profile、只文档化显式模型切换，或继续延后。

**2026-08-18 混合档位映射评估结论：暂缓，不新增第四 Profile。** 评估对象为「`k3-256k` 主力四槽（主模型/Opus/Sonnet/Fable）+ `kimi-for-coding` Haiku/Subagent 槽」的混合映射 Profile：两模型同为 256K 上下文，全局 compact/max-context 可一致收口，无 1M/256K 错配风险；仓库内 deepseek/GLM Profile 已有混合映射先例，技术可行。暂缓理由：①增量节省仅覆盖 Subagent+后台流量份额（按 subagent 份额 10–25% 与开放平台 API 比价推断的约 2–3 倍单价差估算，约 5–15%，属推断而非官方数字），而日常默认使用 `k3-256k` 相对 1M 会话的约 2 倍额度差（官方口径，见 `docs/07` §12.2 回读增量）不依赖混合映射；②`kimi-for-coding` 相对 K3 的会员额度倍率官方未公布；③Subagent 槽换 K2.7 Code 存在探索/归纳任务质量折损风险；④Console 无分模型消耗明细，无法直接归因验证。重启条件：官方提供分模型消耗明细，或额度压力持续且用户接受 Subagent 质量折损。

三入口档位定位（使用建议，非配置变更）：`kimi-code-k3`（1M 旗舰，重活/长上下文）、`kimi-code-k3-256k`（日常默认）、`kimi-code`（全档 K2.7 Code 经济档，Andante 起可用的保底档）。`kimi-code` 保留而非移除：已随 `1.5.0` 公开发布，删除属破坏性变更；其全程低速率定位与最低档可用性有独立价值。

### 14.3 会员额度与使用边界

Kimi Code 官方事实包括：额度按订阅日每 7 天刷新、未使用额度不结转；另有独立的滚动 5 小时限流窗口；所有设备和 API Key 共用相关额度；Kimi 会员月度总额度耗尽时，Kimi Code 可能被冻结。官方还允许订阅用户显式启用 Extra Usage：订阅额度耗尽后从共享余额按实际用量扣除，Extra Usage 默认不应被 CMR 代为开启，且官方提供月度支出上限设置。

候选产品只显示“会员额度 / Extra Usage 风险”提示，不显示开放平台 Token 单价，不估算会话费用，不查询余额或用量，不承诺“无限额度”或“绝不额外扣费”。Kimi Code 订阅按官方规则仅用于个人交互式使用；企业集成、商业服务和非交互式批处理不属于本候选的授权范围，应转向 Kimi Platform 或按官方政策另行评估。

### 14.4 商业元数据与发布边界

Kimi Code 是订阅权益通道，不得复用 `kimi-k3` 的开放平台 Pricing 记录。三个新 Profile 必须引用独立 `entitlementRef`，与既有按量 Profile 的 `pricingRef` 互斥；权益元数据至少记录 `subscription-quota`、官方说明、核验日期和来源链接。

任务卡 1 当时只更新事实、规格和验收矩阵；后续任务卡在仓库内新增 Provider/Profile、Secret/Setup 支持并完成 `1.5.0` 版本。2026-08-18 真实 Provider 验收（用户授权）与全部发布门禁通过后，`1.5.0` 已公开发布。

Kimi Code 官方 Claude Code 页还给出一段会写入 `~/.claude.json` 并清理 `~/.claude/settings.json` 模型项的跳过登录脚本；Claude Code 官方认证页则说明设置 `ANTHROPIC_API_KEY` 会跳过登录并提示用户批准。CMR 不执行该脚本，也不修改用户 Claude 配置。环境变量直启是否足够必须在隔离配置和真实 Provider 门禁中证明；若仍依赖该脚本，则停止并重新做产品决策。

**2026-08-18 门禁结论：环境变量直启足够，跳过登录脚本不必要。** 无头 `-p` 模式在全新配置上直接可用；交互式首跑在全新配置上需完成 Claude Code 自身的一次性初始化（主题 → 环境键确认选 `1. Yes` → 信任目录，见 `docs/06` §19 首次交互启动），不需要官方脚本，也不需要 CMR 写任何持久状态。误拒环境键会落入登录方式选择界面（无 Esc 出口），恢复路径与代理瞬断重试等边界已写入用户文档。HighSpeed 决策：选项 2（仅文档化 `--model kimi-for-coding-highspeed` 显式切换），不新增第四 Profile。

## 15. GLM-5.3 Coding Plan 升级候选（GLM53-1 至 GLM53-4）

本节绑定 `docs/18-v1.5-glm-5.3-upgrade-implementation-guide.md`，只描述当前未发布候选的增量，不改写 `1.4.0` 的历史发布证据。

`cmr glm`、`cmr glm-5.3`、`cmr glm-5.2` 和 `cmr glm-plan` 都解析到同一个 GLM Coding Plan Profile。该 Profile 使用独立 `glm-coding-plan-membership` subscription-quota entitlement，不再引用 `glm-5.2` 标准 API Pricing；Opus/Sonnet 为 `glm-5.3[1m]`，Haiku 为 `glm-4.7`，compact 为 `1000000`，timeout 为 `3000000`，并设置 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`。它只注入 `ANTHROPIC_AUTH_TOKEN`。

`cmr glm-api` 与 `cmr glm-payg` 保持独立的 GLM-5.2 标准 API Profile：只使用 `ANTHROPIC_API_KEY`、`glm-5.2[1m]`/`glm-4.7` 和现有 2/8/28 CNY/M Pricing。智谱截至 2026-08-16 仍将 GLM-5.3 模型 API 标为近期上线；Coding Plan 已支持 GLM-5.3 不构成标准 API 已支持的证据。CMR 不自动切换两种费用通道。

GLM Coding Plan 的启动提示只使用通用 subscription quota 话术，不显示标准 API 单价、不估算会话费用、不查询额度。真实 GLM 请求、真实标准 API 请求、费用回读、Windows 实机、发布与 Git 远端操作均不属于本轮。

## 16. DeepSeek-V4-Flash-Vision 接入范围（DSV-1 至 DSV-4）

本节绑定 `docs/20-deepseek-v4-flash-vision-implementation-guide.md`，描述 2026-08-21 官方上线的多模态模型 `deepseek-v4-flash-vision-exp` 的接入增量，不改写既有发布证据。

两项改动：

1. `deepseek` Auto Profile 的 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 与 `CLAUDE_CODE_SUBAGENT_MODEL` 从 `deepseek-v4-flash` 切换为 `deepseek-v4-flash-vision-exp`；主模型/Opus/Sonnet 保持 `deepseek-v4-pro[1m]`，effort 保持 `max`。官方 Auto 指南尚未更新为 vision 模型，本切换是产品决策（用户指令），依据为官方图像理解指南确认该模型可用 Anthropic 兼容端点调用、纯文本能力与 flash 正式版持平、价格相同。
2. 新增规范 Profile `deepseek-vision`（兼容别名 `deepseek-flash-vision`）：主模型、Opus、Sonnet、Haiku、子 Agent 全部映射 `deepseek-v4-flash-vision-exp`，`CLAUDE_CODE_EFFORT_LEVEL=max`。复用 `deepseek` Provider、Secret 与 `ANTHROPIC_AUTH_TOKEN`，`costNotice: standard`，`pricingRef: deepseek-v4`（官方定价页 vision-exp 与 flash 同价）。不新增凭据边界，不触发新的 onboarding。

CMR 仍不做模型能力检测与内容路由；vision 模型仅意味着该通道可接受图片输入，Claude Code 会话内实际多模态行为由上游决定。`[1m]` 后缀对 vision-exp 未经验证，本轮全部槽位使用不带后缀形式；vision-exp 思考强度档位官方未单独声明，按 flash 正式版同级使用 `max`；`deepseek-v4` Pricing 记录绝对值与官方 2026-08-17 峰谷 CNY 定价的偏差为存量登记项。以上三项均见 `docs/20` §6。
