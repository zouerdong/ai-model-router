# 08 — 阶段一验收与修复兜底

状态：`0.1.x` 历史验收基线 + `0.2.0`、`1.1.0` 与 `1.2.1` 已验收标准
角色分离：实现者提供证据；后续审阅者独立复核，不采用执行者自评替代验收。

## 1. 判定规则

问题分三级：

- **Blocker**：会导致错模型、密钥泄漏、用户配置损坏、无法回退、核心命令失败。存在任一 Blocker，阶段一不通过。
- **Major**：不破坏安全与正确模型，但影响稳定使用、诊断、跨平台准备或关键文档。应在进入阶段二前修复。
- **Minor**：文案、可用性或低风险维护问题。可记录后修，但不能被用来掩盖 Major/Blocker。

“自动化测试通过”不能覆盖真实 `/status` 错误；“真实请求成功”也不能覆盖密钥泄漏或父环境污染。

## 2. 执行者证据包

阶段一必须提交 `docs/09-phase-1-acceptance.md`，至少包含：

```text
实现 commit：N/A（阶段一尚未初始化 Git）
执行日期与设备
Claude / Node / npm 版本
实际变更文件
官方参数复核日期
自动化命令、退出码、测试数量
两个无密钥 Profile 快照
Doctor 迁移前后摘要
真实 /status 结论
端到端交接演练
备份路径与回退说明
未决项
```

证据文件不能含真实 Key、完整环境、公司配置或聊天内容。

## 3. `0.1.x` 历史验收矩阵

本节记录阶段一当时的验收口径，用于保护已经完成的安全、环境与 Provider 映射基线。其中“只有 `plan/build`”“默认新会话、无 resume”是 `0.1.x` 历史要求，已被第 4 节的 `0.2.0` 方向替代，不再作为新版阻断条件。

### A — 范围与架构

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| A1 | Blocker | 只有 `plan` 与 `build` 两个 Profile | 配置目录清单、Schema 测试 |
| A2 | Blocker | 没有 Codex 配置修改 | 变更清单、`~/.codex` 未触碰声明与检查 |
| A3 | Major | 核心逻辑不依赖 Bash/PowerShell | 代码审阅、平台层测试 |
| A4 | Major | 没有额外网关、GUI、精确计费等越界功能 | 文件与依赖清单 |

### B — 官方模型配置

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| B1 | Blocker | Kimi 的 Claude Code 选择值为 `kimi-k3[1m]`，上游 API model 为 `kimi-k3` | Profile 快照、真实 `/status`、脱敏协议探针或等价官方证据 |
| B2 | Blocker | Kimi 全档位、Fable、子 Agent 均为 `[1m]` | 无密钥快照测试 |
| B3 | Blocker | Kimi Base URL、auth、Tool Search、compact、effort 符合官方 | 官方来源日期、快照 |
| B4 | Blocker | DeepSeek 主/Opus/Sonnet 为 Pro[1m]，Haiku/子 Agent为 Flash | 快照测试 |
| B5 | Major | DeepSeek 未自行添加未验证 Fable/compact 变量 | Profile 审阅 |
| B6 | Major | 价格提示有官方链接和核验日期，不宣称精确费用 | 配置与输出快照 |

### C — 启动器行为

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| C1 | Blocker | `cmr plan` 与 `cmr build` 可从任意目录启动 | 三个路径的假/真实测试 |
| C2 | Blocker | 子进程 cwd 等于调用目录 | 假 Claude 输出 |
| C3 | Blocker | 父环境未被修改，Profile 间无残留 | 前后快照与并行测试 |
| C4 | Blocker | Claude 退出码和 Ctrl+C 正确传递 | 集成测试 |
| C5 | Major | 默认启动新会话，无跨 Provider resume 快捷入口 | CLI 帮助与行为审阅 |
| C6 | Major | 路径含空格/中文可运行 | 临时目录测试 |

