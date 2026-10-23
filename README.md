# harnessCodes · 桌面应用小仓库

两个本地优先的 Windows 桌面应用，共用一套工程习惯：Electron + React + TypeScript，数据只留本机，不登录、不联网、不做遥测。

| 项目 | 一句话 | 版本 | 技术栈 | 文档 |
| --- | --- | --- | --- | --- |
| [文火（WenHuo）](wenHuo/README.md) | 把长篇写完：卷章结构 + 自动保存 + 快照 + 设定库 + 导出 | 0.1.0 | Electron 43 · React 19 · better-sqlite3 13（WAL/FTS5）· Tiptap 3 | [README](wenHuo/README.md) · [PRD](wenHuo/PRD.md) · [技术方案](wenHuo/docs/tech-design.md) · [开发规范](wenHuo/AGENTS.md) |
| [electricReader](electricReader/README.md) | 把书读完：EPUB / TXT 书架 + 排版主题 + 进度记忆 | 1.1.0 | Electron 43 · React 19 · epub.js 0.3 · Zustand 5 · JSON 索引 | [README](electricReader/README.md) · [PRD](electricReader/PRD.md) · [技术方案](electricReader/docs/tech-design.md) · [开发规范](electricReader/AGENTS.md) |

两个项目**互不依赖**，各自有独立的 `package.json`、锁文件和构建产物；根目录只负责仓库级文档与忽略规则。

## 项目一：文火（WenHuo）

面向长篇作者的单机写作工作台。把「写、存、查、导」收在一个窗口里：

- 项目 / 卷 / 章三级结构，单章独立文档，拖拽排序
- 800ms 自动保存、手动与自动快照、崩溃草稿恢复
- 设定库（人物 / 地点 / 组织 / 物品）与章节双向关联、反向引用
- FTS5 trigram 中文全文搜索（1–2 字走 LIKE 兜底）
- 导入 TXT / Markdown 拆章，导出 TXT / Markdown / EPUB
- 整库 zip 备份、每日自动备份、恢复前留档

详细功能与验收见 [wenHuo/PRD.md](wenHuo/PRD.md)，架构与 schema 见 [wenHuo/docs/tech-design.md](wenHuo/docs/tech-design.md)。

```bash
cd wenHuo
pnpm install
pnpm dev          # 受限环境用 pnpm dev:local
pnpm typecheck && pnpm lint && pnpm test
```

## 项目二：electricReader

面向本地书库的极简阅读器。导入 EPUB / TXT，打开即读：

- 书库：封面 / 网格与列表 / 状态筛选 / 继续阅读 / 文件缺失重定位
- 阅读：目录抽屉、键盘与点击翻页、字号 / 行高 / 版心 / 字体、浅色 / 羊皮纸 / 深色
- 进度：Readium 风格 Locator（CFI + 文本片段），重排与重启后回到原段落
- 数据：内容 hash 去重、原子写索引、`.bak` 自动恢复、无网络请求

详细功能与验收见 [electricReader/PRD.md](electricReader/PRD.md)，解析与定位策略见 [electricReader/docs/tech-design.md](electricReader/docs/tech-design.md)。

```bash
cd electricReader
pnpm install
pnpm dev
pnpm typecheck && pnpm test
```

## 仓库结构

```
harnessCodes/
├─ README.md                 # 本文件：两个项目的入口
├─ .gitignore                # 仓库级忽略：node_modules / out / release / 日志
├─ wenHuo/                   # 文火：长篇写作工作台
│  ├─ src/{shared,main,preload,renderer}
│  ├─ tests/{unit,e2e,perf}
│  ├─ docs/{tech-design,ipc,w1-w3 计划,启动排错}
│  ├─ PRD.md  AGENTS.md  README.md
│  └─ package.json / electron.vite.config.ts / electron-builder.yml
└─ electricReader/           # electricReader：EPUB/TXT 阅读器
   ├─ src/{shared,main,preload,renderer}
   ├─ tests/{unit,e2e,helpers}
   ├─ docs/tech-design.md
   ├─ PRD.md  AGENTS.md  README.md
   └─ package.json / electron.vite.config.ts / electron-builder.yml
```

## 共同约定

- **本地优先**：没有服务端、账号体系与运行时网络请求；日志不记录正文。
- **数据安全**：写盘走原子写/事务，删除前二次确认，备份可恢复。
- **分层**：`shared` 纯函数 → `main` 数据能力 → `preload` 白名单 → `renderer` UI；渲染层不碰文件系统。
- **IPC 契约**：通道名 `domain:action`，返回值统一 `Result<T>`，错误文案可直接展示。
- **质量门禁**：`pnpm typecheck && pnpm test`；涉及交互/导入/导出的改动再跑 `pnpm test:e2e`。
- **提交**：Conventional Commits；一次提交一件事；不提交依赖、构建产物与安装包。

## 环境要求

- Windows 10/11 x64（两个项目首版都只验证 Windows）
- Node ≥ 20（文火要求 ≥ 22）
- pnpm（两个项目都只支持 pnpm）

## 发布

两个项目都用 electron-builder 出 Windows 安装包：

```bash
cd wenHuo && pnpm dist:win          # release/ 下生成 NSIS
cd electricReader && pnpm dist:win  # release/ 下生成 NSIS
```

`release/`、`out/`、`node_modules/` 均已在 `.gitignore` 中排除，仓库只保留源码、配置与文档。安装包通过 GitHub Releases 单独分发。
