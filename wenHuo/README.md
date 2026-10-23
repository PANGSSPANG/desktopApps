# 文火（Wenhuo）

本地优先的长篇写作工作台。单章编辑、自动保存、卷章结构、字数统计、一键导出——稿件只保存在本机。

- Slogan：把长篇写完
- 阶段：**W1–W3 已完成**（写作核心、快照与崩溃恢复、搜索、设定库、导入导出、备份）；W4 收口进行中（性能与安装包验证）
- 目标平台：Windows 10/11 x64
- 仓库：本目录是 [harnessCodes](../README.md) 下的两个桌面应用之一，与 [electricReader](../electricReader/README.md) 互不依赖

## 文档

| 文档 | 内容 |
| --- | --- |
| [PRD.md](PRD.md) | 定位、场景、P0 十项功能与验收、成功标准、待确认项 |
| [docs/tech-design.md](docs/tech-design.md) | 技术栈、目录结构、schema、IPC 契约、关键技术点 |
| [AGENTS.md](AGENTS.md) | 开发规范、测试门禁、代码风格、避坑清单 |
| [docs/w1-plan.md](docs/w1-plan.md) | W1 任务清单与完成状态 |
| [docs/w2-plan.md](docs/w2-plan.md) | W2 快照 / 崩溃恢复 / 搜索的任务与验证 |
| [docs/w3-plan.md](docs/w3-plan.md) | W3 导入、设定库、导出三格式、备份、自动备份（均已完成） |
| [docs/ipc.md](docs/ipc.md) | IPC 契约表（由 `pnpm gen:ipc` 从 `shared/ipc.ts` 生成） |
| [docs/troubleshooting-launch.md](docs/troubleshooting-launch.md) | 启动问题排查手册（`pnpm diagnose:launch` 四组对照） |

## 技术栈

Electron 43 · React 19 · TypeScript 5 · electron-vite · Tailwind CSS 4 · Zustand 5 · Tiptap 3 · better-sqlite3 13（WAL + FTS5）· Vitest。

## 快速开始

```bash
pnpm install    # 安装依赖（better-sqlite3 走 N-API 预编译；postinstall 会补装 Electron 二进制）
pnpm dev        # 启动应用
```

> 本机（受管/沙箱终端）如果 `pnpm dev` 启动后立刻闪退、没有日志，改用：
>
> ```bash
> pnpm dev:local
> ```
>
> 它把数据目录指到仓库内 `.appdata/` 并关闭 Chromium 原生沙箱，只用于受限环境；正式使用仍用 `pnpm dev`。

其他命令：

```bash
pnpm typecheck        # 主进程 + 渲染层两套 tsconfig
pnpm lint             # ESLint
pnpm test             # Vitest（纯函数 + 真实临时 SQLite）
pnpm build            # 三端构建到 out/
pnpm smoke:db         # 用 Electron 跑一遍数据库冒烟（schema / FTS5 / 级联删除）
pnpm dist:win         # NSIS 安装包到 release/
```

