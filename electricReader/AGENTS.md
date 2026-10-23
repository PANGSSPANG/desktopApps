---
doc: agents
title: electricReader · 开发规范
version: 1
updated: 2026-10-23
based-on: 技术方案 v1
based-on-date: 2026-10-23
---
## 1. 项目概述

electricReader 是本地优先的桌面 EPUB/TXT 阅读器，Electron + React + TypeScript，无服务端、无账号、无网络。产品目标见 [PRD.md](PRD.md)，架构与数据格式见 [docs/tech-design.md](docs/tech-design.md)。

### 1.1 技术栈

| 层 | 选型 | 约束 |
| --- | --- | --- |
| 容器 | Electron 43.3.0 | 主进程持有全部文件与解析能力 |
| UI | React 19 + TypeScript 5（strict） | 函数组件 + hooks |
| 构建 | electron-vite 6 | 不改用手写 webpack |
| 样式 | Tailwind CSS 4 + CSS 变量 token | 不写行内魔法值 |
| 状态 | Zustand 5 | 只存 UI 与书库元数据 |
| 阅读引擎 | epub.js 0.3.93 | 通过 `ReaderEngine` 适配层隔离 |
| 测试 | Vitest 5 + Playwright 1.64 | 单元 48 条 / E2E 5 条 |
| 打包 | electron-builder 26（NSIS） | 无原生模块 |

### 1.2 目录职责

```
src/shared/     纯函数与类型；禁止 import electron / react / node:fs
src/main/       窗口、书库索引、EPUB/TXT 解析、封面、IPC
src/preload/    仅 contextBridge 白名单
src/renderer/   页面与组件；禁止直接访问 fs / ipcRenderer
tests/unit/     shared + main 模块（临时目录）
tests/e2e/      Playwright 驱动真实 Electron
```

依赖方向单向：`renderer → preload → shared`，`main → shared`。任何反向 import 视为错误。

### 1.3 环境与命令

Node ≥ 20，包管理器固定 `pnpm`。

| 命令 | 用途 |
| --- | --- |
| `pnpm dev` | 开发态（主进程重启 + 渲染层 HMR） |
| `pnpm build` | 三端构建到 `out/` |
| `pnpm typecheck` | 两套 tsconfig 全量类型检查 |
| `pnpm test` | Vitest |
| `pnpm test:e2e` | 构建 + Playwright（串行） |
| `pnpm dist:win` | NSIS 安装包到 `release/` |

---

## 2. 开发规范

### 2.1 分层铁律

1. **文件与解析只在主进程**。渲染层拿不到 `fs`，也不接受任何「传路径过来读」的 IPC。
2. **渲染层只经 `services/api.ts` 调 IPC**。它负责 `Result` 解包、`ApiError` 抛出与 toast。
3. **`shared/` 保持纯净**：只放纯函数/类型/常量；它被主进程、渲染层、Vitest 三方加载。
4. **业务逻辑不写在组件里**：导入、解析、进度归一化落在 `main/` 或 `shared/`，组件只编排。
5. **`platform.ts` 不 import electron**：只做运行环境判断。

### 2.2 IPC 规范

- 通道命名 `domain:action`，全小写：`library:get`、`book:read`、`progress:save`。新增通道必须同步 `shared/ipc-contract.ts`、`preload/index.ts`、技术方案 §6。
- 所有 invoke handler 返回值恒为 `Result<T>`，绝不 `throw` 跨进程；用 `toResult()` 统一收敛。
- 错误 `message` 必须是可直接展示的中文；技术细节只进 `console.error`。
- 入参逐项校验：书籍 id 必须匹配 `/^[a-f0-9]{64}$/`，枚举走白名单，数组校验元素类型并限长。
- `progress:flush` 是单向 `send`，用于退出路径，不得改成 invoke（会阻塞关闭）。
- 渲染层禁止使用 `ipcRenderer`、`remote`、`nodeIntegration`。

### 2.3 存储与文件

