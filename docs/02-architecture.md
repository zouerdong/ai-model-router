# 02 — 系统架构

状态：`1.5.0` 公开 Latest 稳定架构（2026-08-18 发布）；Kimi Code 会员 Provider 已真实验收并发布
更新时间：2026-08-16

## 1. 架构结论

`1.0.0` 采用“数据化 Provider Profile + 干净子进程环境 + Claude Code 参数透明透传”。CMR 的架构边界止于启动 Claude Code 子进程，不进入会话管理层。

```text
用户所在项目目录
       │
       ├── cmr kimi [Claude args...] ── Kimi K3 Profile ────┐
       │                                                     │
       └── cmr deepseek [Claude args...] ─ DeepSeek Profile ─┤
                                                             ▼
                                                  Claude Code 子进程
                              args / cwd / TTY / signal / exit code
```

DeepSeek Auto 不由 CMR 自己判断任务复杂度。CMR 只注入 DeepSeek 官方映射；Claude Code 使用主模型、模型档位和子 Agent 时，自然落到 Pro 或 Flash。Kimi/DeepSeek 均不绑定规划或执行角色。

Profile 选择器之后的参数是不可解释的 opaque token list。CMR 只负责保存顺序和值并传给 Claude Code；不得按已知参数白名单实现，因为 Claude Code 未来新增参数也应自动可用。

## 2. 为什么不沿用旧讨论中的 Python 方案

`0.2.0` 沿用 `0.1.x` 的 Node.js 标准 JavaScript 技术基线，原因来自当前约束：

- Claude Code 官方安装本身要求 Node.js，Mac 与公司 Windows 已有或必然需要该运行时。
- 不再要求 Windows 额外安装和管理 Python。
- `child_process`、`fs`、`path`、`os` 与 `node:test` 足够覆盖当前范围；高费用确认移除后启动路径不再需要 `readline`。
- 两个 Profile 不需要 YAML/TOML；JSON 可直接由标准库读取。
- 不使用 TypeScript，避免为一个轻量 CLI 增加编译链和发布产物。

源代码可直接跨平台使用；阶段一不做 macOS/Windows 独立二进制。若以后确认确有“零运行时安装包”需求，再单独评估打包。

## 3. `1.0.0` 实现目录

`1.0.0` 的最小结构如下，不得扩张成通用 AI 环境管理器。`docs/09-phase-1-acceptance.md` 中的 `plan.json/build.json` 仅属于 `0.1.x` 历史基线：

```text
claude-model-router/
├── AGENTS.md
├── README.md
├── package.json
├── docs/
├── config/
│   ├── providers/
│   │   ├── kimi.json
│   │   └── deepseek.json
│   ├── profiles/
│   │   ├── kimi.json
│   │   └── deepseek.json
│   └── pricing/
│       ├── kimi-k3.json
│       └── deepseek-v4.json
├── src/
│   ├── cli.js
│   ├── commands/
│   │   ├── doctor.js
│   │   ├── launch.js
│   │   └── list.js
│   ├── config/
│   │   ├── loader.js
│   │   └── validator.js
│   ├── environment.js
│   ├── launcher.js
│   ├── platform.js
│   ├── redact.js
│   └── secret-store.js
└── tests/
    ├── fixtures/
    ├── config.test.js
    ├── doctor.test.js
    ├── environment.test.js
    ├── launcher.test.js
    └── redact.test.js
```

## 4. 模块职责

| 模块 | 唯一职责 |
|---|---|
| `cli.js` | 解析 CMR 管理命令（含 `secret`/`config`）或首个 Profile 选择器；保存后续 opaque Claude 参数；选择菜单；统一错误出口 |
| `loader.js` | 从项目内只读加载 Provider/Profile/Pricing |
| `validator.js` | 验证必填字段、变量白名单、Provider 引用与核验日期 |
| `environment.js` | 从父环境复制、清除 Router 变量、注入当前 Profile |
| `launch.js` | 解析 Profile、构建环境、显示非交互式费用信息并把 Claude 参数交给启动器 |
| `launcher.js` | 找到 Claude、合并内部可执行文件前缀参数与用户 Claude 参数、继承 cwd/stdio、转发信号和退出码 |
| `platform.js` | 路径与可执行文件的 macOS/Windows 差异 |
| `secret-store.js` | 仓库外读取/写入 Provider 密钥，接口与平台无关 |
| `redact.js` | 对输出、异常和诊断结构统一脱敏 |
| `doctor.js` | 只读发现 Claude、Settings、Shell/PowerShell 和环境冲突 |

任何模块都不得顺手修改用户配置。当前产品的 `doctor` 没有 `--fix`。

## 5. 配置模型

### 5.1 Provider

Provider 只描述供应商级事实：

```json
{
  "id": "kimi",
  "displayName": "Kimi",
  "baseUrl": "https://api.moonshot.cn/anthropic",
  "authVariable": "ANTHROPIC_AUTH_TOKEN",
  "secretId": "kimi",
  "verifiedOn": "2026-07-18",
  "sourceUrl": "https://platform.kimi.com/docs/guide/claude-code-kimi"
}
```

### 5.2 Profile

Profile 描述一次 Claude Code 会话的完整映射：

```json
{
  "id": "kimi",
  "aliases": ["plan", "kimi-k3"],
  "displayName": "Kimi K3",
  "provider": "kimi",
  "purpose": "通过 Kimi K3 运行 Claude Code；适合规划，也可直接执行",
  "costNotice": "high",
  "environment": {
    "ANTHROPIC_MODEL": "kimi-k3[1m]"
  }
}
```

示例仅表示 Schema，正式 Profile 必须包含 `docs/07-official-sources.md` 所列的完整变量。

Profile 中的模型值属于 Claude Code 选择层。对 1M 模型，`[1m]` 是 Claude Code 的上下文选择后缀；Claude Code 会在向 Provider 发请求前剥离它。因此 Kimi Profile 必须继续注入 `kimi-k3[1m]`，实际 Kimi API model 则是 `kimi-k3`。CMR 不增加 Provider 分支或本地代理来重复转换这一后缀；两层事实与验收方式见 `docs/07-official-sources.md`。

### 5.3 Pricing

Pricing 只负责启动提示，不参与路由或账单：

```json
{
  "model": "kimi-k3",
  "currency": "CNY",
  "unit": "per_million_tokens",
  "verifiedOn": "2026-07-18",
  "sourceUrl": "https://platform.kimi.com/docs/pricing/chat-k3"
}
```

