# 20 — DeepSeek-V4-Flash-Vision 接入：DSV-1 至 DSV-4 实施指导书

状态：**IN PROGRESS — DSV-1 至 DSV-4 实施中，尚未发布**
制定日期：2026-08-21
目标：接入 2026-08-21 官方上线的多模态模型 `deepseek-v4-flash-vision-exp`：① `deepseek` Auto Profile 的 Haiku 档与子 Agent 槽切换到该模型；② 新增显式 `deepseek-vision` Profile，全部模型映射使用该模型。不新增 Provider、Secret 或凭据边界。

> 本文件是本轮改动的现行合同。治理模式为单一执行者 + 自动化验证 + 项目负责人对 commit/push/tag/Release 逐项授权（2026-08-18 起生效，见 `docs/17` 页首）。本轮改动叠加在未发布的 `v1.5.2` 仓库候选（commit cd50a19，内部启动路径清理，无行为变化）之上；最终发布版本号（重定范围 `v1.5.2` 或递增 `v1.6.0`）由项目负责人在发布门禁时决定，本轮不预改 `package.json` 版本号。

## 1. 官方事实（2026-08-21 复核）

主来源：

- DeepSeek 官方更新日志（2026-08-21 条目）：`DeepSeek-V4-Flash-Vision-Exp 发布`，模型名 `deepseek-v4-flash-vision-exp`，实验性质；纯文本能力与 DeepSeek-V4-Flash 正式版持平，视觉 Agent 能力接近 Opus-4.8。https://api-docs.deepseek.com/zh-cn/updates/
- DeepSeek 图像理解指南：明确该模型可通过 Anthropic 兼容端点（`base_url=https://api.deepseek.com/anthropic`）调用，图片以 `image` 内容块承载；仅视觉模型接受图片，其他模型返回 400。https://api-docs.deepseek.com/zh-cn/guides/vision
- DeepSeek 模型与价格页：`deepseek-v4-flash-vision-exp` 与 `deepseek-v4-flash` 价格完全相同（输入缓存命中/未命中、输出，峰谷两档），上下文 1M、输出最大 384K，支持思考模式、Tool Calls、Json Output、Responses API、Anthropic API。https://api-docs.deepseek.com/zh-cn/quick_start/pricing
- DeepSeek Claude Code 接入指南：官方 Auto 映射仍为 `deepseek-v4-pro[1m]` ×3 + `deepseek-v4-flash` ×2 + `CLAUDE_CODE_EFFORT_LEVEL=max`，尚未随 vision 模型更新（指南更新滞后于当日模型上线，不阻塞本轮，依据为图像理解指南的官方 Anthropic 端点章节）。https://api-docs.deepseek.com/zh-cn/guides/coding_agents

推断与假设（显式登记，区别于官方事实）：

1. `deepseek` Auto Profile 的 Haiku/Subagent 槽从 `deepseek-v4-flash` 换成 `deepseek-v4-flash-vision-exp` 是本轮产品决策（用户指令），不是官方映射变更；官方 Auto 指南写的是 `deepseek-v4-flash`。纯文本能力官方声明持平，价格相同，风险为实验模型稳定性。
2. `deepseek-vision` Profile 的 `CLAUDE_CODE_EFFORT_LEVEL=max` 沿用 flash 正式版同通道配置；官方未单独说明 vision-exp 的思考强度档位，按「纯文本持平」推定支持。
3. `[1m]` 上下文选择后缀官方仅示例于 `deepseek-v4-pro[1m]`；vision-exp 在官方 Anthropic 端点示例中为不带后缀形式。本轮全部槽位使用不带后缀的 `deepseek-v4-flash-vision-exp`，`[1m]` 变体留作待验证候选（见 §7）。

## 2. 绑定行为合同

### 2.1 `deepseek` Auto Profile（修改）

仅改动两个槽位，其余不变：

| 变量 | 改动前 | 改动后 |
|---|---|---|
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `deepseek-v4-flash` | `deepseek-v4-flash-vision-exp` |
| `CLAUDE_CODE_SUBAGENT_MODEL` | `deepseek-v4-flash` | `deepseek-v4-flash-vision-exp` |

