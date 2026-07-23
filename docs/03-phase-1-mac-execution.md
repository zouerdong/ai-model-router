# 03 — 阶段一：Mac 实施记录

状态：Completed and accepted on 2026-07-19
目标设备：当前 Mac
结果：本机两 Profile 启动器、真实交接、全局命令和恢复证据已通过；最终结论见 `docs/09-phase-1-acceptance.md`。

## 1. 阶段一结论

阶段一不是“先写一个能跑的切换脚本”。正确顺序是：

```text
复核官方参数
  → 只读 Doctor
  → 用假 Claude 完成 CLI 与启动器
  → 用户确认本机配置迁移
  → 修正 K3 为 kimi-k3[1m]
  → 两个真实 Provider 验收
  → 本机安装
```

在代码和假进程测试通过前，不触碰真实 Claude Code 配置与密钥。

## 2. 实施前 Mac 基线（2026-07-18）

- Claude Code：`2.1.212`。
- Claude 路径：`$HOME/.local/bin/claude`。
- Node.js：`v24.15.0`；npm：`11.12.1`（2026-07-18 本机只读复核）。
- 当前仓库不是 Git 仓库。
- `~/.claude/settings.json` 仍使用旧 `kimi-k3`，不是官方 `kimi-k3[1m]`。
- Settings 中存在永久模型、Base URL、上下文和 effort 配置。
- `.zshrc` 中存在永久 Anthropic 变量。
- 现状能用不代表配置正确；官方参数以 `docs/07-official-sources.md` 为准。

## 3. 预计修改范围

### 3.1 仓库内新增

代码实现预计新增：

```text
package.json
.gitignore
src/**
config/providers/**
config/profiles/**
config/pricing/**
tests/**
```

可能更新：

```text
README.md
docs/07-official-sources.md
docs/03-phase-1-mac-execution.md
```

### 3.2 仓库外可能修改

以下只在门禁批准后处理：

```text
~/.claude/settings.json
~/.zshrc
~/Library/Application Support/ClaudeModelRouter/secrets.json
```

不得修改：

```text
~/.codex/**
Codex 登录、订阅与模型设置
Claude Code 的插件、MCP、Skills、Hooks、权限、主题、状态栏
```

## 4. Phase 0 — 规格与官方参数复核

### 动作

1. 阅读 `AGENTS.md`、产品范围、架构、本计划和官方来源。
2. 重新打开 Kimi、DeepSeek、Claude Code 三方官方页面。
3. 比较模型 ID、变量和 Base URL 是否变化。
4. 若有变化，先更新文档，再开始代码。
5. 确认工作区只包含用户已有文件和本轮文档，不覆盖未知更改。

### 交付

- 更新后的 `docs/07-official-sources.md`（仅在事实变化时）。
- 一段简短实施 Plan：目标、预计文件、风险、测试与需要用户批准的门禁。

### Gate 0

- [ ] 两个 Profile 的官方参数无歧义。
- [ ] 用户没有要求恢复 K2.7/HighSpeed 或新增模型。
- [ ] 未开始修改本机配置。

## 5. Phase 1 — 项目骨架与配置 Schema

### 动作

1. 建立最小 `package.json`，Node 版本要求 `>=18`，ESM 模式。
2. 只使用标准库；不得安装依赖。
3. 建立 `.gitignore`，至少覆盖：
   - `.DS_Store`
   - `node_modules/`
   - `*.log`
   - `.env` / `.env.*`
   - `secrets*.json`
   - 本机运行数据与临时文件
4. 建立两个 Provider、两个 Profile 与价格元数据。
5. 实现严格校验：未知字段、缺失变量、重复别名、过期核验日期均给出可读错误。
6. 配置加载只允许读取仓库已知目录，防止路径穿越。

### 必测

- 正确 Profile 可加载。
- 缺少主模型、Haiku、子 Agent 或 auth 引用时失败。
- Kimi 不是 `kimi-k3[1m]` 时快照测试失败。
- DeepSeek Pro/Flash 映射偏离官方组合时快照测试失败。
- 配置中出现疑似密钥值时校验失败。

### Gate 1

- [ ] 没有第三方运行依赖。
- [ ] 所有 Provider 事实都带官方 URL 与核验日期。
- [ ] 只有 `plan`、`build` 两个 Profile。

## 6. Phase 2 — 只读 Doctor

### 动作

