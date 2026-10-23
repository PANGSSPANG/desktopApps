import { useEffect, useRef, useState } from 'react';
import { EXPORT_KIND_LABELS, isChapterLocked, type ExportKind } from '@shared/types';
import { formatChapterTitle, stripChapterNumber } from '@shared/chapter-title';
import { api, errorMessage, unwrap } from '@renderer/api';
import { formatClock, formatWords } from '@renderer/lib/format';
import { useWorkspace } from '@renderer/store/workspace';
import { ScrollArea } from '@renderer/components/scroll-area';
import { ChapterEditor } from '../editor/chapter-editor';
import { ImportDialog } from '../import/import-dialog';
import { SnapshotPanel } from '../snapshot/snapshot-panel';
import { ChapterEntities } from '../world/chapter-entities';
import { EntityEditor } from '../world/entity-editor';
import { WorldPanel } from '../world/world-panel';

const SAVE_STATE_TEXT: Record<string, string> = {
  idle: '已就绪',
  dirty: '未保存',
  saving: '保存中…',
  saved: '已保存',
  error: '保存失败',
};

export function WorkspaceView() {
  const project = useWorkspace((state) => state.project);
  const tree = useWorkspace((state) => state.tree);
  const chapter = useWorkspace((state) => state.chapter);
  const stats = useWorkspace((state) => state.stats);
  const saveState = useWorkspace((state) => state.saveState);
  const savedAt = useWorkspace((state) => state.savedAt);

  const closeProject = useWorkspace((state) => state.closeProject);
  const selectChapter = useWorkspace((state) => state.selectChapter);
  const addVolume = useWorkspace((state) => state.addVolume);
  const addChapter = useWorkspace((state) => state.addChapter);
  const removeChapter = useWorkspace((state) => state.removeChapter);
  const removeVolume = useWorkspace((state) => state.removeVolume);
  const moveVolume = useWorkspace((state) => state.moveVolume);
  const updateChapterMeta = useWorkspace((state) => state.updateChapterMeta);
  const openSearch = useWorkspace((state) => state.openSearch);
  const editorEpoch = useWorkspace((state) => state.editorEpoch);
  const searchTarget = useWorkspace((state) => state.searchTarget);
  const notify = useWorkspace((state) => state.notify);

  const [exporting, setExporting] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [importing, setImporting] = useState(false);
  const [leftTab, setLeftTab] = useState<'manuscript' | 'world'>('manuscript');
  const [focusMode, setFocusMode] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingVolumeId, setDraggingVolumeId] = useState<string | null>(null);
  const [exportVolumeOnly, setExportVolumeOnly] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = window.localStorage.getItem('wenhuo.collapsedVolumes');
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('wenhuo.collapsedVolumes', JSON.stringify(collapsed));
    } catch {
      // 存不下就只在本次会话生效
    }
  }, [collapsed]);
  const moveChapter = useWorkspace((state) => state.moveChapter);

  // 导出菜单：点外部或按 Esc 关闭（之前挂在 onMouseLeave 上，鼠标移向菜单时穿过间隙就误关）
  useEffect(() => {
    if (!exportMenu) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!exportMenuRef.current?.contains(event.target as Node)) setExportMenu(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setExportMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [exportMenu]);

  // 专注模式下 Esc 退出
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  if (!project) return null;

  const locked = chapter ? isChapterLocked(chapter.status) : false;
  const currentVolumeId =
    tree?.volumes.find((volume) => volume.chapters.some((item) => item.id === chapter?.id))?.id ??
    null;

  async function handleExport(format: ExportKind): Promise<void> {
    if (!project) return;
    setExportMenu(false);
    setExporting(true);
    try {
      // 成功提示与「打开所在文件夹」由主进程负责，这里只关心失败
      unwrap(
        await api.exporter.run(
          project.id,
          format,
          exportVolumeOnly ? (currentVolumeId ?? undefined) : undefined,
        ),
      );
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  const saveText =
    saveState === 'saved' && savedAt
      ? `已保存 ${formatClock(savedAt)}`
      : (SAVE_STATE_TEXT[saveState] ?? '');

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-line px-4">
        <button
          className="rounded px-2 py-1 text-sm text-ink-soft hover:bg-paper-deep"
          onClick={closeProject}
          type="button"
        >
          ← 书架
        </button>
        <span className="font-serif text-base">{project.title}</span>
        <span className="text-xs text-ink-soft">{saveText}</span>
        <span className="ml-auto text-xs text-ink-soft">
          今日 {stats?.todayWords ?? 0} / {stats?.dailyGoal ?? 0} 字 · 连续 {stats?.streak ?? 0} 天
        </span>
        <button
          className="rounded-md border border-line px-3 py-1 text-sm hover:border-accent hover:text-accent"
          onClick={() => setImporting(true)}
          type="button"
        >
          导入
        </button>
        <button
          className="rounded-md border border-line px-3 py-1 text-sm hover:border-accent hover:text-accent"
          onClick={openSearch}
          title="搜索（Ctrl+K）"
          type="button"
        >
          搜索 ⌘K
        </button>
        <button
          className="rounded-md border border-line px-3 py-1 text-sm hover:border-accent hover:text-accent"
          onClick={() => setFocusMode((value) => !value)}
          title="专注模式（Esc 退出）"
          type="button"
        >
          {focusMode ? '退出专注' : '专注'}
        </button>
        <div className="relative" ref={exportMenuRef}>
          <button
            aria-expanded={exportMenu}
            className="rounded-md border border-line px-3 py-1 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
            disabled={exporting}
            onClick={() => setExportMenu((open) => !open)}
            type="button"
          >
            {exporting ? '导出中…' : '导出 ▾'}
          </button>

          {exportMenu ? (
            <div className="absolute right-0 top-full z-30 w-52 overflow-hidden rounded-md border border-line bg-paper pt-1 shadow-lg">
              <label className="flex items-center gap-2 border-b border-line/60 px-3 py-1.5 text-[11px] text-ink-soft">
                <input
                  checked={exportVolumeOnly}
                  disabled={!currentVolumeId}
                  onChange={(event) => setExportVolumeOnly(event.target.checked)}
                  type="checkbox"
                />
                只导出当前卷
              </label>
              <div className="rounded-md border-t border-line/60">
                {(Object.keys(EXPORT_KIND_LABELS) as ExportKind[]).map((format) => (
                  <button
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-paper-deep"
                    key={format}
                    onClick={() => void handleExport(format)}
                    type="button"
                  >
                    {EXPORT_KIND_LABELS[format]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </header>

      <EntityEditor />

      {importing ? (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={() => {
            void useWorkspace.getState().refreshTree();
            void useWorkspace.getState().refreshStats();
          }}
          projectId={project.id}
        />
      ) : null}

      <div
        className={`grid min-h-0 flex-1 ${focusMode ? 'grid-cols-1' : 'grid-cols-[240px_1fr_280px]'}`}
      >
        <aside className={`min-h-0 border-r border-line bg-paper/60 ${focusMode ? 'hidden' : ''}`}>
          <ScrollArea className="px-3 py-4">
            <div className="mb-3 flex gap-1 px-1">
              <button
                className={`rounded px-2 py-0.5 text-xs ${leftTab === 'manuscript' ? 'bg-accent text-white' : 'text-ink-soft hover:bg-paper-deep'}`}
                onClick={() => setLeftTab('manuscript')}
                type="button"
              >
                稿件
              </button>
              <button
                className={`rounded px-2 py-0.5 text-xs ${leftTab === 'world' ? 'bg-accent text-white' : 'text-ink-soft hover:bg-paper-deep'}`}
                onClick={() => setLeftTab('world')}
                type="button"
              >
                设定
              </button>
            </div>

            {leftTab === 'world' ? (
              <WorldPanel />
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-xs uppercase tracking-widest text-ink-soft">稿件</span>
                  <button
                    className="rounded px-1.5 text-sm text-ink-soft hover:bg-paper-deep"
                    onClick={() => void addVolume()}
                    title="新建卷"
                    type="button"
                  >
                    ＋卷
                  </button>
                </div>

                {(tree?.volumes ?? []).map((volume) => (
                  <section className="group/vol mb-3" key={volume.id}>
                    <div
                      className={`flex items-center justify-between px-1 py-1 ${
                        draggingVolumeId === volume.id ? 'opacity-40' : ''
                      }`}
                      draggable
                      onDragEnd={() => setDraggingVolumeId(null)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                      }}
                      onDragStart={(event) => {
                        setDraggingVolumeId(volume.id);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', volume.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const dragged = event.dataTransfer.getData('text/plain');
                        setDraggingVolumeId(null);
                        if (!dragged || dragged === volume.id) return;
                        // 只在章节 id 不等于卷 id 时处理卷排序，避免和章节拖动互相干扰
                        void moveVolume(dragged, volume.id);
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-1">
                        <button
                          className="shrink-0 rounded px-1 text-[10px] text-ink-soft hover:bg-paper-deep"
                          onClick={() =>
                            setCollapsed((current) => ({
                              ...current,
                              [volume.id]: !current[volume.id],
                            }))
                          }
                          title={collapsed[volume.id] ? '展开这一卷' : '折叠这一卷'}
                          type="button"
                        >
                          {collapsed[volume.id] ? '▸' : '▾'}
                        </button>
                        <span className="truncate text-sm font-medium">{volume.title}</span>
                        {collapsed[volume.id] ? (
                          <span className="shrink-0 text-[10px] text-ink-soft">
                            {volume.chapters.length} 章
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <button
                          className="rounded px-1 text-[10px] text-ink-soft/60 opacity-0 transition hover:text-red-600 group-hover/vol:opacity-100"
                          onClick={() => void removeVolume(volume.id)}
                          title="删除整卷（连同其中章节）"
                          type="button"
                        >
                          删卷
                        </button>
                        <button
                          className="rounded px-1 text-xs text-ink-soft hover:bg-paper-deep"
                          onClick={() => void addChapter(volume.id)}
                          title="新建章节"
                          type="button"
                        >
                          ＋章
                        </button>
                      </span>
                    </div>
                    {collapsed[volume.id] ? null : (
                      <ul>
                        {volume.chapters.map((item) => {
                          const active = item.id === chapter?.id;
                          return (
                            <li className="group/row" key={item.id}>
                              <div
                                className={`flex w-full cursor-pointer items-baseline justify-between gap-2 rounded px-2 py-1.5 text-sm ${
                                  active
                                    ? 'bg-white text-ink shadow-sm'
                                    : 'text-ink-soft hover:bg-paper-deep'
                                } ${draggingId === item.id ? 'opacity-40' : ''}`}
                                draggable
                                onClick={() => void selectChapter(item.id)}
                                onDragEnd={() => setDraggingId(null)}
                                onDragOver={(event) => {
                                  event.preventDefault();
                                  event.dataTransfer.dropEffect = 'move';
                                }}
                                onDragStart={(event) => {
                                  setDraggingId(item.id);
                                  event.dataTransfer.effectAllowed = 'move';
                                  event.dataTransfer.setData('text/plain', item.id);
                                }}
                                onDrop={(event) => {
                                  event.preventDefault();
                                  const dragged = event.dataTransfer.getData('text/plain');
                                  setDraggingId(null);
                                  if (!dragged || dragged === item.id) return;
                                  void moveChapter(dragged, volume.id, item.id);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') void selectChapter(item.id);
                                }}
                                role="button"
                                tabIndex={0}
                              >
                                <span className="flex min-w-0 items-baseline gap-1">
                                  {item.status === 'done' ? (
                                    <span className="shrink-0 text-[10px] text-accent">✓</span>
                                  ) : null}
                                  <span className="truncate">
                                    {formatChapterTitle(item.number, item.title)}
                                  </span>
                                </span>
                                <span className="flex shrink-0 items-baseline gap-1">
                                  <button
                                    className="rounded px-1 text-[11px] text-ink-soft/60 opacity-0 transition hover:text-red-600 group-hover/row:opacity-100"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      void removeChapter(item.id);
                                    }}
                                    title="删除这一章"
                                    type="button"
                                  >
                                    删除
                                  </button>
                                  <span className="text-[11px] text-ink-soft">
                                    {item.wordCount}
                                  </span>
                                </span>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                ))}

                {tree && tree.volumes.length === 0 ? (
                  <p className="px-2 text-xs text-ink-soft">还没有卷，先新建一卷。</p>
                ) : null}
              </>
            )}
          </ScrollArea>
        </aside>

        <main className="min-h-0">
          {chapter ? (
            <div className="flex h-full flex-col">
              <div className="mx-auto w-full max-w-[680px] px-10 pt-8">
                <input
                  className="w-full bg-transparent font-serif text-xl outline-none disabled:text-ink-soft"
                  defaultValue={stripChapterNumber(chapter.title)}
                  disabled={locked}
                  key={`${chapter.id}-title`}
                  onBlur={(event) => {
                    const title = event.target.value.trim();
                    if (!title || title === chapter.title) return;
                    void api.manuscript
                      .renameChapter(chapter.id, title)
                      .then((result) => {
                        unwrap(result);
                        void useWorkspace.getState().refreshTree();
                      })
                      .catch((error: unknown) => notify(errorMessage(error)));
                  }}
                />
              </div>
              <div className="min-h-0 flex-1">
                <ChapterEditor
                  chapter={chapter}
                  highlight={
                    searchTarget && searchTarget.chapterId === chapter.id
                      ? {
                          query: searchTarget.query,
                          occurrence: searchTarget.occurrence,
                          nonce: searchTarget.nonce,
                        }
                      : null
                  }
                  key={`${chapter.id}:${editorEpoch}`}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-ink-soft">
              左侧新建一章即可开始写作。
            </div>
          )}
        </main>

        <aside className={`min-h-0 border-l border-line bg-paper/60 ${focusMode ? 'hidden' : ''}`}>
          <ScrollArea className="px-4 py-5">
            <h2 className="text-xs uppercase tracking-widest text-ink-soft">章节信息</h2>

            <div className="mt-4">
              <span className="text-xs text-ink-soft">状态</span>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <button
                  className={`rounded-md border px-2 py-1 text-xs ${
                    locked
                      ? 'border-line text-ink-soft hover:border-accent'
                      : 'border-accent bg-accent/10 text-accent'
                  }`}
                  disabled={!chapter || !locked}
                  onClick={() => void updateChapterMeta({ status: 'draft' })}
                  type="button"
                >
                  可编辑
                </button>
                <button
                  className={`rounded-md border px-2 py-1 text-xs ${
                    locked
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-line text-ink-soft hover:border-accent'
                  }`}
                  disabled={!chapter || locked}
                  onClick={() => void updateChapterMeta({ status: 'done' })}
                  type="button"
                >
                  已完成
                </button>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
                {locked
                  ? '已完成章节只读：改回「可编辑」才能继续修改。'
                  : '草稿与修改中都算可编辑；标为「已完成」后正文锁定。'}
              </p>
            </div>

            <label className="mt-4 block text-xs text-ink-soft">
              摘要
              <textarea
                className="mt-1 h-28 w-full resize-none rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
                defaultValue={chapter?.synopsis ?? ''}
                key={`${chapter?.id ?? 'none'}-synopsis`}
                onBlur={(event) => {
                  if (!chapter) return;
                  const text = event.target.value;
                  if (text === chapter.synopsis) return;
                  void updateChapterMeta({ synopsis: text });
                }}
                placeholder="一句话记住这一章写了什么"
              />
            </label>

            <dl className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">本章</dt>
                <dd>{formatWords(chapter?.wordCount ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">全书</dt>
                <dd>{formatWords(stats?.totalWords ?? 0)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">已完成</dt>
                <dd>
                  {stats?.doneCount ?? 0} / {stats?.chapterCount ?? 0} 章
                </dd>
              </div>
            </dl>

            <ChapterEntities />

            <SnapshotPanel />
          </ScrollArea>
        </aside>
      </div>

      <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line px-4 text-xs text-ink-soft">
        <span>本章 {formatWords(chapter?.wordCount ?? 0)}</span>
        <span>今日 {stats?.todayWords ?? 0} 字</span>
        <span>{saveText}</span>
      </footer>
    </div>
  );
}