### D — Doctor 与迁移

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| D1 | Blocker | Doctor 默认只读，运行前后目标文件未改变 | 校验和或测试 |
| D2 | Blocker | 能发现 Settings、Shell 和环境中的冲突键 | 迁移前摘要 |
| D3 | Blocker | 旧 `kimi-k3` 已在获批迁移后消失，正式生效为 `[1m]` | 迁移后 Doctor + `/status` |
| D4 | Blocker | Settings 非模型字段保持一致 | 脱敏结构差异 |
| D5 | Major | legacy `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 已明确处理或有理由保留 | 决策记录 |
| D6 | Blocker | 修改前存在可用备份 | 路径、权限、恢复说明 |

### E — 密钥与隐私

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| E1 | Blocker | 真实 Key 不在仓库、参数、日志、测试或错误中 | 模式扫描、人工审阅 |
| E2 | Blocker | Secret Store 位于仓库外且权限正确 | 路径与权限摘要 |
| E3 | Blocker | `secret status` 只显示 configured/missing | 输出快照 |
| E4 | Blocker | 异常路径也脱敏 | 故意失败测试 |
| E5 | Major | 写入采用安全临时文件与原子替换 | 代码与测试 |
| E6 | Major | 含敏感配置的用户 Settings 权限风险已明确处理或记录为用户拒绝的已知风险 | 权限摘要与门禁记录 |

### F — 自动化与真实验收

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| F1 | Blocker | `npm test` 全部通过 | 命令、退出码、测试摘要 |
| F2 | Blocker | `npm run lint` 通过 | 命令与退出码 |
| F3 | Blocker | Kimi 最小请求、工具、子 Agent 正常 | 真实验收摘要 |
| F4 | Blocker | DeepSeek 最小请求与子 Agent 正常 | 真实验收摘要 |
| F5 | Major | Windows 路径与 `.cmd` 分支有自动化覆盖 | 测试清单 |
| F6 | Blocker | K3 → Brief → DeepSeek 新会话交接成功 | 示例 Brief 与结果 |

### G — 安装与文档

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| G1 | Blocker | 全局安装仅在用户批准后发生 | 门禁记录 |
| G2 | Blocker | `cmr version/doctor/list` 从任意目录可用 | 命令摘要 |
| G3 | Major | README 与实际命令、路径、限制一致 | 文档审阅 |
| G4 | Major | 阶段二/三未被提前执行 | 最终报告与目录检查 |

## 4. `0.2.0` 改造验收矩阵

以下条目全部以 Luna 修改后的实际文件和独立复跑结果为准。Luna 只能回写“已实现、等待 Sol 审阅”，不得自行给出最终 PASS。

### H — 产品边界与兼容性

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| H1 | Blocker | 规范 Profile ID 为 `kimi/deepseek`，配置文件名与 ID 一致 | 配置目录、Schema 测试、`cmr list` |
| H2 | Blocker | `plan/build` 分别作为 `kimi/deepseek` 的兼容别名，环境和参数行为完全一致 | 别名对照测试 |
| H3 | Blocker | Kimi 与 DeepSeek 均不绑定规划/执行角色 | Profile 文案、帮助、启动输出审阅 |
| H4 | Major | `cmr` 菜单以 Provider/Profile 为主，不再以固定两阶段流程为主 | 菜单输出测试 |
| H5 | Blocker | 不新增 Session Registry、提示词分类、动态路由或代理层 | 代码与依赖审阅 |

### I — Claude Code 参数与会话语义

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| I1 | Blocker | Profile 选择器后的 argv 保持数量、顺序和值原样传给 Claude Code | 假 Claude argv 精确断言 |
| I2 | Blocker | `--continue` 可透传，不再被 CMR 拒绝 | `kimi/deepseek` 双 Profile 测试 |
| I3 | Blocker | `--resume <id>` 与不带值的 `--resume` 可透传 | 精确 argv 测试 |
| I4 | Blocker | `--fork-session --resume <id>` 组合不被重排或解析 | 精确 argv 测试 |
| I5 | Blocker | `--permission-mode plan`、`--model <value>`、`-p <prompt>` 及未知未来参数可透传 | 参数化测试 |
| I6 | Blocker | 空格、中文、引号样式字符和以 `-` 开头的参数值不经过 Shell 字符串拼接 | argv/路径测试、启动代码审阅 |
| I7 | Blocker | CMR 的输出、错误和费用提示不打印用户参数或提示词 | 敏感哨兵测试 |
| I8 | Major | 跨 Provider resume 被允许但不自动发生；风险由文档说明 | CLI 行为与使用文档审阅 |
| I9 | Major | `cmr <profile> --help` 到达 Claude Code；`cmr help` 只说明 CMR | 假/真实非计费帮助测试 |

### J — 启动体验、回归与交付

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| J1 | Major | Kimi 仅显示一行费用信息，不再要求 `[y/N]` 二次确认 | 非交互测试、输出快照 |
| J2 | Blocker | cwd、TTY、父环境隔离、信号和退出码保持 `0.1.x` 基线 | 原回归测试 + 新参数测试 |
| J3 | Blocker | Kimi/DeepSeek 官方环境映射未因改名发生变化 | 重命名前后脱敏快照对照 |
| J4 | Blocker | `npm test` 与 `npm run lint` 全部通过 | 独立复跑命令、退出码、计数 |
| J5 | Major | Windows `.cmd` 分支仍正确接收完整 argv | Windows 模拟测试 |
| J6 | Major | README、使用手册、产品和架构文档只描述实际已实现行为 | 文档交叉检查 |
| J7 | Major | 包版本为 `0.2.0`，且 `cmr version` 一致 | `package.json` 与命令输出 |
| J8 | Blocker | 未修改 Codex、用户 Settings、Shell、密钥、全局安装、Git/远端 | 变更清单与只读状态检查 |
| J9 | Blocker | 无真实密钥、提示词哨兵或本机敏感内容进入仓库 | 模式扫描与人工审阅 |

## 5. 后续独立审阅流程

用户回来要求审阅与验收时，审阅者按以下顺序工作：

1. 读取 `AGENTS.md` 与现行规格，不先相信执行报告。
2. 检查全部新增/修改文件和依赖。
3. 对照官方页面重新核验可变参数。
4. 静态检查安全边界、模型映射和平台分层。
5. 重新运行 lint/test，不复用 Luna 的退出码结论。
6. 用独立假 Claude 复跑 cwd、环境、信号、退出码测试。
7. 只读运行 Doctor，核对本机实际状态。
8. 如用户授权真实验证，再最小化复核 `/status` 和 Provider 请求。
9. 按验收矩阵逐项判定，先报告 Blocker/Major，再给总评。

审阅请求默认授权只读诊断与测试，不自动授权修改 Settings、密钥、全局安装或删除。若用户明确要求“验收并修复”，仓库内安全修复可直接推进；命中红线的修复仍需当次确认。

## 6. 根因修复手册

### 6.1 K3 仍显示 `kimi-k3`

不要只再改一个 Settings 字符串。依次检查：

1. `plan` Profile 快照。
2. 当前进程遗留变量。
3. User/Project/Local/Managed Settings 来源。
4. Shell Profile。
5. 启动参数和是否误跑裸 `claude`。

修复完整来源链后重跑 Doctor、快照与 `/status`。

不要把 Claude Code 的 `[1m]` 选择后缀当作 Kimi 原生 API model。当前 Claude Code 官方文档规定：Claude Code 使用该后缀选择 1M 上下文，并在发给 Provider 前剥离后缀。因此：

- `/status` 显示 `kimi-k3[1m]` 是正确的 Claude Code 层结果。
- Kimi `/v1/models` 和 `/v1/messages` 使用 `kimi-k3` 是正确的 Provider 层结果。
- 手工请求 `model: kimi-k3[1m]` 返回 404，不能单独证明 Router 或 Claude Code 失败。

若交互会话看似无回复，先用同一 Profile 做 `--print` 最小请求并等待模型完成，再比较安全模式与默认模式；不得用短时间人工观察替代端到端结果，也不得在 CMR 中重复实现 Claude Code 已负责的后缀剥离。

### 6.2 DeepSeek 主会话或子 Agent 用错模型

先比较官方六项环境映射与实际子进程快照。不得添加提示词分类器或本地代理补救。若 Provider 自动映射与官方文档不一致，暂停真实调用并更新事实基线。

### 6.3 Settings 迁移破坏插件或状态栏

停止继续修改，比较迁移前后 JSON 结构。优先恢复备份，再以“只删除 Router 管理键”的方式重做。恢复备份涉及覆盖本机配置，必须先获得用户确认。

### 6.4 密钥疑似泄漏

立即停止真实 API 与 GitHub 阶段：

1. 确定泄漏位置，不在对话中展示值。
2. 告知用户需要在 Provider 控制台轮换/撤销 Key。
3. 用户确认后清理工作区或日志。
4. 重新执行全仓扫描。

若尚未 Git 初始化，不建立 Git 直到清理完成；若未来已推送，则按独立的 Git 历史清理方案处理，不能简单再提交一次删除。

### 6.5 父环境被污染

说明实现修改了 `process.env`、Shell 或系统环境，而非只构建副本。回到 `environment.js` 修复数据流，恢复受影响配置后重跑并行与前后快照测试。

### 6.6 Ctrl+C、退出码或 TTY 异常

使用最小假进程复现，不通过 `shell: true` 的宽泛绕过掩盖平台问题。修复 `launcher`/`platform` 边界，分别覆盖 macOS 与 Windows `.cmd`。

### 6.7 全局命令冲突

先定位实际 `cmr` 路径和 npm prefix。不要修改 PATH 作为第一反应。若需卸载或覆盖全局命令，先展示准确目标和回退方式并获得确认。

### 6.8 参数被拒绝、改写或泄漏

先用假 Claude 捕获 argv，并把问题分为三层：`cli.js` 是否截断、`launch.js` 是否重排、`launcher.js` 是否把数组拼成字符串。修复时坚持 opaque argv 契约，不为当前已知的 `--continue/--resume` 增加专用分支。若敏感哨兵出现在 CMR 输出中，按密钥疑似泄漏等级停止并清除证据文件中的原文。

## 7. 回退矩阵

| 变更 | 回退来源 | 触发条件 | 是否需再次确认 |
|---|---|---|---|
| `settings.json` 迁移 | 门禁 B 创建的原文件备份 | 非模型设置损坏、Provider 失败 | 是，覆盖用户配置 |
| `.zshrc` 迁移 | 门禁 B 创建的原文件备份 | 新终端环境异常 | 是，覆盖 Shell 配置 |
| Secret Store | Provider 控制台轮换 + 本机重设 | 权限错误或疑似泄漏 | 是，凭据操作 |
| 全局 `cmr` | 记录的 npm 卸载命令 | 命令冲突或安装损坏 | 是，全局环境变更 |
| 仓库代码 | 修复前文件清单/后续 Git 提交 | 自动化回归 | 删除/重置时需确认 |

备份必须位于仓库外，不得在阶段二被提交。

## 8. 验收结论格式

独立审阅者最终只给三种结论：

- **PASS**：全部 Blocker 和 Major 通过，可进入阶段二。
- **CONDITIONAL PASS**：Blocker 全部通过，仅存在明确记录且不影响阶段二安全的 Minor。
- **FAIL**：任一 Blocker 或未修复 Major 存在，不得进入 GitHub 首次推送。

结论必须附失败项 ID、证据、根因和修复建议，不能只给主观评分。

## 9. `0.2.0` 独立验收结论

2026-07-19，Sol 按 H/I/J 矩阵完成独立审阅并修复发现的问题。最终结论为 **PASS — `0.2.0` accepted on Mac**；详细修复、UltraQA 场景矩阵与复验命令见 `docs/10-v0.2-transparent-profile-launcher-implementation-brief.md` 第 14 节。

Windows `.cmd` 已完成无 `shell:true` 的模拟回归，但 Windows 实机仍按 `docs/05-phase-3-windows.md` 单独验收，不属于本次 Mac PASS。

## 10. `1.1.0` 首次运行配置向导验收矩阵

本节与 `docs/11-v1.1-first-run-setup-implementation-brief.md` 共同构成下一版本的 Binding acceptance standard。Luna 完成后只能标记“等待 Sol 审阅”，不得自行把本节改为 PASS。

### K — 触发、兼容与 CLI 边界

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| K1 | Blocker | Setup State 缺失时，无论零个、一个或全部当前 Provider Key 为 configured，无参数 TTY `cmr` 都先显示全量状态并进入 setup | 三种 Secret Store 状态 + 临时 HOME 集成测试 |
| K2 | Blocker | Setup State 已覆盖全部当前 Provider 时，无参数 `cmr` 进入带状态普通菜单；Key 后来 missing 不会被误判为首次运行 | completed state + Key 状态变化测试 |
| K3 | Blocker | `cmr setup`、`cmr setup kimi`、`cmr setup deepseek` 契约明确；未知/多余参数被拒绝 | CLI 参数化测试、help 快照 |
| K4 | Blocker | 非 TTY 永不读取输入或挂起；无参数仍打印帮助，缺 Key Profile 快速失败 | 超时集成测试、stdin 不可读哨兵 |
| K5 | Blocker | `help/version/list/doctor/config/secret` 不因首次状态产生写入 | Secret/Setup State 路径前后不存在或哈希不变 |
| K6 | Major | `plan/build` 及既有 Profile/管理命令兼容性不退化 | 原测试全量复跑 |
| K7 | Major | 版本为 `1.1.0`，package、CLI、help、README 一致 | 文件与命令输出 |
| K8 | Blocker | 当前配置新增 unseen Provider 时自动再次显示全部 Provider 状态并进入引导；完成后将当前 ID 并入 seen 集合 | 动态三 Provider 配置测试 |
| K9 | Blocker | 用户看过状态后明确选择稍后/继续会原子记录 seen；Ctrl+C、EOF 或错误不记录 | State Store 内容与失败注入测试 |

### L — 首次配置与随时更换 Key

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| L1 | Blocker | 用户可选择配置两家、仅 Kimi、仅 DeepSeek 或稍后退出 | setup 状态机测试 |
| L2 | Blocker | `cmr setup` 显示 `configured/missing`，已配置项默认保留，不静默覆盖 | 输出与 store 快照 |
| L3 | Blocker | 用户可在 `cmr setup` 菜单或 `cmr setup <provider>` 中显式更换任一 Key | 双 Provider 替换测试 |
| L4 | Blocker | 更换 Key 时，新值通过本地校验并原子写入后旧值才被替换 | 注入 fs 失败测试；旧值仍可读取 |
| L5 | Blocker | 更换过程取消、EOF、空值、前后空白、多行、超长或写入失败均保留旧 Key | hostile 输入矩阵 |
| L6 | Blocker | 两 Provider 逐项提交；第二项取消/失败时第一项成功状态保留，重新进入从实时状态继续 | 部分成功恢复测试 |
| L7 | Major | `cmr secret set/status` 继续可用且与 setup 写入同一 Schema v1 Store | 交叉兼容测试 |
| L8 | Major | 不提供 Key argv、环境变量批量导入、剪贴板读取或明文回显快捷方式 | help/代码审阅 |
| L9 | Major | setup 状态与菜单由数据化 Provider 集合生成；当前两家是基线，不在 onboarding 触发逻辑中硬编码数量 | 动态 Provider fake config |

### M — 就地配置与启动合同

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| M1 | Blocker | `cmr <profile>` 缺 Key + TTY 时只配置当前 Provider，成功后同一次调用继续启动 | fake Claude 端到端测试 |
| M2 | Blocker | 就地 setup 前后的 Claude argv 数量、顺序和值严格不变，且不出现在 CMR 输出 | hostile argv + 隐私哨兵 |
| M3 | Blocker | 就地 setup 取消/失败时不启动 Claude，已存在的其他 Provider Key 不变 | spawn 未调用断言 |
| M4 | Blocker | cwd、TTY、父环境隔离、信号与退出码保持 `1.0.0` 合同 | launcher 原回归 + setup 路径集成测试 |
| M5 | Major | setup 完成摘要发现 Claude 缺失时给官方安装文档和可操作提示，但不自动安装或改 PATH | 路径发现测试、输出快照 |

### N — 密钥、终端与分发安全

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| N1 | Blocker | Key 不出现在 stdout/stderr、argv、异常、快照、测试名或仓库候选文件 | 双 Key + 敏感哨兵扫描 |
| N2 | Blocker | raw mode 在成功、校验失败、写入失败、Ctrl+C、EOF、close、stream error 下均恢复 | fake TTY 事件矩阵 |
| N3 | Blocker | 损坏/不可读 Secret Store 时停止且不覆盖；JSON/Schema 损坏的 Setup State 不得抑制引导，明确完成后可原子重建；权限/I/O 读取失败仍须停止 | 双 Store 哈希、警告与恢复测试 |
| N4 | Blocker | setup 只允许修改临时测试 HOME 中的 CMR Secret/Setup State；不修改 Settings、Shell、系统/用户环境、`.env`、Codex 或真实本机 Store | 临时 HOME 测试 + git diff/状态审阅 |
| N5 | Blocker | 不新增 `preinstall/install/postinstall` 凭据脚本，不在安装期间等待输入 | package.json 审阅 + 非 TTY pack/install 候选测试 |
| N6 | Major | `apiKeyUrl` 为重新核验的官方 `https:` 地址；Schema 拒绝 HTTP/相对 URL，基线测试断言两家当前官方地址 | 配置测试 + 官方来源日期 |
| N7 | Major | macOS 与 win32 路径/TTY 分支有自动化覆盖；Windows 实机结论仍留给阶段三 | 平台模拟测试与范围声明 |
| N8 | Major | `npm pack --dry-run`/实际 tarball 清单不含 Secret Store、备份、日志或本机路径文件 | pack 清单与敏感扫描 |
| N9 | Blocker | Setup State 只含 Schema 版本与 seen Provider ID，不含 Key、账号、时间、路径、使用记录或遥测 | Schema 测试与文件内容审阅 |

### O — 独立审阅结论门槛

`1.1.0` 的最终结论仍使用第 8 节的 PASS / CONDITIONAL PASS / FAIL。任一 K/L/M/N Blocker 失败即为 FAIL；未修复 Major 不得发布。独立审阅必须在全新临时 HOME 内复跑，不得读取或替换当前用户已经配置的真实 Kimi/DeepSeek Key。

## 11. `1.1.0` 独立验收结论

2026-07-19，Sol 按 K/L/M/N/O 与 S/T/R/C/L/P 矩阵完成独立审阅。首轮发现并修复 L5 多行 TTY 粘贴被静默截断后保存、以及 `setup` 未加入 Profile 保留命令集合的问题；补充相应回归与缺失的组合测试后，最终结论为 **PASS — `1.1.0` accepted on Mac**。

最终独立复跑为 79/79 tests passed、lint PASS、`git diff --check` PASS、`npm pack --dry-run` PASS；官方 Kimi/DeepSeek API Key 入口与 Claude Code 安装入口已重新核验。独立验收阶段未读取或替换真实 Key，未运行真实 setup、Provider 请求、全局安装、Git 写操作或发布；用户随后另行授权创建本地 release commit 与 `v1.1.0` tag。Windows 仅保留自动化模拟证据，实机验收仍属于阶段三。详细 UltraQA 场景、修复与命令证据见 `docs/11` 第 17 节。

## 12. `1.2.1` Windows 兼容性补丁验收

`1.2.1` 的发布门槛限定为：

1. Windows PATH 键名任意大小写均能发现 Claude。
2. PATH 缺失或不含 Claude 时检查 `%USERPROFILE%\.local\bin\claude.exe`。
3. 显式 `pathValue` 优先级不变。
4. Windows `.cmd/.bat` 仍使用 `cmd.exe /d /c` 且 `shell: false`。
5. Doctor 不在 Windows 上输出 POSIX Settings/Secret Store 权限警告。
6. `package.json`、CLI、README 与稳定标签同为 `1.2.1`。
7. 全量 test、lint、pack、diff 与敏感信息检查通过。

上述门槛通过只证明本补丁范围可发布，不替代 `docs/05` 的完整 Windows 实机验收。

2026-07-24 独立复跑结论为 **PASS — `1.2.1` READY FOR RELEASE**：Windows/Doctor targeted tests 6/6、全量测试 83/83、lint、pack、`git diff --check` 与敏感信息检查全部通过；package、CLI、README 同为 `1.2.1`。Kimi、DeepSeek 官方映射与 Claude Code Windows 原生安装位置已重新核验。完整 Windows 实机阶段仍未标记 PASS。

## 13. `1.3.0` 自更新验收矩阵（PASS — RELEASED）

本节为绑定验收标准。任一 Blocker 失败，`1.3.0` 不得发布；2026-07-24 的最终结果为全部 Blocker/Major 通过并正式发布。

### P — 产品与 Release channel

| ID | 级别 | 验收项 |
|---|---|---|
| P1 | Blocker | 只使用 canonical GitHub latest Release 固定资产 `claude-model-router.tgz` |
| P2 | Blocker | 不使用 main、任意 URL、用户 branch/tag 或 GitHub API token |
| P3 | Blocker | 候选包名正确且 version 为严格稳定 SemVer |
| P4 | Major | `cmr update --check` 只读且 exit 0 |
| P5 | Major | 其他命令无后台或隐式联网 |
| P6 | Blocker | 资产来自验收过的 `npm pack` 并附带 checksum |
| P7 | Blocker | 资产准备完成后再发布 immutable Release |

### Q — 安装来源与 prefix

| ID | 级别 | 验收项 |
|---|---|---|
| Q1 | Blocker | 更新当前活动入口对应的精确 prefix，不盲用 npm 默认 prefix |
| Q2 | Blocker | macOS/Unix 实体 global package 可识别 |
| Q3 | Blocker | Windows 实体 global package 与 `.cmd` 可识别 |
| Q4 | Blocker | source symlink/junction 在写入前拒绝 |
| Q5 | Blocker | checkout、未知包管理器和模糊映射 fail closed |
| Q6 | Major | 多份 PATH 命令时只处理当前活动入口 |
| Q7 | Major | 权限不足不提权、不换 prefix |

### R — 更新事务与恢复

| ID | 级别 | 验收项 |
|---|---|---|
| R1 | Blocker | 覆盖前存在可安装的当前包 rollback tgz |
| R2 | Blocker | 候选先下载并校验，再从本地 tgz 安装 |
| R3 | Blocker | npm argv 使用 exact prefix、ignore-scripts、no-audit/no-fund 和临时 cache |
| R4 | Blocker | 安装后同时验证 package.json 与同一绝对入口 version |
| R5 | Blocker | install failure 能区分旧版完整可用与需要恢复 |
| R6 | Blocker | post-verify failure 自动 rollback 并再次验证 |
| R7 | Blocker | rollback 失败不误报成功，并给精确人工恢复命令 |
| R8 | Major | same version 不 install，older candidate 不 downgrade |
| R9 | Blocker | 并发 update 互斥，stale lock 安全恢复 |
| R10 | Major | 成功、失败、中断后清理临时目录与 lock |

### S — 安全与范围

| ID | 级别 | 验收项 |
|---|---|---|
| S1 | Blocker | current/candidate lifecycle scripts 均不执行 |
| S2 | Blocker | Secret/State/Settings/Shell/系统环境/Provider 配置不变 |
| S3 | Blocker | 不输出 Key、npm token、完整 env、`.npmrc` 或敏感哨兵 |
| S4 | Blocker | 无 `shell: true`、无命令字符串拼接 |
| S5 | Blocker | 不执行 git pull/merge/rebase/reset/stash |
| S6 | Major | 清除 Router 管理变量但保留 npm PATH、代理与 CA 能力 |
| S7 | Major | 只修改自身 package，不改其他 global package |
| S8 | Blocker | 无第三方运行时依赖、无 install lifecycle script |

### T — 兼容与发布

| ID | 级别 | 验收项 |
|---|---|---|
| T1 | Blocker | 既有测试与新增 update tests 全部通过 |
| T2 | Blocker | lint、pack、diff、敏感扫描通过 |
| T3 | Blocker | Mac 隔离 prefix self-update E2E 通过 |
| T4 | Blocker | 实际 Windows OS（物理机、本地 VM 或 GitHub-hosted Windows VM）隔离 prefix self-update E2E 通过 |
| T5 | Major | Node 18/npm 9 与当前 Node/npm 的核心测试通过 |
| T6 | Blocker | package/CLI/README/tag/Release asset 版本一致为 1.3.0 |
| T7 | Blocker | 1.2.1 bootstrap 文档与临时安装验证通过 |
| T8 | Major | source-linked 安装给出安全人工维护说明 |
| T9 | Blocker | 未经批准没有真实全局更新、push、Release 或 CI/CD |

Windows T4 必须在实际 Windows 内核、Windows 文件系统与 Windows shell 中运行；物理机不是必要条件，GitHub-hosted Windows VM 可作为可重复的正式证据。macOS 上注入 `platform: "win32"` 仍只能算模拟，不能替代 T4。`docs/13-v1.3-self-update-implementation-brief.md` 第 15 节是实现者证据，不替代本节的独立判定。

2026-07-24，T4 在 GitHub-hosted Windows Server 2025 x64 上完成独立验收：[run 30094641599](https://github.com/zouerdong/ai-model-router/actions/runs/30094641599)，commit `f8f68d301e54b1d2008c32c00378a27346091c1f`。Node `18.20.8` 与 `24.18.0` 两档均通过 PowerShell 全量回归，以及 PowerShell、CMD、Git Bash 下的 custom prefix 自替换、multi-prefix 不变、bad candidate、junction 拒绝、install failure rollback 与 Ctrl+C 子进程终止场景。英文 README 的最终 release commit `515d7160055c53ab76c10dc9967c5950e139ab82` 又由 [run 30095977923](https://github.com/zouerdong/ai-model-router/actions/runs/30095977923) 复跑两档矩阵并全绿。

同日，`v1.3.0` immutable Release 从已验收 Draft 发布为 Latest。固定资产 `claude-model-router.tgz` 为 33,167 bytes，SHA-256 为 `593835bc3ee8297ee1533680e564037b517735083f18c9b538a510e712fa66f0`；GitHub digest、`SHA256SUMS`、exact/latest 下载三者一致。公开 exact URL 临时 prefix 安装输出 `1.3.0`，帮助文本正确，`cmr update --check` 输出已是最新稳定版。因此 P1–P7、Q1–Q7、R1–R10、S1–S8、T1–T9 全部 PASS，最终结论为 **PASS — `1.3.0` RELEASED**。

## 14. `1.4.0` GLM-5.2 Coding Plan 验收矩阵

本节与 `docs/14-v1.4-glm-5.2-coding-plan-implementation-brief.md` 共同构成绑定验收标准。仓库内候选实现和假 Key 自动化已完成；没有真实 GLM Coding Plan Key 与账单回读时，不得给 `1.4.0` PASS。

### U — 配置与官方映射

| ID | 级别 | 验收项 |
|---|---|---|
| U1 | Blocker | 正式集合精确为 Kimi、DeepSeek、GLM 三 Provider/Profile |
| U2 | Blocker | `glm` Base URL、Bearer auth、secretId 与官方 URL 精确 |
| U3 | Blocker | Sonnet/Opus=`glm-5.2[1m]`，Haiku=`glm-4.7` |
| U4 | Blocker | compact=`1000000`、timeout=`3000000`、disable nonessential=`1` |
| U5 | Blocker | 初始 GLM Profile 不含官方未列出的 main/Fable/Subagent/Effort/Tool Search 变量 |
| U6 | Major | GLM Pricing 明确为标准 API 参考，不宣称 Plan 精确费用 |
| U7 | Blocker | `glm-5.2`/`glm-plan` 是 `glm` 数据化别名 |
| U8 | Major | 实施与发布前官方复核完成，Haiku 文档冲突已按 `docs/07` 处理 |

### V — Secret、Setup 与升级

| ID | 级别 | 验收项 |
|---|---|---|
| V1 | Blocker | 旧两家 Secret Store Schema v1 无迁移可读 |
| V2 | Blocker | 原子加入 GLM 不改变旧 Key，失败保留完整旧 Store |
| V3 | Blocker | 旧 seen 两家自动识别 GLM unseen；不按包版本特判 |
| V4 | Blocker | Full dashboard 显示三家，完成/稍后后写 sorted union |
| V5 | Blocker | targeted/inline GLM setup 不误标未显示 Provider |
| V6 | Major | 动态第四 Provider 测试继续通过，不能硬编码三家 setup |
| V7 | Major | `secret set/status`、Doctor、List 与菜单支持 GLM |
| V8 | Major | 文档说明写入 GLM 后手工降级 `1.3.0` 的 Store 兼容风险 |

### W — 启动与环境

| ID | 级别 | 验收项 |
|---|---|---|
| W1 | Blocker | `cmr glm` fake Claude 环境与官方候选精确 |
| W2 | Blocker | 只使用 `ANTHROPIC_AUTH_TOKEN`，清除旧 API key/token 冲突 |
| W3 | Blocker | timeout/traffic 变量对所有 Profile 大小写安全清理；只在 GLM 回注官方值 |
| W4 | Blocker | 父环境不变、跨 Profile 无 Router 残留 |
| W5 | Blocker | opaque argv、cwd、TTY、signal、exit code 不退化 |
| W6 | Blocker | 缺 GLM Key TTY setup 后继续；取消不 spawn；non-TTY 快速失败 |
| W7 | Major | Windows `.cmd` 与混合大小写环境自动化通过 |
| W8 | Blocker | 输出、错误、fake snapshot 不含 Key 或 prompt sentinel |

### X — 分发与真实 Provider

| ID | 级别 | 验收项 |
|---|---|---|
| X1 | Blocker | 全量 test/lint/diff/pack 与敏感扫描通过 |
| X2 | Blocker | package/CLI 候选版本一致为 `1.4.0` |
| X3 | Blocker | 包含三个 GLM JSON，排除 Secret/State/本机路径 |
| X4 | Blocker | updater 与 Mac isolated prefix E2E 不退化 |
| X5 | Major | Node 18 核心测试通过 |
| X6 | Blocker | 实际 Windows OS 全回归在获批流程中通过 |
| X7 | Blocker | 用户授权的真实 Plan 主请求、工具和子 Agent 通过 |
| X8 | Blocker | 套餐用量/费用回读证明请求走 Coding Plan，未意外扣现金余额 |
| X9 | Blocker | 未经批准没有真实 Key、API、全局安装、CI 修改、push 或发布 |
| X10 | Blocker | 独立审阅 PASS 后才可准备 `1.4.0` Release |

没有真实 Plan Key时可以给出“实现候选已完成、Provider 发布受阻”，不能用 skipped X7/X8 代替 PASS。

## 15. `1.4.0` GLM 标准 API 按量付费验收矩阵

本节与 `docs/15-v1.5-glm-standard-api-payg-implementation-brief.md` 共同构成绑定验收标准。该实施文件名保留最初的独立 `1.5.0` 规划；维护者已将两种 GLM 模式统一纳入 `1.4.0`，最终发布判定见 `docs/16`。

### Y — 配置与身份边界

| ID | 级别 | 验收项 |
|---|---|---|
| Y1 | Blocker | 正式集合精确为 4 Provider、4 Profile、3 Pricing |
| Y2 | Blocker | `glm-api` Base URL、API Key URL、`ANTHROPIC_API_KEY`、secretId 精确 |
| Y3 | Blocker | `glm` 保持 `ANTHROPIC_AUTH_TOKEN`/secretId `glm` |
| Y4 | Blocker | `glm-api`/`glm-payg` 等价，`glm-5.2`/`glm-plan` 仍属于 `glm` |
| Y5 | Blocker | 两个 GLM Profile 模型/运行环境精确相同，凭据边界不同 |
| Y6 | Blocker | `glm-api` 不含 main/Fable/Subagent/Effort/Tool Search 自创变量 |
| Y7 | Major | 两个 GLM Profile 合法共享 `glm-5.2` Pricing；没有重复价格文件 |
| Y8 | Major | `costNotice=payg` 数据化驱动计费警告 |
| Y9 | Major | 实施日官方事实复核完成；事实与推断分开记录 |

### Z — Secret、Setup 与升级

| ID | 级别 | 验收项 |
|---|---|---|
| Z1 | Blocker | 旧三 Provider Schema v1 无迁移可读 |
| Z2 | Blocker | 原子加入 `glm-api` 不改变前三把 Key |
| Z3 | Blocker | `glm-api` 写入/替换失败保留完整旧 Store |
| Z4 | Blocker | `glm` 与 `glm-api` 不复制、不共享、不互相替换 |
| Z5 | Blocker | 三家 seen 自动识别 `glm-api` unseen |
| Z6 | Blocker | Full dashboard 显示四家；Not now 不强制配置 |
| Z7 | Blocker | targeted/inline `glm-api` setup 不误标其他 Provider |
| Z8 | Major | 动态第五 Provider 测试继续通过 |
| Z9 | Major | 文档说明写入第四 Secret 后降级到 1.4/1.3 的兼容风险 |

### AA — 启动、费用与隐私

| ID | 级别 | 验收项 |
|---|---|---|
| AA1 | Blocker | `cmr glm-api` fake Claude 环境精确 |
| AA2 | Blocker | `ANTHROPIC_API_KEY` only；Bearer token 和 mixed-case 残留不存在 |
| AA3 | Blocker | `glm` ↔ `glm-api` 双向启动无 auth/model 残留 |
| AA4 | Blocker | 父环境不变；Kimi/DeepSeek/GLM Plan 零退化 |
| AA5 | Blocker | opaque argv、cwd、TTY、signal、exit code 不退化 |
| AA6 | Blocker | 缺 Key TTY setup 后继续；取消不 spawn；non-TTY 快速失败 |
| AA7 | Blocker | payg WARN 明确直接计费，值来自 Pricing，不计算会话费用 |
| AA8 | Blocker | 输出、错误、WARN、snapshot 不含 Key 或 prompt sentinel |
| AA9 | Major | Windows `.cmd` 与 mixed-case 环境模拟通过 |

### AB — 分发与真实 Provider

| ID | 级别 | 验收项 |
|---|---|---|
| AB1 | Blocker | 全量 test/lint/diff/pack/sensitive scan 通过 |
| AB2 | Blocker | package/CLI 发布版本一致为 `1.4.0` |
| AB3 | Blocker | package 包含两个新 JSON，排除 Secret/State/tests/`.env`/本机路径 |
| AB4 | Blocker | updater 与 Mac isolated prefix E2E 不退化 |
| AB5 | Major | Node 18 核心测试通过 |
| AB6 | Blocker | 实际 Windows OS 全回归在获批流程中通过 |
| AB7 | Blocker | 用户授权的真实标准 API 主请求、工具、子 Agent 通过 |
| AB8 | Blocker | 费用明细回读证明 `glm-api` 走标准 API，未误耗 Coding Plan |
| AB9 | Blocker | 用户授权的真实 Coding Plan 验收仍按 `docs/14` 闭环 |
| AB10 | Blocker | 未经批准没有真实 Key/API、全局安装、CI、push 或发布 |
| AB11 | Blocker | 独立审阅通过后才可准备 Release |

Provider 真实验收由维护者确认；自动化、Node 18、Windows、打包、自更新与公开 Release 证据统一记录在 `docs/16`。

## 16. `1.5.0` Kimi Code 会员 Provider 任务卡 1 验收矩阵

本节是 `docs/17` 任务卡 1 的绑定验收矩阵。当前只完成官方事实、产品范围、架构合同和验收门禁的规格工作；没有真实 Kimi Code Key，不得把任何 Provider、模型、工具、子 Agent、额度归属或 HighSpeed 结论写成 PASS。以下矩阵的 Blocker 适用于后续实现与发布；任务卡 1 交回时仅登记“规格已完成、等待 Sol 独立复核”。

### AC — 配置身份与官方事实

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| AC1 | Blocker | `kimi` 仍是开放平台按量通道；`kimi-code` 使用独立 Kimi Code 会员通道，Base URL、Key 来源、Secret ID、鉴权 Header 和账单边界不混用 | `docs/01/02/07/17` 交叉审阅、官方直接链接 |
| AC2 | Blocker | 首批正式候选精确为 `kimi-code`、`kimi-code-k3-256k`、`kimi-code-k3` 三个 Profile；HighSpeed 不在候选配置 | Profile/别名规格、配置集合审阅 |
| AC3 | Blocker | `kimi-for-coding`、`k3-256k`、`k3` 的模型 ID、上下文和最低会员档位符合当前 Kimi Code 官方页 | `docs/07` 2026-08-12 事实章节、官方模型/Claude Code 页面 |
| AC4 | Blocker | K3 的 Claude Code 选择值是 `k3[1m]`，上游原生 ID 是 `k3`；CMR 不自行剥离 `[1m]` | 官方 Kimi Code Claude Code 页、Claude Code Model Configuration 页、后续假 Claude/协议证据 |
| AC5 | Blocker | 三个 Profile 均完整映射主模型、Opus、Sonnet、Haiku、Fable、Subagent；K3 两套映射为官方直接示例，`kimi-for-coding` 完整映射明确标为受约束推断；`CLAUDE_CODE_MAX_CONTEXT_TOKENS` 与 auto compact 的目标值有规格依据 | 官方 Kimi Code Claude Code 示例、事实/推断分栏、环境映射表、后续环境快照 |
| AC6 | Blocker | Kimi Code 会员的 7 天刷新、滚动 5 小时窗口、月度总额度、Extra Usage 和个人交互式使用限制被准确描述；不得写成无限额度或固定价格 | 官方 Membership Benefits、Community Guidelines、事实/推断分栏 |
| AC7 | Blocker | 当前 Kimi Code 页面与旧/开放平台 Claude Code 页面之间的端点、鉴权和模型命名冲突被显式登记；任何跨通道混用均阻断实现 | `docs/07` 冲突表、Sol 独立复核 |
| AC8 | Major | Claude Code 的 `/model`、`--model`、`ANTHROPIC_MODEL`、Settings 优先级、`/model` 默认持久化和 `ANTHROPIC_CUSTOM_MODEL_OPTION` 语义被记录；CMR 不把自定义 picker 当作 Provider 注册 | Claude Code 官方 Model Configuration、架构边界审阅 |
| AC9 | Blocker | Kimi Code 官方跳过登录脚本会写用户 Claude 配置，而 CMR 禁止持久修改；该差异被登记为 Blocker，环境变量直启必须在隔离配置与真实 Provider 门禁中证明 | Kimi Code Claude Code、Claude Code Authentication、`docs/07/17` 冲突登记 |

### AD — Entitlement、Secret 与 Setup

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| AD1 | Blocker | 新增 Profile 只引用独立 `entitlementRef`；不得引用 `kimi-k3` PAYG `pricingRef` 冒充会员价格，且两种 Ref 必须互斥 | `docs/01/02/17` Schema 合同，任务卡 2/3 测试 |
| AD2 | Blocker | 三个 Profile 共用 `kimi-code` Secret；不复用、复制、识别、替换既有 `kimi` Secret，不在 401/402/403/429 后 fallback | Secret/Provider 设计、假 Key 隔离测试 |
| AD3 | Blocker | Full setup 由动态 Provider 集合发现第五家 unseen；targeted/inline setup 只操作 `kimi-code`，不误标其他 Provider | Setup State 差集测试、临时 HOME |
| AD4 | Blocker | Kimi Code Key 只在用户主动交互式配置中输入；不修改真实 Store、Settings、Shell、系统环境或 Extra Usage | 测试夹具、只读审计、敏感扫描 |
| AD5 | Major | 输出只有 `configured/missing` 和脱敏权益提示，不显示 Key、掩码、长度、余额、精确费用或账户信息 | hostile 输出测试 |
| AD6 | Major | 写入第五 Secret 后，降级到旧版本可能拒绝 Store 的风险被文档化；不得自动删除新 Key | 降级说明、回退审阅 |

### AE — 启动环境与 Claude Code 隔离

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| AE1 | Blocker | Kimi Code 子进程只注入 `ANTHROPIC_API_KEY`；所有大小写变体的 `ANTHROPIC_AUTH_TOKEN` 与旧模型变量先被清除 | 假 Claude 环境快照、mixed-case 参数化测试 |
| AE2 | Blocker | `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 只由 Kimi Code Profile 回注；Kimi、DeepSeek、GLM 两种模式不继承该变量 | 连续 Profile 启动快照、父环境前后对照 |
| AE3 | Blocker | 三个 Profile 的全量模型/compact/effort 映射与已登记的官方事实或受约束推断一致，不缺 Fable/后台/Subagent，不把 `kimi-for-coding` 推断伪装成官方示例 | 假 Claude snapshot、Schema 测试、事实/推断交叉审阅 |
| AE4 | Blocker | argv、cwd、TTY、Ctrl+C、退出码、父环境隔离继续满足 `1.4.0` 合同；CMR 不解析、重排、记录或回显 `--model` 等参数 | 既有回归、Hostile QA、假 Claude E2E |
| AE5 | Blocker | 不把 Kimi Code `kimi-for-coding-highspeed` 与 Claude Code `/fast` 混为同一能力；记录 `/fast` 会切到受支持 Opus、默认持久化及网关资格检查风险，在任务卡 8 前不添加 HighSpeed 入口 | Kimi Code Model Configuration、Claude Code Fast mode、架构审阅 |
| AE6 | Major | `ANTHROPIC_BASE_URL` 非一方端点导致 Tool Search 默认禁用的 Claude Code 语义被保留；不凭经验加入 Tool Search 变量 | 官方 Environment variables、环境快照 |