- 所有路径从 `createAppPaths()` 取，禁止手拼 `\` 或 `..`。
- 写索引必须走 `writeFileAtomic()`：临时文件 → fsync → `.bak` → rename。
- `library.json` 是不可信输入：解析必须经过 `parseLibraryFile()`，坏条目丢弃、版本不支持直接报错。
- 书籍副本按内容 SHA-256 命名；**不要**用标题或时间做文件名。
- 复制大文件用临时文件 + rename，失败清理临时文件；索引写失败要回滚副本。
- 删除书籍时同时清理 `.epub`、`.txt` 与封面目录（历史格式可能都存在）。

### 2.4 渲染层

- 组件函数式、具名导出；路由懒加载页面可用 `export default`。
- 全局状态只放：书库列表、当前书、设置、面板开关、toast。正文内容留在 epub.js 实例里。
- 列表 `key` 用业务 id，不用数组下标。
- 所有可点击图标按钮必须有 `aria-label`；面板打开时禁用阅读器输入。
- 用户可见文案中文，标点全角；错误提示说明「发生了什么 + 能做什么」。
- 主题颜色一律用 `styles/index.css` 里的 CSS 变量（`bg-canvas`、`text-ink` 等），不写死 `#hex`。

### 2.5 命名与格式

| 对象 | 规则 | 示例 |
| --- | --- | --- |
| 普通 TS 文件 | `kebab-case` | `library-repo.ts`、`use-resolved-theme.ts` |
| React 组件文件 | `PascalCase.tsx` | `BookCard.tsx`、`SettingsPanel.tsx` |
| 组件导出 | `PascalCase` | `export function BookCard()` |
| 函数/变量 | `camelCase` | `normalizeLocator` |
| 类型/接口 | `PascalCase`，不加 `I` 前缀 | `ReaderSettings` |
| 常量 | `UPPER_SNAKE_CASE` | `MAX_BOOK_BYTES` |
| 数据库/JSON 字段 | `camelCase` | `lastReadAt` |
| IPC 通道 | `domain:action` | `progress:save` |

格式：2 空格缩进、单引号、**不写分号**、`printWidth: 100`、`trailingComma: all`（见 `.prettierrc.json`）。

TypeScript：`strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 全开。可选字段用条件展开而不是赋 `undefined`：

```ts
return { id, ...(author ? { author } : {}) }
```

### 2.6 Git 与提交

- 分支：`main` 保持可构建可测试；功能分支 `feat/<scope>`，修复 `fix/<scope>`。
- 提交信息：Conventional Commits，scope 取目录：`feat(reader): 支持横向滚轮翻页`、`fix(storage): 索引损坏时优先读 .bak`。
- 不提交 `node_modules/`、`out/`、`release/`、日志与临时目录。
- 一次提交只做一件事；涉及 IPC 契约或磁盘格式的改动必须在正文说明兼容性。

### 2.7 完成定义（DoD）

一次改动只有在以下全部满足时才算完成：

1. `pnpm typecheck`、`pnpm test` 全绿；涉及渲染层交互再跑一次 `pnpm test:e2e`。
2. 新增逻辑有对应测试；改磁盘格式必须补迁移/兼容用例。
3. 改 IPC 契约同步更新 `shared/ipc-contract.ts`、preload、技术方案 §6。
4. 用户可见行为有中文文案，空态 / 加载态 / 错误态齐全。
5. 涉及导入、进度、重定位的改动，手工跑一次真实文件。

---

## 3. 测试要求

### 3.1 必须覆盖的部分

| 目标 | 必须覆盖 |
| --- | --- |
| `main/epub/metadata.ts` | EPUB2/3 元数据、封面候选、无封面、损坏、缺 OPF、DRM、纯字体混淆 |
| `main/txt/txt-book.ts` | BOM、UTF-16、GB18030、无标题、章节边界、超长章节拆分 |
| `main/epub/import-service.ts` | 去重、格式冲突、副本恢复、删除清理、重定位 hash 校验 |
| `main/storage/library-schema.ts` | v1→v2、坏字段、重复 id、非法版本 |
| `main/storage/library-repo.ts` | 并发写、`.bak` 恢复、缺失文件标记 |
| `main/storage/atomic.ts` | 原子写、跳过备份、缺失文件返回 null、失败不留半截 |
| `shared/defaults.ts` | Locator 序列化、容差比较、百分比夹紧、非法输入 |

### 3.2 集成测试

- 使用真实临时目录（`mkdtemp`），不 mock 文件系统。
- 每个用例结束删除临时目录；测试之间不共享状态。
- fixture 由 `tests/helpers/epub-fixture.ts` / `txt-fixture.ts` 现场生成，不提交二进制样本。

### 3.3 E2E

- 必须串行（helper 固定 CDP 端口 19222），Playwright 配置 `workers: 1`。
- 每个用例独立 userData（`ELECTRICREADER_USER_DATA`），跑完清理。
- 断言用户可见结果（文本、文件存在、百分比），不断言 class 名或内部状态。
- 需要重启的用例必须真正结束进程再启动。

### 3.4 提交前门禁

```bash
pnpm typecheck && pnpm test
```

涉及 reader / 导入 / 删除的改动额外跑 `pnpm test:e2e`。

---

## 4. 代码风格

### 4.1 TypeScript

- 禁止 `any`；确需逃逸用 `unknown` + 类型守卫，或局部 `// eslint-disable` 并注明理由。
- 对外导出函数显式标注返回类型；内部可推断。
- 用 `type` 表示联合/映射，用 `interface` 表示可扩展对象。
- 不为可选字段赋值 `undefined`（`exactOptionalPropertyTypes` 会拒绝）。

