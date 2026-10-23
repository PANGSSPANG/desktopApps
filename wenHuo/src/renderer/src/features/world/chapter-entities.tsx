import { useEffect } from 'react';
import { ENTITY_KIND_LABELS } from '@shared/types';
import { pickableEntities } from '@shared/entity-picker';
import { useWorkspace } from '@renderer/store/workspace';

/** 右栏：本章关联了哪些设定卡，可增可减；开启提及提示后还会主动提醒。 */
export function ChapterEntities() {
  const chapter = useWorkspace((state) => state.chapter);
  const linked = useWorkspace((state) => state.chapterEntities);
  const allEntities = useWorkspace((state) => state.allEntities);
  const candidates = useWorkspace((state) => state.mentionCandidates);
  const prefs = useWorkspace((state) => state.prefs);
  const setMentionHint = useWorkspace((state) => state.setMentionHint);
  const linkEntity = useWorkspace((state) => state.linkEntity);
  const unlinkEntity = useWorkspace((state) => state.unlinkEntity);
  const openEntity = useWorkspace((state) => state.openEntity);
  const loadAllEntities = useWorkspace((state) => state.loadAllEntities);

  // 每次进章节都重新拉一遍，避免用打开项目时的旧列表（新建的卡会看不见）
  useEffect(() => {
    void loadAllEntities();
  }, [chapter?.id, loadAllEntities]);

  if (!chapter) return null;

  const available = pickableEntities(allEntities, linked);

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs uppercase tracking-widest text-ink-soft">关联设定</h2>
        <span className="text-[11px] text-ink-soft">{linked.length} 个</span>
      </div>

      {linked.length === 0 ? (
        <p className="mt-2 text-[11px] text-ink-soft">这一章还没有挂人物或地点。</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1">
          {linked.map((entity) => (
            <li key={entity.id}>
              <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px] shadow-sm">
                <button
                  className="hover:text-accent"
                  onClick={() => void openEntity(entity.id)}
                  title={ENTITY_KIND_LABELS[entity.kind]}
                  type="button"
                >
                  {entity.name}
                </button>
                <button
                  aria-label="取消关联"
                  className="text-ink-soft/60 hover:text-red-600"
                  onClick={() => void unlinkEntity(entity.id)}
                  title="取消关联"
                  type="button"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {candidates.length > 0 ? (
        <div className="mt-2 rounded-md border border-dashed border-accent/40 bg-accent/5 px-2 py-1.5">
          <p className="text-[11px] text-ink-soft">正文里提到了：</p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {candidates.map((entity) => (
              <li key={entity.id}>
                <button
                  className="rounded bg-white px-2 py-0.5 text-[11px] text-accent shadow-sm hover:bg-accent hover:text-white"
                  onClick={() => void linkEntity(entity.id)}
                  title="关联到本章"
                  type="button"
                >
                  ＋ {entity.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {allEntities.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-line px-2 py-2 text-[11px] leading-relaxed text-ink-soft">
          还没有设定卡。左栏切到「设定」→「＋ 新建」，建完这里就能选了。
        </p>
      ) : available.length === 0 ? (
        <p className="mt-2 text-[11px] text-ink-soft">项目里的设定卡都已关联到本章。</p>
      ) : (
        <select
          className="mt-2 w-full rounded-md border border-line bg-white px-2 py-1 text-xs text-ink-soft outline-none focus:border-accent"
          onChange={(event) => {
            if (!event.target.value) return;
            void linkEntity(event.target.value);
            event.target.value = '';
          }}
          value=""
        >
          <option value="">＋ 关联设定卡…（{available.length} 张可选）</option>
          {available.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {ENTITY_KIND_LABELS[entity.kind]} · {entity.name}
            </option>
          ))}
        </select>
      )}

      <label className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-soft">
        <input
          checked={prefs.mentionHint}
          onChange={(event) => void setMentionHint(event.target.checked)}
          type="checkbox"
        />
        正文提到未关联的设定卡时提醒
      </label>
    </section>
  );
}
