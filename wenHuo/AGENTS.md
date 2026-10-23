---
doc: agents
title: 文火 · 开发规范
version: 1.1
updated: 2026-10-23
based-on: 技术方案 v1
based-on-date: 2026-10-23
---
## 1. 项目概述

「文火（Wenhuo）」是本地优先的桌面端长篇写作工作台，Electron + React + SQLite 单体桌面应用，无服务端、无账号、无云同步。目标与验收口径见 [PRD.md](PRD.md)，架构与数据模型见 [docs/tech-design.md](docs/tech-design.md)。

### 1.1 技术栈速览

| 层 | 选型 | 约束 |
| --- | --- | --- |
| 容器 | Electron 43.3.0 | 主进程持有全部数据能力 |
| UI | React 19 + TypeScript 5（strict） | 函数组件 + hooks，无 class 组件 |
| 构建 | electron-vite | 不改用手写 webpack |
| 样式 | Tailwind CSS 4 + CSS 变量 token | 不写行内魔法值 |
| 状态 | Zustand 5 | 分 slice，正文不入 store |
| 编辑器 | Tiptap 3 / ProseMirror | 正文唯一真相在编辑器实例 |
| 存储 | better-sqlite3 + WAL + FTS5 | 仅主进程可访问 |
| 测试 | Vitest + Playwright（Electron/CDP） | 见 §3 |
| 打包 | electron-builder（NSIS） | 原生模块需 asarUnpack |

### 1.2 目录职责

```
src/shared/     纯函数与类型，可被 Vitest 直接加载；禁止 import electron / better-sqlite3 / react
src/main/       数据库、文件、导出、备份、IPC handler；禁止 import 渲染层
src/preload/    仅 contextBridge 白名单暴露
src/renderer/   页面与组件；禁止直接访问 fs / db / ipcRenderer
tests/unit/     shared 与 main 模块（临时 SQLite）
tests/e2e/      Playwright Electron
```

依赖方向单向：`renderer → preload → shared`，`main → shared`。任何反向 import 视为错误。

本目录是 [harnessCodes](../README.md) 多项目仓库的子项目，与 `../electricReader` 互不依赖；安装、构建、发布都在本目录内完成，不要在仓库根目录执行 `pnpm install`。

### 1.3 环境与命令

Node ≥ 22，包管理器固定 `pnpm`（禁止 npm/yarn 混用）。

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 启动开发态（主进程改动自动重启，渲染层 HMR） |
| `pnpm build` | 三端构建产物到 `out/` |
| `pnpm typecheck` | `tsc --noEmit`（node + web 两套 tsconfig） |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest 单测 + 集成 |
| `pnpm test:e2e` | Playwright（需先 `pnpm build`） |
| `pnpm rebuild:native` | `electron-rebuild -f -w better-sqlite3` |
| `pnpm dist:win` | 出 NSIS 安装包到 `release/` |

---

## 2. 开发规范

### 2.1 分层铁律

1. **数据库只在主进程**。渲染层拿不到连接，也不接受任何"传 SQL 过来执行"的 IPC。
2. **渲染层不直接调用 `window.api`**，统一经 `src/renderer/api/*` 包装，由它做 `Result` 解包、错误 toast 与日志。
3. **`shared/` 保持纯净**：只放纯函数/类型/常量。它被主进程、渲染层、测试三方加载，一旦引入环境依赖就会全线崩。
4. **业务逻辑不写在组件里**：字数、排序、拆章、导出序列化等必须落在 `shared/` 或 `main/modules/`，组件只负责编排与展示。
5. **`main/modules/*` 导出纯数据层函数**（入参普通对象，返回 `Result`），不接收 `IpcMainInvokeEvent`；handler 层只做字段校验（`asString` / `asRecord` / `asOptionalNumber`）+ 转调 + 日志。

### 2.2 IPC 规范

- 通道命名 `domain:action`，全小写，动词在后：`chapter:save`、`snapshot:restore`、`export:run`。新增通道必须同时更新 `src/shared/ipc.ts`、`preload/index.ts`、tech-design §3.6 表格。
- 所有 handler 用统一包装器，禁止裸 `ipcMain.handle`：