### AF — 真实 Provider 与权益归属

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| AF1 | Blocker | 用户授权后，三个首批 Profile 各自通过 `/status` Base URL、最小主请求、工具和子 Agent；考虑 Kimi 官方允许 `/status` 仍显示 Claude 名称，模型选择层与上游原生 ID 必须由环境/协议证据另行证明 | 脱敏真实 Provider 证据；无真实 Key 时 BLOCKED |
| AF2 | Blocker | K3 256K 与 K3 1M 的会员档位权限、上下文限制、Thinking/Effort 行为和切换/compact 影响得到真实验证 | 会员档位记录、脱敏请求与 `/status` |
| AF3 | Blocker | 用量前后回读证明请求走 Kimi Code 会员通道，不误扣开放平台余额；不把静态配置当作归属证明 | Kimi Code Console/订阅页脱敏回读 |
| AF4 | Blocker | Extra Usage 在用户授权状态下保持可控；CMR 未开启、未修改支出上限、未自动切换 | 用户授权记录、脱敏状态前后 |
| AF5 | Blocker | HighSpeed 真实验证覆盖模型 ID、Claude Code `/fast` 是否切向 Anthropic、持久设置污染、额度消耗与归属；结果只允许显式 Profile/只文档化/继续延后三选一 | 任务卡 8 真实证据；未验证则延后 |
| AF6 | Blocker | 真实 Provider 失败、会员不足、Extra Usage、401/403/429 等按原样失败，不做 Key 类型检测、自动重试或费用通道 fallback | 失败路径与代码审阅 |

