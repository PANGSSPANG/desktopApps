import { useState } from 'react';
import { SPLIT_RULES, SPLIT_RULE_LABELS, type SplitRule } from '@shared/split-chapters';
import type { ImportPreview } from '@shared/types';
import { mergeChapterUp, renameChapter } from '@shared/import-edit';
import type { SplitChapter } from '@shared/split-chapters';
import { api, errorMessage, unwrap } from '@renderer/api';
import { formatWords } from '@renderer/lib/format';

interface ImportDialogProps {
  /** 有值 = 导入到当前项目；无值 = 新建一本书 */
  projectId?: string;
  onClose: () => void;
  onImported: (projectId: string) => void;
}

export function ImportDialog({ projectId, onClose, onImported }: ImportDialogProps) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [chapters, setChapters] = useState<SplitChapter[]>([]);
  const [rule, setRule] = useState<SplitRule>('chapter');
  const [projectTitle, setProjectTitle] = useState('');
  const [volumeTitle, setVolumeTitle] = useState('导入内容');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadPreview(filePath: string, nextRule: SplitRule): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const result = unwrap(await api.importer.preview({ filePath, rule: nextRule }));
      setPreview(result);
      setChapters(result.chapters);
      setProjectTitle(result.suggestedTitle);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setBusy(false);
    }
  }

  async function pickFile(): Promise<void> {
    try {
      const filePath = unwrap(await api.importer.pickFile());
      if (!filePath) return;
      setPreview(null);
      await loadPreview(filePath, rule);
    } catch (pickError) {
      setError(errorMessage(pickError));
    }
  }

  async function changeRule(nextRule: SplitRule): Promise<void> {
    setRule(nextRule);
    if (preview) await loadPreview(preview.filePath, nextRule);
  }

  async function submit(): Promise<void> {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = unwrap(
        await api.importer.commit({
          ...(projectId ? { projectId } : { projectTitle: projectTitle.trim() || '导入的书' }),
          volumeTitle: volumeTitle.trim() || '导入内容',
          chapters,
        }),
      );
      onImported(result.projectId);
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  const chapterTotal = chapters.reduce((sum, chapter) => sum + chapter.body.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6">
      <div className="flex max-h-[86vh] w-[680px] flex-col rounded-xl border border-line bg-paper shadow-2xl">
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-serif text-lg">导入稿件</h2>
          <button className="text-sm text-ink-soft hover:text-ink" onClick={onClose} type="button">
            关闭
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-center gap-2">
            <button
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
              disabled={busy}
              onClick={() => void pickFile()}
              type="button"
            >
              选择文件…
            </button>
            <span className="truncate text-xs text-ink-soft">
              {preview ? preview.filePath : '支持 .txt / .md，自动识别 UTF-8 与 GBK'}
            </span>
          </div>

          <label className="mt-4 block text-xs text-ink-soft">
            拆章规则
            <select
              className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
              disabled={!preview || busy}
              onChange={(event) => void changeRule(event.target.value as SplitRule)}
              value={rule}
            >
              {SPLIT_RULES.map((item) => (
                <option key={item} value={item}>
                  {SPLIT_RULE_LABELS[item]}
                </option>
              ))}
            </select>
          </label>

          {preview ? (
            <>
              <p className="mt-3 text-xs text-ink-soft">
                共 {chapters.length} 章 · {formatWords(chapterTotal)} · 原文 {preview.totalChars}{' '}
                字符
                <span className="ml-2 text-[11px]">（标题可改，拆多了可以并入上一章）</span>
              </p>

              {preview.warnings.length > 0 ? (
                <ul className="mt-2 space-y-1 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-[11px] text-ink">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>· {warning}</li>
                  ))}
                </ul>
              ) : null}

              <ul className="mt-3 max-h-56 space-y-0.5 overflow-y-auto rounded-md border border-line bg-white/60 px-2 py-1">
                {chapters.slice(0, 60).map((chapter, index) => (
                  <li className="flex items-center gap-2 px-1 py-0.5 text-xs" key={index}>
                    <span className="w-6 shrink-0 text-right text-[11px] text-ink-soft">
                      {index + 1}.
                    </span>
                    <input
                      className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs outline-none hover:border-line focus:border-accent focus:bg-white"
                      onChange={(event) =>
                        setChapters((current) => renameChapter(current, index, event.target.value))
                      }
                      placeholder="（无标题）"
                      value={chapter.title}
                    />
                    <span className="shrink-0 text-[11px] text-ink-soft">
                      {formatWords(chapter.body.length)}
                    </span>
                    <button
                      className="shrink-0 rounded px-1 text-[11px] text-ink-soft hover:text-accent disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => setChapters((current) => mergeChapterUp(current, index))}
                      title="把这一章并入上一章"
                      type="button"
                    >
                      并入上一章
                    </button>
                  </li>
                ))}
                {chapters.length > 60 ? (
                  <li className="px-1 py-0.5 text-[11px] text-ink-soft">
                    … 还有 {chapters.length - 60} 章未展示（仍会全部导入）
                  </li>
                ) : null}
              </ul>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {!projectId ? (
                  <label className="block text-xs text-ink-soft">
                    书名
                    <input
                      className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
                      onChange={(event) => setProjectTitle(event.target.value)}
                      value={projectTitle}
                    />
                  </label>
                ) : null}
                <label className="block text-xs text-ink-soft">
                  卷名
                  <input
                    className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
                    onChange={(event) => setVolumeTitle(event.target.value)}
                    value={volumeTitle}
                  />
                </label>
              </div>

              <p className="mt-2 text-[11px] text-ink-soft">导入会追加一卷，不会覆盖现有章节。</p>
            </>
          ) : null}

          {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
        </div>

        <footer className="flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-[11px] text-ink-soft">
            {busy ? '处理中…' : preview ? `将导入 ${preview.chapters.length} 章` : '先选一个文件'}
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-paper-deep"
              onClick={onClose}
              type="button"
            >
              取消
            </button>
            <button
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent/90 disabled:opacity-40"
              disabled={!preview || busy}
              onClick={() => void submit()}
              type="button"
            >
              开始导入
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
