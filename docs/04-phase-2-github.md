# 04 — 阶段二：GitHub 首次推送计划

状态：GitHub 公共源码阶段已通过；`1.3.0` 本机候选审阅完成，Release 门禁未闭环
目标：让 GitHub 成为 Mac 与 Windows 的唯一公共源码来源，不让任何本机凭据、私有背景资料或个人机器路径进入公开历史。

## 1. 为什么必须独立成一个阶段

本地 Git 初始化、提交候选扫描和 `v1.0.0` 发布提交在 Mac 验收后完成。第一次推送一旦带入密钥，后续删除文件并不能自动从 Git 历史中清除，因此创建远端和 push 仍作为独立门禁执行。

## 2. 阶段二前置条件

- [x] 阶段一验收记录已完成。
- [x] `.gitignore` 覆盖 `.DS_Store`、密钥、本机配置、日志和临时文件。
- [x] 阶段一收尾扫描未发现真实 API Key、Token、`.env` 或迁移备份。
- [x] 本地默认分支为 `main`，公开稳定发布点为 `v1.1.0`。
- [x] 用户已决定 GitHub 仓库为 Public：`ErdongZou-ai/ai-model-router`。
- [x] 用户知道 GitHub 仓库只同步公共源码，不同步本机密钥、使用记录或本地历史讨论。

## 3. GitHub 在本项目中的职责

GitHub 只负责：

- 源码与配置模板的唯一版本。
- 文档、测试和变更历史。
- Mac 到 Windows 的获取与后续更新。
- 阶段二后另行批准的跨平台自动测试。

GitHub 不负责：

- API Key 同步。
- 公司代理或凭据同步。
- 将 Mac 可执行文件直接变成 Windows 可执行文件。
- 自动部署或公开发布。

## 4. 执行步骤与门禁

### Step 1 — 本机身份与工具只读检查

检查：

- Git 版本。
- GitHub 账号是否已建立。
- GitHub CLI 是否已安装、是否登录。
- `git config user.name` / `user.email` 是否已设置。

未安装新工具时不擅自安装。GitHub CLI 不是必需，可使用浏览器创建远端后用 Git 连接。

### Step 2 — 提交候选扫描

在 `git init` 前后都要执行等价检查：

- 列出全部文件，包括隐藏文件。
- 搜索常见 Key/Token 模式和 Provider 域名附近的疑似凭据。
- 检查大文件、备份文件、日志、Shell/Settings 副本。
- 确认本机 `00_background/` 被 Git 忽略，不进入公共候选、提交或历史。
- 审阅 `.gitignore` 命中结果。

扫描输出必须脱敏。发现疑似密钥时停止；未经用户确认不得删除文件或改写历史。

### Step 3 — 初始化本地 Git（已完成）

已建立默认分支 `main`，完成本地提交并创建带说明的 `v1.0.0` 标签。远端阶段开始前仍需复核：

- 将提交的文件清单。
- 被忽略的敏感/本机文件清单。
- 将推送的提交与标签。
- 扫描结论。

本地 `git init` 与提交不等于外部发布，但仍应让用户看清当前状态。

2026-07-23 公共发布审计发现：既有本地提交包含维护者本机历史讨论文件、绝对路径和个人提交邮箱。用户已明确授权保留本机文件但重建首次公开历史，并选择 MIT License 与 GitHub noreply 提交邮箱。旧历史不得直接 push；公共历史从清理后的 `v1.1.0` 发布点开始。

### Step 4 — 创建 GitHub 远端

已确认远端：

- URL：`https://github.com/ErdongZou-ai/ai-model-router`
- Owner：`ErdongZou-ai`
- 可见性：Public
- 默认分支：`main`
- 远端初始提交仅含 GitHub 生成的 MIT `LICENSE` 与不适用于本项目的 Python `.gitignore`

远端初始提交已公开记录维护者 Gmail。若用户要求公共历史只使用 GitHub noreply 邮箱，首次源码 push 需要在最终预览后单独批准 `--force-with-lease` 覆盖这一个初始提交；不得静默强推。

### Step 5 — Push 红线

在 `git push` 前再次展示：

- 远端准确 URL。
- 当前分支与将推送的提交。
- 最终 `git status`。
- 最终密钥扫描结果。

用户明确确认后，才执行第一次 push。若远端初始提交保留，则必须先正常合并；若按已选择的干净公共历史覆盖初始提交，则必须再次获得强推的明确授权并只允许使用 `--force-with-lease`，不得使用无租约强推。

2026-07-23 用户在看到远端 URL、初始 SHA、公共提交、标签和扫描结论后，明确批准两次 push。执行结果：

- 以精确租约 `c45fed09035fef3f020c8b4d4b898f5e11246204` 覆盖远端 GitHub 自动初始提交，未使用无租约强推。
- 远端 `main` 为无父提交 `c7bfe49817e9eaef4231e3d99f17fd3bc509d8b1`。
- 作者和提交者均使用 `275486446+ErdongZou-ai@users.noreply.github.com`，GitHub 正确关联到 `ErdongZou-ai`。
- annotated tag `v1.1.0` 已推送并指向同一发布提交。