### AG — 分发、候选与 Release 门禁

| ID | 级别 | 验收项 | 必须证据 |
|---|---|---|---|
| AG1 | Blocker | 任务卡 1 只改允许的规范文档和证据登记；不改 `src/`、`config/`、`tests/`、`package.json`、用户配置、CI、Git 远端或 Release | `git diff --stat`、变更清单 |
| AG2 | Blocker | 任务卡 1 的 `npm test`、`npm run lint`、`git diff --check` 全部通过；后续实现卡还需按其合同补齐 pack/跨平台/Updater 验证 | 命令、退出码、测试数量 |
| AG3 | Blocker | 没有真实 Key、账号、额度截图、完整环境、提示词或本机路径进入仓库、日志、快照和候选包 | 敏感扫描与人工审阅 |
| AG4 | Blocker | 没有三个首批 Profile 的真实 Provider PASS，不得发布 `1.5.0` 或将其标为 Latest；当前稳定版仍为 `1.4.0` | 发布状态、后续任务卡 7/8/9 证据 |
| AG5 | Major | 任务卡 6 前，候选文档明确个人交互式使用限制、会员/开放平台 Key 不通用、Extra Usage 风险、HighSpeed 未纳入稳定范围 | README/使用文档审阅 |
| AG6 | Blocker | Sol 独立复核前不得进入任务卡 2；任何事实冲突无法按产品边界消解时必须停在 FAIL/阻断 | `docs/17` 角色合同与证据登记 |

