---
doc: tech-design
title: electricReader · 本地优先桌面阅读器技术方案
version: 1
updated: 2026-10-23
based-on: PRD v1
based-on-date: 2026-10-23
---
## 1. 目标与约束

electricReader 是单机、离线、单窗口的 EPUB / TXT 阅读器。技术上只服务三件事：

1. **打开就能读**：导入后立刻可读，不依赖网络与账号。
2. **位置不丢**：换字号、改版心、重启、崩溃后都能回到原段落。
3. **数据不坏**：书库索引与书籍副本原子写入，坏文件可诊断、可恢复。

硬约束：

- 渲染进程不碰文件系统与 Node API，全部能力经 preload 白名单 + IPC。
- 主进程不做长阻塞任务；解析、哈希、复制都是异步流式/分片执行。
- 不引入原生模块（封面缩略图用 Electron `nativeImage`），降低打包与 ABI 风险。
- 不发起任何运行时网络请求。

## 2. 进程与模块

| 进程 | 职责 | 禁止 |
| --- | --- | --- |
| 主进程 | 窗口生命周期、书库索引、EPUB/TXT 解析、封面生成、文件复制/删除、IPC | 不渲染 UI、不把整本书常驻内存（按次读取） |
| 预加载 | `contextBridge` 暴露 `window.api`，只做通道转发 | 不暴露 `ipcRenderer` / `require` / 文件路径能力 |
| 渲染进程 | 书架、阅读器、排版与主题、TOC、进度防抖 | 不直接访问 fs、不拼接磁盘路径 |

```
src/
├─ shared/           纯函数与类型，主/渲染/测试三方共用
│  ├─ types.ts       Book / Locator / ReaderSettings / Result
│  ├─ defaults.ts    选项白名单、normalizeSettings、Locator 序列化与比较
│  ├─ ipc-contract.ts 通道常量 + ElectricReaderApi 接口
│  └─ platform.ts
├─ main/
│  ├─ index.ts       单实例锁、协议注册、窗口、启动 bootstrap
│  ├─ window-state.ts 窗口位置/大小持久化与多屏校正
│  ├─ epub/
│  │  ├─ metadata.ts OPF 解析、封面候选、DRM 识别
│  │  ├─ import-service.ts 导入/重定位/删除编排
│  │  └─ cover.ts    nativeImage 缩略图
│  ├─ txt/
│  │  └─ txt-book.ts 编码识别、拆章、TXT → EPUB
│  ├─ storage/
│  │  ├─ paths.ts    所有落盘路径的唯一来源
│  │  ├─ atomic.ts   原子写、.bak、读取工具
│  │  ├─ library-schema.ts JSON 解析与清洗（不可信输入）
│  │  └─ library-repo.ts 内存态 + 串行化写入队列
│  └─ ipc/
│     ├─ result.ts   异常 → Result 的唯一收敛点
│     ├─ books.ts    10 个通道的 handler
│     └─ register.ts 依赖装配
├─ preload/index.ts
└─ renderer/
   ├─ app/App.tsx    HashRouter、主题应用、启动门禁
   ├─ features/library/
   ├─ features/reader/（含 engine/epubjs-engine.ts）
   ├─ stores/        library / reader / settings / toast
   └─ styles/index.css  Tailwind 4 + CSS 变量 token
```

依赖方向单向：`renderer → preload → shared`，`main → shared`。渲染层不 import `main/`。

## 3. 数据模型与磁盘格式

### 3.1 目录

```
<userData>/
├─ library.json                 # 索引，schemaVersion = 2
├─ library.json.bak             # 上一次成功写入的副本
├─ library.corrupt-<ts>.json    # 损坏索引归档（仅异常时出现）
└─ books/
   ├─ <sha256>.epub | .txt      # 书籍副本，文件名即内容 hash
   └─ <sha256>/cover.jpg        # 240px JPEG 缩略图
```

`<userData>` 默认 `%APPDATA%\electricReader`，可由 `ELECTRICREADER_USER_DATA` 覆盖。所有路径由 `createAppPaths()` 推导，业务代码禁止手拼分隔符。

### 3.2 library.json（v2）

