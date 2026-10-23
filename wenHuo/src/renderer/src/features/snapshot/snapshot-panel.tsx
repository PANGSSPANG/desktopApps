import { useState } from 'react';
import type { SnapshotKind, SnapshotSummary } from '@shared/types';
import { formatClock, formatWords } from '@renderer/lib/format';
import { useWorkspace } from '@renderer/store/workspace';

const KIND_LABEL: Record<SnapshotKind, string> = {
  manual: '手动',
  auto: '自动',
  pre_restore: '恢复前',
};

function snapshotLabel(snapshot: SnapshotSummary): string {
  return snapshot.note || `${KIND_LABEL[snapshot.kind]}快照 · ${formatWords(snapshot.wordCount)}`;
}

export function SnapshotPanel() {
  const snapshots = useWorkspace((state) => state.snapshots);
  const preview = useWorkspace((state) => state.snapshotPreview);
  const chapter = useWorkspace((state) => state.chapter);
  const createSnapshot = useWorkspace((state) => state.createSnapshot);
  const previewSnapshot = useWorkspace((state) => state.previewSnapshot);
  const closePreview = useWorkspace((state) => state.closeSnapshotPreview);
  const restoreSnapshot = useWorkspace((state) => state.restoreSnapshot);
  const removeSnapshot = useWorkspace((state) => state.removeSnapshot);
  const clearLegacySnapshots = useWorkspace((state) => state.clearLegacySnapshots);
  const requestConfirm = useWorkspace((state) => state.requestConfirm);

  const legacyCount = snapshots.filter((item) => item.kind === 'pre_restore').length;

  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  async function submitNote(): Promise<void> {
    if (saving) return;
    setSaving(true);
    try {
      await createSnapshot(note.trim());
      setComposing(false);
      setNote('');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(snapshot: SnapshotSummary): Promise<void> {
    const ok = await requestConfirm(`删除快照「${snapshotLabel(snapshot)}」？删除后不可找回。`, {
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    await removeSnapshot(snapshot.id);
  }

  async function handleRestore(): Promise<void> {
    if (!preview) return;
    const ok = await requestConfirm(
      '恢复会直接覆盖当前正文，且不可撤销。\n如需保留当前版本，请先「＋ 给当前正文留个快照」。',
      { confirmText: '恢复并覆盖', danger: true },
    );
    if (!ok) return;
    await restoreSnapshot(preview.id);
  }

  async function handleClearLegacy(): Promise<void> {
    const ok = await requestConfirm(
      `清理这 ${legacyCount} 条旧版「恢复前」记录？其它快照不受影响。`,
      { confirmText: '清理', danger: true },
    );
    if (!ok) return;
    await clearLegacySnapshots();
  }

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-ink-soft">快照</h2>
        <span className="text-[11px] text-ink-soft">{snapshots.length} 条</span>
      </div>

      <button
        className="mt-2 w-full rounded-md border border-line px-2 py-1.5 text-xs hover:border-accent hover:text-accent disabled:opacity-40"
        disabled={!chapter}
        onClick={() => setComposing(true)}
        type="button"
      >
        ＋ 给当前正文留个快照
      </button>

      <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
        每 10 分钟或每净增 2000
        字自动留点；手动快照不会自动清理，可以手动删除。恢复会直接覆盖当前正文，不自动备份。
      </p>

      {legacyCount > 0 ? (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-ink-soft">
          还有 {legacyCount} 条旧版「恢复前」记录
          <button
            className="text-accent underline"
            onClick={() => void handleClearLegacy()}
            type="button"
          >
            一键清理
          </button>
        </p>
      ) : null}

      <ul className="mt-3 space-y-0.5">
        {snapshots.length === 0 ? (
          <li className="rounded border border-dashed border-line px-2 py-3 text-center text-[11px] text-ink-soft">
            还没有快照
          </li>
        ) : (
          snapshots.map((snapshot) => (
            <li
              className="group flex items-center gap-1 rounded px-1 hover:bg-paper-deep"
              key={snapshot.id}
            >
              <button
                className="flex min-w-0 flex-1 items-baseline justify-between gap-2 py-1 text-left text-xs"
                onClick={() => void previewSnapshot(snapshot.id)}
                title="查看并恢复"
                type="button"
              >
                <span className="flex min-w-0 items-baseline gap-1">
                  <span
                    className={`shrink-0 rounded px-1 text-[10px] ${
                      snapshot.kind === 'auto'
                        ? 'bg-paper-deep text-ink-soft'
                        : 'bg-accent/10 text-accent'
                    }`}
                  >
                    {KIND_LABEL[snapshot.kind]}
                  </span>
                  <span className="truncate">
                    {snapshot.note || formatWords(snapshot.wordCount)}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-soft">
                  {formatClock(snapshot.createdAt)}
                </span>
              </button>
              <button
                aria-label="删除该快照"
                className="shrink-0 rounded px-1 text-[11px] text-ink-soft/60 hover:text-red-600"
                onClick={() => void handleDelete(snapshot)}
                title="删除该快照"
                type="button"
              >
                删除
              </button>
            </li>
          ))
        )}
      </ul>

      {composing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6">
          <div className="w-[440px] rounded-xl border border-line bg-paper p-5 shadow-2xl">
            <h3 className="font-serif text-base">留个快照</h3>
            <p className="mt-1 text-xs text-ink-soft">
              当前 {formatWords(chapter?.wordCount ?? 0)} · 备注可留空
            </p>
            <textarea
              autoFocus
              className="mt-3 h-24 w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setComposing(false);
                  return;
                }
                // 中文输入法回车是"上屏"，不能当保存
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submitNote();
                }
              }}
              placeholder="比如：改回第三稿的开头"
              value={note}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-paper-deep"
                onClick={() => setComposing(false)}
                type="button"
              >
                取消
              </button>
              <button
                className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
                disabled={saving}
                onClick={() => void submitNote()}
                type="button"
              >
                {saving ? '保存中…' : '保存快照'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6">
          <div className="flex max-h-[80vh] w-[640px] flex-col rounded-xl border border-line bg-paper shadow-2xl">
            <header className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
              <span>
                {KIND_LABEL[preview.kind]}快照 · {formatWords(preview.wordCount)} ·{' '}
                {formatClock(preview.createdAt)}
                {preview.note ? ` · ${preview.note}` : ''}
              </span>
              <button className="text-ink-soft hover:text-ink" onClick={closePreview} type="button">
                关闭
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed">
                {preview.plainText || '（空章节）'}
              </pre>
            </div>
            <footer className="flex items-center justify-between border-t border-line px-4 py-3">
              <button
                className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:text-red-600"
                onClick={() => void handleDelete(preview)}
                type="button"
              >
                删除此快照
              </button>
              <div className="flex gap-2">
                <button
                  className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-paper-deep"
                  onClick={closePreview}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90"
                  onClick={() => void handleRestore()}
                  type="button"
                >
                  恢复并覆盖当前正文
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