每次价格变化只能更新配置和核验日期，不能改写历史日志；CMR 默认不记录会话 Token。

### 5.4 Profile ID、别名与保留字

- 规范 ID：`kimi`、`deepseek`、`glm`、`glm-api`、`kimi-code`、`kimi-code-k3-256k`、`kimi-code-k3`；候选追加 `deepseek-vision`（`docs/20`）。
- Kimi 兼容别名：`plan`、`kimi-k3`；Kimi Code 别名：`kimi-membership*`。
- DeepSeek 兼容别名：`build`、`deepseek-auto`；DeepSeek Vision 别名：`deepseek-flash-vision`。
- `help`、`version`、`list`、`doctor`、`config`、`secret` 等管理命令是保留字，Profile ID 与别名不得占用。
- ID、别名解析必须来自数据化 Profile；CLI 不得分别写一套模型映射。
- 两个 Profile 配置文件在 `0.2.0` 实施时从 `plan.json/build.json` 重命名为 `kimi.json/deepseek.json`。这是文件移动/删除语义，执行者必须先获得用户对精确文件的批准。

## 6. Router 管理的环境变量

构建子进程环境时，先从继承环境中删除以下键，再注入所选 Profile：

```text
ANTHROPIC_BASE_URL
ANTHROPIC_API_KEY
ANTHROPIC_AUTH_TOKEN
ANTHROPIC_MODEL
ANTHROPIC_SMALL_FAST_MODEL
ANTHROPIC_DEFAULT_OPUS_MODEL
ANTHROPIC_DEFAULT_OPUS_MODEL_NAME
ANTHROPIC_DEFAULT_SONNET_MODEL
ANTHROPIC_DEFAULT_SONNET_MODEL_NAME
ANTHROPIC_DEFAULT_HAIKU_MODEL
ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME
ANTHROPIC_DEFAULT_FABLE_MODEL
ANTHROPIC_DEFAULT_FABLE_MODEL_NAME
CLAUDE_CODE_SUBAGENT_MODEL
ENABLE_TOOL_SEARCH
CLAUDE_CODE_AUTO_COMPACT_WINDOW
CLAUDE_CODE_EFFORT_LEVEL
```

