# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 权威规则与阅读顺序

`AGENTS.md` 是本项目的绑定规则手册，优先级高于本文件；冲突时以 AGENTS.md 为准。开始任何实质工作前按其 §2 顺序阅读：AGENTS.md → `docs/01-product-scope.md` → `docs/02-architecture.md` → 当前阶段执行文档（`docs/10+`，每版本一份编号实施指导书）→ `docs/07-official-sources.md` → `docs/08-acceptance-and-recovery.md` → `docs/09`。

## 常用命令

```bash
npm test                                  # 全量测试（node --test；macOS 上 166 中 3 个 Windows-only 自动 skip）
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
3. **启动链** `src/commands/launch.js` → `src/secret-store.js`（密钥存仓库外 `~/Library/Application Support/ClaudeModelRouter/` 或 `%APPDATA%`，0600 原子写）→ `src/environment.js`（对 20 个 `ROUTER_MANAGED_ENV_VARS` 做大小写不敏感清理后仅注入当前 profile 的值 + 恰好一个鉴权变量；父进程 env 永不修改）→ `src/launcher.js`（spawn、信号转发、退出码透传）。
4. **自更新** `src/updater.js` + `update-lock.js` + `command-runner.js`：只从固定 GitHub Release 资产 `releases/latest/download/claude-model-router.tgz` 更新，带备份/校验/回滚，对源码 checkout/junction 等拒绝。
5. **平台层** `src/platform.js`：macOS/Windows 差异（路径、claude.exe/.cmd 发现）。

当前 5 Provider / 8 Profile：kimi（开放平台）、deepseek、deepseek-vision（全槽位多模态实验模型）、glm（Coding Plan 5.3）、glm-api（标准 API 5.2）、kimi-code 会员 ×3。每条通道是独立凭据边界——**CMR 永不检测 Key 类型、合并槽位、或跨通道 fallback**。

## 关键约定（易踩坑）

- **文档先于代码**：改行为前先改对应 docs（AGENTS.md/docs/01/02/阶段文档），每版本的实施指导书带任务卡与"证据登记"台账，只允许事后如实填写，不得预填 PASS。
- **双语分工**：README.md 是英文，docs/ 与 AGENTS.md 是中文，配置 JSON 的 `purpose` 是中文。
- **密钥红线**：真实 Key 永不进入代码/测试/日志/argv/对话。测试全用假 Key（如 `test-kimi-key`）+ `mkdtemp` 隔离 + `tests/fixtures/fake-claude.js` 假 Claude 子进程做 E2E。
- **Windows CI**：`.github/workflows/windows-t4.yml` 只在 push 到 `codex/windows-t4-validation` 分支（或手动 dispatch）触发——做 Windows 验收时把 main 快进到该分支再推；用完的验证分支发布后可删（内容应已回收入 main，Actions 日志独立留存）。
- **发布流程**：固定资产在仓库外 staging 构建（`claude-model-router.tgz` 固定名 + `SHA256SUMS`），发布后必须做 exact/latest 双 URL 回读 + 隔离 prefix 安装 + `cmr update --check`。完整配方见 `docs/16`（v1.4）与 `docs/17` §12/§14（v1.5）。
- **治理模式**（2026-08-18 起）：单一执行者 + 自动化验证 + 项目负责人对 push/tag/Release 逐项授权（Luna/Sol 双角色已撤销，历史记录见 docs/17 页首）。

## 当前状态

`v1.6.0` 已于 2026-08-21 发布（Latest，tag `v1.6.0` 指向门禁 commit 718ccd1；内容：`docs/20` DSV-1~4 DeepSeek-V4-Flash-Vision 接入——deepseek Auto 的 Haiku/子 Agent 槽位 + 新增 `deepseek-vision` Profile，并入原 1.5.2 候选的内部清理）。`v1.5.1`（2026-08-18）：`docs/19` SSFC-1~3 Secret Store 前向兼容修复。`v1.5.0`（同日早些时候发布）新增 Kimi Code 会员三 Profile 与 GLM-5.3 Coding Plan。已登记未做的候选项：HighSpeed 显式 Profile、GLM-5.3 标准 API 迁移、Claude Code `/fast` 行为实测、Kimi 混合档位映射（2026-08-18 评估后暂缓，见 docs/01 §14.2）、vision-exp `[1m]` 后缀验证、deepseek-v4 pricing 记录与 2026-08-17 峰谷 CNY 定价的口径更新（见 docs/20 §6）。