```ts
// src/main/ipc/guard.ts
export function handle<O>(
  channel: string,
  logger: Logger,
  fn: (payload: unknown) => O | Promise<O>,
): void {
  ipcMain.handle(channel, async (_event, payload: unknown): Promise<Result<O>> => {
    try {
      return ok(await fn(payload));
    } catch (error) {
      logger.error(`ipc ${channel} failed`, error);
      return err(toErrorCode(error), toResultMessage(error));
    }
  });
}
```

- 入参由各 handler 用 `asRecord` / `asString` / `asOptionalString` / `asOptionalNumber` 逐字段校验，缺失或类型不符抛 `AppError('INVALID_ARGUMENT')`。
- **返回值恒为 `Result<T>`**，绝不 `throw` 跨进程；渲染层错误提示用 `error.message`（已是中文可展示文案），技术细节只进日志。
- 路径一律由 `createAppPaths()` / `projectDataDir()` 推导，不接受渲染层传入的绝对路径；项目 id 由主进程生成。
- 渲染层不得使用 `ipcRenderer`、`remote`、`nodeIntegration` 相关能力。

### 2.3 数据访问与迁移

- 所有写操作必须在事务中完成（`db.transaction(fn)`），一次用户动作 = 一次事务。
- 保存章节必须同一事务内更新：`chapters`（content/plain_text/word_count/content_hash/updated_at）、`projects.updated_at`、`writing_sessions` 增量。
- **迁移只增不改**：新增 `src/main/db/migrations/NNN_描述.sql`，同步更新 `migrate.ts` 的期望版本号与单测。禁止修改已发布迁移文件，禁止写回滚脚本。
- 新增查询必须带索引；`EXPLAIN QUERY PLAN` 出现 `SCAN` 于大表即视为缺陷。
- 时间戳一律 UTC 毫秒整数；"今日"用 `shared/date-key.ts` 的本地 `date_key`，禁止用 `Date.now()` 直接比较日期。
- SQL 关键字大写，表名列名 `snake_case`，语句用模板字符串多行书写并保持可读。

### 2.4 状态管理

- Zustand store 只存：当前项目/章节 id、卷章树、保存状态、UI 面板开关、筛选条件。
- **正文绝不进 store**。正文在 Tiptap 实例内，保存时读取快照。禁止 `onUpdate` 里 `set({content})`。
- store action 负责调 `api/` 层，组件不直接拼装 IPC 参数。
- 派生数据（总字数、进度）用 selector 计算，不重复存。

### 2.5 文件与命名

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 文件/目录 | 全部 `kebab-case` | `chapter-tree.tsx`、`word-count.ts` |
| React 组件导出 | `PascalCase`，具名导出（除路由 lazy 需要） | `export function ChapterTree()` |
| 函数/变量 | `camelCase` | `buildManuscript` |
| 类型/接口 | `PascalCase`，不加 `I` 前缀 | `ExportRequest` |
| 常量 | `UPPER_SNAKE_CASE` | `AUTOSAVE_DEBOUNCE_MS` |
| 数据库 | `snake_case` | `writing_sessions` |
| IPC 通道 | `domain:action` | `world:backlinks` |
| CSS 类（自定义部分） | `wh-` 前缀 + kebab | `wh-prose` |

### 2.6 Git 与提交

- 分支：`main` 保持可构建可测试；功能分支 `feat/<scope>`，修复 `fix/<scope>`。
- 提交信息遵循 Conventional Commits，scope 取目录名：`feat(editor): 支持打字机模式`、`fix(db): 迁移失败时恢复副本`、`test(export): 补 EPUB 结构断言`。
- 一次提交只做一件事；不提交 `out/`、`release/`、`*.db`、`node_modules/`、测试产生的临时目录。
- 破坏性改动（迁移、IPC 契约）必须在提交正文说明兼容性与操作步骤。

### 2.7 完成定义（DoD）

一次改动只有在以下全部满足时才算完成：

