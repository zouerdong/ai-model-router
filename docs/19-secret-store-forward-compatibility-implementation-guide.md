# 19 — Secret Store 前向兼容修复：SSFC-1 至 SSFC-3 实施指导书

状态：**IMPLEMENTED — SSFC-1 至 SSFC-3 仓库候选完成（2026-08-18），待随下一常规版本合并发布；发布决策另行授权**
制定日期：2026-08-18
目标：修复密钥库严格校验导致的跨版本瘫痪，恢复「旧版本永远可以继续使用旧通道」的产品预期；随下一个常规版本合并发布，不单独 hotfix。

> 本文件是本轮修复的现行合同。治理模式为单一执行者 + 自动化验证 + 项目负责人对 commit/push/tag/Release 逐项授权（2026-08-18 起生效，见 `docs/17` 页首）。`docs/10`–`docs/18` 为历史实施与发布证据，不属于本轮范围，不得回写。本轮不涉及任何 Provider、Profile、模型映射或价格事实，因此无官方事实复核环节。

## 1. 结论先行

密钥库 `secrets.json` 是跨安装共享的本机状态（源码 checkout 与全局 npm 安装读写同一文件），而 `src/secret-store.js` 的 `parseStore` 要求文件中**每一个** provider key 都必须存在于**当前安装版本**的 provider 集合。一旦较新版本写入较新 provider 的 key，任何较旧版本读取密钥库即抛 `unknown provider`，导致菜单、`cmr <profile>`（含全部旧通道）、`setup`、`doctor`、`secret status` 全部不可用。

修复方向：读取时对当前版本不认识的 provider key 跳过校验、原样保留；写入时不删除、不改写。安全边界不变（Schema v1、原子写入、0600/0700 权限、已知 key 的值校验、脱敏完整性）。

发布决策（2026-08-18，项目负责人确认）：

1. 不做 `v1.5.1` hotfix：外部暴露面约为零（`kimi-code` key 只能由 `1.5.0` 写入，`1.5.0` 发布当天尚无存量用户降级场景）。
2. 修复随下一个常规版本合并发布。已发布的 `1.4.0`/`1.5.0` 无法追补；修复只有进入「用户日常运行的旧版二进制」后才开始提供保护，这是选择随版发布的根本原因。

## 2. 事件与根因登记（2026-08-18）

### 2.1 现象

2026-08-18 16:48（本机截图，桌面留存），Mac 上在任意目录运行 `cmr` 连续三次失败：

```text
ERROR unknown provider: kimi-code
```

执行 `cmr update`（全局 `1.4.0` → `1.5.0`）后恢复正常。同一时期公司 Windows 机器（未更新，仍为旧版）不受影响。

### 2.2 根因链条

1. 报错来源：`src/secret-store.js` `parseStore` 的逐 key 校验——store 文件中每个 key 必须在当前版本的 provider 集合（`secretId` 集合）内，否则抛 `unknown provider: <key>`，整个文件被判为不可读。
2. 密钥库位于仓库外（macOS `~/Library/Application Support/ClaudeModelRouter/`、Windows `%APPDATA%`），跨安装共享：源码 checkout 与全局 npm 安装读写同一文件。
3. `kimi-code` provider 仅存在于 `1.5.0`（aaf8851 引入）。`1.5.0` 开发期间源码 checkout 在 Mac 上 set 过 Kimi Code 会员 key，共享密钥库自此包含 `kimi-code`。
4. 新终端中的 `cmr` 解析到全局安装的 `1.4.0`（其 provider 集合不含 `kimi-code`）→ `parseStore` 扫到该 key → 抛错。
5. 读密钥库的路径全部经过 `readAll()`：菜单（`cli.js` `getProviderStatuses`）、任意 profile 启动（`launch.js`）、`setup`、`doctor`（`doctor.js` `secretStore.status()`）、`secret status`。`cmr update` 不读库，因此仍可自救——但报错本身不提示这条路。

### 2.3 触发条件与场景分类

触发条件（两者缺一不可）：**同一台机器上，较新版本曾向密钥库写入较新 provider 的 key；随后较旧版本二进制读取密钥库。**