### Step 6 — 远端验收

在 GitHub 页面验证：

- 文件与本地一致。
- 仓库可见性正确。
- 没有 secrets、本机路径备份或日志。
- README 链接有效。
- 默认分支为 `main`。
- clone URL 可用。

远端 API 与独立 clone 验收结果：

- 仓库为 Public，默认分支为 `main`。
- 公开树含 52 个文件；不含 `00_background/`、`.env`、Secret Store、日志、`.tgz` 或本机绝对用户路径。
- 从 GitHub `v1.1.0` 全新浅 clone 后，`npm test` 为 79/79 PASS，`npm run lint` PASS。
- 在独立临时 npm prefix 中安装 clone，`cmr version` 输出 `1.1.0`。
- GitHub Release、npm publish 和 CI/CD 均未执行。

## 5. CI/CD 单独处理

`.github/workflows/**` 属于 CI/CD 配置，不能因为“顺便做跨平台测试”直接加入。

首次安全推送完成后，再向用户提出一个独立变更：

- macOS runner：Node LTS 上运行 lint/test。
- Windows runner：Node LTS 上运行 lint/test。
- 不注入真实 Provider Key。
- 不做真实 API 测试。
- 不自动发布 npm 或 Release。

只有用户确认后才新增工作流并再次推送。

## 6. 面向初次使用者的日常最小流程

阶段二交付时应提供一页简化说明：

```text
查看变化 → git status
查看具体内容 → git diff
保存到本地历史 → git add + git commit
上传到 GitHub → git push（每次仍由用户决定）
从 GitHub 获取 → git pull --ff-only
```

不要把 `commit` 和 `push` 混为一件事；前者是本机历史，后者是对外写入。

## 7. 完成定义

- [x] 远端 Public 与用户选择一致。
- [x] 首次提交可从空目录 clone。
- [x] clone 后 `npm test` 和 `npm run lint` 通过。
- [x] 远端历史中没有密钥或本机备份。
- [x] 用户已在逐步门禁中区分本地 commit、tag、普通 push 与安全强推。
- [x] 未经另行批准，没有 GitHub Release、npm publish 或 CI/CD。

## 8. GitHub 分发与 `1.1.0` 首次设置的关系

GitHub 成为源码来源，不等于已经形成完整的新用户安装体验。面向公司新电脑或外部使用者时，应区分三件事：

1. **获取源码**：clone、pull 或下载 Release。
2. **安装命令**：让 `cmr` 出现在用户 PATH；具体方式必须在发布前单独验证并写入 README。
3. **首次配置**：用户主动运行 `cmr` 后，由 `1.1.0` setup 向导在 TTY 中接收并保存自己的 Provider Key。

`docs/11-v1.1-first-run-setup-implementation-brief.md` 只解决第 3 项，并为第 2 项完成后的体验提供统一入口。不得为了让安装结束时立即弹出向导而添加 npm `postinstall` 凭据输入；npm 生命周期可能无 TTY、被跳过或在升级/CI 中重复执行。

`1.1.0` 已于 2026-07-19 在 Mac 通过独立验收，因此阶段二按以下现状执行：

- README 以 `cmr` 首次交互向导和 `cmr setup` 作为 `1.1.0` 的主配置方式，同时保留 `cmr secret set` 兼容说明。
- GitHub `main` 与 annotated tag `v1.1.0` 已推送并完成独立 clone、测试、lint 和临时安装验收。

## 10. 仓库 canonical 地址更新

2026-07-24，GitHub 将仓库 canonical 地址解析为 `https://github.com/zouerdong/ai-model-router`；历史 `ErdongZou-ai/ai-model-router` 地址继续由 GitHub 重定向。`1.2.1` 起，README、安装命令、package metadata、Issues 与 Release 链接统一使用新 canonical 地址；历史首次发布记录中的旧地址保留为当时事实。
- GitHub Release、npm 包发布和 CI/CD 仍未创建；源码与 Git tag 可公开获取不等于这些分发渠道已经完成。

阶段二的 clone 验收还应增加：在全新临时 HOME 中安装候选包，首次交互运行无论预置零个、一个或全部 Key 都先显示全量状态并进入 setup；非 TTY 安装与命令均不挂起；打包清单不含本机 Secret Store、Setup State、日志或备份。

## 11. `1.3.0` 自更新实现状态

状态：**本机候选审阅完成；正式 Release 门禁未闭环**。

仓库内已实现从 canonical GitHub latest Release 固定资产读取候选包的 `cmr update --check` 与 `cmr update` 编排，并补充 npm pack/install 的隔离 cache、exact prefix、rollback 与绝对入口验证。Release draft、checksum、immutable 发布、公开资产回读与正式 tag 仍属于 Sol 审阅后的发布门禁；本轮未执行 Git 写操作或 CI/CD。