1. `pnpm typecheck`、`pnpm lint`、`pnpm test` 全绿。
2. 新增/改动逻辑有对应测试（见 §3.1）；改 schema 必须附迁移测试。
3. 改 IPC 契约同步更新 `shared/ipc.ts`、preload、tech-design §3.6。
4. 用户可见行为有中文文案，空态/加载态/错误态齐全（不只做"快乐路径"）。
5. 涉及自动保存、导出、迁移的改动，手工跑一次对应场景（E2E 或真机）。

---

## 3. 测试要求

### 3.1 必须写单元测试的部分

| 目标 | 必须覆盖 |
| --- | --- |
| `shared/word-count.ts` | 纯中文、中英混排、全角字母数字、Emoji、纯标点、空串、超长文本 |
| `shared/sort-order.ts` | 首插、尾插、中间插、相邻差值过小触发重排、跨卷移动 |
| `shared/split-chapters.ts` | 章节正则、`##` 标题、空行分章、无匹配（整篇一章）、异常标题 |
| `shared/date-key.ts` | 跨零点、跨月、连续天数（含今天未写、昨天断档） |
| `main/db/migrate.ts` | 空库→v1、v1→v2、迁移失败回滚、重复执行幂等 |
| `main/modules/snapshot` | 内容相同不重复落库、保留策略裁剪、恢复为覆盖式且不自动写 `pre_restore`、旧 `pre_restore` 可清理 |
| `main/modules/search` | 3 字以上走 FTS、1–2 字走 LIKE、结果分组、特殊字符不报错 |
| `main/modules/export` | TXT/MD/EPUB 的章节顺序、标题层级、总字数一致性（golden 结构断言） |
| `main/modules/backup` | zip 内容清单、manifest 字段、恢复后数据完整 |

### 3.2 集成测试

- 使用 `better-sqlite3` 临时文件库（`tests/unit/helpers/temp-db.ts` 建库 + 跑迁移 + 结束后删除），不 mock 数据库。
- 每个 `modules/*` 至少 1 条「写入 → 读取 → 事务回滚」用例。
- 触发器（FTS 同步）必须有测试：新增、修改标题、修改正文、删除章节后 `search_index` 行数与内容正确。

### 3.3 E2E（Playwright Electron，当前 10 条）

1. 新建项目 → 建卷章 → 中文输入 → 自动保存 → 重启后内容还在。
2. 写 3 章 → 搜索中文关键词 → 跳转到命中位置。
3. 手动快照 → 修改正文 → 恢复快照 → 内容回到旧版（覆盖式，不自动留档）。
4. 导入 TXT → 拆章预览 → 确认导入 → 导出 EPUB → 文件存在且目录有序。
5. 删除项目 → 记录与附件目录清理。
6. 强杀进程 → 重启 → 恢复提示 → 恢复内容正确。
7. 查找替换：分割线之后把 2 个字替换成 1 个字，从第一个字开始替换。
8. 查找替换：分割线下方的文字也能替换。
9. 章节标记为已完成后，正文不能再输入。
10. 设置页显示数据目录与备份选项。

E2E 规则：

- 每个用例用独立临时 userData 目录（`--user-data-dir`），跑完清理，用例之间不共享状态。
- 断言面向用户可见结果（文本、文件存在、字数），不断言内部实现或 class 名。
- 涉及重启/强杀的用例必须真正结束进程再启动，不用 mock。
- 中文输入必须额外覆盖 composition 路径（派发 `compositionstart/update/end`），断言无重复字符。

### 3.4 性能验收（W4 执行，回归时抽测）

| 指标 | 阈值 | 测法 |
| --- | --- | --- |
| 启动到书架可交互 | < 1.5s | 冷启动 + 50 万字演示项目 |
| 切换章节 | < 200ms | 连切 20 次取 P95 |
| 搜索（3 字以上） | < 300ms | 50 万字项目，P95 |
| 今日字数查询 | < 50ms | 直接调用 `stats:overview` |
| 章节树滚动 | ≥ 55fps | 300 章，DevTools 帧率 |

超阈值不得"留着以后优化"：要么当次修复，要么在 PR 中记录原因与后续任务。

### 3.5 提交前门禁