| 场景 | 是否触发 | 说明 |
|---|---|---|
| 普通用户单向升级 | 否 | 新版本认识所有旧 key |
| 源码 checkout 与全局安装混用（本次事件） | 是 | 开发机每个「新增 provider 的周期」都会重埋一次雷 |
| 升级后手动降级（如按支持建议 `npm install` 旧版本） | 是 | 需先 set 过新通道 key；三事件串联，概率低但真实 |
| `cmr update` 自带的失败回滚 | 否 | 回滚目标是更新前正在运行的版本，必然认识库中所有 key（该 key 只能由认识它的版本写入） |
| 跨机器 | 否 | 密钥库为单机状态，不随安装迁移 |

### 2.4 对照设计与文档现状

`src/setup-state.js` 的 `getUnseenProviderIds` 只过滤当前 provider、容忍状态中多出的 ID——setup 状态天然前向兼容；密钥库漏掉了同样的考量。`AGENTS.md` 与 `docs/02`/`docs/06` 均未把「未知 key 即拒绝」写成合同（文档只锁 Schema v1、原子写入、长度/空值校验），现有测试也未断言该抛错行为，因此放宽不违反任何已锁定合同。

### 2.5 限制声明

已发布的 `1.4.0` 与 `1.5.0` 二进制无法追补本修复。对于「store 已含 `kimi-code` key 且仍运行 ≤`1.4.0`」的机器（当前仅知为维护者本机开发场景），自救手段仍是 `cmr update`。

## 3. 绑定行为合同（修复后语义）

### 3.1 读取（`parseStore`）

1. 顶层 schema 校验不变：合法 JSON、仅 `version`/`providers` 两键、`version === 1`、`providers` 为对象。违反仍抛 `secret store has an invalid schema` / `is not valid JSON`。
2. 已知 provider key（在当前 provider 集合内）：值校验不变（`assertSecret` 全项），违反仍抛 `secret store has an invalid secret`。
3. 未知 provider key（不在当前集合内）：**跳过校验，原样保留在返回的 `providers` 对象中**。其值即使格式异常（空串、含换行等）也不导致读取失败——未知条目按不透明数据处理。

### 3.2 写入与查询

- `get(provider)`：对**被请求的** provider 仍执行 `assertProvider`（未知即抛）；菜单与启动链只会请求当前版本已知的 provider，此行为不变。
- `set(provider, secret)`：仅更新被请求的 key；读取改为宽容后，写回天然保留全部未知 key，不删除、不改写、不重排语义。
- `status()`：只列出当前版本已知 provider；未知 key 不出现在输出中。
- `readSecretsForRedaction()`：**必须**返回包含未知 key 在内的全部密钥值——错误脱敏的完整性不得因本修复缩窄。此条为安全关键断言，必须有测试。

### 3.3 不变量

不改变：Schema v1、原子写入（临时文件 + rename）、目录 0700 与文件 0600 权限、已知 key 的全部值校验、`get`/`set` 对未知请求 provider 的拒绝、密钥红线（本文件与测试不得出现真实 key）。

## 4. 任务卡

### SSFC-1 — 规格与文档合同

范围：本文件即为合同主体。另在 `docs/02-architecture.md` 新增 §21（Secret Store 前向兼容：共享状态与版本化读取边界，含 §2.2 链路与 §3 合同的架构表述）；在 `docs/08-acceptance-and-recovery.md` 新增 §18（SSFC-A 验收矩阵，见本文件 §4 门槛）；在 `docs/06-usage.md` 的 `secrets.json` 条目补一句跨版本行为说明（较新 CMR 写入、当前版本不认识的 Provider Key 会被忽略并原样保留，升级后可用）；在 `CLAUDE.md`「当前状态」登记本修复已立项及文档指针。不修改 `docs/10`–`docs/18` 与 `AGENTS.md`。

门槛：四份文档增量与本文件 §2/§3 一致；§2.3 场景表与 §2.5 限制声明完整登记；无预填证据。

### SSFC-2 — 宽容读取实现与单元测试

范围：修改 `src/secret-store.js` 的 `parseStore`（按 §3.1 分层校验）；`tests/secret-store.test.js` 新增以下场景，全部使用假 key 与临时目录：

