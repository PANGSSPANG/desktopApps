# W1 任务清单 · Walking Skeleton

目标：**建项目 → 建卷章 → 写字 → 保存 → 重启恢复 → 导出 TXT**，一条真实纵向链路跑通，且第一周就验证原生模块与打包可行性。

验收命令：

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

## 一、工程骨架

- [x] `package.json` / `pnpm-workspace.yaml`（原生依赖白名单）
- [x] `electron.vite.config.ts`（主 / 预加载 / 渲染三端 + 别名）
- [x] `tsconfig.json` / `tsconfig.node.json` / `tsconfig.web.json`（strict 全开）
- [x] `.prettierrc.json` / `eslint.config.mjs`
- [x] `electron-builder.yml`（asarUnpack 原生模块）
- [x] `src/types/globals.d.ts`（`?raw` 模块声明）
- [x] ESLint 基础规则（typescript-eslint recommended + 禁 `any`）
- [ ] ESLint 规则补严（react-hooks、import 顺序）
- [ ] CI 脚本（等价 `pnpm typecheck && lint && test`）

## 一·五、W1 验收结果

| 检查 | 结果 |
| --- | --- |
| `tsc -p tsconfig.node.json` | 0 错误 |
| `tsc -p tsconfig.web.json` | 0 错误 |
| `eslint . --max-warnings 0` | 0 error / 0 warning |
| `vitest run` | 8 文件 / 50 用例全绿 |
| `electron-vite build` | 三端构建成功 |
| `electron scripts/db-smoke.cjs` | schema、FTS5(trigram)、聚合、级联删除正常 |
| GUI 启动（`pnpm dev:local`） | Electron 存活、`wenhuo.db` 建成并迁移到 v1、dev server 200 |

## 二、数据层

- [x] `paths.ts`：userData 下的 db / projects / logs / drafts / recovery
- [x] `db/connection.ts`：WAL、synchronous=NORMAL、外键、busy_timeout
- [x] `db/migrations/001_init.sql`：projects / volumes / chapters / entities / chapter_links / snapshots / writing_sessions / settings / search_index（FTS5 trigram + 触发器）
- [x] `db/migrate.ts`：`user_version` 逐版本、单迁移事务、失败回滚
- [x] 启动时迁移前备份旧库到 `recovery/`
- [x] `modules/project.ts`：列表（聚合字数/章数/进度）、创建（自带第一卷第一章）、重命名、删除（级联 + 清附件目录）
- [x] `modules/manuscript.ts`：卷章树、建卷、建章、改名、删除
- [x] `modules/chapter.ts`：读取、保存（事务 + 字数 + hash + 会话增量）、元信息 patch
- [x] `modules/stats.ts`：全书/今日字数、连续天数、完成章数
- [x] `modules/export-txt.ts`：`buildTxt` 纯函数 + 写文件
- [x] 导出目录自动避让不可写位置（`isDirWritable` 真实写探测）、文件名清洗、导出后「打开所在文件夹」

## 三、进程与契约

- [x] `shared/result.ts` + `shared/errors.ts`：`Result<T>`、错误码、中文文案、`AppError`
- [x] `shared/ipc.ts`：通道常量 + `WenhuoApi` 类型（主/预加载共用）
- [x] `main/ipc/guard.ts`：统一 `handle` 包装（捕获 → 日志 → Result）
- [x] `main/ipc/handlers.ts`：15 个通道
- [x] `preload/index.ts`：contextBridge 白名单
- [x] `main/window.ts`：contextIsolation + sandbox + 无 nodeIntegration、拒绝导航与新窗口
- [x] `main/index.ts`：迁移前备份、单实例锁失败不阻断启动、`WENHUO_USER_DATA` 覆盖数据目录
- [x] `scripts/ensure-electron.cjs`：postinstall 自愈（防 pnpm 跳过 electron 安装脚本）
- [x] `scripts/dev-local.cjs`：受限环境启动器（`NO_SANDBOX=1` + 仓库内 `.appdata`）
- [ ] 生产态 CSP（`onHeadersReceived`）
- [ ] IPC 入参 zod 校验（当前为手写类型守卫）

## 四、渲染层

- [x] 书架：项目卡片、新建对话框、空态、进度条
- [x] 三栏工作台：顶栏（项目名/保存状态/今日字数/导出）、左栏卷章、中央编辑器、右栏章节信息、底栏统计
- [x] Tiptap 编辑器：StarterKit、粗体/斜体/引用/分隔线、中文排版
- [x] 自动保存：800ms 防抖、`compositionstart/end` 门控、失焦/关闭前 flush、切章前 flush
- [x] 保存状态可见：未保存 / 保存中 / 已保存 HH:mm / 保存失败
- [x] 章节状态与摘要编辑
- [ ] 拖拽排序、章节复制、删除确认
- [ ] 专注模式 / 打字机模式（W4）
- [ ] 快捷键与命令面板（W4）

## 五、测试

- [x] `word-count`：中文、混排、全角、Emoji、纯标点、连字符
- [x] `sort-order`：首插/尾插/中间插、间隔过小、重排
- [x] `date-key`：本地日期键、跨月跨年、连续天数四种情形
- [x] `migrate`：空库→v1、幂等、核心表存在、外键级联
- [x] `chapter-save`：字数回写、今日增量、负增量、`baseHash` 冲突
- [x] `export-txt`：卷章顺序、BOM、CRLF、标题齐全
- [ ] E2E（Playwright Electron，6 条，W4）
- [ ] 性能基线测量（50 万字项目，W4）

## 六、打包

- [ ] `pnpm dist:win` 出包并在干净目录安装验证
- [ ] 安装后启动校验：DB 落在 userData、原生模块正常加载

## 七、W1 遗留决策

1. **原生模块 ABI**：`better-sqlite3` 13 提供 N-API 预编译产物，Node 与 Electron 共用同一份二进制，实测 Electron 主进程可直接加载，因此不需要 `electron-rebuild`；`pnpm rebuild:native` 仅作为预编译缺失时的兜底。
2. **schema 粒度**：v1 已包含 entities / snapshots / search_index，虽然 W1 未全部接入，但保持与《技术方案》一致，避免后续改表。
3. **锁文件**：本次初始化在受限网络与沙箱环境完成，最终已用 pnpm 重装（`pnpm-lock.yaml` + pnpm 虚拟目录），并把 registry 指向镜像；受限网络下可继续用镜像。
4. **启动环境差异**：本机终端不允许 Chromium 原生沙箱初始化，且 `%APPDATA%` 下无法创建文件。主进程因此支持 `WENHUO_USER_DATA` 覆盖数据目录、单实例锁失败不再阻断启动；受限终端用 `pnpm dev:local`，正式环境仍用 `pnpm dev`。
5. **Electron 安装脚本**：pnpm 默认不跑依赖 postinstall，已在根 `postinstall` 里加 `scripts/ensure-electron.cjs` 做自愈（已实测：删掉 `path.txt` 后能自动补回）。
