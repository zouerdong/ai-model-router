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

## 13. `1.3.0` 自更新验收矩阵（Sol 本机审阅完成；整体发布门禁未闭环）

本节只增加绑定验收标准，不提前给出 `PASS`。任一 Blocker 失败，`1.3.0` 不得发布。

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

Windows T4 必须在实际 Windows 内核、Windows 文件系统与 Windows shell 中运行；物理机不是必要条件，GitHub-hosted Windows VM 可作为可重复的正式证据。macOS 上注入 `platform: "win32"` 仍只能算模拟，不能替代 T4。T4 未完成前不能宣称跨平台 updater 已完成。`docs/13-v1.3-self-update-implementation-brief.md` 第 15 节是实现者证据，不替代本节的独立判定。
