---
doc: tech-design
title: 文火 · 桌面端长篇写作工作台技术方案
version: 1.1
updated: 2026-10-23
based-on: PRD v1.1
based-on-date: 2026-10-23
---
## 1. 技术栈

### 1.1 选型总表

| 层 | 选型 | 版本 | 用途 | 备注 |
| --- | --- | --- | --- | --- |
| 运行时 | Electron | 43.3.0 | 桌面容器 | 主进程承载数据与文件能力 |
| UI | React | 19.x | 渲染层 | 并发特性可用，不做 SSR |
| 语言 | TypeScript | 5.x | 全量 | `strict: true`，`noUncheckedIndexedAccess` 开启 |
| 构建 | electron-vite | 6.0.0 | 主/预加载/渲染三端构建 | 开发期 HMR 仅作用于渲染层 |
| 样式 | Tailwind CSS | 4.3.3 | 视觉系统 | 设计 token 走 CSS 变量 |
| 状态 | Zustand | 5.x | 渲染层状态 | 分 slice，编辑器正文不入 store |
| 编辑器 | Tiptap / ProseMirror | 3.32 | 正文编辑 | StarterKit + 自定义中文排版扩展 |
| 数据库 | better-sqlite3 | 13.0.3 | 本地存储 | N-API 预编译，同步 API，仅主进程使用 |
| 搜索 | SQLite FTS5 | 随 SQLite | 全文检索 | `trigram` 分词 + LIKE 兜底 |
| 压缩 | fflate | 0.8.x | EPUB / 备份 zip | 纯 JS，无原生依赖 |
| DOCX（P1） | docx | 9.x | DOCX 导出 | 纯 JS，首版未引入 |
| 测试 | Vitest | 5.0.5 | 单元/集成 | Node 环境直连临时 SQLite |
| E2E | Playwright（CDP） | 1.64.1 | 端到端 | 驱动真实 Electron 进程，串行 |
| 打包 | electron-builder | 26.x | NSIS 安装包 | 需处理原生模块 |
| 日志 | 自研 `main/logger.ts` | — | 主进程日志 | 5MB 轮转，写入永不抛异常 |

### 1.2 进程职责

| 进程 | 职责 | 禁止 |
| --- | --- | --- |
| 主进程 | SQLite 连接与迁移、项目/卷章/设定/快照/搜索/统计、导出、备份、文件对话框、窗口生命周期 | 不做 UI 渲染；导出按卷/章分片并 `await` 让出事件循环 |
| 预加载 | `contextBridge` 暴露白名单 API，`Result<T>` 解包 | 不暴露原始 `ipcRenderer`、不暴露 `require` |
| 渲染层 | 三栏工作台、编辑器、纯前端状态与交互 | 不直接访问文件系统/数据库，不出现 `window.api` 之外的通道 |

### 1.3 安全基线

- `webPreferences`: `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`、`preload` 显式指定。
- 渲染层 HTML 设 CSP：`default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'`，禁 `eval`。
- `will-navigate` 与 `setWindowOpenHandler` 一律拒绝，外部链接经 `shell.openExternal` 二次确认。
- IPC 只接受注册表中的通道名，入参用 zod 校验；路径类参数必须经 `resolveInside(base, p)` 校验，禁止越出用户数据目录。

---

## 2. 项目结构