```jsonc
{
  "schemaVersion": 2,
  "books": [
    {
      "id": "<sha256>",
      "format": "epub",              // v1 没有该字段，迁移时默认 epub
      "title": "…",
      "author": "…",                  // 可选
      "language": "zh-CN",            // 可选
      "fileSize": 123456,
      "addedAt": "ISO-8601",
      "lastReadAt": "ISO-8601",       // 可选
      "status": "unread | reading | finished",
      "progress": {
        "locator": { "href": "…", "cfi": "…", "locations": { "progression": 0.2, "totalProgression": 0.42 }, "text": { "highlight": "…" } },
        "percent": 42.3,
        "updatedAt": "ISO-8601"
      }
    }
  ],
  "settings": { "fontSize": 130, "theme": "light", "followSystem": true, "pageTurn": "both" },
  "windowState": { "x": 100, "y": 80, "width": 1220, "height": 820, "maximized": false }
}
```

解析规则（`library-schema.ts`）：

- 磁盘 JSON 视为**不可信输入**：逐字段收窄，坏条目丢弃，不因一条坏数据拖垮整库。
- `schemaVersion` 只接受 1 / 2；更高版本直接报错，绝不静默降级。
- 重复 id 保留第一条；`percent` 夹到 0–100；非法时间戳回落到 `addedAt`。
- `fileMissing` 不落盘，每次 `library:get` 时由主进程 `access()` 探测后派生。

### 3.3 写入与恢复

`writeFileAtomic()` 的顺序是：同目录临时文件 → `write` → `fsync` → 旧文件复制为 `.bak` → `rename`。重命名在同一目录内完成，避免跨卷非原子移动；Windows 不支持目录 fsync，因此只做文件级同步。

`LibraryRepository` 维护一份内存态 `state`，所有写操作经 `mutate()`：

```
structuredClone(state) → 修改草稿 → 原子写盘 → 成功后替换内存态
```

写入通过 `pending` Promise 链串行化，保证并发 IPC（例如快速翻页 + 修改设置）不会互相覆盖。

启动加载顺序：`library.json` → 解析失败则归档为 `library.corrupt-<ts>.json` → 尝试 `library.json.bak` → 仍失败则新建空库。任何一步都不会删除用户数据。

## 4. 导入管线

### 4.1 入口与校验

- `library:import-dialog`：主进程 `dialog.showOpenDialog`，多选。
- `library:import-paths`：拖拽路径，最多 500 条；路径只接受字符串，逐条处理。
- 批量导入逐本 try/catch，单本失败不影响其余，最终返回 `ImportSummary { imported, duplicates, errors }`。

### 4.2 去重与复制

1. 流式计算文件 SHA-256，作为书籍 id。
2. 若 id 已存在且副本仍在 → 记为重复，直接跳过。
3. 若 id 已存在但副本被删 → 重新复制并刷新元数据，**保留原阅读进度**。
4. 同内容不同格式（先 TXT 后 EPUB）→ `FORMAT_CONFLICT`，要求先移除原书。
5. 复制使用 `copyFile(tmp)` + `rename`，失败清理临时文件；索引写入失败时回滚书籍副本与封面。

### 4.3 EPUB 解析（`metadata.ts`）

- `fflate.unzipSync` 解压，带 2GB 解压总量上限（filter 累计 `originalSize`）。
- `META-INF/container.xml` → `rootfile[full-path]` → OPF；XML 用 `fast-xml-parser`，去命名空间前缀。
- 元数据：`dc:title`、`dc:creator`（多个用 ` / ` 连接）、`dc:language`，均清洗控制字符并截断。
- 封面候选顺序：
  1. manifest `properties="cover-image"`
  2. EPUB2 `<meta name="cover" content="id">`
  3. guide `type="cover"` 指向的图片
  4. id / href 含 `cover` 的图片
  5. 体积最大的图片
- 封面超过 20MB 或不是支持的图片类型则放弃，不影响导入。
- DRM：存在 `META-INF/rights.xml` 或 `encryption.xml` 中有非字体混淆的 `EncryptedData` → `DRM` 错误；纯字体混淆（IDPF / Adobe）放行。

### 4.4 TXT 解析（`txt-book.ts`）

- 编码嗅探顺序：BOM（UTF-8 / UTF-16LE / UTF-16BE）→ UTF-8 严格解码 → GB18030 兜底。
- 章节规则：`第X章/节/回/卷`（支持中文数字与阿拉伯数字）、Markdown 标题、整篇一章；空文件拒绝。
- 输出 `TxtDocument { title, author, chapters[] }`，单文件上限 200MB、最多 3000 章。
- 阅读时不落盘转换：`buildTxtEpub()` 在内存中生成合法 EPUB（mimetype 首条不压缩、nav.xhtml、按 14000 字拆分超长章节），再交给统一的 epub.js 引擎。

### 4.5 错误码