在 `1.4.0` 基线中，本机现有 `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 不属于既有四个 Profile 的 Router 管理变量，因此 `doctor` 仍按 legacy/unverified 处理；它不应被既有 Profile 静默继承。任务卡 1 复核确认 Kimi Code 官方 Claude Code 指南明确使用该变量；任务卡 2 已将它纳入 `1.5.0` 候选的 Router 管理集合，后续任务卡已验证大小写不敏感清理和按 Profile 回注。

不属于 Router 的变量不得清除，例如代理、Tavily、MCP、终端与编辑器设置。

环境副本清理按键名大小写不敏感执行。原因是 Windows 环境变量名不区分大小写，而 `{ ...process.env }` 得到的普通对象会保留实际大小写；如果只删除规范大写键，旧的混合大小写 Router 变量可能与新值同时进入子进程。

## 7. 运行数据流

### 7.1 命令解析与启动前

1. 若无参数，显示交互式 Profile/管理菜单。
2. 若首个 token 是 CMR 管理命令，由对应管理命令处理，后续参数按该命令自身契约解析。
3. 否则把首个 token 作为 Profile ID/别名解析；找不到时返回未知命令错误。
4. 把首个 token 之后的全部 token 保存为 `claudeArgs`；不检查、不改写、不拼接成字符串、不记录。
5. 加载并校验 Profile 与 Provider。
6. 定位 `claude` / `claude.cmd`。
7. 获取本机 Provider 密钥；缺失则停止，不回显值。
8. Kimi 等高费用 Profile 只显示一行信息，不等待确认。
9. 检查会阻断本次启动的永久配置冲突。

### 7.2 子进程环境

1. 浅复制 `process.env`。
2. 删除 Router 管理的全部变量。
3. 注入 Base URL、选定 Profile 的完整映射和唯一鉴权变量。
4. 不修改 `process.env` 本身。

### 7.3 启动与退出

1. 内部测试/平台适配所需的 `executableArgs` 必须位于用户 `claudeArgs` 之前；正常 `claude` 可执行文件的 `executableArgs` 为空。
2. 以 argv 数组启动，禁止把参数拼为 Shell 命令字符串；空格、中文、引号和以 `-` 开头的值不得改变。
3. 使用当前 `process.cwd()` 启动 Claude Code。
4. `stdio: "inherit"`，不截获交互界面。
5. 处理 Ctrl+C/终止信号，避免留下孤儿进程。
6. 原样返回 Claude Code 的退出码。
7. 不在日志中打印完整环境对象或任何 `claudeArgs`。

### 7.4 Claude Code 会话与参数边界

- `--continue`、`--resume`、`--fork-session` 完全由 Claude Code 解释；CMR 不读写会话文件。
- 用户选择哪个 Profile，本次恢复后的子进程就使用哪个 Profile 环境。CMR 不阻止跨 Provider 恢复。
- `--model`、`--permission-mode`、`-p` 和其他参数同样透明传递。Provider 不支持某个模型时，由 Claude Code/Provider 自然报错。
- CMR 不应输出“必须新会话”“不能 `/model`”“Kimi 只能规划”“DeepSeek 只能执行”等限制性文案。
- 项目文件与 Claude Code 本地会话记录不会被 CMR 修改。普通文本与工具会话通常可以跨 Provider 恢复；少数 Provider 不支持的内容块或能力可能自然报错，这不是启动器拦截或转换的理由。

## 8. 永久 Settings 冲突的处理策略

Claude Code 的 `settings.json.env` 可能覆盖终端变量。`0.1.x` 已选择并完成**显式的一次性迁移**，而不是依赖脆弱的运行时覆盖；`0.2.0` 不重复迁移：

1. `cmr doctor` 先只读列出冲突键和来源，不显示值。
2. 代码、假进程测试完成后再进入本机迁移门禁。
3. 执行者展示将修改的文件、键名和备份位置。
4. 用户明确确认后，备份 `settings.json` 与 `.zshrc`。
5. 只移除模型、端点、鉴权、上下文和 effort 相关项；保留插件、主题、状态栏、Tavily、Hooks、权限等。
6. 移除 Settings 顶层旧 `model: kimi-k3`，由 `cmr kimi` 明确提供 `kimi-k3[1m]`。
7. 将两个 Provider 密钥写入仓库外的 CMR 本机存储。
8. 再次运行 `doctor`，确认冲突消失。

备份可能包含旧 API Key，目录与文件必须限制为当前用户可访问，且永远不进入仓库。

这会使直接运行裸 `claude` 不再自动连接 Kimi。迁移后应使用 `cmr kimi` 或 `cmr deepseek`；`cmr plan/build` 继续作为兼容别名。

## 9. 密钥存储

当前版本沿用最小、透明、跨平台的仓库外 JSON 存储：

- macOS：`~/Library/Application Support/ClaudeModelRouter/secrets.json`
- Windows：`%APPDATA%\ClaudeModelRouter\secrets.json`

要求：

- macOS 文件权限为 `0600`，父目录不允许其他用户写入。
- Windows 阶段通过用户目录 ACL 验证，仅当前用户可访问。
- `cmr secret set` 从 TTY 隐藏输入，不把密钥放入参数或历史。
- 写入采用同目录临时文件 + 原子替换。
- 日志只显示 Provider 是否已配置。

如果阶段三发现公司安全政策禁止本地明文凭据，再将 `SecretStore` 接口替换为系统凭据库；不得在阶段一预先引入平台原生依赖。

## 10. Doctor 架构

`cmr doctor` 默认完全只读，输出 `PASS/WARN/FAIL`：

- OS、架构、Node、Claude Code 版本与实际路径。
- 当前目录。
- Kimi/DeepSeek 密钥的 configured/missing 状态。
- 当前进程中 Router 变量的键名与是否非空。
- 用户、项目、Local、Managed Settings 的来源和冲突键。
- Mac Shell 或 Windows PowerShell Profile 中的相关变量名。
- Profile Schema、官方核验日期与过期提醒。
- `.gitignore` 是否覆盖密钥、`.DS_Store`、日志和本机配置。

Doctor 不联网验证余额，不发送测试请求，不读取或显示完整密钥。

## 11. Windows 扩展点

以下差异必须封装在 `platform.js`，不能散落在业务逻辑中：

- `claude`、`claude.exe`、`claude.cmd` 查找与启动。
- `HOME` / `USERPROFILE` / `APPDATA` 路径。
- Shell Profile 与用户环境变量的只读审计。
- 文件权限/ACL 的验证方法。
- Ctrl+C 与退出码行为。

阶段一的单元测试应模拟 `win32` 路径与 `.cmd`，但不宣称 Windows 已完成真实验收。

**路径构造按"来源"选 API**（`v1.7.0` Windows 门禁两轮失败的教训，见 `docs/21` 证据台账）：

- 固定系统字面量路径（managed settings 的 `C:\Program Files\ClaudeCode`、`/Library/Application Support/ClaudeCode`、`/etc/claude-code`）必须用**目标平台**的 `path.win32` / `path.posix` 构造，与宿主无关；注意 `path.join("C:", ...)` 在真 Windows 上产出驱动器相对路径，必须 `path.win32.join("C:\\", ...)`。
- 宿主运行时传入的路径（`CLAUDE_CONFIG_DIR`、homedir、cwd 及其派生）用**宿主** `path` 模块构造；目录展开的子路径跟随父路径所用的同一 API（`settings-conflict.js` 的每个 settings 候选携带自己的 `pathApi`）。
- 测试中注入 fake fs 的路径键必须与生产代码使用同一构造来源（从生产函数取值或同 API 拼接），不得手写平台相关字面量。
- macOS 全绿不代表 Windows 会绿：宿主与目标平台一致时会掩盖分隔符差异，Windows 实机 CI 门禁是唯一可靠兜底。

## 12. 关键风险与控制

| 风险 | 控制 |
|---|---|
| Settings 覆盖启动环境 | Doctor + 经批准的一次性迁移 |
| 只改主模型，后台任务失败 | Profile 快照测试覆盖完整映射 |
| K3 仍使用旧 `kimi-k3` | 正式 Profile 固定 `kimi-k3[1m]`，真实 `/status` 验收 |
| 用户透传的模型名不受当前 Provider 支持 | 不拦截；由 Claude Code/Provider 报错，使用文档说明恢复到 Profile 默认模型的方法 |
| 密钥进入 Git/日志 | 仓库外存储、统一脱敏、提交前扫描 |
| 跨 Provider 恢复旧会话出现上下文或模型兼容差异 | 尊重用户显式选择；不自动恢复、不建 Session Registry；推荐重要任务用文件式交接 |
| 参数包含提示词或敏感路径并进入日志 | CMR 不记录、回显或序列化 `claudeArgs`；测试故意放置敏感哨兵并检查输出 |
| 参数拼为 Shell 字符串导致转义或命令注入 | 始终使用 argv 数组；只有既有 Windows `.cmd` 平台边界可使用受控分支 |
| Mac 代码在 Windows 行为不同 | 标准库核心、平台适配层、Windows 模拟测试与阶段三实机验收 |

## 13. `1.1.0` 首次运行配置架构（已验收）

> 本节记录已通过 Sol 独立验收的实现架构。精确接口、阶段步骤、测试向量与最终证据见 `docs/11-v1.1-first-run-setup-implementation-brief.md`。

### 13.1 架构结论

`1.1.0` 增加两个仓库外组件：薄的 setup 编排层和只保存 onboarding 元数据的 Setup State Store；不改变 Provider 环境注入、Claude argv 透传或 Secret Store 格式：

```text
安装完成
   │
   └── 用户首次运行 cmr（TTY）
           │
           ├── state 缺失/存在 unseen Provider
           │        └── 读取全部 Key 状态 ── setup 向导
           │               ├── missing ─────── 隐藏输入 ── SecretStore.set()
           │               ├── configured ──── 保留或显式更换
           │               └── 完成/稍后 ───── SetupState.markSeen(current providers)
           ├── state 已覆盖全部当前 Provider ─ 带状态的普通菜单
           └── 非 TTY ──────────────────────── 帮助/明确错误，不等待输入

cmr <profile> [opaque Claude args...]
           │
           ├── secret configured ───────────── 原 launchProfile 路径
           └── secret missing + TTY ────────── 单 Provider setup ── 成功后继续原启动