```
wenhuo/
├─ package.json
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ tsconfig.json / tsconfig.node.json / tsconfig.web.json
├─ vitest.config.ts
├─ playwright.config.ts
├─ docs/                          # tech-design.md 等
├─ build/                         # 图标、安装器资源
├─ src/
│  ├─ shared/                     # 主/渲染共用，纯函数与类型，禁止 import electron
│  │  ├─ result.ts                # Result<T>、ok/err、错误码
│  │  ├─ errors.ts                # ERROR_CODES 枚举 + 中文文案映射
│  │  ├─ types.ts                 # Project/Volume/Chapter/Entity/Snapshot/...
│  │  ├─ ipc.ts                   # 通道常量 + WenhuoApi 类型
│  │  ├─ word-count.ts            # 中英文计数（唯一实现）
│  │  ├─ sort-order.ts            # 稀疏序号插入与重排
│  │  ├─ project-type.ts          # ProjectTypeProfile 配置
│  │  ├─ split-chapters.ts        # TXT/MD 拆章规则（纯函数）
│  │  ├─ editor-doc.ts            # ProseMirror JSON ↔ 纯文本
│  │  └─ date-key.ts              # 本地日期键、连续天数计算
│  ├─ main/
│  │  ├─ index.ts                 # app 生命周期、单实例锁、窗口创建
│  │  ├─ window.ts                # BrowserWindow 工厂与安全选项
│  │  ├─ paths.ts                 # userData 下的目录约定
│  │  ├─ logger.ts
│  │  ├─ db/
│  │  │  ├─ connection.ts         # 打开库、PRAGMA、关闭
│  │  │  ├─ migrate.ts            # user_version 迁移执行器
│  │  │  └─ migrations/
│  │  │     └─ 001_init.sql
│  │  ├─ modules/               # 扁平模块，每个文件一个领域
│  │  │  ├─ project.ts          # 书架、创建、重命名、删除
│  │  │  ├─ manuscript.ts       # 卷章树、排序、移动
│  │  │  ├─ manuscript-content.ts # 树 + 章节正文的聚合读取
│  │  │  ├─ chapter.ts          # 读取、保存、正文与字数
│  │  │  ├─ content-hash.ts     # 正文 hash 与乐观并发
│  │  │  ├─ snapshot.ts         # 自动/手动快照、保留策略、恢复
│  │  │  ├─ search.ts           # FTS 写入、查询、LIKE 兜底
│  │  │  ├─ world.ts            # 设定卡、章节关联、反向引用
│  │  │  ├─ stats.ts            # 今日字数、连续天数、进度
│  │  │  ├─ prefs.ts            # 应用偏好（提及提示、打字机、自动备份）
│  │  │  ├─ export.ts           # 导出编排与文件名
│  │  │  ├─ export-txt.ts / export-markdown.ts / export-epub.ts
│  │  │  └─ import.ts           # TXT/MD 导入、拆章预览与事务落库
│  │  ├─ ipc/
│  │  │  ├─ handlers.ts         # 注册全部 handler
│  │  │  └─ guard.ts            # 包装：Result 化 + 日志 + 字段校验工具
│  │  └─ services/
│  │     ├─ draft-journal.ts    # 草稿日志落盘、扫描与清扫
│  │     ├─ auto-backup.ts      # 每日首次启动自动备份
│  │     └─ backup.ts           # zip 备份、恢复与恢复前副本
│  ├─ preload/
│  │  └─ index.ts                 # contextBridge 暴露 typed api
│  └─ renderer/
│     ├─ index.html
│     ├─ main.tsx / App.tsx / router.tsx
│     ├─ features/
│     │  ├─ bookshelf/  workspace/  editor/  world/
│     │  └─ search/  snapshot/  import/  backup/  recovery/  settings/
│     ├─ components/               # confirm-dialog / scroll-area
│     ├─ api/                      # 包装 window.api，统一错误提示
│     ├─ store/                    # zustand workspace store
│     └─ styles/index.css          # Tailwind 入口 + CSS 变量 token
└─ tests/
   ├─ unit/                       # shared 纯函数 + main modules（临时库）
   ├─ unit/helpers/               # temp-db.ts / docs.ts
   ├─ e2e/                        # Playwright Electron（10 条）
   └─ perf/                       # UI 性能用例
```

约定：

- `shared/` 不得 `import 'electron'` 与 `import 'better-sqlite3'`，保证可被 Vitest 直接加载。
- 每个 `modules/*` 导出「纯数据层函数」，IPC handler 只做校验与转调，便于测试不启动 Electron。
- 渲染层不直接 `import` `main/`。

---

## 3. 数据模型

### 3.1 存储位置

```
%APPDATA%\wenhuo\
├─ wenhuo.db              # 全项目共用一库，WAL
├─ wenhuo.db-wal / -shm
├─ logs\main.log
├─ drafts\<chapterId>.jsonl   # 崩溃恢复日志
├─ recovery\              # 恢复时的旧库副本
└─ projects\<projectId>\
   ├─ attachments\        # 头像、附件
   └─ backups\<ts>.zip    # 自动备份
```

单库多项目：书架需要跨项目聚合（总字数、最近编辑），分库会导致每次启动打开 N 个连接，故统一为一个库，用 `project_id` 隔离。

### 3.2 schema v1（迁移 `001_init.sql`）

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT '',
  genre         TEXT NOT NULL DEFAULT 'webnovel'
                CHECK (genre IN ('webnovel','novel','nonfiction')),
  synopsis      TEXT NOT NULL DEFAULT '',
  target_words  INTEGER NOT NULL DEFAULT 0,
  daily_goal    INTEGER NOT NULL DEFAULT 0,
  cover_path    TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX idx_projects_recent ON projects(deleted_at, updated_at DESC);