```bash
pnpm typecheck && pnpm lint && pnpm test
```

涉及 schema / IPC / 导出时额外跑 `pnpm test:e2e`。CI（或本地等价脚本）不得跳过任何一项。

### 3.6 测试数据

- 拆章、字数、导出等用例的 fixture 在测试代码里现场构造（`tests/unit/helpers/docs.ts`、各测试内的文本常量），不提交二进制样本。
- 不提交真实用户稿件；性能演示项目由 `scripts/seed-perf-project.cjs` 生成到临时数据目录。
- goldens 只比较结构摘要（章数、顺序、标题层级、总字数），不比字节，避免时间戳抖动。

---

## 4. 代码风格

### 4.1 TypeScript

- `strict: true`、`noUncheckedIndexedAccess: true`、`noImplicitOverride: true`、`exactOptionalPropertyTypes: true`。
- **禁止 `any`**；确需逃逸用 `unknown` + 类型守卫，或局部 `// eslint-disable` 并写明理由。
- 对外导出的函数必须显式标注返回类型；内部可推断。
- 用 `type` 而非 `interface` 表示联合/映射，用 `interface` 表示可扩展对象；同一文件保持一致。
- 用 `satisfies` 约束字面量配置，保留推导。

### 4.2 格式

- Prettier：2 空格缩进、单引号、`semi: true`、`printWidth: 100`、`trailingComma: all`。
- ESLint flat config，规则冲突以 Prettier 为准；提交前格式化，不把格式修复混进功能提交。
- import 顺序：node 内置 → 第三方 → `@shared` → `@main`/`@renderer` → 相对路径 → 样式；组间空行。

### 4.3 React

- 函数组件 + hooks；组件文件单一导出，超过 200 行考虑拆分。
- 组件只做编排与渲染，副作用集中到 hooks（`use-auto-save`、`use-chapter-tree`）。
- 列表必须稳定 `key`（用业务 id，不用数组下标）。
- 图标按钮必须有 `aria-label`；全局快捷键集中在 `renderer/src/app.tsx` 注册，容器级快捷键就近注册，禁止同一组合键在多处重复绑定。
- 编辑器的 `onUpdate` 只做「置 dirty + 计时」，不做 setState 触发重渲染。

### 4.4 样式

- Tailwind 类优先；颜色/字号/间距/圆角必须取自 `styles/index.css` 的 CSS 变量，不写死 `#hex`、`px` 魔法值。
- 正文排版统一在 `styles/index.css` 的正文样式段：衬线字体、行高 1.8、首行缩进 2em、版心宽度可配；不允许在组件里单独覆盖正文段样式。
- 视觉基调：暖色纸张背景、低对比度工具栏、克制的动效（≤ 150ms）。

### 4.5 文案与注释

- 界面文案中文，标点用全角；数字、代码、单位用半角；术语首次出现可附英文（如「快照（Snapshot）」）。
- 错误提示必须说清"发生了什么 + 用户能做什么"，例如「保存失败，已保留草稿，请检查磁盘空间后重试」。
- 注释解释**为什么**，不解释代码在做什么；复杂算法（稀疏排序、trigram 兜底、EPUB 打包顺序）必须留一段说明。
- 不留 `TODO` 裸标记，统一写成 `// TODO(owner): 原因 + 触发条件`。

### 4.6 错误处理

- 主进程：捕获后转 `Result`，日志带 `channel` 与上下文，不打印正文。
- 渲染层：`api/` 层统一处理 `ok:false`，先 toast 再决定是否中断流程；不允许空 `catch {}`。
- 用户可恢复的错误（保存失败、导出失败）必须给重试入口；不可恢复的（迁移失败、原生模块加载失败）给出明确操作指引。

---

## 5. 注意事项

以下为已知高频坑，写代码前后都要对照检查。