`ANTHROPIC_MODEL`/Opus/Sonnet 保持 `deepseek-v4-pro[1m]`，`CLAUDE_CODE_EFFORT_LEVEL` 保持 `max`。目的：主会话不降档，后台/轻量任务与识图流量获得多模态能力。

### 2.2 `deepseek-vision` Profile（新增）

- 规范 ID：`deepseek-vision`；兼容别名：`deepseek-flash-vision`（恰好一个，模式对齐 `glm-api`）。
- Provider：复用 `deepseek`（同一 Base URL、`ANTHROPIC_AUTH_TOKEN`、Secret Store 槽 `deepseek`）。不新增 Provider、不新增凭据边界、不触发新的 onboarding。
- 全部模型映射（主模型、Opus、Sonnet、Haiku、子 Agent）= `deepseek-v4-flash-vision-exp`，外加 `CLAUDE_CODE_EFFORT_LEVEL=max`。不设置 Fable、compact、max-context、timeout 等官方未列出的变量。
- 商业元数据：`costNotice: "standard"`，`pricingRef: "deepseek-v4"`（vision-exp 与 flash 官方同价，复用该 Pricing 记录，不新建）。
- menu 顺序：catalog 中紧随 `deepseek` 之后（deepseek 系 Profile 相邻）。

### 2.3 不变量

- 每次启动仍只注入恰好一个鉴权变量（`ANTHROPIC_AUTH_TOKEN`）+ 当前 Profile 环境；跨 Profile 无 fallback。
- CMR 不检测模型能力、不按内容路由；Profile 只决定环境注入。
- 真实 Key 不进入代码、测试、日志；本轮全部使用假 Key 与假 Claude 子进程验证。

## 3. 任务卡

### DSV-1 — 事实与规格合同

更新 `docs/01` §16、`docs/07` §14、本文件；登记 `[1m]`/effort 待验证项与 pricing 存量偏差。完成后回填证据。

### DSV-2 — 配置与 validator 锁

- 修改 `config/profiles/deepseek.json`（§2.1 两槽位 + purpose 文案）。
- 新增 `config/profiles/deepseek-vision.json`；`config/catalog.json` profiles 序列插入 `deepseek-vision`。
- `config/providers/deepseek.json` `verifiedOn` 更新为 2026-08-21（当日按官方页面复核 Base URL/鉴权/vision 支持）。
- `src/config/validator.js`：`requiredProfiles` 加入 `deepseek-vision`；新增 deepseek 双 Profile 合同锁——`deepseek-vision` 的 aliases/provider/pricingRef/costNotice 与 environment（byte-exact，含 requiredEnvironment 顺序）；`deepseek` 的 environment 增加 byte-exact 锁（对齐 glm/kimi-code 锁强度，本轮起 deepseek 环境映射进入 validator 锁）。
- `tests/config.test.js` 同步：profile 清单（8 个）、alias 解析、deepseek 新环境值、deepseek-vision 完整断言。

### DSV-3 — 回归测试同步

- `tests/environment.test.js`：deepseek 环境断言更新；"seven formal profiles" 计数改 eight（两处循环为泛化遍历，无需改逻辑）。
- `tests/launch.test.js`：`buildSnapshot.haiku` 期望值更新。
- `tests/hostile-qa.test.js`：cases 表新增 `deepseek-vision` 行（model=`deepseek-v4-flash-vision-exp`、`ANTHROPIC_AUTH_TOKEN`、无 max-context）；测试名计数改 eight。
- `tests/cli.test.js`：菜单序号断言随 catalog 顺移（choices[3]→glm、[4]→glm-api、[5]→kimi-code、setup→[8]）；`cmr list` 输出增加 deepseek-vision 断言。

### DSV-4 — 验证与停止条件

`npm test`（macOS 预期 3 个 Windows-only skip）+ `npm run lint` 全绿；`node src/cli.js list` 冒烟显示新 Profile；`node src/cli.js deepseek-vision --help` 之外不做真实 API 调用。真实 vision 请求验收属于后续可选步骤，须项目负责人授权使用本机密钥后另行执行。验证全部通过后回填 §5 证据台账，等待 commit/push 授权。