1. 模拟旧版读取新库：注入 `providerIds` 为四家旧集合（`kimi`/`deepseek`/`glm`/`glm-api`），store 文件含 `kimi-code` key——`readAll` 成功、`get("kimi")` 返回正确值、`status()` 只列四家且不含 `kimi-code`。
2. 保留性：在上述 store 上 `set("kimi", ...)` 写回后，`kimi-code` key 及其值原样存在。
3. 脱敏完整性：`readSecretsForRedaction()` 的返回包含未知 key 的值。
4. 不透明性：未知 key 的值为非法格式（空串、含换行）时读取仍成功、写回仍原样保留。
5. 回归：已知 key 值非法仍抛 `invalid secret`；顶层 schema 破坏仍抛 `invalid schema`；现有全部测试不改动语义的前提下继续通过。

门槛：不修改 `get`/`set` 对未知**请求** provider 的拒绝；不动原子写入与权限逻辑；`npm test`/`npm run lint` 通过。

### SSFC-3 — 跨版本共存回归与停止

范围：在 `tests/`（优先 `tests/cli.test.js` 或 `tests/launch.test.js`，仅注入、不改产品代码）补一条端到端回归：以缩减 provider 集合的注入配置 + 含额外未知 key 的 store 文件运行菜单/启动路径，不再抛 `unknown provider`；随后全量 `npm test`、`npm run lint`、`git diff --check`；按 §6 格式登记 §7 证据台账。

门槛：两条以上真实读库路径（至少菜单与 `cmr <profile>`）在模拟旧版集合下通过；完成后停止——commit、push、并入哪个版本的发布决策、tag、Release 均由项目负责人另行授权，本轮不做。

## 5. 文件边界

允许修改：`docs/19`（本文件）、`docs/02`/`docs/06`/`docs/08` 的 SSFC 增量、`CLAUDE.md` 当前状态一行、`src/secret-store.js`、`tests/secret-store.test.js`、`tests/cli.test.js`（或 `tests/launch.test.js`，仅新增注入式断言）。

明确不修改：`config/` 全部、`src/config/validator.js`、`src/cli.js`、`src/commands/`、`src/updater.js`、`src/setup-state.js`、`src/environment.js`、`src/launcher.js`、CI/CD、Git 历史与远端、真实 Secret Store 与本机密钥、`AGENTS.md`、`docs/10`–`docs/18`。

## 6. 每卡交回格式

```text
任务卡：SSFC-N
实际修改：<文件列表>
验证：<命令、exit code、测试数量>
真实 Key/API：未使用
与合同偏差：无 / <差异、证据、影响>
下一步：<下一张卡或停止>
```

## 7. 证据台账

> 台账只能事后如实填写，不得预填。

### SSFC-1 — 规格与文档合同

```text
任务卡：SSFC-1
实际修改：docs/19（本文件，合同主体，2026-08-18 制定）；docs/02-architecture.md（新增 §21 Secret Store 前向兼容架构：共享状态与版本边界、分层校验合同、不变量与已发布版本限制）；docs/08-acceptance-and-recovery.md（新增 §18 SSFC-A 验收矩阵，SSFC-A1~A7，不追溯改变已发布版本记录）；docs/06-usage.md（secrets.json 条目补跨版本忽略/保留说明；降级风险段标注 docs/19 修复前/后边界）；CLAUDE.md（当前状态登记 docs/19 为当前执行合同）
验证：git diff --check exit 0；未涉及 JS/测试改动，npm test/npm run lint 留待 SSFC-2/SSFC-3 全量执行；docs/10–docs/18 与 AGENTS.md 未改动（git status 核对）
真实 Key/API：未使用
与合同偏差：无
下一步：SSFC-2
```

### SSFC-2 — 宽容读取实现与单元测试