1. 实现 `cmr doctor`，默认不联网、不修改文件。
2. 检测 Claude 实际路径与版本。
3. 检测当前进程中 Router 变量的键名和非空状态。
4. 解析 `~/.claude/settings.json` 与当前项目的 Claude Settings，只输出冲突键名。
5. 检查 `.zshrc`/`.zprofile` 等文件中的相关 export，只输出文件、行号和变量名，值统一为 `<redacted>`。
6. 单独警告：
   - `kimi-k3` 应迁移为 `kimi-k3[1m]`。
   - `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 当前为 legacy/unverified。
   - 同时存在多个鉴权变量。
   - Settings `env` 会覆盖启动环境。
7. 检查密钥文件权限，但不读取值到输出。

### 预期当前 Mac 结果

```text
PASS  Claude Code 2.1.212 detected
WARN  user settings contain router-managed variables
WARN  user model is kimi-k3; official profile requires kimi-k3[1m]
WARN  shell profile contains persistent Anthropic variables
WARN  CLAUDE_CODE_MAX_CONTEXT_TOKENS is legacy/unverified
INFO  Kimi secret: not yet migrated / configured
INFO  DeepSeek secret: configured or missing
```

实际文本可以不同，但不得显示密钥或完整敏感配置行。

### Gate 2

- [ ] Doctor 对当前 Mac 能准确报告已知冲突。
- [ ] Doctor 运行前后文件校验和不变。
- [ ] Doctor 输出通过密钥模式扫描。

## 7. Phase 3 — CLI、环境构建与启动器

### 动作

1. 实现默认菜单和直接命令。
2. 实现 `list`、`config path`、`secret status`、`version`。
3. 环境构建必须从副本开始，清除全部 Router 变量后注入。
4. `plan` 使用 Kimi 官方完整映射。
5. `build` 使用 DeepSeek 官方 Auto 映射，不自创 Fable 或压缩变量。
6. 启动 Claude 时继承 `cwd` 和交互终端。
7. 正确传递退出码和中断信号。
8. `plan` 启动前显示高费用提示、上下文和价格核验日期。
9. 两种模式启动前均提醒不要通过 `/model` 菜单跨 Provider 切换。
10. 缺密钥、Claude 不存在或 Profile 失效时，在启动前失败。

### 明确限制

- 不实现 `cmr switch` 后再裸跑 `claude`；命令本身必须启动 Claude。
- 不实现跨供应商恢复/继续快捷命令。
- 不把完整子进程环境打到 debug log。
- 不在阶段一构建 GUI 或后台守护进程。

### Gate 3

- [ ] 使用假 Claude 进程通过全部启动器测试。
- [ ] 父进程环境在测试前后相同。
- [ ] 临时测试目录中的 `cwd` 原样传给假 Claude。
- [ ] 退出码与 Ctrl+C 行为通过。

## 8. Phase 4 — 本机密钥能力

### 代码动作

1. 实现仓库外 Secret Store。
2. 实现隐藏输入的 `cmr secret set kimi|deepseek`。
3. 写入过程使用 `0600` 权限和原子替换。
4. 对所有异常、Doctor 和状态输出统一脱敏。
5. 测试使用临时目录与假密钥，不接触真实 Key。

### 用户门禁 A：真实密钥

执行者必须停下来说明：

- 将创建的准确路径。
- 文件将包含哪两个 Provider 的凭据。
- 文件不会进入 Git。
- 用户应在本机提示框输入，不应把 Key 发到对话。

用户确认后，才允许创建本机密钥文件或迁移现有 Kimi Key。若 Mac 没有 DeepSeek Key，用户需要自行在本机输入；执行者不得猜测或从公司配置复制。

### Gate 4

- [ ] 两个 Provider 的 `secret status` 均只显示 configured/missing。
- [ ] 密钥文件权限正确。
- [ ] 仓库扫描找不到真实密钥。

## 9. Phase 5 — 本机旧配置迁移与 K3 修复

这是用户已要求“稍后一起改好”的明确事项，但因涉及 `settings.json`、Shell 和密钥，实际执行前仍必须按红线展示预览并获得当次确认。

### 迁移前只读预览

必须列出：

- 将备份的文件和备份目标路径。
- `settings.json` 将删除的顶层键和 `env` 键名。
- `.zshrc` 将删除的变量名与行号。
- 明确保留的非模型项。
- 裸 `claude` 将不再自动进入 Kimi，今后改用 `cmr plan` / `cmr build`。

不得在预览中显示值。

### 用户门禁 B：配置修改

用户明确确认后，按以下顺序执行：

1. 备份原 `~/.claude/settings.json` 和 `.zshrc` 到仓库外目录；备份权限限制为当前用户可访问。
2. 从 Settings `env` 中删除 Router 管理项。
3. 删除顶层旧 `model: kimi-k3`。
4. 经确认处理 legacy `CLAUDE_CODE_MAX_CONTEXT_TOKENS`。
5. 从 `.zshrc` 删除永久 Anthropic Base URL、模型与鉴权 export。
6. 保留 `enabledPlugins`、`extraKnownMarketplaces`、`statusLine`、`theme`、Tavily 和其他非模型设置。
7. 验证 JSON 可解析、Shell 语法有效。
8. 重开一个终端运行 `cmr doctor`。

当前 `settings.json` 含有非 Router 管理的敏感配置且文件权限不是 `0600`。迁移预览中应单独提出权限加固选项；是否执行仍需用户确认，不能借 Router 迁移静默改变。

K3 不再通过旧 Settings 修补为 `[1m]`；正确结果应由 `cmr plan` Profile 注入完整的 `kimi-k3[1m]` 配置。这样两个 Provider 才能真正切换。

### 回退

若迁移后 Claude Code 或非模型能力异常：

1. 停止真实 API 测试。
2. 展示差异。
3. 用户确认后从备份恢复两个文件。
4. 不通过临时添加更多永久变量修补。

### Gate 5

- [ ] Doctor 不再报告永久 Router 变量冲突。
- [ ] Settings 中非模型键与迁移前一致。
- [ ] 新终端中没有非空的遗留 Router 变量。
- [ ] 备份位置已告知用户。

## 10. Phase 6 — 自动化验证

### 单元测试

- Provider/Profile 读取与 Schema。
- 完整环境清理和注入。
- 密钥脱敏与异常脱敏。
- 密钥文件权限和原子写入。
- macOS/Windows 路径选择。
- Doctor 对 JSON、Shell、环境冲突的识别。

### 快照测试

对 `plan` 和 `build` 最终环境分别保存无密钥快照。任何模型 ID、档位或上下文变化都必须显式更新测试与官方来源日期。

### 假 Claude 集成测试

假进程只输出白名单字段：

- cwd。
- Base URL。
- 各模型变量。
- 是否收到鉴权变量（boolean，不输出值）。
- 收到的信号。

验证：

- 当前目录继承。
- 两 Profile 环境互不残留。
- 父环境不变。
- 交互 stdio 与退出码。
- 路径含空格和中文时正常。
- `claude.cmd` 的 Windows 分支有模拟覆盖。

### 静态验证

```bash
npm test
npm run lint
```

V1 若无 ESLint 依赖，`lint` 可使用 Node 自带语法检查和项目内规则脚本，不得为了满足命令额外引入庞大工具链。

## 11. Phase 7 — 真实 API 冒烟验收

### 用户门禁 C：使用真实 API

真实调用会使用用户本机 Key 并产生费用。执行者先说明每个测试的次数和目的，用户确认后再启动。

### Kimi K3

1. 在临时测试项目目录运行 `cmr plan`。
2. `/status` 验证 Base URL 与 `kimi-k3[1m]`。
3. 发送一个最小文本请求。
4. 执行一个只读工具调用。
5. 启动一个最小子 Agent，确认未报 model not found。
6. 退出并检查父环境未变化。

### DeepSeek Auto

1. 在同一测试目录另开新会话运行 `cmr build`。
2. `/status` 验证 Base URL 与 `deepseek-v4-pro[1m]`。
3. 发送一个最小文本请求。
4. 启动一个最小子 Agent。
5. 用无密钥环境快照确认 Haiku 与子 Agent 指向 `deepseek-v4-flash`。
6. 退出并检查父环境未变化。

### 端到端交接演练

1. `cmr plan` 为一个极小示例任务写 Implementation Brief。
2. 退出 K3 会话。
3. `cmr build` 作为新会话只读取仓库规则与 Brief。
4. 执行、测试、回写结果。
5. 不恢复 K3 会话，不复制整段聊天历史。

## 12. Phase 8 — 本机安装与使用说明

代码和真实验收通过后才处理全局命令。

### 用户门禁 D：全局安装

说明将执行的命令、npm prefix 和卸载方式。用户确认后才允许全局安装本项目。不得全局安装额外依赖。

安装后验证：

```text
cmr version
cmr doctor
cmr list
```

并在三个不同目录验证 `cmr plan` / `cmr build` 始终继承当前目录。

### 阶段一交付

- 可运行的本机 `cmr`。
- 两个 Profile。
- Doctor 与 Secret Store。
- 自动化测试报告。
- 真实 API 冒烟结果。
- 本机迁移备份位置。
- 更新后的 README 使用说明。
- 阶段一验收记录 `docs/09-phase-1-acceptance.md`。

## 13. 停止条件

遇到以下情况必须停下定位根因，不得绕过：

- 官方模型参数与本文冲突。
- Settings/Managed Settings 仍覆盖 Profile。
- 需要把密钥写进命令行、仓库或日志才能运行。
- K3 `/status` 仍显示 `kimi-k3` 而不是 `kimi-k3[1m]`。
- DeepSeek 主会话落到 Flash，或子 Agent 请求未知模型。
- 修改前无法创建可验证备份。
- 非模型 Claude Code 设置发生变化。
- 测试必须依赖真实 API 才能通过。

## 14. 完成定义

只有 `docs/01-product-scope.md` 第 7 节九项成功标准全部通过，并生成验收记录，阶段一才算完成。代码写完、菜单出现或单个模型能聊天都不算完成。