### 4.2 注释与文案

- 注释解释**为什么**，不复述代码。
- 复杂逻辑（epub.js 页索引反算、DRM 字体混淆放行、TXT 编码嗅探）必须留一段说明。
- 不留裸 `TODO`，写成 `// TODO(owner): 原因 + 触发条件`。
- 错误提示不打印路径以外的隐私信息；日志不含正文。

### 4.3 错误处理

- 主进程：结构化错误（`AppError` / `EpubError` / `TxtError` / `ImportServiceError`）→ `Result`；未知错误统一 `INTERNAL`。
- 渲染层：`api/` 层抛 `ApiError`，调用方 catch 后 toast；不允许空 `catch {}`。
- 可恢复错误（文件缺失、导入某本失败）必须给重试或替代操作。
- 退出路径（`beforeunload`、`visibilitychange`）禁止弹错。

---

## 5. 避坑清单

- **E-01 epub.js 页内定位**：0.3.93 的 `paginatedLocation` 不计容器 `scrollLeft`，同章翻页永远回报第一页。必须用 `scrollLeft / clientWidth` 反算页索引（见 `epubjs-engine.ts`）。
- **E-02 进度 flush**：关闭/切页时进度可能还没落盘，`visibilitychange`、`beforeunload`、返回书架三处都要 flush；`flush` 用 `send` 不用 `invoke`。
- **E-03 首次定位**：第一次 `relocated` 要立即保存，否则「在读」状态与最近阅读时间不准。
- **E-04 重排锚点**：改字号/版心/窗口大小后必须按当前 locator 恢复；重排期间禁用输入，避免用户翻页被吃掉。
- **E-05 TXT 编码**：不能只用 `TextDecoder('utf-8')`，必须带 fatal 尝试并回落 GB18030；BOM 优先。
- **E-06 封面**：书架只读 240px 缩略图，不要回退去解压原书；`nativeImage` 解不出的图（如 SVG）直接跳过。
- **E-07 大文件**：`book:read` 整本读入内存，1GB 上限是有意为之；不要在主进程同步 `readFileSync`。
- **E-08 索引写入**：不要直接 `writeFile`，否则断电会留下半截 JSON；所有写走原子写并保留 `.bak`。
- **E-09 路径安全**：封面协议与书籍 id 必须校验 64 位 hex；禁止把渲染层传来的路径直接拼进 `books/`。
- **E-10 双份声明**：`window.api` 的类型在 `services/api.ts` 声明一次即可，不要在别处重复定义不同的接口。
- **E-11 测试端口**：E2E 固定 CDP 端口，不能并行；端口被占用会直接超时。
- **E-12 主题与原生窗口**：切主题要同时改 `nativeTheme.themeSource` 与 `data-theme`，否则标题栏和正文会不一致。
- **E-13 不联网**：禁止引入任何运行时网络请求（字体 CDN、埋点、更新检查都不行）。
- **E-14 删除顺序**：先删索引再删文件不可回滚；当前实现是先移除索引、再尽力清理文件，清理失败只记日志，不要因此回滚索引。
- **E-15 沙箱**：渲染层 `sandbox: true`，preload 里不能用 Node 模块；新增能力必须走 IPC。

---

## 6. 约束与假设

- 【假设】开发与交付环境为 Windows 10/11 x64，Node ≥ 20，pnpm 为唯一包管理器。
- 【假设】单人开发，无专职测试与设计，门禁需本地自觉执行。
- 【假设】单仓库单 `package.json`；`@shared` / `@renderer` 通过路径别名引用。
- 【假设】不引入 UI 组件库，基础组件自建，避免包体与样式体系冲突。
- 【假设】书库规模 ≤ 2000 本，JSON 索引足够；超过后迁移 SQLite。
- 【假设】不实现自动更新、崩溃上报、遥测；日志仅落本地。
- 【假设】首版只保证 Windows 安装包可用，macOS/Linux 不验证。