| code | 含义 |
| --- | --- |
| `DRM` | 受 DRM 保护 |
| `CORRUPT` | 压缩包/XML 损坏 |
| `NO_OPF` | 缺少 container 或 OPF |
| `UNSUPPORTED` | 非 EPUB / 非白名单扩展名 |
| `TOO_LARGE` | 超出解压或读取上限 |
| `FILE_NOT_FOUND` | 源文件不存在 |
| `FORMAT_CONFLICT` | 同内容已存在另一种格式 |
| `HASH_MISMATCH` | 重新定位时内容不一致 |
| `CANCELLED` | 用户取消对话框 |

## 5. 阅读器

### 5.1 引擎适配层

`ReaderEngine` 接口把「打开、翻页、跳转、应用设置、销毁」与 epub.js 隔离，阅读页只依赖接口，未来替换 Readium 不需要改页面。

`EpubJsReaderEngine` 关键点：

- `epub.js` 以 `flow: 'paginated'`、`spread: 'none'`、`allowScriptedContent: false` 渲染到容器。
- 书内容位于 iframe，`sandbox="allow-same-origin"`，不注入 `allow-scripts`；内容里的链接、点击、滚轮事件由父页面统一代理。
- 排版通过 `rendition.themes.registerCss()` 注入一份受控 CSS（字体、行高、缩进、主题色），不改写书内 HTML。
- `ResizeObserver` + 140ms 防抖处理容器尺寸变化；重排后按锚点恢复位置。

### 5.2 Locator 契约

```ts
interface Locator {
  href: string                    // spine 内相对路径
  type: string
  title?: string                  // 章节名（来自 TOC）
  cfi?: string                    // epub.js 精确锚点
  locations: { progression: number; totalProgression?: number }
  text?: { before?: string; highlight?: string; after?: string }
}
```

恢复优先级：`cfi` → `href`（+ 文本片段兜底）→ 第一章。`normalizeLocator()` 会夹紧进度、截断文本片段（≤500 字符），非法输入返回 `null`。

epub.js 0.3.93 的 `paginatedLocation` 在章节内翻页时只回报第一页，因此引擎按容器 `scrollLeft / clientWidth` 反算页索引，并用页首元素生成 CFI，保证节内翻页也有段落级锚点。

### 5.3 进度保存

- 首次定位立即落盘（让「在读」和最近阅读时间马上正确）。
- 之后 1.2s 防抖；`visibilitychange` 隐藏、`beforeunload`、返回书架时同步 `send` 一次 `progress:flush`。
- `progress:flush` 是单向 `ipcMain.on`，不等待渲染层，避免退出路径被阻塞。
- `percent ≥ 99` 自动置为 `finished`；状态为 `unread` 时首次保存置为 `reading`。

### 5.4 输入与快捷键

| 输入 | 行为 |
| --- | --- |
| ← / PageUp | 上一页 |
| → / PageDown / 空格 | 下一页 |
| 点击左 24% / 右 24% | 上一页 / 下一页 |
| 横向滚轮（|deltaX| 主导） | 翻页，420ms 锁避免连翻 |
| Esc | 关闭目录 / 设置面板 |

面板打开或重排中会 `setInputEnabled(false)`，避免误翻页。

### 5.5 设置与主题

`ReaderSettings` 全部走白名单枚举（字号 100–160、行高 1.5/1.7/1.9、版心 640–960、主题三选一）。`normalizeSettings()` 对未知值回落到默认值，因此旧版本设置、手改 JSON 都不会让应用崩溃。

主题解析：`followSystem` 时读 `prefers-color-scheme`，否则用显式主题；同时同步 `nativeTheme.themeSource`，让窗口边框与原生控件一致，并写入 `document.documentElement.dataset.theme` 供 CSS 变量切换。

## 6. IPC 契约

| 通道 | 方向 | 入参 | 返回 |
| --- | --- | --- | --- |
| `library:get` | invoke | — | `Result<LibraryData>` |
| `library:import-dialog` | invoke | — | `Result<ImportSummary>` |
| `library:import-paths` | invoke | `string[]` | `Result<ImportSummary>` |
| `library:delete` | invoke | `bookId` | `Result<LibraryData>` |
| `library:relocate` | invoke | `bookId` | `Result<Book>` |
| `library:set-status` | invoke | `bookId, status` | `Result<LibraryData>` |
| `book:read` | invoke | `bookId` | `Result<Uint8Array>` |
| `progress:save` | invoke | `ProgressUpdate` | `Result<Book>` |
| `progress:flush` | send | `ProgressUpdate` | — |
| `settings:update` | invoke | `Partial<ReaderSettings>` | `Result<ReaderSettings>` |

