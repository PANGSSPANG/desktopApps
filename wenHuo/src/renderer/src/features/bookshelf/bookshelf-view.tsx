import { useState } from 'react';
import { GENRES, PROJECT_TYPES, type Genre } from '@shared/project-type';
import { formatRelative, formatWords } from '@renderer/lib/format';
import { useWorkspace } from '@renderer/store/workspace';
import { SettingsDialog } from '../settings/settings-dialog';
import { BackupDialog } from '../backup/backup-dialog';
import { ImportDialog } from '../import/import-dialog';

export function BookshelfView() {
  const projects = useWorkspace((state) => state.projects);
  const createProject = useWorkspace((state) => state.createProject);
  const openProject = useWorkspace((state) => state.openProject);
  const removeProject = useWorkspace((state) => state.removeProject);
  const renameProject = useWorkspace((state) => state.renameProject);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genre, setGenre] = useState<Genre>('webnovel');

  async function submit(): Promise<void> {
    if (!title.trim()) return;
    await createProject({
      title: title.trim(),
      genre,
      ...(author.trim() ? { author: author.trim() } : {}),
    });
    setCreating(false);
    setTitle('');
    setAuthor('');
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-end justify-between border-b border-line px-10 py-6">
        <div>
          <h1 className="font-serif text-2xl tracking-wide">文火</h1>
          <p className="mt-1 text-sm text-ink-soft">本地优先的长篇写作工作台 · 把长篇写完</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md border border-line px-4 py-2 text-sm hover:border-accent hover:text-accent"
            onClick={() => setSettingsOpen(true)}
            type="button"
          >
            设置
          </button>
          <button
            className="rounded-md border border-line px-4 py-2 text-sm hover:border-accent hover:text-accent"
            onClick={() => setBackingUp(true)}
            type="button"
          >
            备份
          </button>
          <button
            className="rounded-md border border-line px-4 py-2 text-sm hover:border-accent hover:text-accent"
            onClick={() => setImporting(true)}
            type="button"
          >
            导入稿件
          </button>
          <button
            className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90"
            onClick={() => setCreating(true)}
            type="button"
          >
            新建项目
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-10 py-8">
        {projects.length === 0 ? (
          <div className="mx-auto mt-24 max-w-md text-center text-ink-soft">
            <p className="font-serif text-lg">书架还是空的</p>
            <p className="mt-2 text-sm">新建一个项目，从第一章开始。稿件只保存在这台电脑上。</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <li className="group relative" key={project.id}>
                <div
                  className="w-full cursor-pointer rounded-xl border border-line bg-white/60 p-5 text-left transition hover:border-accent/50 hover:bg-white"
                  onClick={() => void openProject(project.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void openProject(project.id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    {editingId === project.id ? (
                      <input
                        autoFocus
                        className="min-w-0 flex-1 rounded border border-accent bg-white px-1 py-0.5 font-serif text-lg outline-none"
                        onBlur={() => {
                          void renameProject(project.id, draft);
                          setEditingId(null);
                        }}
                        onChange={(event) => setDraft(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === 'Enter') {
                            void renameProject(project.id, draft);
                            setEditingId(null);
                          }
                          if (event.key === 'Escape') setEditingId(null);
                        }}
                        value={draft}
                      />
                    ) : (
                      <span className="truncate font-serif text-lg">{project.title}</span>
                    )}
                    <span className="shrink-0 rounded bg-paper-deep px-2 py-0.5 text-xs text-ink-soft">
                      {PROJECT_TYPES[project.genre].label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    {project.author || '未署名'} · {formatRelative(project.updatedAt)}编辑
                  </p>
                  <p className="mt-4 text-sm">
                    {formatWords(project.totalWords)}
                    <span className="text-ink-soft"> · {project.chapterCount} 章</span>
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-deep">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.round(project.progress * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-ink-soft">
                      {Math.round(project.progress * 100)}%
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        className="rounded px-2 py-0.5 text-[11px] text-ink-soft/60 opacity-0 transition hover:text-accent group-hover:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDraft(project.title);
                          setEditingId(project.id);
                        }}
                        title="重命名项目"
                        type="button"
                      >
                        重命名
                      </button>
                      <button
                        className="rounded px-2 py-0.5 text-[11px] text-ink-soft/60 opacity-0 transition hover:text-red-600 group-hover:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeProject(project.id);
                        }}
                        title="删除项目"
                        type="button"
                      >
                        删除
                      </button>
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {backingUp ? <BackupDialog onClose={() => setBackingUp(false)} /> : null}

      {importing ? (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={(projectId) => void openProject(projectId)}
        />
      ) : null}

      {creating ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/20">
          <div className="w-[420px] rounded-xl border border-line bg-paper p-6 shadow-2xl">
            <h2 className="font-serif text-lg">新建项目</h2>
            <label className="mt-4 block text-sm">
              书名
              <input
                autoFocus
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-accent"
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>
            <label className="mt-3 block text-sm">
              作者
              <input
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-accent"
                onChange={(event) => setAuthor(event.target.value)}
                value={author}
              />
            </label>
            <label className="mt-3 block text-sm">
              类型
              <select
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 outline-none focus:border-accent"
                onChange={(event) => setGenre(event.target.value as Genre)}
                value={genre}
              >
                {GENRES.map((item) => (
                  <option key={item} value={item}>
                    {PROJECT_TYPES[item].label}
                  </option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-xs text-ink-soft">
              类型只影响默认目标与侧栏模块，不改变数据结构。
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                className="rounded-md px-4 py-2 text-sm text-ink-soft hover:bg-paper-deep"
                onClick={() => setCreating(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-40"
                disabled={!title.trim()}
                onClick={() => void submit()}
                type="button"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {settingsOpen ? <SettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}
