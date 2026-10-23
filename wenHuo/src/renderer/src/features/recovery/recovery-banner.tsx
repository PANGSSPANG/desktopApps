import { formatRelative, formatWords } from '@renderer/lib/format';
import { useWorkspace } from '@renderer/store/workspace';

/**
 * 启动时发现的未保存草稿。
 * 恢复 = 覆盖正文（先自动留一份快照）；丢弃 = 把草稿存成快照后删除，两种选择都不可逆丢失内容。
 */
export function RecoveryBanner() {
  const recovery = useWorkspace((state) => state.recovery);
  const recoverDraft = useWorkspace((state) => state.recoverDraft);
  const discardDraft = useWorkspace((state) => state.discardDraft);

  if (recovery.length === 0) return null;

  return (
    <div className="border-b border-accent/30 bg-accent/10 px-4 py-2">
      <div className="flex items-center gap-3 text-xs">
        <span className="font-medium">检测到 {recovery.length} 份未保存的草稿</span>
        <span className="text-ink-soft">上次可能没有正常退出，可以恢复或留档丢弃。</span>
      </div>
      <ul className="mt-1 space-y-1">
        {recovery.map((item) => (
          <li className="flex items-center gap-3 text-xs" key={item.chapterId}>
            <span className="min-w-0 truncate">
              {item.chapterTitle || '未命名章节'} · {formatWords(item.wordCount)} ·{' '}
              {formatRelative(item.savedAt)}
            </span>
            <button
              className="shrink-0 rounded border border-accent/40 px-2 py-0.5 text-accent hover:bg-accent/10"
              onClick={() => void recoverDraft(item.chapterId)}
              type="button"
            >
              恢复
            </button>
            <button
              className="shrink-0 rounded px-2 py-0.5 text-ink-soft hover:bg-paper-deep"
              onClick={() => void discardDraft(item.chapterId)}
              type="button"
            >
              留档并丢弃
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
