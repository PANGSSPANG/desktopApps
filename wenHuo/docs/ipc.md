# IPC 契约

> 本文件由 `node scripts/gen-ipc-doc.cjs` 从 `src/shared/ipc.ts` 生成，请勿手改。
> 通道统一走 `handle(channel, logger, fn)` 包装，返回值恒为 `Result<T>`。

## 通道（46）

| 常量 | 通道 |
| --- | --- |
| `projectList` | `project:list` |
| `projectCreate` | `project:create` |
| `projectRename` | `project:rename` |
| `projectDelete` | `project:delete` |
| `projectOpen` | `project:open` |
| `manuscriptTree` | `manuscript:tree` |
| `volumeCreate` | `volume:create` |
| `volumeDelete` | `volume:delete` |
| `volumeMove` | `volume:move` |
| `chapterCreate` | `chapter:create` |
| `chapterGet` | `chapter:get` |
| `chapterSave` | `chapter:save` |
| `chapterPatch` | `chapter:patch` |
| `chapterMove` | `chapter:move` |
| `chapterRename` | `chapter:rename` |
| `chapterDelete` | `chapter:delete` |
| `statsOverview` | `stats:overview` |
| `exportRun` | `export:run` |
| `prefsGet` | `prefs:get` |
| `prefsSet` | `prefs:set` |
| `appInfo` | `app:info` |
| `backupCreate` | `backup:create` |
| `backupList` | `backup:list` |
| `backupPick` | `backup:pick` |
| `backupRestore` | `backup:restore` |
| `appBootstrap` | `app:bootstrap` |
| `worldList` | `world:list` |
| `worldGet` | `world:get` |
| `worldSave` | `world:save` |
| `worldDelete` | `world:delete` |
| `worldLink` | `world:link` |
| `worldUnlink` | `world:unlink` |
| `worldBacklinks` | `world:backlinks` |
| `importPick` | `import:pick` |
| `importPreview` | `import:preview` |
| `importCommit` | `import:commit` |
| `snapshotList` | `snapshot:list` |
| `snapshotCreate` | `snapshot:create` |
| `snapshotGet` | `snapshot:get` |
| `snapshotDelete` | `snapshot:delete` |
| `snapshotRestore` | `snapshot:restore` |
| `searchQuery` | `search:query` |
| `draftStash` | `draft:stash` |
| `draftClear` | `draft:clear` |
| `recoveryRestore` | `recovery:restore` |
| `recoveryDiscard` | `recovery:discard` |

## API 命名空间（14）

- `window.api.project`
- `window.api.manuscript`
- `window.api.chapter`
- `window.api.stats`
- `window.api.snapshot`
- `window.api.search`
- `window.api.draft`
- `window.api.recovery`
- `window.api.world`
- `window.api.importer`
- `window.api.prefs`
- `window.api.backup`
- `window.api.exporter`
- `window.api.app`

## 约束

- 渲染层不直接调用 `window.api`，统一经 `src/renderer/api/*`。
- 新增通道时同步更新：`shared/ipc.ts`、`preload/index.ts`、主进程 handler，并重跑本脚本。
- 通道命名 `domain:action`，全小写、动词在后。
