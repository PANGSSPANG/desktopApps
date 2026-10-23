import { useEffect, useMemo, useRef, useState } from 'react';
import type { SearchHit } from '@shared/types';
import { useWorkspace } from '@renderer/store/workspace';

/** 主进程返回的上下文用 [[ ]] 标命中，这里切成 <mark>，不注入 HTML。 */
function renderContext(context: string): React.ReactNode[] {
  const parts = context.split(/\[\[|\]\]/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark className="rounded bg-accent/20 px-0.5 text-ink" key={index}>
        {part}
      </mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export function SearchPalette() {
  const open = useWorkspace((state) => state.searchOpen);
  const page = useWorkspace((state) => state.searchPage);
  const close = useWorkspace((state) => state.closeSearch);
  const runSearch = useWorkspace((state) => state.runSearch);
  const jumpToHit = useWorkspace((state) => state.jumpToHit);
  const openEntity = useWorkspace((state) => state.openEntity);

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void runSearch(query);
    }, 200);
    return () => clearTimeout(timer);
  }, [open, query, runSearch]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close();
    };
    // 点遮罩关闭：不必先按 Esc
    const onPointerDown = (event: PointerEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) close();
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  const total = useMemo(() => (page ? page.chapters.length + page.entities.length : 0), [page]);

  if (!open) return null;

  function jump(hit: SearchHit): void {
    // 先关面板、下一帧再跳转：让遮罩与输入框先卸载，焦点才能顺利交给编辑器
    close();
    requestAnimationFrame(() => {
      void jumpToHit(hit);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/25 pt-[12vh]">
      <div
        className="w-[600px] overflow-hidden rounded-xl border border-line bg-paper shadow-2xl"
        ref={panelRef}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="text-ink-soft">⌕</span>
          <input
            className="w-full bg-transparent text-sm outline-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索章节、人物、地点…（1 个字也能搜）"
            ref={inputRef}
            value={query}
          />
          <kbd className="rounded border border-line px-1 text-[10px] text-ink-soft">Esc</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
          {!query.trim() ? (
            <p className="px-3 py-6 text-center text-xs text-ink-soft">
              输入关键词开始搜索；正文与设定卡会被一起检索。
            </p>
          ) : total === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-soft">没有找到「{query}」</p>
          ) : (
            <>
              {page && page.chapters.length > 0 ? (
                <section className="mb-2">
                  <h3 className="px-3 py-1 text-[11px] uppercase tracking-widest text-ink-soft">
                    章节 · {page.chapters.length}
                  </h3>
                  {page.chapters.map((hit) => (
                    <button
                      className="block w-full rounded px-3 py-2 text-left hover:bg-paper-deep"
                      data-testid="search-hit"
                      key={hit.id}
                      onClick={() => jump(hit)}
                      type="button"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm">{hit.title || '未命名'}</span>
                        <span className="shrink-0 text-[10px] text-ink-soft">
                          第 {hit.occurrence + 1} 处
                        </span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-soft">
                        {renderContext(hit.context)}
                      </div>
                    </button>
                  ))}
                </section>
              ) : null}

              {page && page.entities.length > 0 ? (
                <section>
                  <h3 className="px-3 py-1 text-[11px] uppercase tracking-widest text-ink-soft">
                    设定 · {page.entities.length}
                  </h3>
                  {page.entities.map((hit) => (
                    <button
                      className="block w-full rounded px-3 py-2 text-left hover:bg-paper-deep"
                      key={hit.id}
                      onClick={() => {
                        close();
                        void openEntity(hit.refId);
                      }}
                      type="button"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm">{hit.title}</span>
                        <span className="text-[10px] text-ink-soft">设定</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-soft">
                        {renderContext(hit.context)}
                      </div>
                    </button>
                  ))}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
