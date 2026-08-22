# 21 — 公开发布安全加固实施指导（候选）

状态：**PASS — `v1.7.0` RELEASED**（2026-08-22T04:12:16Z 公开发布，Latest，tag `v1.7.0` 指向门禁 commit `86f0d40`；候选 commit `9f7e436` + Windows 门禁修复 `4509151`/`86f0d40`）。本文件所有 PASS 证据以实际运行结果为准，禁止预填。

## 1. 背景与触发

`1.6.0` 已公开发布。2026-08-22 对 `src/`、`tests/`、`config/` 做了多维度安全审查（secrets/env、自更新供应链、跨文件正确性、JS 陷阱、CC Switch 兼容性、配置校验、cleanup），发现若干应在下一版本修复的安全与正确性缺陷。本文件是这些修复的绑定实施合同。

## 2. 范围

只修复审查确认的缺陷，不新增 Provider/Profile/价格，不改变 opaque argv、凭据边界、数据驱动配置等既有合同。涉及五条主线（SC-1~SC-5）：

1. Claude Code settings 覆盖劫持（CC Switch 场景）的启动前拦截。
2. 隐藏输入（`readHiddenSecret`）的终端序列与控制字节加固。
3. 自更新链的发布资产完整性校验（SHA256SUMS）与元数据收紧。
4. 若干小缺陷（密钥回显、setup-state ID 模式、重复清理逻辑、死统计、Node 基线）。

## 3. 任务卡 SC-1：settings 冲突预检（launch 拒绝 + doctor 报告）

**事实链**：CC Switch（github.com/farion1231/cc-switch）切换供应商时把 `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN`/`ANTHROPIC_API_KEY` 写入 `~/.claude/settings.json` 的 `env` 块；Claude Code 官方文档（code.claude.com/docs/en/env-vars）确认 settings `env` 在启动时及文件每次变更时**替换**继承自 shell 的同名变量（社区证据 anthropics/claude-code#8500、claude-agent-sdk-typescript#217）。因此 CMR 注入的子进程环境会被 settings 覆盖，`ROUTER_MANAGED_ENV_VARS` 的进程内清理对此无效——这正是真实用户报告的「装过 CC Switch 后 Profile 被劫持」。

**实现**：新增 `src/settings-conflict.js`：

- `getClaudeUserSettingsPath`：用户级 settings 路径，优先 `CLAUDE_CONFIG_DIR`（Claude Code 遵循该变量重定位配置；它不在 Router 管理集合内，不能被清理）。
- `collectSettingsConflicts`：扫描用户（含 `CLAUDE_CONFIG_DIR`）、项目 `.claude/settings.json`、`.claude/settings.local.json`、managed settings（目录形态时展开其下 `.json`）的 `env` 块，命中 Router 管理变量即记冲突；同一文件多角色去重。解析失败的文件跳过（属 doctor 关注点，预检只拦可检测冲突）。
- `assertNoSettingsConflicts`：`launchProfile` 在取密钥前调用；有冲突即抛错并列出文件、来源与变量名，拒绝启动。
- 空字符串 settings 值同样取消注入变量，因此按「键存在」判定即冲突。

**设计决策（负责人可否决）**：预检选择**拒绝启动**而非仅 WARN——被劫持的会话会用错端点与凭据（或混合两者导致 401），静默继续违背「每条通道是独立凭据边界」的产品承诺。`apiKeyHelper` 不作为 launch 阻断：官方认证优先级中 `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` 高于 `apiKeyHelper`（code.claude.com/docs/en/authentication），CMR 恒注入其一；但 `doctor` 将其列为 WARN 供用户知情。

**doctor 对齐**：`doctor` 的用户级 settings 路径同样改走 `CLAUDE_CONFIG_DIR` 感知版本，并在 settings 摘要中报告 `apiKeyHelper`。

## 4. 任务卡 SC-2：隐藏输入加固

`readHiddenSecret`（raw mode TTY）逐字符处理存在三类缺陷：

1. **Ctrl+D（EOT）被当字面字符追加进密钥** → 改为与 Ctrl+C 一致的取消（`CMR_CANCELLED`）。
2. **方向键/编辑键的 CSI/SS3/OSC 转义序列逐字节折叠进密钥**（`ESC[D` 等）→ 增加跨 chunk 的转义序列状态机（escape → sequence（CSI/SS3，参数/中间字节 0x20–0x3F，终结字节 0x40–0x7E）/string（OSC/DCS，BEL 或 ESC 终结），序列长度上限 128 防御死状态）。序列中间的 Ctrl+C/Ctrl+D 仍然生效。
3. **游离控制字节（Tab、NUL、C1）进入存储值** → 按码点过滤（已处理的 `\r`/`\n`/`\b`/DEL 除外）。