所有 invoke 返回值恒为 `Result<T>`；异常不跨进程，`toResult()` 统一收敛为 `{ ok:false, code, message }`，`message` 为可直接展示的中文。

## 7. 安全基线

- `BrowserWindow`: `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、`webSecurity: true`、生产态 `devTools: false`。
- CSP 由构建期注入：生产 `script-src 'self'`；开发态放开 `'unsafe-inline'` 与 HMR websocket。`object-src 'none'`、`form-action 'none'`。
- 导航：`will-navigate` / `will-frame-navigate` 拦截，仅 http(s) 交给 `shell.openExternal`；`setWindowOpenHandler` 一律 deny；`will-attach-webview` 阻止。
- 权限：`setPermissionRequestHandler` 全部拒绝；`will-download` 阻止。
- 封面协议 `reader://cover/<id>`：校验 hostname 与 64 位 hex id 后才读文件，响应固定 `image/jpeg` + `no-cache`。
- IPC 入参逐项校验（id 正则、枚举白名单、数组元素类型），路径永不来自渲染层。

## 8. 构建与打包

| 命令 | 产物 |
| --- | --- |
| `pnpm dev` | electron-vite 开发服务器 + Electron |
| `pnpm build` | `out/main`、`out/preload`、`out/renderer` |
| `pnpm typecheck` | 两套 tsconfig 全量类型检查 |
| `pnpm test` | Vitest，48 条 |
| `pnpm test:e2e` | 构建后用 Playwright + CDP 驱动真实 Electron，5 条 |
| `pnpm dist:win` | `release/electricReader-<version>-x64-setup.exe` |

打包要点：`electron-builder.yml` 以 `out/**` + `package.json` 为输入，生产依赖（`epubjs` 仅渲染层已打进 bundle，`fast-xml-parser` / `fflate` 留在 node_modules）随 asar 一起打包；无原生模块，不需要 `electron-rebuild`。

## 9. 测试策略

- **单元/集成（Vitest，48 条）**：EPUB 元数据与错误分支、TXT 编码与拆章、导入管线（去重、回滚、重定位）、书库索引（v1→v2、坏数据、并发写）、原子写、Locator 序列化与容差比较。
- **E2E（Playwright，5 条）**：EPUB/TXT 导入与封面、翻页与字号变化后的位置保持、目录跳转与深色主题、TXT 续读、删除清理。每个用例独立临时 userData，用例结束清理。
- E2E 用真实 fixture 生成器（`tests/helpers/epub-fixture.ts`）现场构造 EPUB，不依赖二进制样本。
- 断言面向用户可见结果（文本、文件存在、进度百分比），不断言内部实现。

## 10. 性能与限制

| 项 | 现状 | 说明 |
| --- | --- | --- |
| 书架加载 | N 次 `access()` 并发探测 | 书数量在千级以内可接受；更大规模可改为目录扫描 |
| 索引写入 | 全量 JSON + 整库克隆 | 单次 < 数 MB，WAL 无关；十万本级别需换 SQLite |
| 打开大书 | 整本读入内存后交给 epub.js | 上限 1GB；更大文件应改为按需解压 |
| 进度保存 | 1.2s 防抖 + 全量写 | 翻页频繁时写放大可控 |
| 封面 | 导入时一次生成 | 书架不读原图，滚动无 IO |

明确限制：单实例单窗口；单次导入 500 本；EPUB 解压 ≤ 2GB；TXT ≤ 200MB；不支持 DRM、批注、书签、全文检索。

## 11. 关键取舍

1. **JSON 索引而非 SQLite**：书库规模小、结构简单，JSON 便于人工排查与备份；代价是全量写与无事务。若未来加入批注/标签/统计，应迁移到 SQLite。
2. **TXT 转 EPUB 而非自研分页**：复用 epub.js 的排版、目录与定位能力，代价是每次打开需生成一次内存 EPUB；对 200MB 上限内的文件耗时可接受。
3. **封面用 nativeImage**：避免引入 sharp 等原生模块，代价是不支持 SVG 封面（直接跳过）。
4. **CFI + 文本双锚点**：CFI 精确但脆弱，文本片段用于跨版本兜底；两者都失效时退到章节开头，保证「能读」优先于「精确」。
5. **整本 IPC 传输**：实现简单、与 epub.js 的 ArrayBuffer 入参契合；大文件会带来一次拷贝，后续可改为 `reader://book/<id>` 流式协议。