### 启动排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `Error: Electron uninstall` | pnpm 默认不跑依赖的 postinstall，Electron 只有包没有 `dist/` | 根 `postinstall` 已自动补装（`scripts/ensure-electron.cjs`）；仍失败就手动 
ode node_modules/electron/install.js` |
| 启动后立刻退出、`out/` 与日志都没有 | 受限环境里 Chromium 原生沙箱无法初始化 | `pnpm dev:local`，或 `NO_SANDBOX=1 pnpm dev` |
| 提示"无法创建数据目录" | 数据目录（`%APPDATA%\wenhuo`）不可写 | 用 `WENHUO_USER_DATA=<可写路径>` 覆盖 |
| 导出时提示"没有权限保存" | 保存对话框默认落在不可写目录（受限环境里整个用户目录都可能不可写） | 导出默认目录会按「上次位置 → 文档 → 桌面 → `<userData>/exports`」挑第一个真正可写的；受限环境下会直接落在 `.appdata/exports`，导出完点「打开所在文件夹」即可 |
| 一直弹 `A JavaScript error occurred in the main process`（`ENOENT ... logs\main.log`） | 数据目录退化成相对路径，工作目录变化后日志目录不存在；且日志写入当时会抛异常，焦点事件每次都触发一次 | 已修：日志写入三重兜底不再抛异常；启动时把数据目录钉成绝对路径（退化时用 `~/.wenhuo`）；未捕获异常只提示一次 |
| 拖动侧边滚动条后，点击输入框无法输入 | Chromium 在拖拽中断时残留"拖拽中"状态（[KDE #495846](https://bugs.kde.org/show_bug.cgi?id=495846)），鼠标事件不再落到输入框 | 已隐藏原生滚动条，改为应用内自绘滚动条（`components/scroll-area.tsx`），并加了窗口焦点兜底 |

| `pnpm dist:win` 卡在下载 / `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE` | electron-builder 默认从 GitHub 拉 Electron zip、NSIS、7zip；NSIS 生成安装器后还要**执行**它来产出卸载器 | 设置 `ELECTRON_MIRROR` 与 `ELECTRON_BUILDER_BINARIES_MIRROR`（见下方命令）；若执行安装器被安全软件拦截，改用 `pnpm dist:win:zip` 出便携包 |

| `dist:win` 报 `process failed 2`（`wenhuo-0.1.0-x64.exe`） | NSIS 生成卸载器时失败，常见于用户名/临时目录含中文（NSIS 对非 ASCII 临时路径敏感），或安全软件拦截静默安装器 | 先 `$env:TEMP=$env:TMP="D:\wenhuo-tmp"` 再重跑；仍失败就用 `pnpm dist:win:portable` 出单文件 exe，或 `pnpm dist:win:zip` 出便携包 |

| 双击 `wenhuo.exe` 没反应、也不留日志 | 受限环境（虚拟桌面 / 远程会话 / 受管机器）里 Chromium 原生沙箱无法初始化，Electron 在加载应用代码前就退出了 | 运行同目录的 `start-wenhuo-no-sandbox.cmd`，或命令行 `wenhuo.exe --no-sandbox`；正常 Windows 桌面上双击通常没问题 |

| 双击后闪一下就没、或提示「无法创建数据目录」 | `%APPDATA%` 在受限环境里不可写（EPERM），应用建 `projects/` 失败 | 已在启动时按 `WENHUO_USER_DATA` → 默认目录 → `~/.wenhuo` → exe 同目录 `data/` → 当前目录 `.appdata/` 逐个探测，自动落到可写位置；日志里能看到实际用的目录 |

### 导出行为

- 默认目录按上面顺序探测，探测方式是真实写一个临时文件再删掉，`exists` 不算数；
- 成功后弹窗显示完整路径与大小，并提供「打开所在文件夹」；
- 写入失败会返回 `EXPORT_FAILED`，提示里带错误码、目标路径和可用的导出目录。

### 关于原生模块

`better-sqlite3` 13 提供 **N-API 预编译产物**（`prebuilds/win32-x64.node`），同一份二进制在 Node 与 Electron 下都能加载，因此通常**不需要** `electron-rebuild`。只有预编译缺失、被迫从源码编译时才需要：

```bash
pnpm rebuild:native
```

## 目录

```
src/
├─ shared/     纯函数与类型：Result、字数、排序、日期、项目模板、文件名（禁止 import electron）
├─ main/       数据库、迁移、项目/卷章/章节/快照/搜索/导出、IPC、窗口
├─ preload/    contextBridge 白名单
└─ renderer/   书架、三栏工作台、Tiptap 编辑器、快照面板、搜索面板、恢复条
tests/unit/    Vitest：字数、排序、日期、迁移、保存、导出、快照、搜索、草稿
scripts/       db-smoke.cjs（Electron 内验证数据库链路）、dev-local.cjs、ensure-electron.cjs
```

## 验证状态（W1–W3）

| 检查项 | 命令 | 结果 |
| --- | --- | --- |
| 主进程类型 | `pnpm typecheck:node` | ✅ 0 错误 |
| 渲染层类型 | `pnpm typecheck:web` | ✅ 0 错误 |
| 代码规范 | `pnpm lint` | ✅ 0 error / 0 warning |
| 单元与集成测试 | `pnpm test` | ✅ 31 文件 / 194 用例 |
| 三端构建 | `pnpm build` | ✅ 构建通过 |
| Electron 内数据库链路 | `pnpm smoke:db` | ✅ schema、FTS5(trigram)、聚合、级联删除 |
| 窗口启动 | `pnpm dev:local` | ✅ Electron 存活、迁移 v1、全部 IPC 注册成功 |
| 数据层性能（51 万字） | `pnpm perf:baseline` | ✅ 读树 0.7ms、搜索 0.4ms、聚合 0.3ms |
| UI 性能（51 万字） | `pnpm perf:ui` | ✅ 启动 1137ms、切章 p95 79ms、搜索 270ms |
| 端到端 | `pnpm test:e2e` | ✅ 10 条（写作/搜索/快照、查找替换、完成章锁定、导入→EPUB、删除项目、设置、草稿恢复） |

## 已实现（W1–W3）

- 项目书架：新建 / 打开 / 最近编辑排序 / 总字数与进度聚合
- 卷章树：建卷、建章、切章、改标题、删除章节/整卷（均二次确认）、拖拽排序（章节跨卷 + 卷之间）、卷章折叠展开（折叠状态本地记忆），删项目在书架卡片悬停「删除」、重命名在卡片悬停「重命名」；默认标题统一中文数字（第一章…第十一章）；**「已完成」的章正文锁定（主进程拒绝保存与快照恢复）**
- 编辑器：Tiptap 富文本、中文首行缩进、专注版心、打字机模式（光标锁定屏幕中部）、查找替换（区分/不区分大小写、整词、结果计数与高亮）；800ms 自动保存、中文输入法组合期不保存、切章/失焦/关闭前 flush
- 保存事务：正文 + 纯文本 + 字数 + hash + 项目更新时间 + 当日写作增量
- 字数：汉字逐字、英文按词、标点与 Emoji 不计；今日字数、连续天数、完成章数
- **设定库**：人物 / 地点 / 组织 / 物品卡片（名称、别名、身份、描述、关系），与章节双向关联、反向引用（章名可点击跳转）、搜索可命中别名；可选「正文提及未关联设定卡时提醒」（默认关闭）
- **快照**：手动命名 + 自动（10 分钟 / 净增 2000 字）、内容 hash 去重、自动快照每章保留 50 条 30 天；恢复为**覆盖式、不自动备份**（要保留先手动存），列表可预览 / 删除 / 清理旧版过程记录
- **崩溃恢复**：保存失败或未保存时每 5 秒写草稿日志，启动扫描成候选；恢复与"留档并丢弃"都不丢内容
- **全文搜索**：FTS5 trigram（≥3 字）+ LIKE 兜底（1–2 字），逐处命中展开（同章最多 5 处）、章节/设定分组、`Ctrl+K` 面板、点击直接选中并滚动到命中文字
- **导入**：TXT / Markdown，按「第X章」/ Markdown 标题 / 空行 / 整篇拆章，导入前预览（章数、字数、告警，可改标题、把多切的一章并入上一章），可新建书或追加一卷；自动识别 UTF-8 与 GBK
- 导出：TXT / Markdown / EPUB 三种格式（共用同一份有序稿件；EPUB 带 nav + ncx，mimetype 首条不压缩），可勾选「只导出当前卷」，导出后可直接打开所在文件夹
- **备份**：整库快照 + manifest 打 zip（`VACUUM INTO` 保证 WAL 一致），列表、从备份恢复（先留恢复前副本再重启）；**每天首次启动自动备份一份**，保留最近 7 份，手动备份永不自动清理；备份面板可「清理旧自动备份」
- **设置页**：提及提示开关、打字机模式开关、自动备份开关与保留份数、数据目录/版本/库体积、立即备份
- 数据安全：WAL、外键级联、迁移前自动备份、`baseHash` 乐观并发

## 尚未实现

- NSIS 安装包的干净机器安装验证（受限环境里安装器静默执行被拦截，当前交付 zip/便携包）。
- P1：大纲看板、时间线、DOCX / PDF 导出、版本 diff 对比。
- macOS / Linux 打包与签名。

规划见 [docs/w1-plan.md](docs/w1-plan.md)、[docs/w2-plan.md](docs/w2-plan.md)、[docs/w3-plan.md](docs/w3-plan.md) 与 [PRD §8 实现状态](PRD.md#8-实现状态v01-交付)。

## 端到端测试（E2E）

```bash
pnpm test:e2e      # 会先构建，再用 Playwright 驱动真实 Electron
```

- 用例在 `tests/e2e/`，每个用例用**仓库内**的临时数据目录（`.e2e-tmp/run-*`，已忽略提交），不用系统 `%TEMP%`——部分 Windows 机器上 Temp 不可写，会让应用报「无法创建数据目录」。
- 需要桌面会话：Electron 在纯无头/远程会话里可能起得来进程但拿不到窗口，此时以本地桌面执行为准。
- 失败的用例会在 `test-results/` 留下上下文。