- **A-01 中文输入法**：拼音组合期间禁止触发保存与任何重渲染。必须同时检查 `isComposing` 与 `editor.view.composing`；`compositionend` 之后才允许置 dirty。
- **A-02 自动保存不能回灌正文**：保存只做「编辑器 → 数据库」单向写，禁止把库内容 `setContent` 回编辑中的实例，否则光标与输入法状态会被打断。
- **A-03 切章先 flush**：销毁编辑器实例前必须 `await flush()`，`onDestroy` 里不要再触发保存（会把空文档写回去）。
- **A-04 FTS5 中文短词**：`trigram` 无法匹配 1–2 个字符，必须走 LIKE 兜底；新写搜索逻辑时先确认字符数分支。
- **A-05 快照会撑库**：自动快照必须 hash 去重 + 限频 + 保留上限，禁止"每次保存都打快照"。
- **A-06 原生模块**：`better-sqlite3` 与 Electron ABI 必须匹配；升级 Electron 或 Node 后立刻 `pnpm rebuild:native` 并跑 `pnpm dist:win`。
- **A-07 导出要有结构测试**：能导出 ≠ 导对；EPUB 的 `mimetype` 必须是首个且无压缩条目，`nav.xhtml` 顺序必须与卷章树一致。
- **A-08 范围冻结**：P0 清单之外的任何功能进 backlog，不在收口周开工；新增功能前先确认 PRD 是否已升版。
- **A-09 大项目别做全表扫描**：书架、统计、搜索、字数一律走索引或聚合；新增查询先看执行计划。
- **A-10 删除不可轻率**：删除项目/卷/章前必须二次确认并先备份；删除设定卡要清理 `chapter_links`。
- **A-11 时区**：时间戳存 UTC 毫秒，展示与"今日"按本地时区；跨零点统计必须用 `date_key`，不要用 `now - 24h`。
- **A-12 离线优先**：不引入任何运行时网络请求；确需联网的能力（未来 AI/投稿）必须走显式开关且默认关闭。
- **A-13 不收集内容**：日志、崩溃报告、遥测一律不得包含正文；只允许记录长度、hash 前缀、章节 id。
- **A-14 Windows 路径**：用 `path.join` 与 `app.getPath`，禁止手拼 `\\`；中文路径（含用户名带中文）必须在 E2E 中覆盖一次。
- **A-15 渲染层别存正文**：把正文放进 Zustand 会导致每次按键全树重渲染，是本项目最容易造成"越写越卡"的写法。

---

## 6. 约束与假设

- 【假设】开发与交付环境为 Windows 10/11 x64，Node ≥ 22，pnpm 为唯一包管理器；CI 与本地使用相同 Node 大版本。
- 【假设】单人全职开发，周期 5 周（4 周功能 + 1 周缓冲），无专职测试与设计；因此 §3.5 的门禁必须本地自觉执行。
- 【假设】代码仓库为多项目仓库，本目录是独立子项目、单一 `package.json`，不做 monorepo workspace 拆分；`src/shared` 通过路径别名 `@shared` 引用。
- 【假设】不引入 UI 组件库（如 Ant Design / shadcn），基础组件在 `components/ui` 内自建，避免包体与样式体系冲突。
- 【假设】数据库 schema 演进通过 `PRAGMA user_version` 迁移完成，历史版本只向前兼容，不保证回滚。
- 【假设】应用不联网，因此不实现自动更新、埋点、崩溃上报；日志仅落本地。
- 【假设】首版只保证 Windows 安装包可用，代码保持跨平台但不在 macOS 上验证。
- 【推断】若 `trigram` 分词在打包后的 SQLite 中不可用，将降级为应用层二元组索引；相关开关需集中在 `main/modules/search`，不得散落到业务代码。
- 【推断】随项目增大，`snapshots` 表会成为体积主因；若单库超过 2GB，需先执行保留策略清理而不是直接换存储引擎。
- 【推断】`before-quit` 中的异步 flush 需要 `preventDefault` 后二次 `app.quit()`，否则关闭窗口会丢最后一次保存。
- 【推断】单测覆盖率 70% 的口径只统计 `src/shared` 与 `src/main/modules`，UI 组件不计入，避免为凑数写无意义快照测试。
- 【推断】E2E 在 CI 上跑 Electron 需要图形环境；若无头运行受限，则以本地执行为准并在 PR 中附运行记录。
