import { ENTITY_KIND_LABELS, type EntityKind } from '@shared/types';
import { useWorkspace } from '@renderer/store/workspace';

const KINDS = Object.keys(ENTITY_KIND_LABELS) as EntityKind[];
type Filter = EntityKind | 'all';

export function WorldPanel() {
  const entities = useWorkspace((state) => state.entities);
  const kind = useWorkspace((state) => state.entityKind);
  const setEntityKind = useWorkspace((state) => state.setEntityKind);
  const openEntity = useWorkspace((state) => state.openEntity);
  const project = useWorkspace((state) => state.project);

  const filters: { value: Filter; label: string }[] = [
    { value: 'all', label: '全部' },
    ...KINDS.map((item) => ({ value: item as Filter, label: ENTITY_KIND_LABELS[item] })),
  ];

  return (
    <div className="px-1">
      <div className="mb-2 flex flex-wrap gap-1">
        {filters.map((filter) => (
          <button
            className={`rounded px-2 py-0.5 text-[11px] ${
              kind === filter.value ? 'bg-accent text-white' : 'text-ink-soft hover:bg-paper-deep'
            }`}
            key={filter.value}
            onClick={() => setEntityKind(filter.value)}
            type="button"
          >
            {filter.label}
          </button>
        ))}
      </div>

      <button
        className="mb-2 w-full rounded-md border border-dashed border-line px-2 py-1 text-xs text-ink-soft hover:border-accent hover:text-accent"
        onClick={() => void openEntity(null, kind === 'all' ? 'character' : kind)}
        type="button"
      >
        ＋ 新建{kind === 'all' ? '设定' : ENTITY_KIND_LABELS[kind]}
      </button>

      {entities.length === 0 ? (
        <p className="px-1 py-3 text-[11px] leading-relaxed text-ink-soft">
          {project ? '还没有设定卡。人物、地点、组织、物品都可以建。' : '先打开一个项目。'}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {entities.map((entity) => (
            <li key={entity.id}>
              <button
                className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-sm text-ink-soft hover:bg-paper-deep hover:text-ink"
                onClick={() => void openEntity(entity.id)}
                type="button"
              >
                <span className="min-w-0 truncate">{entity.name}</span>
                <span className="shrink-0 text-[10px] text-ink-soft">
                  {entity.chapterCount > 0
                    ? `${entity.chapterCount} 章`
                    : ENTITY_KIND_LABELS[entity.kind]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
