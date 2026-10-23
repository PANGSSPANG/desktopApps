# electricReader

本地优先的桌面电子书阅读器。把 EPUB / TXT 拖进书架，进度、排版和阅读状态只存在本机——没有账号、没有云同步、没有任何网络请求。

- 定位：安静的本地阅读器，而不是书城客户端
- 版本：**1.1.0**
- 平台：Windows 10/11 x64（代码保持跨平台，首版只验证 Windows）
- 依赖：Node ≥ 20 + pnpm

## 功能

### 书架

- 导入：文件选择框或直接拖入窗口，一次最多 500 个文件；按文件内容 SHA-256 去重，改文件名不会重复入库
- 视图：网格 / 列表切换，按「全部 / 在读 / 未读 / 已读」筛选，计数实时联动
- 继续阅读：自动挑出最近在读且文件仍在的一本置顶展示
- 封面：导入时从 EPUB 抽取并生成 240px JPEG 缩略图，书架永远不读原图
- 文件丢失：检测到书库副本被删时标记「文件缺失」，可重新定位（重新定位会校验内容 hash，防止挂错书）
- 管理：删除书籍（二次确认并清理副本与封面）、手动切换阅读状态

### 阅读器

- 双格式：EPUB 2 / EPUB 3；TXT 支持 UTF-8（含 BOM）、UTF-16LE/BE、GB18030
- TXT 在打开时按章节规则切分并生成内存中的 EPUB 文档，同样支持目录、翻页和进度
- 目录：抽屉式 TOC，支持多级章节，当前章节高亮
- 排版：字号 5 档、行高 3 档、版心宽度 4 档、衬线/无衬线、首行缩进开关
- 主题：浅色 / 羊皮纸 / 深色，可跟随系统；工具栏切换即时生效
- 翻页：键盘（← →、PageUp/PageDown、空格）、点击左右热区、横向滚轮，可在设置里切换「按键 / 点击 / 两者」
- 位置记忆：Readium 风格 Locator（CFI + href + 文本片段 + 进度百分比），重排、换字号、重启后回到原段落
- 进度保存：翻页后 1.2s 防抖落盘；窗口隐藏、关闭、返回书架时立即 flush；读到 99% 自动标记「已读」

### 数据与安全

- 书库索引 `library.json` 原子写入（临时文件 → fsync → .bak → rename），损坏时自动归档并尝试从 `.bak` 恢复
- 所有书籍副本按内容 hash 命名，导入、重定位、删除都不会误伤其他书
- 渲染进程：`contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`、CSP 生产态无内联脚本
- 书内容渲染在不带 `allow-scripts` 的 iframe 中；外链一律交给系统浏览器；权限请求与下载默认拒绝
- 覆盖 `reader://` 自定义协议读取封面，只允许 64 位 hex 书名，杜绝路径穿越

## 技术栈

Electron 43 · React 19 · TypeScript 5（strict）· electron-vite 6 · Tailwind CSS 4 · Zustand 5 · epub.js 0.3 · Vitest 5 · Playwright 1.64 · electron-builder 26。

## 快速开始

```bash
pnpm install
pnpm dev          # 开发态：主进程改动自动重启，渲染层 HMR
pnpm build        # 三端产物到 out/
pnpm start        # 用 Electron 预览构建产物
```

质量与交付：

```bash
pnpm typecheck    # 主进程 + 渲染层两套 tsconfig
pnpm test         # Vitest 单元/集成（48 条）
pnpm test:e2e     # 先构建，再用 Playwright 驱动真实 Electron（5 条）
pnpm dist:win     # NSIS 安装包到 release/
```

> `pnpm test:e2e` 需要桌面会话；E2E helper 固定使用 CDP 端口 19222，因此 Playwright 配置为串行单 worker。