**已核实为误报、不改**：跨 chunk 劈开的多字节 UTF-8 产生 U+FFFD——`input.setEncoding("utf8")` 使 Node 以 StringDecoder 解码，官方文档明确保证不拆多字节字符；`chunk.toString("utf8")` 对已解码字符串是恒等操作。退格已按完整 code point 删除（不劈代理对），`1.6.0` 审查后先行修复。

## 5. 任务卡 SC-3：自更新完整性校验

`1.6.0` 的更新链中下载资产从不校验摘要（SHA256SUMS 未拉取、npm shasum 字段被忽略），且安装后立即执行 `cmr version` 验证——资产被替换时代码在摘要比对前就已运行，全链唯一完整性控制是 TLS。修复：

1. 新增 `LATEST_RELEASE_SUMS_URL`（固定 Release 资产 `releases/latest/download/SHA256SUMS`，发布配方 `docs/16`/`docs/17` 已保证该资产存在）。
2. `verifyReleaseIntegrity`（update.js）：`transactionalUpdate` 在安装前（本地安装一致性复核之后、`runInstall` 之前）拉取 SHA256SUMS（大小上限 64KB），按 **tarball 路径 basename** 匹配条目，对下载文件做 sha256 比对；不匹配、拉取失败、无条目均拒绝安装（fail-closed）。`--check` 不安装故不校验。`fetchImpl` 可注入供测试。
3. `parseNpmPackMetadata` 文件名收紧：拒绝 cmd.exe 元字符与 `%`（`& | ^ % ! < > ( ) ' " = ; ,` + 控制字符），杜绝该路径进入 Windows `cmd.exe /d /c` 时的命令注入；路径分隔符与空格保持允许（绝对路径与含空格用户目录合法）。
4. `commandEnvironment` 在清理 Router 变量之外剥离 `NODE_OPTIONS`——否则 shell profile 注入的 `--require` 会进入更新链的每个 npm/node 子进程。其余环境（代理、`npm_config_*`、CA）保留，不破坏企业代理用户。

## 6. 任务卡 SC-4：小缺陷修复

| 缺陷 | 修复 |
|---|---|
| 误粘贴的 API Key 作 profile 名被明文回显（`unknown profile: sk-...`，未入库故脱敏失效） | `launch.js`：≥24 字符且 token 字符集的选择器输出 `<redacted N-character input>`；普通 typo 原样（超 40 字符截断） |
| `--version`/`-v` 有效但 `-h` 落入 `unknown profile: -h` | `cli.js` help 分支补 `-h` |
| `cli.js` `VERSION` 与 `package.json` 无一致性校验，版本漂移使 `update --check` 误报 | 测试断言二者相等 |
| `setup-state.js` ID 模式拒绝带点 ID（loader 允许 `[.-]`），带点 Provider 永久卡死首次引导 | 对齐 loader 模式 |
| `doctor` 用户 settings 双 stat（TOCTOU + 重复系统调用） | 单次取 mode |
| managed-var 清理逻辑在 `command-runner.js` 与 `environment.js` 双份实现，易漂移 | `environment.js` 导出 `removeEnvironmentKeys` 单一实现，两处复用 |
| 崩溃遗留 `.secrets-<uuid>.tmp`（完整密钥副本）永不清理 | `set()` 前清扫 >10 分钟的遗留 tmp（`stat` 可用才执行；不碰并发写者的新文件） |
| `isExecutable` 用 `access(X_OK)`，POSIX 上目录返回真（PATH 中同名目录抢跑） | `stat().isFile()`（`1.6.0` 审查后先行修复） |
| Windows `cmd.exe` 未转义参数元字符（`R&D-notes` 的 `&` 分裂命令）——BatBadBut（CVE-2024-24576）已在 libuv 修复 | `engines` 提升至 `>=18.20.0`（含修复的首个 18.x 补丁版），见 §7 |

## 7. 技术基线变更：Node `>=18.20.0`

`package.json` engines 由 `>=18` 提升至 `>=18.20.0`。理由：libuv 对 `.cmd/.bat` spawn 参数的转义校验（BatBadBut，CVE-2024-24576）进入 18.20.0/20.12.0/21.7.0；旧补丁版上 Windows `.cmd` 启动路径存在真实命令注入面。npm engines 非强制，仅安装告警。AGENTS.md §4 已同步。**该变更需负责人确认**（见 §12）。