本节结论格式仍使用第 8 节的 `PASS` / `CONDITIONAL PASS` / `FAIL`。任务卡 1 的“规格完成”不等于任何 AF 真实 Provider 门禁通过。

### 任务卡 8 真实 Provider 证据结论（2026-08-18）

用户授权（Allegretto+ 档、Extra Usage 全程关闭、脱敏回读）下以最小请求完成真实验收；治理模式为项目负责人 2026-08-18 指令确立的单一执行者 + 自动化验证（撤销 Luna/Sol 双角色，见 `docs/17` 页首）。

- **AF1 `PASS`**：三个首批 Profile 各自通过环境变量无头直启、最小主请求、只读/写读工具、子 Agent 与 `--model` 显式切换（合计 14 次最小请求）；`/status` 于真实配置 k3 会话验证 Base URL=`https://api.kimi.com/coding/`、鉴权通道为 `ANTHROPIC_API_KEY`、Auth token 为 none；模型选择层与上游 ID 经 Claude Code sdk 层遥测（各档模型 ID 精确到达请求层）与运行进程环境核验（`ps`，脱敏）证明。
- **AF2 `PASS`**：Allegretto+ 实测 `k3[1m]` 1M 窗口与 `k3-256k`；`CLAUDE_CODE_EFFORT_LEVEL=high` 注入生效且优先于会话内 `/effort`（Claude Code 官方提示原文为证）；`/compact` 行为正常（最小会话未达压缩阈值，已记录限度）。
- **AF3 `PASS`**：Kimi Code Console weekly `0% → 1%`、5 小时滚动窗 `7%`、Usage History 含本轮全部模型 ID；Moonshot 开放平台当日 API 请求为零、余额无变化——会员通道为唯一消耗通道。
- **AF4 `PASS`**：Extra Usage 全程关闭，无现金扣费；CMR 未开启、未修改支出上限。
- **AF5 `PASS`（决策 2）**：HighSpeed 按三选一中的“只文档化显式模型切换”处理——`--model kimi-for-coding-highspeed` 真实验证可用（`FAST-OK` + sdk 层遥测），四个模型 ID 共用同一 Provider/Secret/Base URL；`/fast` 交互行为（H2/H3）未实测、3 倍消耗对比（H5）样本不足，故不新增 `kimi-code-fast`，`/fast` 不作为入口。
- **AF6 `PASS`**：全程无 fallback、自动重试或 Key 类型检测行为；失败按原样透传的边界未因新增通道改变。

