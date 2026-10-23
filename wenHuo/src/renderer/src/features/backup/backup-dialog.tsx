import { useEffect, useState } from 'react';
import type { BackupInfo } from '@shared/types';
import { api, errorMessage, unwrap } from '@renderer/api';
import { formatBytes, formatRelative } from '@renderer/lib/format';
import { useWorkspace } from '@renderer/store/workspace';

export function BackupDialog({ onClose }: { onClose: () => void }) {
  const notify = useWorkspace((state) => state.notify);
  const requestConfirm = useWorkspace((state) => state.requestConfirm);

  const [items, setItems] = useState<BackupInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    try {
      setItems(unwrap(await api.backup.list()));
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const info = unwrap(await api.backup.create());
      await refresh();
      notify(`备份完成：${info.fileName}（${formatBytes(info.bytes)}）`);
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setBusy(false);
    }
  }

  async function handlePruneAuto(): Promise<void> {
    const ok = await requestConfirm('清理超出保留份数的旧自动备份？手动备份不会受影响。', {
      confirmText: '清理',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const removed = unwrap(await api.backup.pruneAuto());
      setError(null);
      await refresh();
      setNotice(removed > 0 ? `已清理 ${removed} 份旧自动备份。` : '没有需要清理的自动备份。');
    } catch (pruneError) {
      setError(errorMessage(pruneError));
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(): Promise<void> {
    setError(null);
    try {
      const zipPath = unwrap(await api.backup.pickFile());
      if (!zipPath) return;

      const ok = await requestConfirm(
        '恢复会用备份覆盖当前全部数据，并重启应用。\n恢复前会先把当前数据库复制一份到 recovery/ 目录。',
        { confirmText: '恢复并重启', danger: true },
      );
      if (!ok) return;

      setBusy(true);
      const result = unwrap(await api.backup.restore(zipPath));
      notify(`已恢复 ${result.projectCount} 个项目、${result.chapterCount} 章，应用即将重启…`);
    } catch (restoreError) {
      setBusy(false);
      setError(errorMessage(restoreError));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6">
      <div className="flex max-h-[80vh] w-[560px] flex-col rounded-xl border border-line bg-paper shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-serif text-lg">备份与恢复</h2>
          <button className="text-sm text-ink-soft hover:text-ink" onClick={onClose} type="button">
            关闭
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs leading-relaxed text-ink-soft">
            备份包含全部项目与稿件（整库快照 + 清单），默认存放在应用数据目录的 backups/ 下。
          </p>

          <div className="mt-3 flex gap-2">
            <button
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
              disabled={busy}
              onClick={() => void handleCreate()}
              type="button"
            >
              {busy ? '处理中…' : '立即备份'}
            </button>
            <button
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
              disabled={busy}
              onClick={() => void handleRestore()}
              type="button"
            >
              从备份文件恢复…
            </button>
            <button
              className="rounded-md border border-line px-3 py-1.5 text-sm text-ink-soft hover:border-red-400 hover:text-red-600 disabled:opacity-50"
              disabled={busy}
              onClick={() => void handlePruneAuto()}
              title="只删除 wenhuo-auto- 前缀的自动备份，手动备份不受影响"
              type="button"
            >
              清理旧自动备份
            </button>
          </div>

          {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
          {notice ? <p className="mt-3 text-xs text-ink-soft">{notice}</p> : null}

          <h3 className="mt-5 text-xs uppercase tracking-widest text-ink-soft">本地备份</h3>
          {items.length === 0 ? (
            <p className="mt-2 text-[11px] text-ink-soft">还没有备份。</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {items.map((item) => (
                <li
                  className="flex items-baseline justify-between gap-3 rounded border border-line/70 bg-white/60 px-3 py-1.5 text-xs"
                  key={item.filePath}
                >
                  <span className="min-w-0 truncate">{item.fileName}</span>
                  <span className="shrink-0 text-[11px] text-ink-soft">
                    {item.projectCount} 项目 / {item.chapterCount} 章 · {formatBytes(item.bytes)} ·{' '}
                    {formatRelative(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex justify-end border-t border-line px-5 py-3">
          <button
            className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-paper-deep"
            onClick={onClose}
            type="button"
          >
            关闭
          </button>
        </footer>
      </div>
    </div>
  );
}
