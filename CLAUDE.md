# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 权威规则与阅读顺序

`AGENTS.md` 是本项目的绑定规则手册，优先级高于本文件；冲突时以 AGENTS.md 为准。开始任何实质工作前按其 §2 顺序阅读：AGENTS.md → `docs/01-product-scope.md` → `docs/02-architecture.md` → 当前阶段执行文档（`docs/10+`，每版本一份编号实施指导书）→ `docs/07-official-sources.md` → `docs/08-acceptance-and-recovery.md` → `docs/09`。

## 常用命令

```bash
npm test                                  # 全量测试（node --test；当前 184 项，macOS 上 3 个 Windows-only 自动 skip）
npm run lint                              # 语法检查（scripts/lint.js 对 src/tests/scripts 做 node --check，无 ESLint）
node --test tests/launch.test.js          # 运行单个测试文件
node src/cli.js <profile|命令>            # 直接运行本仓库候选 CLI（不经全局安装）
npm pack --ignore-scripts --no-audit      # 生成 tarball（发布资产用，与 CI/Release 的 pack 口径一致）
```

任何改动后的最低验证基线：`npm test` + `npm run lint`（AGENTS.md §10）。

## 架构大图

CMR 是零依赖 Node.js ESM CLI（Node ≥18，仅标准库），职责是 Claude Code 启动前的 Profile 选择与环境注入——不是代理、不是路由、不是会话管理器。核心链路跨多个文件，按数据流理解：

1. **入口与分发** `src/cli.js`：无参数 + TTY → 交互菜单/onboarding（数据驱动 provider 集合）；管理命令（`version/list/doctor/update/config/secret/setup`）；否则第一个 token 解析为 profile，**其余参数原样透传给 Claude Code（opaque argv，不解析不记录）**。
2. **数据驱动配置** `config/{providers,profiles,pricing,entitlements}/*.json` + `config/catalog.json`（排序）。`src/config/loader.js` 按目录发现并由 `src/config/validator.js` 锁死合同：byte-exact 环境映射、别名表、`pricingRef XOR entitlementRef` 互斥。**新增/修改 Provider 或 Profile 必须同步改 validator 锁与 `tests/config.test.js` 断言**，否则加载即失败。
3. **启动链** `src/commands/launch.js` → `src/settings-conflict.js`（启动前预检 Claude Code 各级 settings 的 `env` 块，命中 Router 管理变量即拒绝启动——CC Switch 等切换器写入的持久变量会覆盖 CMR 注入的子进程环境，`CLAUDE_CONFIG_DIR` 感知）→ `src/secret-store.js`（密钥存仓库外 `~/Library/Application Support/ClaudeModelRouter/` 或 `%APPDATA%`，0600 原子写；隐藏输入吞转义序列/控制字节，Ctrl+D 取消）→ `src/environment.js`（对 20 个 `ROUTER_MANAGED_ENV_VARS` 做大小写不敏感清理后仅注入当前 profile 的值 + 恰好一个鉴权变量；父进程 env 永不修改；`removeEnvironmentKeys` 是清理的唯一实现）→ `src/launcher.js`（spawn、信号转发、退出码透传）。
4. **自更新** `src/updater.js` + `update-lock.js` + `command-runner.js`：只从固定 GitHub Release 资产 `releases/latest/download/claude-model-router.tgz` 更新，安装前按 `SHA256SUMS` 校验资产摘要（fail-closed），带备份/校验/回滚，对源码 checkout/junction 等拒绝；更新链子进程环境额外剥离 `NODE_OPTIONS`。
5. **平台层** `src/platform.js`：macOS/Windows 差异（路径、claude.exe/.cmd 发现）。

当前仓库候选为 5 Provider / 7 Profile：kimi（开放平台）、deepseek（V4.1 Flash 单一原生多模态入口）、glm（Coding Plan 5.3/5.3-Flash）、glm-api（标准 API 5.3/5.3-Flash）、kimi-code 会员 ×3。每条 Provider 通道是独立凭据边界——**CMR 永不检测 Key 类型、合并槽位、或跨通道 fallback**。

## 关键约定（易踩坑）

- **文档先于代码**：改行为前先改对应 docs（AGENTS.md/docs/01/02/阶段文档），每版本的实施指导书带任务卡与"证据登记"台账，只允许事后如实填写，不得预填 PASS。
- **双语分工**：README.md 是英文，docs/ 与 AGENTS.md 是中文，配置 JSON 的 `purpose` 是中文。
- **密钥红线**：真实 Key 永不进入代码/测试/日志/argv/对话。测试全用假 Key（如 `test-kimi-key`）+ `mkdtemp` 隔离 + `tests/fixtures/fake-claude.js` 假 Claude 子进程做 E2E。
- **Windows CI**：`.github/workflows/windows-t4.yml` 只在 push 到 `codex/windows-t4-validation` 分支（或手动 dispatch）触发——做 Windows 验收时把 main 快进到该分支再推；用完的验证分支发布后可删（内容应已回收入 main，Actions 日志独立留存）。
- **发布流程**：固定资产在仓库外 staging 构建（`claude-model-router.tgz` 固定名 + `SHA256SUMS`），发布后必须做 exact/latest 双 URL 回读 + 隔离 prefix 安装 + `cmr update --check`。完整配方见 `docs/16`（v1.4）与 `docs/17` §12/§14（v1.5）。
- **治理模式**（2026-08-18 起）：单一执行者 + 自动化验证 + 项目负责人对 push/tag/Release 逐项授权（Luna/Sol 双角色已撤销，历史记录见 docs/17 页首）。
- **DeepSeek 模型后缀**：`[1m]` 是 Claude Code 官方上下文选择后缀；`[text]` / `[image]` 不是能力声明，禁止写入 Profile。图片由 Claude Code visual content block 与上游 Anthropic `image` block 支持，不由模型字符串标签开启。

