import { useEffect, useState } from 'react';
import { ENTITY_KIND_LABELS, type EntityKind } from '@shared/types';
import { useWorkspace } from '@renderer/store/workspace';

const KINDS = Object.keys(ENTITY_KIND_LABELS) as EntityKind[];

type Mode = 'view' | 'edit';

export function EntityEditor() {
  const open = useWorkspace((state) => state.entityEditorOpen);
  const editing = useWorkspace((state) => state.editingEntity);
  const draftKind = useWorkspace((state) => state.entityDraftKind);
  const project = useWorkspace((state) => state.project);
  const close = useWorkspace((state) => state.closeEntity);
  const save = useWorkspace((state) => state.saveEntity);
  const remove = useWorkspace((state) => state.deleteEditingEntity);
  const selectChapter = useWorkspace((state) => state.selectChapter);

  const [mode, setMode] = useState<Mode>('view');
  const [kind, setKind] = useState<EntityKind>(editing?.kind ?? draftKind);
  const [name, setName] = useState(editing?.name ?? '');
  const [alias, setAlias] = useState(editing?.alias ?? '');
  const [role, setRole] = useState(editing?.role ?? '');
  const [description, setDescription] = useState(editing?.description ?? '');
  const [relations, setRelations] = useState(editing?.relations ?? '');

  // 每次打开：已有卡片先给「查看」，新建才直接进「编辑」
  useEffect(() => {
    if (!open) return;
    setMode(editing ? 'view' : 'edit');
  }, [open, editing?.id, editing]);

  if (!open || !project) return null;

  function startEdit(): void {
    if (!editing) return;
    setKind(editing.kind);
    setName(editing.name);
    setAlias(editing.alias);
    setRole(editing.role);
    setDescription(editing.description);
    setRelations(editing.relations);
    setMode('edit');
  }

  async function submit(): Promise<void> {
    if (!project || !name.trim()) return;
    await save({
      projectId: project.id,
      kind,
      name: name.trim(),
      alias,
      role,
      description,
      relations,
      ...(editing ? { id: editing.id } : {}),
    });
    setMode('view');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6">
      <div className="flex max-h-[86vh] w-[560px] flex-col rounded-xl border border-line bg-paper shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-serif text-lg">
            {mode === 'edit' ? (editing ? '编辑设定' : '新建设定') : '设定详情'}
          </h2>
          <button className="text-sm text-ink-soft hover:text-ink" onClick={close} type="button">
            关闭
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {mode === 'view' && editing ? (
            <>
              <div className="flex items-baseline gap-2">
                <span className="rounded bg-paper-deep px-2 py-0.5 text-[11px] text-ink-soft">
                  {ENTITY_KIND_LABELS[editing.kind]}
                </span>
                <span className="font-serif text-xl">{editing.name}</span>
                {editing.alias ? (
                  <span className="text-xs text-ink-soft">（{editing.alias}）</span>
                ) : null}
              </div>

              {editing.role ? <p className="mt-2 text-sm text-ink-soft">{editing.role}</p> : null}

              {editing.description ? (
                <section className="mt-4">
                  <h3 className="text-xs uppercase tracking-widest text-ink-soft">描述</h3>
                  <p className="mt-1 whitespace-pre-wrap font-serif text-sm leading-relaxed">
                    {editing.description}
                  </p>
                </section>
              ) : null}

              {editing.relations ? (
                <section className="mt-4">
                  <h3 className="text-xs uppercase tracking-widest text-ink-soft">关系</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                    {editing.relations}
                  </p>
                </section>
              ) : null}

              {editing.description === '' && editing.relations === '' ? (
                <p className="mt-4 rounded-md border border-dashed border-line px-3 py-3 text-xs text-ink-soft">
                  这张卡还是空的。点右下角「编辑」补充描述与关系。
                </p>
              ) : null}

              <section className="mt-5">
                <h3 className="text-xs uppercase tracking-widest text-ink-soft">
                  出现在 {editing.chapters.length} 章
                </h3>
                {editing.chapters.length === 0 ? (
                  <p className="mt-1 text-xs text-ink-soft">
                    还没有关联章节。在右栏「关联设定」里挂到正在写的章节上。
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1">
                    {editing.chapters.map((chapter) => (
                      <li key={chapter.id}>
                        <button
                          className="rounded bg-paper-deep px-2 py-0.5 text-[11px] text-ink-soft hover:bg-accent hover:text-white"
                          onClick={() => {
                            close();
                            void selectChapter(chapter.id);
                          }}
                          title="跳到这一章"
                          type="button"
                        >
                          {chapter.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <>
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <label className="block text-xs text-ink-soft">
                  类型
                  <select
                    className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
                    onChange={(event) => setKind(event.target.value as EntityKind)}
                    value={kind}
                  >
                    {KINDS.map((item) => (
                      <option key={item} value={item}>
                        {ENTITY_KIND_LABELS[item]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-ink-soft">
                  名称
                  <input
                    autoFocus
                    className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="玄清"
                    value={name}
                  />
                </label>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <label className="block text-xs text-ink-soft">
                  别名
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
                    onChange={(event) => setAlias(event.target.value)}
                    placeholder="玄清道长"
                    value={alias}
                  />
                </label>
                <label className="block text-xs text-ink-soft">
                  身份 / 定位
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
                    onChange={(event) => setRole(event.target.value)}
                    placeholder="青云观主"
                    value={role}
                  />
                </label>
              </div>

              <label className="mt-3 block text-xs text-ink-soft">
                描述
                <textarea
                  className="mt-1 h-28 w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="外貌、性格、来历……"
                  value={description}
                />
              </label>

              <label className="mt-3 block text-xs text-ink-soft">
                关系
                <textarea
                  className="mt-1 h-20 w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                  onChange={(event) => setRelations(event.target.value)}
                  placeholder="青云子的师父；与李慕白有旧怨……"
                  value={relations}
                />
              </label>

              {editing && editing.chapters.length > 0 ? (
                <p className="mt-3 text-[11px] text-ink-soft">
                  已在 {editing.chapters.length} 章出现；关联关系在右栏「关联设定」里增减。
                </p>
              ) : null}
            </>
          )}
        </div>

        <footer className="flex items-center justify-between border-t border-line px-5 py-3">
          <div>
            {editing && mode === 'view' ? (
              <button
                className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:text-red-600"
                onClick={() => void remove()}
                type="button"
              >
                删除
              </button>
            ) : null}
          </div>
          <div className="flex gap-2">
            {mode === 'view' && editing ? (
              <>
                <button
                  className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-paper-deep"
                  onClick={close}
                  type="button"
                >
                  关闭
                </button>
                <button
                  className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90"
                  onClick={startEdit}
                  type="button"
                >
                  编辑
                </button>
              </>
            ) : (
              <>
                <button
                  className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-paper-deep"
                  onClick={() => (editing ? setMode('view') : close())}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90 disabled:opacity-40"
                  disabled={!name.trim()}
                  onClick={() => void submit()}
                  type="button"
                >
                  保存
                </button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