## 8. 任务卡 SC-5：freshness 过期降级为警告（防变砖）

**原合同**：`assertDate` 在 `verifiedOn` 超 180 天时抛错，且 `loadConfigSet` 支撑所有命令——按最早日期 2026-07-23 推算，**2027-01-20** 起全球用户的所有命令（含 launch）硬失败，无旁路、无自救（重装同版本携带相同日期）。

**决策（负责人 2026-08-22 拍板）**：不变砖。过期从"硬失败"降级为"警告"：

- `validator.js`：日期格式/真实性/未来日期仍是硬校验；超过 `STALENESS_WARNING_DAYS`（180）仅向 `warnings` 数组记录（`validateProvider/Pricing/Entitlement` 接受可选 `warnings`，`validateConfigSet` 创建并在返回值携带）。
- `loader.js`：`loadConfigSet` 返回值新增 `warnings` 字段；所有命令照常工作。
- `doctor.js`：逐条输出 WARN（`details.config.warnings` 同步携带）。
- 维护者侧纪律不变（AGENTS.md §8：实现与发布前重新核验官方来源、更新日期）——本卡只取消"把用户工具变砖"这一执行手段。

## 9. 审查确认但登记不修的候选

| 项 | 理由 |
|---|---|
| Windows secret store ACL 强制缺失（chmod 在 win32 跳过、doctor 跳过权限检查，注释承诺的「平台验证」不存在） | 需 icacls/ACL 实装与 Windows 实机验收，单独立卡；先修正文档表述 |
| `set()` 并发读改写竞态（两终端互相覆盖新密钥） | 概率低、无泄露；锁文件方案另议 |
| 临时文件 rename 前无 fsync（断电可致空 secrets.json） | 需改 fs 注入接口与全部测试 mock；持久性（非泄露）问题，另议 |
| `formatPricing` 按 pricing id 硬编码分支并在 launch 抛 `unsupported pricing configuration` | 与 GLM-5.3 标准 API 迁移候选合并处理（数据驱动化） |
| `migrate.js` 死代码随 npm 包发布（~190 行，仅测试引用） | 删除文件需负责人批准（AGENTS.md §3/§5） |
| update 超时只杀直接子进程（Windows 上 cmd.exe 之下 npm/node 孙进程成孤儿） | 需进程树终止，Windows 实机验收，另立卡 |
| update-lock PID 复用导致锁永不释放（极端自 DoS） | 概率极低；mtime 兜底方案另议 |
| `environment.js` 快照 `has*` 死字段、`setup.js` 每问重建 readline | cleanup 级，无实际缺陷 |

（原表中的「180 天 freshness 定时炸弹」已由任务卡 SC-5 处理，2027-01-20 不再触发硬失败。）

## 10. 测试合同

- `tests/settings-conflict.test.js`：预检拒绝、CLAUDE_CONFIG_DIR、managed 目录展开、多角色去重（`1.6.0` 审查中先行落地）。
- `tests/secret-store.test.js`：转义序列/OSC/游离控制字节丢弃、跨 chunk 序列、Ctrl+D 取消、tmp 清扫（stale 删除、fresh 保留）。
- `tests/launch.test.js`：token 形态选择器脱敏、普通 typo 原样。
- `tests/cli.test.js`：`-h` 别名、`VERSION` === `package.json`。
- `tests/update.test.js`：SHA256SUMS 不匹配拒绝安装且不动已装版本、拉取失败 fail-closed、`NODE_OPTIONS` 剥离（观察子进程 env）、既有事务路径全量回归。
- `tests/updater.test.js`：文件名 cmd 元字符与 `%` 拒绝。
- `tests/setup-state.test.js`：带点 Provider ID 接受、非法仍拒绝。
- `tests/command-runner.test.js`：清理行为回归（自定义 managedKeys 仍支持）。
- `tests/config.test.js`：过期仅产生 warning、`loadConfigSet` 在过期时钟下正常返回且携带 `warnings`；未来日期仍硬失败。

## 11. 证据登记台账（事后如实填写）

