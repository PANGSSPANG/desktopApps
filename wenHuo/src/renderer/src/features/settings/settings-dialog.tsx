import { useEffect, useState } from 'react';
import type { AppInfo } from '@shared/types';
import { api, errorMessage, unwrap } from '@renderer/api';
import { formatBytes } from '@renderer/lib/format';
import { useWorkspace } from '@renderer/store/workspace';

interface SettingsDialogProps {
  onClose(): void;
}

/** 设置：偏好、数据位置、备份操作。写作类应用的设置项少，一次别塞太多。 */
export function SettingsDialog({ onClose }: SettingsDialogProps) {
  const prefs = useWorkspace((state) => state.prefs);
  const setMentionHint = useWorkspace((state) => state.setMentionHint);
  const setTypewriter = useWorkspace((state) => state.setTypewriter);
  const setAutoBackup = useWorkspace((state) => state.setAutoBackup);
  const setAutoBackupKeep = useWorkspace((state) => state.setAutoBackupKeep);
  const notify = useWorkspace((state) => state.notify);

  const [info, setInfo] = useState<AppInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setInfo(unwrap(await api.app.info()));
      } catch (loadError) {
        setError(errorMessage(loadError));
      }
    })();
  }, []);

  async function handleBackup(): Promise<void> {
    setBusy(true);
    try {
      const backup = unwrap(await api.backup.create());
      notify(`已备份 ${backup.fileName}`);
      setInfo(unwrap(await api.app.info()));
    } catch (backupError) {
      setError(errorMessage(backupError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/25 p-6">
      <div className="flex max-h-[84vh] w-[560px] flex-col rounded-xl border border-line bg-paper shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-serif text-lg">设置</h2>
          <button className="text-sm text-ink-soft hover:text-ink" onClick={onClose} type="button">
            关闭
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <h3 className="text-xs uppercase tracking-widest text-ink-soft">写作</h3>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              checked={prefs.mentionHint}
              className="mt-1"
              onChange={(event) => void setMentionHint(event.target.checked)}
              type="checkbox"
            />
            <span>
              正文提到未关联的设定卡时提醒
              <span className="mt-0.5 block text-[11px] text-ink-soft">
                只检测两字以上的名称，避免单字误报。
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              checked={prefs.typewriter}
              className="mt-1"
              onChange={(event) => void setTypewriter(event.target.checked)}
              type="checkbox"
            />
            <span>
              打字机模式
              <span className="mt-0.5 block text-[11px] text-ink-soft">
                光标始终停在屏幕中部，写长段时视线不用跟着下移。
              </span>
            </span>
          </label>

          <h3 className="mt-6 text-xs uppercase tracking-widest text-ink-soft">备份</h3>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input
              checked={prefs.autoBackup}
              className="mt-1"
              onChange={(event) => void setAutoBackup(event.target.checked)}
              type="checkbox"
            />
            <span>
              每天首次启动自动备份
              <span className="mt-0.5 block text-[11px] text-ink-soft">
                手动备份不会被自动清理。
              </span>
            </span>
          </label>

          <label className="mt-3 flex items-center gap-2 text-sm">
            保留
            <input
              className="w-16 rounded-md border border-line bg-white px-2 py-1 text-sm outline-none focus:border-accent disabled:opacity-50"
              disabled={!prefs.autoBackup}
              max={30}
              min={1}
              onChange={(event) => void setAutoBackupKeep(Number(event.target.value))}
              type="number"
              value={prefs.autoBackupKeep}
            />
            份自动备份
          </label>

          <div className="mt-3 flex gap-2">
            <button
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50"
              disabled={busy}
              onClick={() => void handleBackup()}
              type="button"
            >
              {busy ? '备份中…' : '立即备份一次'}
            </button>
          </div>

          <h3 className="mt-6 text-xs uppercase tracking-widest text-ink-soft">数据</h3>
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-ink-soft">目录</dt>
              <dd className="min-w-0 break-all">{info?.dataDir ?? '读取中…'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-ink-soft">版本</dt>
              <dd>{info?.version ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-ink-soft">数据库</dt>
              <dd>{info ? formatBytes(info.dbBytes) : '—'}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
            稿件只存在这台电脑上；换机或重装前，请先用「备份」导出 zip。
          </p>

          {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