```

首次运行判断不能读取 Key 状态代替。Setup State Store 保存当前用户已经看过的 Provider ID；文件缺失代表第一次进入，当前配置出现未 seen Provider 代表版本增加了新 Provider。两种情况都先展示**全部当前 Provider** 的 Key 状态并进入引导，无论它们是 configured 还是 missing。

状态文件不属于安装包，也不由安装脚本写入。它定义的是“当前本机用户数据目录中的首次 CMR 交互使用”：卸载/重装后若应用数据仍保留，则不重复引导；换新电脑、换用户目录或删除应用数据后会重新引导。

### 13.2 为什么不使用 npm `postinstall`

npm 安装脚本默认不保证与用户共享标准输入输出，可以被 `ignore-scripts`/脚本审批策略跳过，也会在 CI、升级、依赖安装和无 TTY 环境执行。把密钥输入放在安装生命周期会造成安装卡死、重复索取凭据、供应链权限扩大和不可测试的分发差异。

因此安装职责只到“命令可运行”；配置职责从用户主动运行 `cmr` 开始。`package.json` 不增加任何收集凭据的 lifecycle script。

### 13.3 目标模块职责

| 模块 | `1.1.0` 新职责 |
|---|---|
| `cli.js` | 识别 `setup`；在无参数 TTY 下按 Setup State 选择首次/新 Provider 向导或普通菜单；管理命令仍优先且不触发隐式写入 |
| `commands/setup.js` | 纯编排：选择 Provider、显示官方获取地址、调用隐藏输入、处理已配置项、逐项保存、输出脱敏摘要 |
| `commands/launch.js` | 缺少当前 Provider 密钥且为 TTY 时调用单 Provider setup；成功后继续同一次启动；非 TTY 保持快速失败 |
| `setup-state.js` | 仓库外读取/原子写入 Schema v1 onboarding 状态；保存 `seenProviderIds`，不保存 Key、账号、时间或使用记录 |
| `secret-store.js` | 沿用 Schema v1 与原子写入；隐藏输入支持由调用方提供 Provider 标签，但仍负责 raw mode 恢复与长度/空值校验 |
| `platform.js` | 提供统一 CMR 应用数据目录、Secret/State 路径与 Claude 可执行文件发现；向导不拼接 Shell 命令或打开浏览器 |
| `config/providers/*.json` | 增加经 Schema 校验的 `apiKeyUrl`，作为向导显示的官方控制台地址 |
| `validator.js` | 校验 `apiKeyUrl` 必须为 `https:` 绝对 URL，且 Provider ID/secretId 仍符合现有合同 |

交互层与两个 Store 都必须可注入，以便测试不依赖真实终端。`setup.js` 接受 `prompter`、`secretStore`、`setupStateStore`、`input/output`、`platform/env/homeDir` 等选项；单元测试使用 fake prompter 和临时 HOME，不读取本机状态。

### 13.4 CLI 分派优先级

分派顺序固定为：

1. 显式管理命令：`help/version/list/doctor/config/secret/setup`。
2. 无参数：非 TTY 打印帮助；TTY 比较当前数据化 Provider ID 与 `seenProviderIds`。State 缺失或存在 unseen Provider 时，读取全量 Key 状态并进入 setup；否则进入普通菜单。
3. Profile ID/别名：保留全部后续 opaque argv；密钥存在则启动，缺失时仅在 TTY 做当前 Provider setup。
4. 未知首 token：保持未知 Profile 错误，不把 Claude 参数误判为 setup 输入。

`doctor`、`list`、`version`、`help`、`config path` 和 `secret status` 永远不因首次运行而写文件。无参数首次/新 Provider 向导和无 target 的 `cmr setup` 都展示全量状态，因此可在用户完成或明确选择稍后后写 Setup State；定向 `cmr setup <provider>` 与缺 Key 启动只展示一个 Provider，不得把其他 Provider 标为 seen。

### 13.5 Setup 状态机

```text
START
  ├─ no TTY ─────────────────────────────── ERROR_NO_TTY
  └─ load config + setup state + all secret status
       ├─ corrupt/unreadable Secret Store ── ERROR_SECRET_STORE (不覆盖)
       ├─ state missing/unseen provider ───── onboarding reason
       └─ show every current provider status before choices
            ├─ deliberate not now/continue ── mark all current provider IDs seen
            ├─ interrupt/EOF/error ────────── CANCELLED (不 mark seen)
            └─ for each provider, sequentially
                 ├─ already configured ───── KEEP by default
                 ├─ show apiKeyUrl
                 ├─ hidden input cancel ──── stop; 已成功保存项保留
                 ├─ validation/write fail ── stop; 不打印 Key
                 └─ write succeeds ───────── configured
       └─ print refreshed all-provider summary
            ├─ onboarding completed/not now ─ mark seen atomically
            └─ targeted/inline setup only ─── do not change unseen Provider state
```

多 Provider 设置采用逐项原子提交，而不是把两个 Key 暂存在内存后一次性写入。这样第二项取消或失败时，第一项仍是明确、可用的成功结果；重新运行向导必须从实时状态继续，不能重复覆盖第一项。

### 13.6 输出与错误合同

- stdout：欢迎、选择、官方 URL、`configured/missing` 摘要和下一步命令。
- stderr：错误、警告、隐藏输入提示；不得包含输入值。
- 不打印 Key 的掩码、末四位、长度、哈希或 JSON Secret Store 内容。
- Ctrl+C 必须恢复终端 raw mode。显式 `setup` 返回 `130`；Profile 缺 Key 的就地 setup 被取消时不得启动 Claude，同样返回 `130`。
- 普通“稍后配置/继续”不是异常，返回 `0`；首次/新 Provider 向导在用户已经看过全量状态并明确选择后写入 Setup State，但不创建空 Secret Store。
- Secret Store 损坏或不可读时停止，不以空对象覆盖；用户通过 `cmr config path` 和错误信息定位，但修复/删除仍需单独确认。
- Setup State 损坏不能抑制首次引导：显示警告、把当前 Provider 当作 unseen；用户明确完成后用合法 Schema 原子重建该非敏感状态文件。
- Setup State 如果因权限或 I/O 错误无法读取，则停止并返回错误，不把未知内容当作空状态或强行覆盖。

### 13.7 本地就绪检查与网络边界

向导完成摘要只检查：

- Provider/Profile 配置 Schema 有效。
- 选定 Provider 的 Secret Store 状态为 `configured`。
- Claude Code 可执行文件是否能在 PATH 中发现。
- 当前平台是否在已支持集合中。

`1.1.0` 不自动请求 Provider API。Kimi 与 DeepSeek 都有只读 models 接口，但公司代理、证书、限流和服务波动会把有效 Key 误判为失败；同时现有 Node 核心没有统一代理传输层。在线验证以后若需要，应作为显式 `cmr setup --verify` 或 `cmr doctor --network` 的独立设计，并明确超时、代理和非计费合同。

所有 UI 和测试必须把 `configured` 解释为“已存入本机 Store”，不能输出 `valid/verified/connected`。首次真实启动返回的 401、余额或模型权限错误属于 Provider 可用性结果，不得由 setup 在无网络证据时提前承诺。

### 13.8 兼容性约束

- Secret Store 继续使用 `{ "version": 1, "providers": { ... } }`，`1.0.0` 已有文件无需迁移。
- Setup State 使用 `{ "version": 1, "seenProviderIds": [...] }`。从 `1.0.0` 升级的用户没有该文件，因此无论已有几把 Key，第一次运行 `1.1.0` 都会看到一次全量状态与向导。
- Setup UI 与 State 比较必须遍历数据化 Provider 集合，不以 `status.kimi/status.deepseek` 固定分支判断首次。以后新增 Provider 会自动形成 unseen 差集并重新触发一次全量引导。
- 新增共用既有 Provider Key 的 Profile/模型不会形成 unseen Provider，因此不重复弹凭据向导；只有新增独立凭据边界时才增加 Provider ID。
- `cmr secret set/status` 保留，作为脚本化维护之外的底层人工管理命令；不删除兼容入口。
- `cmr kimi/deepseek` 后的 Claude argv 在 setup 前后都不得解析、记录、改写或丢失。
- setup 不调用阶段一专用 `migrateLocalConfig()`；该函数硬编码 macOS 文件和历史备份路径，不是通用新用户配置方案。
- 发现 Settings/Shell 冲突时只给出 `cmr doctor` 路径，不自动修改用户文件。通用跨平台引导式迁移必须另立规格和门禁。

## 14. `1.2.1` Windows 可执行文件发现

Windows 环境变量名在操作系统层面不区分大小写，但 `{ ...process.env }` 得到的普通 JavaScript 对象会保留实际键名。`findClaudeExecutable()` 因此不能只读取 `env.PATH`，必须在 `win32` 下按不区分大小写的键名查找 PATH。

可执行文件发现顺序为：

1. 用户显式注入的 `pathValue`。
2. Windows 环境对象中任意大小写的 PATH 键。
3. 官方原生安装后备目录 `%USERPROFILE%\.local\bin`。

Windows 分支使用 `path.win32.delimiter` 与 `path.win32.join`，以便在 Mac/Linux 自动化中也能验证分号 PATH 和反斜杠候选路径。候选名称继续按 `claude.exe`、`claude.cmd`、`claude.bat`、`claude` 顺序查找；`.cmd/.bat` 仍由既有 `cmd.exe /d /c`、`shell: false` 分支启动。

Doctor 在 Windows 上不解释 POSIX mode bits。Secret Store 与 Settings 的 Windows ACL 仍属于阶段三实机验收，不得把“无 POSIX 警告”写成“ACL 已安全验证”。

## 15. `1.3.0` 自更新架构（已发布）

自更新是 CMR 的显式管理路径，不进入 Profile 启动路径：

```text
cmr update / --check
        │
        ├─ 当前绝对入口 → package root → 实际 npm prefix
        ├─ 固定 GitHub latest Release asset
        ├─ npm pack 到临时目录 → 严格校验 name/version/path
        └─ update：lock → current rollback pack → candidate pack
                         → exact-prefix install → package/入口双验证
                         → success 或 rollback/re-verify
```

实现边界：`updater.js` 只承载稳定 SemVer、npm pack metadata、实体安装识别与 update plan 等可测试逻辑；`platform.js` 负责 npm/npm.cmd 发现、Windows `.cmd/.bat` 的 `cmd.exe /d /c` argv 边界和平台路径；update command 负责 lock、临时目录、npm 编排、验证、回滚、信号和脱敏输出。所有 npm 子进程使用 argv 数组、`shell: false`、临时 cwd/cache、`--ignore-scripts`、`--no-audit`、`--no-fund`；不得调用 GitHub API、拼接 Shell 字符串或执行 git 操作。

安装识别以当前活动 `cmr` 入口为真相源，不以 `npm prefix --global` 覆盖推导结果。Unix 需要确认 `<prefix>/bin/cmr` 与 `<prefix>/lib/node_modules/claude-model-router` 的实体映射；Windows 需要确认 `<prefix>\\cmr.cmd` 与 `<prefix>\\node_modules\\claude-model-router` 的实体映射。任何 source link/junction、checkout、未知包管理器或模糊映射都在写操作前拒绝。

Windows npm shim 启动 Node 后，`process.argv[1]` 通常是 package 内的 `src/cli.js`，而不是 `cmr.cmd`。安装识别因此同时接受标准 global layout 中的 CLI entry path 与 shim path，再反推出同一 prefix 的 `cmr.cmd` 并核对 shim 内容；安装后重新核对 command → package 映射，不能只相信 package.json 与一段看似正确的 version 输出。

`--check` 不创建 update lock、不备份、不安装；普通 `cmr`、Profile、`list`、`doctor`、`version`、`setup` 不隐式联网。更新 lock 只保存 schema、PID、startedAt 和随机 owner token；新鲜但尚未写完的 lock 不能被当作 stale，超过阈值但 PID 仍存活的 lock 也不能仅因年龄被删除。finally 清理自己的 lock 与临时目录。

npm 子进程的 stdout/stderr 捕获有固定上限，pack/install 有五分钟上限，绝对入口 version 验证有三十秒上限；转发过的 SIGINT 即使被 npm 映射为普通失败码，CMR 对外仍保持 `130`。候选 tarball 与 unpacked metadata 另有尺寸上限，避免异常 Release 资产造成无界内存、磁盘或安装风险。Windows 自替换所需的回滚、验证、清理和平台逻辑必须在 install 前完整加载。

## 16. `1.3.0` 实现状态

状态：**PASS — `1.3.0` RELEASED**。

上述架构已落地为标准 JavaScript ESM 实现；`command-runner.js` 统一 argv、`shell: false`、Windows shim 与信号边界，`update-lock.js` 提供互斥，`commands/update.js` 预加载 backup/install/verify/rollback/cleanup 路径。实现不引入运行时第三方依赖，也不触碰 CMR Secret/State、Claude Settings、Shell 或 Provider 配置。

原生 Windows self-update 已由 GitHub-hosted Windows Server 2025 的 PowerShell、CMD、Git Bash T4 验收；固定 Release asset、checksum、immutable 发布、exact/latest bootstrap 与公开 `cmr update --check` 已闭环。最终证据见 `docs/13-v1.3-self-update-implementation-brief.md` 第 19 节。

## 17. `1.4.0` GLM-5.2 Coding Plan 架构

绑定实施合同：`docs/14-v1.4-glm-5.2-coding-plan-implementation-brief.md`。

运行图：

```text
用户所在项目目录
       │
       ├── cmr kimi [Claude args...] ───── Kimi Provider ─────┐
       ├── cmr deepseek [Claude args...] ─ DeepSeek Provider ─┤
       └── cmr glm [Claude args...] ─────── GLM Plan Provider ─┤
                                                               ▼
                                                    Claude Code 子进程
                                args / cwd / TTY / signal / exit code
```

`glm` 是独立凭据边界：

```text
Provider/Profile ID=glm
ANTHROPIC_BASE_URL=https://open.bigmodel.cn/api/anthropic
authVariable=ANTHROPIC_AUTH_TOKEN
secretId=glm
```

Profile 初始候选只注入当前智谱完整 Claude Code 指南明确列出的模型与运行变量：

```text
ANTHROPIC_DEFAULT_OPUS_MODEL=glm-5.2[1m]
ANTHROPIC_DEFAULT_SONNET_MODEL=glm-5.2[1m]
ANTHROPIC_DEFAULT_HAIKU_MODEL=glm-4.7
CLAUDE_CODE_AUTO_COMPACT_WINDOW=1000000
CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
API_TIMEOUT_MS=3000000
```

初始候选不得凭其他 Provider 经验增加 `ANTHROPIC_MODEL`、Fable、Subagent、Effort 或 Tool Search 映射。真实验收发现偏差时，必须先更新官方事实和规格，再调整实现。

`API_TIMEOUT_MS` 与 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 加入 Router 管理变量集合。每次启动都先大小写不敏感地清理继承环境中的同名变体；选中 GLM 时再注入官方值，选中 Kimi/DeepSeek 时不回注。这与现有“先清理全部 Router 管理变量，再注入选中 Profile”的跨 Profile 隔离合同一致，父 `process.env` 仍保持不变。

Secret Store 和 Setup State 都保持 Schema v1。旧 `seenProviderIds=["deepseek","kimi"]` 在三 Provider 配置下自然得到 unseen `glm`；完成或明确稍后后写入三家并集。CLI、Doctor、SecretStore 与测试必须从已校验 Provider 集合派生，不能把现有“两家硬编码”机械改成新的“三家硬编码”散落在业务逻辑中。

标准按量 API 使用 `ANTHROPIC_API_KEY`/`X-Api-Key`，与 Coding Plan 的 Bearer 鉴权和套餐计费不同；它在同一 `1.4.0` 中作为用户显式选择的独立 `glm-api` Provider/Profile 提供，禁止隐藏 fallback。

## 18. `1.4.0` GLM 标准 API 按量付费架构

绑定实施合同：`docs/15-v1.5-glm-standard-api-payg-implementation-brief.md`。该文件名保留最初的独立版本规划；统一版本决策与发布证据见 `docs/16-v1.4-unified-glm-release.md`。

```text
用户所在项目目录
       │
       ├── cmr kimi [Claude args...] ───── Kimi Provider ──────────┐
       ├── cmr deepseek [Claude args...] ─ DeepSeek Provider ──────┤
       ├── cmr glm [Claude args...] ─────── GLM Coding Plan ───────┤
       └── cmr glm-api [Claude args...] ── GLM standard API PAYG ──┤
                                                                       ▼
                                                            Claude Code 子进程
                                         args / cwd / TTY / signal / exit code
```

两个 GLM 入口共享 Anthropic-compatible Base URL，却是不可合并的凭据与账单边界：

| 维度 | `glm` Coding Plan | `glm-api` 标准 API 按量付费 |
|---|---|---|
| Provider/Profile/Secret ID | `glm` | `glm-api` |
| Claude Code auth variable | `ANTHROPIC_AUTH_TOKEN` | `ANTHROPIC_API_KEY` |
| 上游 Header | `Authorization: Bearer` | `X-Api-Key` |
| Key 页面 | Coding Plan 入口 | 标准 API Keys 页面 |
| 费用语义 | 套餐及账户规则 | 标准 API Token 按量计费 |

两者的模型与运行环境映射暂时相同：Opus/Sonnet 为 `glm-5.2[1m]`，Haiku 为 `glm-4.7`，并设置 compact、disable nonessential traffic 与 timeout。这只复用公开的模型映射；`environment.js` 保持通用数据流，根据 `provider.authVariable` 注入唯一 secret，不增加 Provider 专用启动函数或代理。

`ROUTER_MANAGED_ENV_VARS` 已包含两种 Anthropic 鉴权变量。构建子进程环境时必须先按大小写不敏感规则清除所有 Router 管理变量，再注入 Base URL、当前 Profile 环境和当前 Provider 的唯一鉴权变量。父环境对象不修改。由此保证 `glm → glm-api`、`glm-api → glm` 及 GLM 与既有 Provider 连续启动不会交叉污染。

Secret Store 与 Setup State 保持 Schema v1 和动态集合机制：旧三 Provider Store 无迁移可读，第四 Provider 缺失即为 `missing`；旧三 Provider seen 状态自然得到 `glm-api` unseen。CMR 不复制 GLM Key、不检测 Key 类型、不中间代理请求，也不因任意错误在 Plan/PAYG 间切换。写入第四 Key 后旧版本可能无法读取整个 Store，这是手工降级风险，不是 updater rollback 要自动处理的数据迁移。

## 19. `1.5.0` Kimi Code 会员 Provider 架构

绑定执行指导：`docs/17-v1.5-kimi-code-membership-implementation-guide.md`。任务卡 1–9 已按本节架构完成实现、真实 Provider 验收与公开发布（2026-08-18）。

### 19.1 双通道边界

```text
用户所在项目目录
       │
       ├── cmr kimi [Claude args...] ───────── Kimi Open Platform ───────┐
       ├── cmr deepseek [Claude args...] ──── DeepSeek ──────────────────┤
       ├── cmr glm [Claude args...] ───────── GLM Coding Plan ───────────┤
       ├── cmr glm-api [Claude args...] ───── GLM standard API ──────────┤
       └── cmr kimi-code* [Claude args...] ── Kimi Code Membership ──────┤
                                                                           ▼
                                                                Claude Code 子进程
                                           args / cwd / TTY / signal / exit code
```

`kimi` 与 `kimi-code*` 即使都由 Kimi 提供，也必须被视为不同 Provider：

| 维度 | `kimi` | `kimi-code*` 候选 |
|---|---|---|
| 产品通道 | Kimi/Moonshot 开放平台 | Kimi Code 会员权益 |
| Base URL | `https://api.moonshot.cn/anthropic` | `https://api.kimi.com/coding/` |
| Claude Code 鉴权变量 | `ANTHROPIC_AUTH_TOKEN` | `ANTHROPIC_API_KEY` |
| 上游鉴权 | `Authorization: Bearer` | `X-Api-Key` |
| Secret ID | `kimi` | `kimi-code` |
| 商业元数据 | `pricingRef` | `entitlementRef` |
| 失败处理 | 原样失败 | 原样失败；不切回 `kimi` |

构建 Kimi Code 子进程环境时，必须先按大小写不敏感规则清除继承环境中的 `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、所有 Router 管理模型变量及候选新增的 `CLAUDE_CODE_MAX_CONTEXT_TOKENS`，再只注入当前 Profile 的 `ANTHROPIC_API_KEY` 和模型映射。反向启动 `kimi` 时也只能注入 `ANTHROPIC_AUTH_TOKEN`；父 `process.env` 不修改。

### 19.2 候选 Profile 与环境层

三个候选 Profile 共用一个 Provider/Secret，但各自完整注入以下 Claude Code 选择层映射：

| Profile | 主 / Opus / Sonnet / Haiku / Fable / Subagent | `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | Effort |
|---|---|---:|---:|---|
| `kimi-code` | `kimi-for-coding` | `262144` | `262144` | 不额外注入 |
| `kimi-code-k3-256k` | `k3-256k` | `262144` | `262144` | `high` |
| `kimi-code-k3` | `k3[1m]` | `1048576` | `1048576` | `high` |

K3-256K 与 K3-1M 的 Fable、Opus、Sonnet、Haiku、Subagent、compact、max-context 和 effort 映射来自 Kimi Code 官方 Claude Code 示例。官方没有单独给出 `kimi-for-coding` 的第三套完整 Claude Code 示例；该 Profile 以官方模型 ID、256K 上下文和会员矩阵为事实基础，受约束地复用完整档位映射并不额外注入 effort，后续真实 Provider 验收仍是 Blocker。`k3[1m]` 只在 Claude Code 选择层出现；CMR 不实现上游模型 ID 转换。`CLAUDE_CODE_MAX_CONTEXT_TOKENS` 已作为任务卡 2 的地基变更进入 Router 管理集合，并在任务卡 3–7 的隔离与回归证据中通过。

### 19.3 Opaque argv、模型切换与 HighSpeed 边界

`--model`、`--continue`、`--resume`、`--fork-session`、`--effort` 和未来参数继续属于 Claude Code 的 opaque argv。Claude Code 官方当前优先级为会话内 `/model`、启动 `--model`、`ANTHROPIC_MODEL`、Settings。`--model` 与环境变量只作用于本次启动；交互式 `/model <name>` 或 picker 的 Enter 当前会把选择写为后续新会话的用户默认，picker 的 `s` 才只切换当前会话。CMR 不拦截这些原生命令，但文档和真实验收必须把持久化风险算入跨 Profile 隔离，不能把 `/model` 描述为无副作用的临时切换。

Claude Code 官方 `/fast` 当前是 Anthropic Opus 5/4.8 的研究预览快速配置，不是单独模型；启用时若当前不是受支持的 Opus，会自动切换到 Opus，且交互式启用默认跨会话持久化。网关/代理场景还会直接请求 `api.anthropic.com` 检查资格，Kimi Code Key 可能使检查失败；跳过客户端检查也不证明 Kimi 上游支持该模式。Kimi Code 的 `kimi-for-coding-highspeed` 则是独立 Provider 模型 ID。因此不能把 `/fast` 当作 Kimi HighSpeed 入口。HighSpeed 保持候选非目标，必须由任务卡 8 的显式模型、持久设置、额度消耗和归属回读共同决定。

### 19.4 Setup、权益和降级

新增 `kimi-code` Provider 后，动态 Setup State 应从当前四家 seen 集合计算出 unseen；Full setup 显示五家，三个 Profile 只引导一次 `kimi-code` Key，targeted/inline setup 不能误标其他 Provider。订阅权益使用独立 `entitlementRef`，不虚构 Token 单价；Extra Usage 仅由用户在 Kimi 侧显式开启，CMR 不探测、不修改、不自动切换。

写入第五个 Secret 后，旧版 `1.4.0` 可能因不认识 `kimi-code` 而拒绝读取整个 Store。这是用户可见的手工降级风险；CMR 不为降级自动删除新 Key，也不在启动失败后静默改用开放平台。

### 19.5 官方跳过登录脚本的未决边界

Kimi Code 官方 Claude Code 页要求直接接入用户先运行脚本，写入 `~/.claude.json` 的第三方支持/onboarding 标记并清理 `~/.claude/settings.json` 的旧模型项；Claude Code 官方认证页同时说明设置 `ANTHROPIC_API_KEY` 会跳过登录并提示批准。两者是否对当前 Claude Code 版本等价，静态资料无法消解。

CMR 不执行该脚本，不写用户 Claude 配置，也不依赖未公开的持久状态字段。任务卡 3–7 已在隔离 Claude 配置与假 Claude 中证明候选只使用临时子进程环境且不创建 Claude 配置文件；真实 Kimi Code 直启仍须在任务卡 8 的用户授权门禁中复核。若真实环境变量直启失败且只能依赖持久修改，本候选必须停止并回到产品决策，不能在实现卡中顺手越过红线。

**2026-08-18 复核结论：直启成立。** 真实验收（无头与 TUI 双路径）证明仅凭 CMR 注入的子进程环境即可完成全部请求：无头模式在全新配置直接可用；TUI 全新配置首跑仅需 Claude Code 自身的一次性初始化（环境键确认须主动选 `1. Yes`，默认推荐 `No`；误拒后的登录选择界面无 Esc 出口；首跑含对 `api.anthropic.com` 的一次性连通性检查，代理瞬断重试即可），全程无官方脚本、无 CMR 持久写入。运行中子进程环境经 `ps` 核验（脱敏）：仅 `ANTHROPIC_API_KEY`、无 `ANTHROPIC_AUTH_TOKEN`、模型与窗口变量与 Profile 精确一致。HighSpeed 按决策 2 文档化显式切换，运行时零改动。

## 20. GLM-5.3 Coding Plan 升级架构

绑定实施合同：`docs/18-v1.5-glm-5.3-upgrade-implementation-guide.md`。

本轮只升级现有 `glm` Profile 的模型选择层和商业元数据，不新增 Provider，不改变 `glm` Secret，不改变 `glm-api` 的标准 API 数据流：

```text
cmr glm / glm-5.3 / glm-5.2 / glm-plan
  └── GLM Coding Plan ── AUTH_TOKEN ── glm-coding-plan-membership entitlement
                               ├── Opus/Sonnet: glm-5.3[1m]
                               └── Haiku: glm-4.7

cmr glm-api / glm-payg
  └── GLM standard API ── API_KEY ── glm-5.2 pricing
                               ├── Opus/Sonnet: glm-5.2[1m]
                               └── Haiku: glm-4.7
```

两条通道仍共享 Anthropic-compatible Base URL，但鉴权变量、Secret 槽位和商业元数据保持独立。`glm` 的 subscription-quota 提示来自 entitlement JSON；`glm-api` 的 pay-as-you-go 提示继续来自 `glm-5.2` Pricing。因标准 API 页面截至 2026-08-16 仍将 GLM-5.3 API 标为近期上线，不能从 Coding Plan 5.3 支持推导出标准 API 迁移。

## 21. Secret Store 前向兼容架构

绑定实施合同：`docs/19-secret-store-forward-compatibility-implementation-guide.md`。

Secret Store 是**跨安装共享的单机状态**：源码 checkout 与全局 npm 安装读写同一个仓库外文件（macOS `~/Library/Application Support/ClaudeModelRouter/secrets.json`、Windows `%APPDATA%` 等价路径），而校验它所用的 provider 集合（`secretId` 全集）随**当前安装版本**静态打包。`1.5.0` 及之前 `parseStore` 要求文件中每个 key 都在当前版本集合内，因此「较新版本写入较新 provider 的 key，较旧版本随后读取」会让旧版所有读库路径（菜单、任意 Profile 启动、`setup`、`doctor`、`secret status`）整体抛 `unknown provider` 并不可用——2026-08-18 维护者开发机（源码 checkout 写入 `kimi-code` + 全局 `1.4.0` 读取）实测复现；`cmr update` 不读库所以仍可自救。对照设计见 `setup-state.js`：`getUnseenProviderIds` 只过滤当前 provider、容忍状态中多出的 ID，天然前向兼容。`cmr update` 自带的失败回滚不触发本问题：回滚目标是更新前正在运行的版本，必然认识库中所有 key。

修复后的读取与写入合同：

```text
parseStore（分层校验）
  ├── 顶层 schema：合法 JSON、仅 version/providers 两键、version=1   —— 不变，违反即抛
  ├── 已知 provider key：值校验（assertSecret 全项）                —— 不变，违反即抛
  └── 未知 provider key：跳过校验，原样保留在返回对象中（不透明数据）
        └── 值即使为空串/含换行等非法格式，也不导致读取失败

get(provider)        对被请求的 provider 仍拒绝未知（菜单/启动链不会请求未知 ID）—— 不变
set(provider, ...)   仅更新被请求 key；写回天然保留全部未知 key，不删除、不改写
status()             只列当前版本已知 provider；未知 key 不出现
readSecretsForRedaction()  必须包含未知 key 的值（错误脱敏完整性不得缩窄）—— 安全关键
```

不变量：Schema v1、原子写入（临时文件 + rename）、目录 0700/文件 0600、已知 key 全部值校验、`get`/`set` 对未知请求 provider 的拒绝、密钥红线均不变。限制：已发布的 `1.4.0`/`1.5.0` 二进制无法追补本行为，仍会在含 `kimi-code` key 的 Store 上拒绝读取；修复随下一常规版本发布后，从该版本起的降级/混用场景获得保护。

## 22. 公开发布安全加固架构（候选）

绑定实施合同：`docs/21-security-hardening-implementation-guide.md`。

### 22.1 settings 覆盖与启动前预检

Claude Code 官方合同：settings 文件 `env` 块的值在启动时及文件每次变更时**替换**继承自进程环境的同名变量（含空字符串取消）。因此 CMR 注入的子进程环境会被 settings 覆盖——`ROUTER_MANAGED_ENV_VARS` 的进程内清理对此无效。供应商切换器（CC Switch 等）正是把 `ANTHROPIC_BASE_URL` 与鉴权变量持久写进 `~/.claude/settings.json` 的 `env` 块，构成对 CMR Profile 的静默劫持。

```text
cmr <profile>
  └── launchProfile
        └── assertNoSettingsConflicts（settings-conflict.js）
              ├── 用户 settings（含 CLAUDE_CONFIG_DIR） / 项目 settings(.local) / managed（目录展开 .json）
              ├── env 块命中 Router 管理变量（键存在即冲突，含空值）
              └── 有冲突 → 列出文件/来源/变量并拒绝启动；无冲突 → 原启动链
```

`apiKeyHelper` 不阻断启动（官方认证优先级中 `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` 高于它，CMR 恒注入其一），但 `doctor` 报告。doctor 的用户 settings 路径同样感知 `CLAUDE_CONFIG_DIR`。

### 22.2 隐藏输入与密钥输出

raw mode 隐藏输入按状态机吞掉 CSI/SS3/OSC 转义序列与游离控制字节（跨 chunk 有效，序列中 Ctrl+C/Ctrl+D 仍取消）；Ctrl+D 与 Ctrl+C 同为取消。误粘贴为 profile 参数的 token 形态输入在错误消息中脱敏为 `<redacted N-character input>`，普通 typo 原样展示。`set()` 前清扫超过 10 分钟的 `.secrets-*.tmp` 遗留（并发写者的新文件不动）。

### 22.3 自更新完整性

安装前对下载资产做 SHA256SUMS 校验（固定 `releases/latest/download/SHA256SUMS` 资产，按 tarball basename 匹配条目；拉取失败/无条目/不匹配一律 fail-closed 拒绝安装）。npm pack 元数据文件名拒绝 cmd.exe 元字符与 `%`。更新链子进程环境在 Router 变量清理之外剥离 `NODE_OPTIONS`；代理与 `npm_config_*` 保留。技术基线提升为 Node `>=18.20.0`（libuv BatBadBut `.cmd` 参数转义基线）。