```text
任务卡：SSFC-2
实际修改：src/secret-store.js（parseStore：未知 provider key 跳过校验、原样保留，附注释说明 opaque 语义；assertProvider 保留用于 get/set 对被请求 provider 的拒绝）；tests/secret-store.test.js（新增 3 个测试：① 旧版四家集合读取含 kimi-code 的五家 store——readAll 全量保留、get("kimi") 正确、status 只列四家、get("kimi-code") 仍拒、set("kimi") 轮换后未知 key 原值保留、默认集合可读回 kimi-code；② 未知 key 值非法（换行）读取仍成功 + readSecretsForRedaction 包含未知值 + 写回原样保留；③ 已知 key 值非法仍抛 invalid secret、顶层 schema 破坏仍抛 invalid schema——均在注入旧集合下验证）
验证：node --test tests/secret-store.test.js → 14 tests / 14 pass / 0 fail；全量 npm test → 169 tests / 166 pass / 3 skipped（Windows-only）/ 0 fail（基线 166/163/3，净增 3，零回归）；npm run lint → exit 0
真实 Key/API：未使用（全部 fake key + mkdtemp 隔离）
与合同偏差：无
下一步：SSFC-3
```

### SSFC-3 — 跨版本共存回归与停止

```text
任务卡：SSFC-3
实际修改：tests/launch.test.js（新增 "a legacy provider set launches from a store written by a newer CMR version"：新版写入 kimi+kimi-code 双 key 的 store，注入旧版四家 providerIds 的 reader 经 launchProfile("kimi") 读库启动假 Claude——exit 0、无 unknown provider、AUTH_TOKEN 存在/API_KEY 不存在、argv 透传、无密钥泄漏）；tests/cli.test.js（新增 "the daily menu opens on a secret store written by a newer CMR version"：过滤 kimi-code 的旧版 config + 同一 store + 四家 seen state——裸 cmr 菜单正常打开、kimi [configured]、deepseek [missing]、菜单不含 kimi-code、错误输出无 unknown provider）
验证：node --test tests/cli.test.js tests/launch.test.js → 46/46 pass；全量 npm test → 171 tests / 168 pass / 3 skipped（Windows-only）/ 0 fail；npm run lint → exit 0；git diff --check → exit 0；红绿验证：git stash 临时撤销 src/secret-store.js 修复后 4 个新测试（菜单/启动/前向兼容/脱敏不透明）如预期失败，恢复修复后全绿；改动文件与 §5 文件边界逐一核对，无越界
真实 Key/API：未使用（fake key + mkdtemp + 假 Claude 子进程）
与合同偏差：无
下一步：停止 — SSFC-1 至 SSFC-3 仓库候选完成；commit、push、并入哪个常规版本、tag、Release 未执行，待项目负责人逐项授权
```

## 8. v1.5.1 发布门禁记录

发布决策（2026-08-18，项目负责人授权「按此执行」）：v1.5.1 追加发布，含 SSFC-1~3 修复与版本收口；门禁按序为 commit → push main + Windows 验证分支 → staging 构建 + tag + Release → 发布后回读。流程镜像 `docs/16` §7 与 `docs/17` §12 配方。

### 8.1 门 1 — 候选 commit

```text
commit：5b6ee7e release: prepare Claude Model Router v1.5.1 repository candidate
内容：SSFC-1~3 全部改动 + VERSION/package.json 1.5.0→1.5.1 + 移除过时的
      "Kimi Code membership validation is pending; this 1.5.0 checkout is an
      unreleased repository candidate" usage 行（会员验证已于 2026-08-18 真实通过）
验证：npm test 171/168 pass/3 skip（Windows-only）/0 fail；npm run lint exit 0；
      git diff --check exit 0；红绿验证见 §7 SSFC-3
```

### 8.2 门 2 — push 与 Windows 验证门

```text
push main：afdcc54..5b6ee7e
验证分支：codex/windows-t4-validation @ 5b6ee7e（新建；上一验证分支按惯例于 1.5.0 发布后删除）
Actions run：32125785518 "Windows T4 acceptance" — success（2026-08-18T10:17:27Z）
  ✓ PowerShell full regression
  ✓ CMD T4 + Kimi Code fake-key E2E
  ✓ Git Bash T4 + Kimi Code fake-key E2E
门禁口径说明：1.5.1 采用 CI 门（windows-t4.yml）而非 1.5.0 任务卡 9.1 的实机门；
理由：本轮 diff 平台无关（secret-store 读取逻辑为纯 JS，未触碰 platform.js/路径/权限代码，
本地 skip 的 3 个 Windows-only 测试已全部在 CI 通过）。实机复验可随时按 docs/17 §12.1 补做。
```