## 当前状态

仓库的未发布 `2.0.0` 运行时候选已通过本地与 Windows 门（`docs/25` DS41-1~5）：只保留 `deepseek` / `build` 两个等价选择器，全部槽位迁移到 `deepseek-flash`，删除 `deepseek-vision` Profile 与旧 DeepSeek 品牌别名，Pricing 收口为 V4.1 Flash 当前峰谷 USD 价格。Provider、Secret 与鉴权不变；候选 commit `7aa8e18` 已仅推送验证分支，Windows T4 run 34455293821 在 Node 18.20.8/24.20.0 双档全绿。staging 发现其打包 README 仍有候选/旧 URL 口径，本地 finalization 已修正并通过全量门禁、SHA-256 `49cd63654634c8995721df5e46bb840788bde0ac7289a121ee3fe71562921cdf` 的 fixed asset 及隔离安装；由于 README 属于 payload，仍需形成最终 commit 并复跑 Windows。远端 `main`、tag、Release 与公开 Latest 尚未改动，公开稳定版仍是 `v1.8.2`。

`v1.8.2` 已于 2026-08-29 公开发布为 Latest（tag 指向门禁 commit `30cf53e`；Windows T4 run 33244442385 双档全绿）：两个 DeepSeek Profile 统一注入 `CLAUDE_CODE_MAX_CONTEXT_TOKENS=1048576`，Pricing 刷新为 Pro/Flash/Flash Vision 三模型的工作日峰谷 USD 价格；模型映射、Provider、Secret 与鉴权边界不变。完整证据见 `docs/24`。

`v1.8.1` 已于 2026-08-27 发布（Latest，tag `v1.8.1` 指向门禁 commit 61cd77f；内容：`docs/23` HF-1~4 自更新完整性校验查找热修复——修复自 `v1.7.0` 起真实完整 `cmr update` 全平台必然失败的回归（查找键误用 npm 版本化文件名，改为固定资产名），SHA256SUMS 自本版起常设同摘要别名条目（npm 落盘名），存量 `1.7.0`–`1.8.0` 用户 `cmr update` 一次即自愈（隔离 prefix `1.8.0` 真实完整更新实测通过）；发布门禁新增旧版→新版真实完整 `cmr update` 回读；无 Provider/Profile/配置变更）。`v1.8.0`（同日早些时候发布，tag 指向门禁 commit 7929582）：`docs/22` GFA-1~6 GLM-5.3-Flash Auto 双通道升级——`glm` 与 `glm-api` 同步升级为同一套混合映射（Opus/Sonnet=`glm-5.3[1m]`，Haiku 与全部子 Agent=`glm-5.3-flash[1m]` 强制覆盖，真实会话验证），新增 `glm-5.3` 模型族 Pricing（稳定原价，促销价不入配置）；双通道真实验收通过；智谱积分制套餐在持有效套餐账号上跨通道抵扣两通道请求（上游机制变更），经项目负责人裁定按原合同发布并文档化（docs/07 §15.3）。

`v1.8.0` 已于 2026-08-27 发布（当时的 Latest，tag `v1.8.0` 指向门禁 commit 7929582；内容：`docs/22` GFA-1~6 GLM-5.3-Flash Auto 双通道升级——`glm` 与 `glm-api` 同步升级为同一套混合映射（Opus/Sonnet=`glm-5.3[1m]`，Haiku 与全部子 Agent=`glm-5.3-flash[1m]` 强制覆盖，真实会话验证），新增 `glm-5.3` 模型族 Pricing（稳定原价，促销价不入配置）；双通道真实验收通过；智谱积分制套餐在持有效套餐账号上跨通道抵扣两通道请求（上游机制变更），经项目负责人裁定按原合同发布并文档化（docs/07 §15.3））。`v1.7.0`（2026-08-22）：`docs/21` SC-1~5 公开发布安全加固——settings 冲突预检拒绝启动（CC Switch 劫持防御）、自更新 SHA256SUMS 校验、隐藏输入加固、密钥回显脱敏、freshness 降级为 WARN、Node `>=18.20.0`。`v1.6.0`（2026-08-21）：`docs/20` DSV-1~4 DeepSeek-V4-Flash-Vision 接入——deepseek Auto 的 Haiku/子 Agent 槽位 + 新增 `deepseek-vision` Profile，并入原 1.5.2 候选的内部清理。`v1.5.1`（2026-08-18）：`docs/19` SSFC-1~3 Secret Store 前向兼容修复。`v1.5.0`（同日早些时候发布）新增 Kimi Code 会员三 Profile 与 GLM-5.3 Coding Plan。已登记未做的候选项：智谱积分耗尽后标准 Key 行为确认（见 docs/07 §15.3）、HighSpeed 显式 Profile、Claude Code `/fast` 行为实测、Kimi 混合档位映射（2026-08-18 评估后暂缓，见 docs/01 §14.2）、docs/21 §9 的登记项（Windows ACL、set() 并发、fsync、formatPricing 数据驱动化、migrate.js 死代码删除等）。DeepSeek Vision 客户端 1M 声明与峰谷 Pricing 待办已由 `docs/24` 的 `1.8.2` 正式版处理。