## 4. 文件边界

改动：`docs/01`、`docs/06`、`docs/07`、`AGENTS.md`（§1 Profile 清单）、`README.md`（英文 Profile 表）、`config/profiles/deepseek.json`、`config/profiles/deepseek-vision.json`（新增）、`config/catalog.json`、`config/providers/deepseek.json`、`src/config/validator.js`、`tests/config.test.js`、`tests/environment.test.js`、`tests/launch.test.js`、`tests/hostile-qa.test.js`、`tests/cli.test.js`、本文件。
不改动：`src/` 其余运行时代码（CLI/菜单/setup 均数据驱动）、Secret Store、价格与其他 Provider/Profile、CI、`package.json` 版本号。

## 5. 证据台账（事后如实填写，不得预填 PASS）

### DSV-1 — 事实与规格合同

- 状态：**DONE（2026-08-21）**。`docs/01` §16、`docs/07` §14、`AGENTS.md` §1/§2、`docs/02` §5.4、`docs/06` §2/§20、`README.md` 已更新；`[1m]`/effort 待验证项与 pricing 存量偏差登记于本文件 §6。

### DSV-2 — 配置与 validator 锁

- 状态：**DONE（2026-08-21）**。`config/profiles/deepseek.json` 两槽位与 purpose 更新；`config/profiles/deepseek-vision.json` 新增；`config/catalog.json` 插入 `deepseek-vision`（紧随 `deepseek`）；`config/providers/deepseek.json` `verifiedOn` → 2026-08-21；`src/config/validator.js` `requiredProfiles` 加 `deepseek-vision`，新增 deepseek 双 Profile 合同锁（aliases/provider/pricingRef/costNotice + environment byte-exact）。

### DSV-3 — 回归测试同步

- 状态：**DONE（2026-08-21）**。`tests/config.test.js`（8 Profile 清单、alias 解析 ×2、deepseek 新环境值、deepseek-vision 完整断言、两处固定 `now` 更新为 2026-08-21）；`tests/environment.test.js`（deepseek 断言 + 计数 eight）；`tests/launch.test.js`（haiku 期望值）；`tests/hostile-qa.test.js`（cases 新增 deepseek-vision 行 + 两处计数 eight）；`tests/cli.test.js`（菜单序号断言 2/3/4/5/8、list 输出、opaque-args 用例 ×2）；`tests/doctor.test.js`（validated 8 profiles）。

### DSV-4 — 验证与停止条件

- 状态：**DONE（2026-08-21）**。`npm test`：172 tests，169 pass / 0 fail / 3 Windows-only skip（macOS）。`npm run lint`：通过。`node src/cli.js list` 冒烟：`deepseek`（Haiku/Subagent = `deepseek-v4-flash-vision-exp`）与 `deepseek-vision`（全槽位 vision-exp）条目输出正确。未做真实 API 调用；未改 `package.json` 版本号；未 commit/push。停止点：等待项目负责人 commit/push 授权与发布版本号决策（§6.4）。

## 6. 待验证项与存量登记（不阻塞本轮）

1. `deepseek-v4-flash-vision-exp[1m]` 是否为有效选择值：官方未示例；若后续真实验证可用，再评估是否给 `deepseek-vision` 主槽加 `[1m]`。
2. vision-exp 思考强度档位（low/high/max）官方未单独声明，本轮按 flash 正式版同级使用 `max`。
3. 存量偏差：`config/pricing/deepseek-v4.json` 记录 USD 单价（verified 2026-07-23），官方 2026-08-17 起改为峰谷 CNY 定价（flash：命中 0.05/0.10 元、未命中 1.5/3.0 元、输出 4.5/9.0 元，vision-exp 同价）。vision-exp 与 flash 同价使 `pricingRef: deepseek-v4` 复用成立；但该记录绝对值已过期，更新涉及币种/口径决策，登记为独立候选项，不在本轮修改。
4. 发布版本号决策（`v1.5.2` 重定范围 vs `v1.6.0`）：留给发布门禁。