| 证据 | 结果 | 日期 |
|---|---|---|
| `npm test` 全量 | PASS — 184 tests：181 pass / 0 fail / 3 skip（Windows-only，按惯例在 macOS 自动跳过；含 SC-1~SC-5 全部测试） | 2026-08-22 |
| `npm run lint` | PASS | 2026-08-22 |
| Windows CI（`codex/windows-t4-validation` 门禁） | 第一轮 FAIL（settings-conflict 测试硬编码 POSIX 路径 + managed 路径宿主相关，`4509151`/`86f0d40` 修复：managed 路径按目标平台 path API 确定性构造并补 Linux 官方路径，CLAUDE_CONFIG_DIR/homedir 保持宿主 API）→ 第三轮 [run 32550803846](https://github.com/zouerdong/ai-model-router/actions/runs/32550803846)（commit `86f0d40`，Windows 2025 × Node {18.20.8, 24}）双矩阵 PASS | 2026-08-22 |
| 固定资产 | staging 自 gate commit `86f0d40` 构建：`claude-model-router.tgz` 46262 字节，SHA-256 `ead40fbe8e036d1c76e087c13c96b8c4299c55006030605d700127457a6ec45d` + `SHA256SUMS`；staging/Draft/exact/latest 四处字节一致 | 2026-08-22 |
| 公开发布 | [v1.7.0](https://github.com/zouerdong/ai-model-router/releases/tag/v1.7.0)（2026-08-22T04:12:16Z，immutable、非 prerelease、Latest；tag peeled commit = `86f0d40` = main head）；发布说明含中英双语 CC Switch 兼容提醒（§14） | 2026-08-22 |
| 公开隔离安装 | latest URL 资产安装全新 prefix：`cmr version` = 1.7.0；`cmr update --check` = already latest | 2026-08-22 |
| 公开 old → new 自更新 | 公开 v1.6.0 资产安装隔离 prefix（隔离 HOME）→ `cmr update` → `CMR updated successfully: 1.6.0 -> 1.7.0` → `cmr version` = 1.7.0 | 2026-08-22 |
| 真实 SHA256SUMS 完整性校验 | 1.7.0 `verifyReleaseIntegrity` 对公开 latest 资产真实 fetch 校验 PASS（digest `ead40fbe…c45d`，与 SHA256SUMS 条目一致） | 2026-08-22 |

## 12. 安全红线复核

无真实密钥进测试/日志；`launch.js` 脱敏不回显密钥；更新链校验不新增遥测；不修改用户 Claude 配置（预检只读、拒绝启动；不做 CC Switch 残留清理——负责人 2026-08-22 确认只提醒不代删）。

## 13. 决策记录（负责人 2026-08-22 拍板）

1. 预检取**拒绝启动**（保留现实现）。
2. 版本号定为 **`1.7.0`**。
3. Node `>=18.20.0` engines 提升照准。
4. freshness **不变砖**：由 SC-5 落地（降级为 doctor WARN）。
5. 发布页增加 CC Switch 兼容提醒：文案见 §14，只提醒不代删。

## 14. `v1.7.0` 发布说明候选文案（CC Switch 兼容提醒）

发布时放入 Release notes（中英双语，大白话；README 已有技术性说明段落）：

> **⚠️ 如果你装过 CC Switch，请留意**
>
> CMR 和 CC Switch 这类「切换器」工具会抢同一批 Claude Code 设置。如果你用 CC Switch 切换过供应商，它会把配置写进 Claude Code 的设置文件里——之后你运行 CMR 时，实际用的可能不是你选的那个供应商和 Key（比如你以为在用 Kimi，其实流量走了别的渠道，轻则用错 Key，重则报 401）。
>
> 从本版本起，CMR 启动前会自动做检查：一旦发现这种冲突，会**直接停下来**，并告诉你是哪个文件里的哪些设置在捣乱。这不是坏了，是在保护你用对 Key、算对账。
>
> 解决办法二选一：① 打开提示里说的那个设置文件，把 `env` 里的 `ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY` 这几项删掉，以后用 CMR 管理供应商；② 继续用 CC Switch 管理供应商，不混用 CMR。随时可以运行 `cmr doctor` 查看有没有冲突。

> **⚠️ If you have CC Switch installed, please read**
>
> CMR and provider switchers like CC Switch manage the same Claude Code settings. If you have ever switched providers with CC Switch, it wrote its configuration into Claude Code's settings file — so when you later run CMR, the session may silently use a different provider and key than the one you picked (wrong key, wrong billing, or 401 errors).
>
> Starting with this version, CMR checks for this before every launch. If it detects the conflict it will **stop and tell you exactly which file and which settings are in the way**. That is not a bug — it is protecting you from using the wrong credentials.
>
> Fix it one of two ways: (1) open the file it names and remove the `ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` entries from `env`, letting CMR manage providers; or (2) keep using CC Switch alone and don't mix it with CMR. You can run `cmr doctor` at any time to check for conflicts.
