import type { Editor } from '@tiptap/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { findTextRanges, type ProseMirrorDoc } from '@shared/editor-doc';
import { useWorkspace } from '@renderer/store/workspace';
import { findHighlightKey } from './find-highlight';

interface FindPanelProps {
  editor: Editor | null;
  /** 正文每变一次就加一，用来重算匹配 */
  revision: number;
  readOnly: boolean;
  onClose: () => void;
}

/** 章节内查找替换：位置换算复用 shared/editor-doc 的 findTextRanges。 */
export function FindPanel({ editor, revision, readOnly, onClose }: FindPanelProps) {
  const requestConfirm = useWorkspace((state) => state.requestConfirm);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ranges = useMemo(() => {
    if (!editor || !query.trim()) return [];
    return findTextRanges(editor.state.doc.toJSON() as ProseMirrorDoc, query);
    // revision 参与依赖：正文改动后需要重算
  }, [editor, query, revision]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  // 把查询与当前序号同步给装饰插件，所有命中都会高亮
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr.setMeta(findHighlightKey, { query: query.trim(), activeIndex: index }),
    );
  }, [editor, query, index, revision]);

  function goTo(next: number): void {
    if (!editor || ranges.length === 0) return;
    const target = ranges[((next % ranges.length) + ranges.length) % ranges.length];
    if (!target) return;
    setIndex(((next % ranges.length) + ranges.length) % ranges.length);
    editor.chain().focus().setTextSelection(target).run();
    editor.commands.scrollIntoView();
  }

  function replaceCurrent(): void {
    if (!editor || readOnly) return;
    const target = ranges[index] ?? ranges[0];
    if (!target) return;
    editor.chain().focus().insertContentAt(target, replacement).run();
    goTo(index);
  }

  async function replaceAll(): Promise<void> {
    if (!editor || readOnly || ranges.length === 0) return;
    const ok = await requestConfirm(`替换全部 ${ranges.length} 处？此操作无法撤销。`, {
      confirmText: '全部替换',
      danger: true,
    });
    if (!ok) return;
    // 从后往前替换，前面的位置才不会被打乱
    for (let cursor = ranges.length - 1; cursor >= 0; cursor -= 1) {
      const target = ranges[cursor];
      if (target) editor.chain().insertContentAt(target, replacement).run();
    }
    editor.commands.focus();
  }

  return (
    <div className="absolute right-6 top-2 z-20 w-[420px] rounded-lg border border-line bg-paper/95 p-2 shadow-lg backdrop-blur">
      <div className="flex items-center gap-1">
        <input
          className="min-w-0 flex-1 rounded border border-line bg-white px-2 py-1 text-xs outline-none focus:border-accent"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onClose();
            if (event.key === 'Enter') {
              event.preventDefault();
              goTo(event.shiftKey ? index - 1 : index + 1);
            }
          }}
          placeholder="查找内容"
          ref={inputRef}
          value={query}
        />
        <span className="w-14 shrink-0 text-center text-[11px] text-ink-soft">
          {ranges.length === 0 ? '0/0' : `${index + 1}/${ranges.length}`}
        </span>
        <button
          className="rounded px-1.5 py-0.5 text-xs text-ink-soft hover:bg-paper-deep"
          onClick={() => goTo(index - 1)}
          title="上一处（Shift+Enter）"
          type="button"
        >
          ↑
        </button>
        <button
          className="rounded px-1.5 py-0.5 text-xs text-ink-soft hover:bg-paper-deep"
          onClick={() => goTo(index + 1)}
          title="下一处（Enter）"
          type="button"
        >
          ↓
        </button>
        <button
          className="rounded px-1.5 py-0.5 text-xs text-ink-soft hover:bg-paper-deep"
          onClick={onClose}
          title="关闭（Esc）"
          type="button"
        >
          ×
        </button>
      </div>

      <div className="mt-1 flex items-center gap-1">
        <input
          className="min-w-0 flex-1 rounded border border-line bg-white px-2 py-1 text-xs outline-none focus:border-accent disabled:opacity-50"
          disabled={readOnly}
          onChange={(event) => setReplacement(event.target.value)}
          placeholder={readOnly ? '本章已完成，不能替换' : '替换为…'}
          value={replacement}
        />
        <button
          className="shrink-0 rounded border border-line px-2 py-0.5 text-[11px] hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={readOnly || ranges.length === 0}
          onClick={replaceCurrent}
          type="button"
        >
          替换
        </button>
        <button
          className="shrink-0 rounded border border-line px-2 py-0.5 text-[11px] hover:border-accent hover:text-accent disabled:opacity-40"
          disabled={readOnly || ranges.length === 0}
          onClick={() => void replaceAll()}
          type="button"
        >
          全部替换
        </button>
      </div>
    </div>
  );
}