CREATE TABLE volumes (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  sort_order REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_volumes_project ON volumes(project_id, sort_order);

CREATE TABLE chapters (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  volume_id    TEXT NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
  plain_text   TEXT NOT NULL DEFAULT '',
  word_count   INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','revising','done')),
  synopsis     TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  sort_order   REAL NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_chapters_volume ON chapters(volume_id, sort_order);
CREATE INDEX idx_chapters_recent ON chapters(project_id, updated_at DESC);

-- 人物/地点/组织/物品统一为实体表（对应原文 characters + locations）
CREATE TABLE entities (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL
              CHECK (kind IN ('character','location','organization','item')),
  name        TEXT NOT NULL,
  alias       TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT '',
  profile_json TEXT NOT NULL DEFAULT '{}',
  search_text TEXT NOT NULL DEFAULT '',   -- 派生列：name+alias+role+结构化描述扁平化
  avatar_path TEXT,
  sort_order  REAL NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_entities_project ON entities(project_id, kind, name);

CREATE TABLE chapter_links (
  id          TEXT PRIMARY KEY,
  chapter_id  TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'entity',
  entity_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (chapter_id, entity_type, entity_id)
);
CREATE INDEX idx_links_entity ON chapter_links(entity_type, entity_id);

CREATE TABLE snapshots (
  id           TEXT PRIMARY KEY,
  chapter_id   TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('manual','auto','pre_restore')),
  content_json TEXT NOT NULL,
  plain_text   TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  word_count   INTEGER NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_snapshots_chapter ON snapshots(chapter_id, created_at DESC);
-- 同章同内容同类型只允许一条自动快照，天然去重
CREATE UNIQUE INDEX uq_snapshots_auto_dedupe
  ON snapshots(chapter_id, content_hash) WHERE kind = 'auto';

CREATE TABLE writing_sessions (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  date_key      TEXT NOT NULL,            -- 本地日期 'YYYY-MM-DD'
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER NOT NULL,
  words_written INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, date_key)
);
CREATE INDEX idx_sessions_project_date ON writing_sessions(project_id, date_key DESC);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE search_index USING fts5(
  ref_type   UNINDEXED,   -- 'chapter' | 'entity'
  ref_id     UNINDEXED,
  project_id UNINDEXED,
  title,
  body,
  tokenize = 'trigram'
);
```

同步触发器（章节）：

```sql
CREATE TRIGGER trg_chapters_ai AFTER INSERT ON chapters BEGIN
  INSERT INTO search_index(ref_type, ref_id, project_id, title, body)
  VALUES ('chapter', new.id, new.project_id, new.title, new.plain_text);
END;

CREATE TRIGGER trg_chapters_au AFTER UPDATE OF title, plain_text ON chapters BEGIN
  DELETE FROM search_index WHERE ref_type = 'chapter' AND ref_id = old.id;
  INSERT INTO search_index(ref_type, ref_id, project_id, title, body)
  VALUES ('chapter', new.id, new.project_id, new.title, new.plain_text);
END;

CREATE TRIGGER trg_chapters_ad AFTER DELETE ON chapters BEGIN
  DELETE FROM search_index WHERE ref_type = 'chapter' AND ref_id = old.id;
END;
```

实体触发器同形（`body` 取 `entities.search_text`，`title` 取 `name`），delete 时同时清理 `chapter_links`。

### 3.3 与原文档模型的差异（决策记录）

| 原文档 | 本方案 | 原因 |
| --- | --- | --- |
| `characters` + `locations` 两张表 | `entities` 单表 + `kind` | P0 要人物/地点/组织/物品四类，字段几乎同构；`chapter_links` 是多态关联，单表才能保证外键与反向查一致 |
| `chapters` 仅有 `volume_id` | 增加 `project_id` | 全书字数、搜索、统计都按项目过滤，避免每层 join 回 projects |
| 无 `content_hash` | 增加该列 | 自动快照去重、跳过无变化保存 |
| `timeline_events` | 移入迁移 `002`（P1） | 首版不做时间线 UI，避免空表与未验证字段进 v1 |
| 无 `date_key` | `writing_sessions.date_key` | 今日字数与连续天数按日聚合，避免每次扫时间戳 |

### 3.4 迁移策略

- 版本号用 `PRAGMA user_version`，迁移文件命名 `NNN_描述.sql`，顺序执行。
- 执行前：`wal_checkpoint(TRUNCATE)` 后把 `wenhuo.db` 复制到 `recovery/pre-migrate-v<ver>-<ts>.db`。
- 单个迁移在事务内执行；失败则回滚并恢复副本，向用户报 `DB_MIGRATION_FAILED` 并退出到书架空态。
- 迁移后 `PRAGMA user_version = N`；只增不改，永不写 `DOWN` 脚本。

### 3.5 连接参数

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store   = MEMORY;
PRAGMA cache_size   = -16000;  -- 约 16MB
```

### 3.6 IPC 通道清单

所有通道返回 `Result<T>`，`ok:false` 时 `error.code` 为 `ERROR_CODES` 之一，`message` 为中文可展示文案。

| 域 | 通道 | 返回 / 说明 |
| --- | --- | --- |
| 项目 | `project:list` / `project:create` / `project:rename` / `project:delete` / `project:open` | 书架摘要、创建（含默认卷）、重命名、删除、打开 |
| 卷 | `volume:create` / `volume:delete` / `volume:move` | 返回新 `VolumeTree`；`move` 接收 `beforeVolumeId` |
| 章 | `chapter:create` / `chapter:get` / `chapter:save` / `chapter:patch` / `chapter:move` / `chapter:rename` / `chapter:delete` | `save` 返回 `SaveChapterResult`（字数、保存时间、当日增量） |
| 卷章树 | `manuscript:tree` | 卷 + 章（字数 / 状态 / 排序） |
| 快照 | `snapshot:list` / `snapshot:get` / `snapshot:create` / `snapshot:delete` / `snapshot:clear-legacy` / `snapshot:restore` | 列表不返回正文；`restore` 为覆盖式 |
| 搜索 | `search:query` | 分组结果 + 上下文片段 |
| 设定 | `world:list` / `world:get` / `world:save` / `world:delete` / `world:for-chapter` / `world:link` / `world:unlink` / `world:backlinks` | 保存时重建 `search_text` |
| 统计 | `stats:overview` | 今日 / 目标 / 连续天数 / 总量 |
| 导出 | `export:run` | `txt` / `md` / `epub`，可选 `volumeId` |
| 导入 | `import:pick` / `import:preview` / `import:commit` | 预览只读文件，commit 单事务落库 |
| 备份 | `backup:create` / `backup:list` / `backup:pick` / `backup:restore` / `backup:prune-auto` | 恢复前先复制现状到 `recovery/` |
| 草稿 / 恢复 | `draft:stash` / `draft:clear` / `recovery:restore` / `recovery:discard` | 崩溃恢复候选的读写 |
| 应用 | `app:bootstrap` / `app:info` / `prefs:get` / `prefs:set` | 启动一次性初始化、版本与数据目录 |

---

## 4. 关键技术点

### 4.0 关键设计决策

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D-01 | 单库多项目 + 项目目录仅存附件与备份 | 书架聚合查询与快照跨项目统计都只需一个连接 |
| D-02 | 实体单表 `entities` + `kind` | 四类设定同构，多态关联只需一种外键 |
| D-03 | 正文双存：`content_json`（权威）+ `plain_text`（派生） | 搜索、字数、导出都基于纯文本，避免反复解析 JSON |
| D-04 | 字数由 `shared/word-count.ts` 单点计算 | 编辑器、保存、导入、导出四处口径必须一致 |
| D-05 | 稀疏 `sort_order`（REAL） | 拖拽只更新 1–2 行，避免整卷重排 |
| D-06 | 自动快照「唯一索引去重 + 保留上限」 | 防止短章高频快照把库撑大 |
| D-07 | 所有跨进程调用返回 `Result<T>`，异常不外抛 | 渲染层不会因主进程异常白屏 |
| D-08 | 导出器实现为「纯函数 + 稿件树」 | 可用 golden file 做结构测试，不依赖 Electron |
| D-09 | 恢复日志仅在「保存失败 / 失焦 / 退出前 flush 失败」时落盘 | 正常路径已有 800ms 自动保存，避免无谓 IO |

### 4.1 编辑器与中文输入法（最易翻车）

**问题**：拼音组合期间若触发 React 重渲染或 DOM 变更，会导致候选词丢失、字符重复上屏、光标跳到段首。

**方案**：

1. 在编辑器容器上监听 `compositionstart` / `compositionend`，维护 `isComposing` 标志；Tiptap 侧再叠加 `editor.view.composing` 双保险。
2. 自动保存的触发条件加门控：`isComposing === true` 时不置 dirty、不启动防抖计时；`compositionend` 后若内容与上次保存不同，再启动 800ms 计时。
3. 保存**不改变编辑器受控值**：Tiptap 文档是唯一真相，保存只做「读快照 → 写库」，绝不把库里的内容回灌到正在编辑的实例。
4. `CharacterCount` 扩展只用于展示，不参与落库字数；落库字数统一调用 `countWords(plainText)`。
5. 切换章节时，先 `flush()` 当前章再销毁实例，`onDestroy` 不触发保存（避免把空文档写回去）。

**验证**：E2E 用例中用 `page.keyboard.insertText` 之外还需覆盖组合输入路径（Playwright 可派发 `compositionstart/update/end` 事件），断言字符不重复。

### 4.2 自动保存状态机

```
idle ──doc change──▶ dirty ──800ms──▶ saving ──ok──▶ saved
  ▲                    │                 │
  │                    │                 └─fail──▶ retry(1s/2s/4s)
  └──── chapter switch / blur / quit ────┘            │
                                                      └─3 次失败─▶ failed（落恢复日志 + 提示）
```

- **触发点**：输入停顿 800ms、切章、窗口 `blur`、`before-quit`、`export/backup/snapshot` 前、每 30s 兜底。
- **合流**：`saving` 期间再有变更只置 `pending=true`，本次完成后再存一次，避免并发写同一行。
- **写入内容**：`content_json`、`plain_text`、`word_count`、`content_hash`、`updated_at`、`projects.updated_at`，同一事务；随后更新当日 `writing_sessions.words_written += (newCount - oldCount)`。
- **乐观并发**：`chapter:save` 可带 `baseHash`；若库中 `content_hash` 与 `baseHash` 不一致（多见于多窗口/恢复场景），返回 `CONFLICT_STALE_CONTENT`，UI 提示"内容已在别处更新"。
- **失败**：保留内存与原文件，重试 3 次；仍失败则写 `drafts/<chapterId>.jsonl`（含完整 JSON + 时间戳），顶栏显示"保存失败"，并在重启时进入恢复流程。
- **今日字数**：保存时按差值累加，负增量如实记录，展示层 clamp 到 ≥ 0，避免删除正文刷高目标。

### 4.3 崩溃恢复

- 启动时 `app:bootstrap` 做三件事：读 settings、找 `lastProjectId`、扫描 `drafts/`。
- 候选判定：`drafts/<chapterId>.jsonl` 的 mtime > `chapters.updated_at` → 视为未保存草稿。
- 恢复 UI：列出章节名、草稿时间、字数差异；用户选择「恢复」→ 走正常 `chapter:save` 且先把库中现版本打成 `manual` 快照（note: 崩溃前版本）；选择「丢弃」→ 把草稿也转成 `manual` 快照后删除文件（保证不可逆操作仍可找回）。
- 进程退出前若 `flush` 失败，同样写入草稿日志；成功退出则删除全部草稿文件。
- 强杀场景下最坏丢失 = 上次成功保存到崩溃之间的输入，契约上 ≤ 800ms + 一次 IPC 往返。

### 4.4 快照

- **自动**：距上次自动快照 ≥ 10 分钟，或本章累计新增 ≥ 2000 字；保存成功后评估。内容 hash 相同直接跳过（DB 唯一索引兜底）。
- **保留**：每章自动快照保留最近 50 条 + 最近 30 天（先按时间裁剪，再按条数裁剪）；手动 / `pre_restore` 永不自动删除。
- **恢复**：`snapshot:restore` 在一个事务内完成「读快照 → 覆盖 chapters（content / plain_text / word_count / hash / updated_at）→ 更新项目时间与当日字数增量」。**不自动生成 `pre_restore`**：恢复前 UI 明确提示会覆盖当前正文，需要保留请先手动留快照；旧版本遗留的 `pre_restore` 记录可在面板里一键清理。
- **体积**：正文 3000 字约 30–60KB JSON；50 条/章 × 300 章约 450MB–900MB，配合 30 天窗口可控。P1 的 diff 视图不改变存储格式。
- **预览**：列表只查元数据（`LIMIT 50`，不取 `content_json`），点击时按 id 单取，避免一次加载全量正文。

### 4.5 中文全文搜索

`trigram` 分词器按 3 字符子串建索引，对中文天然可用（不依赖词典），但**少于 3 字符的查询无法命中**。因此双路：

```ts
// 主进程 search/index.ts
const useFts = [...q].length >= 3;
```

**FTS 路径**（≥ 3 字）：

```sql
SELECT ref_type, ref_id,
       snippet(search_index, 4, '[[', ']]', '…', 24) AS context,
       bm25(search_index, 0.0, 0.0, 0.0, 8.0, 1.0)     AS rank
FROM search_index
WHERE search_index MATCH ? AND project_id = ?
ORDER BY rank
LIMIT ? OFFSET ?;
```

- 查询串需转义：`'"' + q.replace(/"/g, '""') + '"'`，作为短语匹配避免语法注入。
- `project_id` 为 `UNINDEXED` 列，等值过滤在 MATCH 之后进行；单项目规模下可接受。
- `snippet` 取第 4 列（`body`），高亮标记 `[[ ]]` 交由渲染层替换为 `<mark>`（不注入 HTML）。

**LIKE 兜底**（1–2 字）：

```sql
SELECT id, title,
       substr(plain_text, max(1, instr(plain_text, ?) - 40), 80) AS context
FROM chapters
WHERE project_id = ?
  AND (title LIKE '%' || ? || '%' OR plain_text LIKE '%' || ? || '%')
ORDER BY updated_at DESC
LIMIT ? OFFSET ?;
```

- 50 万字全表 `instr` 扫描实测在百毫秒级，满足 < 300ms；若后续超限，改为应用层二元组倒排（预留 `search_ngram` 表）。
- 结果按 `ref_type` 分组返回：`entities` 优先展示为「设定」，`chapters` 为「章节」。
- 索引写入由触发器完成，异常时提供 `search:reindex` 维护命令（`INSERT INTO search_index(search_index) VALUES('rebuild')`）。

### 4.6 字数统计

```ts
// shared/word-count.ts（唯一实现）
const HAN    = /\p{Script=Han}/gu;                       // 汉字逐字计数
const LATIN  = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;    // 英文/数字按段计词

export function countWords(text: string): number {
  const han = text.match(HAN)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  return han + latin;
}
```

- 标点、空白、Emoji、控制字符不在两类正则内，天然不计。
- 全角字母/数字先做 NFKC 归一化再计数，避免"ＡＢＣ"算 0。
- 单测固定样本：纯中文、中英混排、含 Emoji、含全角标点、空文本、仅标点。

### 4.7 排序与拖拽

- `sort_order` 用 REAL，新项取前后均值：`(prev + next) / 2`；相邻差 < 1e-6 或触边时，对该卷重排为 `1000, 2000, ...`。
- 跨卷拖拽 = 更新 `volume_id` + 新序号，单条 UPDATE。
- 不存整型序号，避免"插一个改一片"。

### 4.8 导入拆章

- 规则引擎（纯函数，`shared/split-chapters.ts`）：`/^第[零一二三四五六七八九十百千万\d]+[章节回卷]/m`、`/^#{1,3}\s+/m`、`/^\s*$/m`（连续空行分段）三选一 + 自定义正则。
- 输出 `SplitPreview`：`{ chapters: [{title, body, wordCount}], warnings[] }`，渲染层可合并/拆分/改名后再 `import:commit`。
- 导入事务：一次事务写全部章节，失败整体回滚；导入后统一重算字数，不做增量。
- Markdown 导入保留段落与粗斜体：用 `marked` 解析为 AST，再转换为 Tiptap JSON（只支持 P0 节点，未知节点降级为段落并记 warning）。

### 4.9 导出管线

```ts
interface ManuscriptNode { title: string; chapters: { title: string; docJson: unknown; text: string }[] }
interface ExportContext { project: Project; volumes: ManuscriptNode[]; options: ExportOptions }
interface Exporter { readonly format: ExportFormat; run(ctx: ExportContext, outDir: string): Promise<ExportResult> }
```

- `buildManuscript(projectId, scope)` 在主进程读库产出**有序**稿件树，导出器只吃树，不碰数据库 → 可单测。
- **TXT**：卷名 + 章名 + 正文，空行规则可配；UTF-8 带 BOM（兼容 Windows 旧编辑器）。
- **Markdown**：`# 卷` / `## 章`，段落间单空行；转义行首 `#`、`>`、`-`、数字加点的误判。
- **EPUB**：`fflate` 打 zip，结构如下，`mimetype` 必须是**第一个条目且 level 0（stored）**：

```
mimetype                                  "application/epub+zip"
META-INF/container.xml
OEBPS/content.opf                         元数据 dc:title/creator/language=zh-CN
OEBPS/nav.xhtml                           目录（EPUB3）
OEBPS/toc.ncx                             兼容 EPUB2 阅读器
OEBPS/styles.css                          中文首行缩进 2em、行高 1.8
OEBPS/chapter-001.xhtml ...
```

- **DOCX / PDF（P1，未实现）**：若后续引入，`docx` 生成段落与标题；PDF 用隐藏 `BrowserWindow` 加载导出专用 HTML，`printToPDF({ printBackground: true, pageSize: 'A4' })`。
- **保真测试**：每个格式一组 golden file，比较结构（章数、顺序、标题层级、总字数）而非逐字节，避免时间戳/随机 id 抖动。
- **长任务**：首版导出在 `main/modules/export.ts` 内同步完成（读树 + 序列化 + 一次写文件），200 万字规模在百毫秒级；若将来引入 DOCX/PDF，再评估 `utilityProcess` 或隐藏窗口。

### 4.10 性能

| 场景 | 手段 |
| --- | --- |
| 启动 | 书架只查 `projects` + 一个聚合子查询；不做全库字数重算；延迟初始化搜索模块 |
| 切章 | 单行查询 + 单条 `chapter_links` join；编辑器实例复用，只 `setContent`；预取相邻章元数据 |
| 章节树 | 虚拟滚动（行高固定 28px），只渲染视口 ± 10 行 |
| 全书字数 | 启动时 `SUM(word_count)` 一次，保存时增量化；不逐章累加 |
| 今日字数 | `writing_sessions` 按 `(project_id, date_key)` 唯一行，O(1) 读 |
| 搜索 | 分页 20 条；`snippet` 只取 24 token；1–2 字走 LIKE 并限 50 条 |
| 快照列表 | 不取正文列；索引 `(chapter_id, created_at DESC)` 直接覆盖 |
| 自动保存 | 单事务单行 UPDATE；`synchronous=NORMAL` 下 WAL 写入亚毫秒级 |

启动流程并行化：窗口 `show: false` 先建，`ready-to-show` 前完成 bootstrap（读 settings + 迁移检查）再 show；书架数据与窗口显示并行请求。

### 4.11 原生模块与打包

- `better-sqlite3` 13 提供 N-API 预编译产物（`prebuilds/win32-x64.node`），同一二进制在 Node 与 Electron 下都能加载，通常**不需要** `electron-rebuild`；只有预编译缺失、被迫从源码编译时才执行 `pnpm rebuild:native`。
- `electron-builder.yml` 关键项：

```yaml
asar: true
asarUnpack:
  - "**/node_modules/better-sqlite3/**"
npmRebuild: true
win:
  target: [nsis]
  artifactName: "wenhuo-${version}-${arch}.${ext}"
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
```

- **W1 必须跑一次 `pnpm dist:win` 并在干净机器安装验证**（PRD 风险 R-01）。
- 主进程启动时捕获 `require('better-sqlite3')` 失败，返回可读错误而不是白屏：`NATIVE_MODULE_LOAD_FAILED`，并提示重装。

### 4.12 错误、日志与可观测

- `ERROR_CODES`：`INVALID_ARGUMENT` / `NOT_FOUND` / `DB_WRITE_FAILED` / `DB_MIGRATION_FAILED` / `CONFLICT_STALE_CONTENT` / `EXPORT_FAILED` / `IMPORT_FAILED` / `BACKUP_FAILED` / `NATIVE_MODULE_LOAD_FAILED` / `UNKNOWN`。
- `Result<T>` 在 preload 统一解包：成功返数据，失败抛 `AppError`（含 code），由渲染层 `api/` 层统一 toast + 上报日志。
- 主进程日志：`logs/main.log`，含时间、级别、模块、操作、耗时；保存操作记录 `chapterId`、字数差、耗时。
- 不采集任何用户内容与遥测；日志不含正文（仅长度与 hash 前缀）。

---

## 5. 与 PRD 的对应关系

| PRD 条目 | 技术落点 | 模块 / 表 | 阶段 |
| --- | --- | --- | --- |
| F-01 项目书架 | `project:*` IPC、聚合查询、最近编辑排序 | `modules/project`、`projects` | W1 |
| F-02 卷章树 | 稀疏排序、虚拟滚动、`manuscript:*` | `modules/manuscript`、`volumes`/`chapters` | W1（基础）/ W4（打磨） |
| F-03 编辑器 | Tiptap + 中文排版扩展、composition 门控 | `renderer/features/editor` | W1（基础）/ W4（专注/打字机） |
| F-04 自动保存与恢复 | 状态机 + 草稿日志 + WAL 事务 | `modules/chapter`、`services/crash-recovery` | W1（自动保存）/ W2（恢复） |
| F-05 快照 | hash 去重 + 保留策略 + 恢复事务 | `modules/snapshot`、`snapshots` | W2 |
| F-06 字数与目标 | `countWords` 单点 + 会话增量 | `shared/word-count`、`modules/stats` | W2 |
| F-07 全文搜索 | FTS5 trigram + LIKE 兜底 + 分组结果 | `modules/search`、`search_index` | W2 |
| F-08 设定库 | 实体单表 + 多态关联 + 反向引用 | `modules/world`、`entities`/`chapter_links` | W3 |
| F-09 导入导出 | 拆章纯函数 + Exporter 接口 + EPUB 打包 | `modules/import`、`modules/export` | W1（TXT）/ W3（MD/EPUB/导入） |
| F-10 备份 | `VACUUM INTO` + zip + 恢复前备份 | `modules/backup` | W3 |
| S1 日更 | 上次项目/章节恢复、顶栏状态、今日字数 | `app:bootstrap`、`modules/stats` | W1–W2 |
| S2 回退 | `snapshot:restore` + `pre_restore` | `modules/snapshot` | W2 |
| S3 查设定 | `search:query` 分组 + `world:backlinks` | `modules/search`、`modules/world` | W2–W3 |
| S4 旧稿迁移 | `import:preview` → `import:commit` | `modules/import` | W3 |
| S5 崩溃恢复 | 启动扫描 + 恢复候选 UI | `services/crash-recovery` | W2 |
| S6 成稿导出 | 导出向导 + `buildManuscript` | `modules/export` | W1 / W3 |
| §5.2 性能指标 | 索引设计 + 聚合查询 + 虚拟滚动 + 并行启动 | 全链路 | W4 专项 |
| §6.2 E2E 清单 | Playwright Electron 10 条 | `tests/e2e` | W2–W3 |
| §4.2 项目类型模板 | `ProjectTypeProfile` 配置，仅影响默认值 | `shared/project-type.ts` | W1 |

---

## 6. 约束与假设

- 【假设】Electron 43.3.0 与 better-sqlite3 13.x 的 N-API 预编译包在其支持的 ABI 范围内可直接使用；若预编译缺失，改由 `electron-rebuild` 从源码编译，需要本机具备 VS Build Tools。
- 【假设】随 Electron 打包的 SQLite 版本 ≥ 3.44，包含 FTS5 与 `trigram` 分词器；若缺失，退回「应用层二元组索引 + LIKE」的备选方案（新增 `search_ngram` 表）。
- 【假设】单机单用户，数据库不存在并发写冲突；`better-sqlite3` 同步调用在主进程串行执行即可，无需连接池。
- 【假设】不引入多窗口编辑同一章的场景；若未来支持，需在 `chapter:save` 上启用基于 `content_hash` 的乐观并发（已预留 `baseHash`）。
- 【假设】首版导出在主进程内完成，200 万字规模可接受；`utilityProcess` 与 PDF 隐藏窗口是为未来 DOCX/PDF 预留的方案，当前未启用。
- 【假设】首版附件只做「头像 + 任意附件文件」，不进入 FTS 索引，也不参与字数统计。
- 【假设】应用不联网，因此不需要代理、证书、更新服务器；自动更新（autoUpdater）不在本方案范围内。
- 【假设】用户数据目录位于 `%APPDATA%\wenhuo`；若用户改项目根目录，仅影响 `projects/` 子树，库文件仍在 `userData`。
- 【推断】ProseMirror JSON 平均体积约为纯文本的 3–5 倍，3000 字章节约 30–60KB；VACUUM 后 50 万字项目（含 50 条/章快照上限）预计库体积在 1–2GB 内。
- 【推断】FTS5 触发器在每次保存时 `DELETE + INSERT` 会带来额外写放大，但单章行数少（一次一行），实测量级可忽略；若后续成为瓶颈，改为延迟批量重建。
- 【推断】`trigram` 对大小写不敏感，英文搜索行为与中文一致；但 3 字符以下英文查询也会走 LIKE，需要限制结果条数以免全表扫描拖慢。
- 【推断】Zustand 若在每次按键都写正文，会导致全树重渲染，因此正文状态必须留在 Tiptap 实例内，store 只存元信息与保存状态。
- 【推断】`before-quit` 中的异步 flush 需要 `event.preventDefault()` + 手动 `app.quit()` 二次进入，否则窗口关闭时可能来不及落库。
- 【推断】导出 golden 文件若包含时间戳或随机 id 会持续抖动，因此断言必须基于结构摘要而非字节比对。
- 【推断】WAL 模式下若进程被强杀，`-wal` 文件残留但不影响下次打开；一致性由 SQLite 自身保证，无需自行修复。
- 【推断】历史版本升级时 `content_json` 结构可能变化，需在 `shared` 提供 `migrateDocJson()` 做向前兼容，迁移脚本只处理表结构。

---

## 7. 待确认

| 编号 | 待确认问题 | 本文默认取值 | 影响 |
| --- | --- | --- | --- |
| T-01 | 是否接受 `electron-vite` 作为构建工具（替代手写 webpack/vite 配置）？ | 接受，主/预加载/渲染三端由它统一构建 | 若拒绝，需另配三套构建，W1 多 1–2 天 |
| T-02 | 打包后的 SQLite 是否确认带 FTS5 与 trigram？ | 假设可用，W1 写启动自检 `PRAGMA compile_options` 验证 | 若不支持，搜索方案降级为应用层索引 |
| T-03 | 单库多项目是否可接受（库文件随项目增多变大）？ | 接受，单库 + `project_id` 隔离 | 若需求改为每项目一库，需重写书架聚合与备份 |
| T-04 | 正文是否允许用户直接编辑 Markdown 源码（双模式）？ | 不做，仅富文本 | 若要做，需额外 Markdown 双向转换与保存冲突处理 |
| T-05 | 快照保留上限（50 条/章 + 30 天）是否合适？ | 采用，设置页可配 | 影响库体积与"回到更早版本"的能力 |
| T-06 | 是否需要应用内自动更新？ | 不做，手动下载安装包 | 若需要，需引入签名与发布通道 |
| T-07 | SQLite 库是否需要加密（如 SQLCipher）？ | 不做，依赖系统账户权限 | 若需要，需换驱动并处理密钥管理 |
| T-08 | 导出并发限制（同时导多个格式）？ | 同一时刻仅一个导出任务，UI 在导出期间禁用入口 | 影响 UI 交互与 `modules/export.ts` 的实现 |

---

## 8. 实现状态与设计偏差

截至 2026-10-23，W1–W3 的 P0 功能均已落地；本节记录实现相对上方设计的变化，避免文档与代码漂移。

### 8.1 实际交付

| 项 | 设计 | 实现 |
| --- | --- | --- |
| 模块组织 | `modules/<domain>/` 子目录 | 扁平 `modules/<domain>.ts`，导出文件按格式拆分（`export-txt/markdown/epub.ts`） |
| IPC 校验 | zod schema | 无 zod；handler 内用 `asRecord` / `asString` 等字段校验，错误统一 `AppError('INVALID_ARGUMENT')` |
| 日志 | electron-log 5 | 自研 `main/logger.ts`，5MB 轮转，写入三重兜底永不抛异常 |
| 快照恢复 | 恢复前写 `pre_restore` | **覆盖式**：不自动留档，确认框提示用户先手动快照；旧 `pre_restore` 可一键清理 |
| 导出长任务 | `utilityProcess` | 主进程同步完成（200 万字量级百毫秒），未引入 `utilityProcess` |
| 自动备份 | 项目目录 `backups/` | `userData/projects/<id>/backups/`，每日首次启动触发，保留最近 7 份 |
| E2E | 6 条 | 10 条（新增查找替换、完成章锁定、设置页） |
| 单测 | 194 条（31 文件） | 与设计一致 |

### 8.2 验证记录

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型（主/渲染） | `pnpm typecheck` | ✅ |
| 规范 | `pnpm lint` | ✅ |
| 单元 + 集成 | `pnpm test` | ✅ 31 文件 / 194 用例 |
| 构建 | `pnpm build` | ✅ |
| 数据库链路 | `pnpm smoke:db` | ✅ schema / FTS5 trigram / 级联删除 |
| 数据层性能（51 万字） | `pnpm perf:baseline` | 读树 0.7ms、搜索 0.4ms、聚合 0.3ms |
| UI 性能（51 万字） | `pnpm perf:ui` | 启动 1137ms、切章 P95 79ms、搜索 270ms |
| E2E | `pnpm test:e2e` | ✅ 10 条 |
| 打包 | `pnpm dist:win:zip` | ✅ 便携包；NSIS 安装器受环境限制未验证 |

### 8.3 已知技术债

1. `export:run` 在主进程同步执行，超大项目（> 500 万字）会短暂占用主线程；需要时再引入 `utilityProcess`。
2. 章节树未做虚拟滚动，300 章以内可接受；超出时需要虚拟列表。
3. 备份 zip 在内存中组装，库体积 > 2GB 时内存峰值偏高；可改为流式写 zip。
4. IPC handler 的字段校验是手写的，随通道增长容易漏字段；后续可统一成声明式 schema。
5. `snapshots` 表仍是体积主因，保留策略只对 `auto` 生效；手动快照需要用户自己清理。
