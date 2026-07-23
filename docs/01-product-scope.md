# 01 — 产品范围

状态：`1.1.0` Mac 独立验收 PASS；`1.0.0` 与 `0.1.x` 为历史基线
更新时间：2026-07-19

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