### 启动 / 测试排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 双击 exe 或 E2E 启动后进程立刻退出（退出码 `2147483651` / `STATUS_BREAKPOINT`） | 部分受管机器的安全策略会拦截非系统目录下未签名的 Electron 进程，代码还没开始执行 | 把项目或安装包移到用户目录（如 `C:\Users\<name>\apps`）再运行，或加入安全软件信任区 |
| `Error: Electron uninstall` | `node_modules/electron/dist` 缺失 | `node node_modules/electron/install.js` 重新下载 |
| E2E 一直等待 CDP 超时 | 19222 端口被占用，或 Electron 未能启动 | 关闭占用进程后重跑；确认 `node_modules/electron/dist/electron.exe` 存在 |
| 书架为空但 `library.json` 有内容 | 索引解析失败，已被归档为 `library.corrupt-*.json` | 查看主进程控制台输出，用 `.bak` 恢复或重新导入 |

## 目录

```
electricReader/
├─ electron.vite.config.ts     # 三端构建 + CSP 占位符替换
├─ electron-builder.yml        # Windows NSIS 打包
├─ src/
│  ├─ shared/                  # 纯函数与类型：Locator、设置、IPC 契约（禁止 import electron）
│  ├─ main/                    # 窗口、书库索引、EPUB/TXT 解析、封面、IPC
│  │  ├─ epub/                 # OPF/元数据/DRM 识别、导入管线、封面缩略图
│  │  ├─ storage/              # library.json 读写、原子写、路径约定
│  │  ├─ txt/                  # 编码识别、拆章、TXT → EPUB
│  │  └─ ipc/                  # Result 包装与 handler 注册
│  ├─ preload/                 # contextBridge 白名单
│  └─ renderer/                # 书架、阅读页、排版设置、主题、TOC
├─ tests/
│  ├─ unit/                    # 48 条：解析、导入、索引、定位、原子写
│  ├─ e2e/                     # 5 条：导入、翻页、目录、重启续读、删除
│  └─ helpers/                 # 真实 EPUB/TXT fixture 生成器
└─ docs/tech-design.md         # 架构、数据格式、解析与定位策略
```

## 数据存放

Windows 下位于 `%APPDATA%\electricReader`：

```
library.json            # 书库索引（schemaVersion: 2）
library.json.bak        # 上一次成功写入的索引
books\<sha256>.epub     # 书籍副本（TXT 为 .txt）
books\<sha256>\cover.jpg  # 封面缩略图
```

可用环境变量覆盖，便于测试与便携使用：

| 变量 | 用途 |
| --- | --- |
| `ELECTRICREADER_USER_DATA` | 指定 userData 根目录 |
| `ELECTRICREADER_CDP_PORT` | 打开远程调试端口（E2E 用） |
| `ELECTRICREADER_OPEN_DEVTOOLS=1` | 启动时打开 DevTools |
| `ELECTRICREADER_ELECTRON_PATH` | 指定 E2E 使用的 Electron 可执行文件 |

## 已知边界

- 仅支持 EPUB / TXT；MOBI、AZW3、PDF、漫画压缩包不在范围内
- 不支持 DRM 加密书（字体混淆除外），不做批注、书签、划线、全文检索、TTS
- 单本书读取上限 1GB，EPUB 解压后上限 2GB，TXT 上限 200MB，单次导入上限 500 个文件
- 安装包未做代码签名，Windows SmartScreen 会提示「未知发布者」
- 单窗口、单实例；不做多窗口对照阅读

## 文档

| 文档 | 内容 |
| --- | --- |
| [PRD.md](PRD.md) | 定位、用户场景、P0 功能与验收、非目标、路线图 |
| [docs/tech-design.md](docs/tech-design.md) | 进程架构、数据模型、导入管线、定位与重排、安全基线 |
| [AGENTS.md](AGENTS.md) | 开发规范、IPC / 存储约定、测试门禁、避坑清单 |

上游仓库（同时包含「文火」）：见 [../README.md](../README.md)。