附则（AG 之外的首跑事实，已写入用户文档）：全新 Claude 配置首跑顺序为主题 → 环境键确认（默认推荐 `No`，须主动选 `1. Yes`）→（仅当键被拒后）登录方式选择（该界面无 Esc 出口，误选 Console 会进入浏览器 OAuth）；首跑对 `api.anthropic.com` 存在连通性门检，代理瞬断会直接退出、重试即可；无头 `-p` 模式不受首跑影响。

## 17. GLM-5.3 Coding Plan 升级验收矩阵

绑定实施合同：`docs/18-v1.5-glm-5.3-upgrade-implementation-guide.md`。本节只覆盖 GLM53-1 至 GLM53-4 的仓库候选，不改变第 14、15 节对 `1.4.0` 历史 GLM-5.2 的验收记录。

### GLM53-A — 规格与 Coding Plan 映射

| ID | 级别 | 验收项 |
|---|---|---|
| G53-A1 | Blocker | `glm` 使用 `glm-5.3[1m]`、`glm-4.7`、1000000 compact、3000000 timeout、traffic=1 |
| G53-A2 | Blocker | `glm` 只使用 `ANTHROPIC_AUTH_TOKEN`/`glm` Secret，不残留 API Key |
| G53-A3 | Blocker | `glm-5.3`、`glm-5.2`、`glm-plan` 三个别名均解析到当前 `glm` Profile |
| G53-A4 | Blocker | `glm` 不引用 `glm-5.2` Pricing，改用独立 subscription-quota entitlement |
| G53-A5 | Major | 启动提示使用通用 subscription quota 话术，不显示 2/8/28 或会话费用 |

### GLM53-B — 标准 API 边界与回归

| ID | 级别 | 验收项 |
|---|---|---|
| G53-B1 | Blocker | `glm-api` 仍为 `glm-5.2[1m]`/`glm-4.7`，只使用 `ANTHROPIC_API_KEY` |
| G53-B2 | Blocker | `glm-api` 仍引用 `glm-5.2` Pricing，价格为 2/8/28 CNY/M |
| G53-B3 | Blocker | 5.3 Coding Plan 支持不会自动迁移、fallback 或改写标准 API |
| G53-B4 | Blocker | `glm` ↔ `glm-api` 双向启动无 auth/model 残留，Kimi Code 七 Profile 零退化 |
| G53-B5 | Major | `npm test`、`npm run lint`、`git diff --check` 和必要的 pack/敏感扫描通过 |

本轮没有真实 Provider 或标准 API 门禁；最高结论是仓库实现候选完成，不能把自动化结果写成真实连接、计费归属或 Release PASS。
