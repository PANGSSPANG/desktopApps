import { useEffect } from 'react';
import { ConfirmDialog } from './components/confirm-dialog';
import { BookshelfView } from './features/bookshelf/bookshelf-view';
import { RecoveryBanner } from './features/recovery/recovery-banner';
import { SearchPalette } from './features/search/search-palette';
import { WorkspaceView } from './features/workspace/workspace-view';
import { useWorkspace } from './store/workspace';

export function App() {
  const project = useWorkspace((state) => state.project);
  const error = useWorkspace((state) => state.error);
  const loading = useWorkspace((state) => state.loading);
  const bootstrap = useWorkspace((state) => state.bootstrap);
  const clearError = useWorkspace((state) => state.clearError);
  const openSearch = useWorkspace((state) => state.openSearch);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // 全局快捷键：Ctrl/Cmd + K 打开搜索
  const searchOpen = useWorkspace((state) => state.searchOpen);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (!searchOpen) openSearch();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openSearch, searchOpen]);

  /**
   * 焦点兜底。
   *
   * Chromium 在拖拽被中断时（典型场景：拖动滚动条后把鼠标松开在窗口外）
   * 会残留"拖拽中"状态：窗口失去键盘焦点，之后点击输入框也不生效。
   * 这里做两件事：松手时若窗口没有焦点就抢回来；点到可编辑元素却没拿到焦点时补一次 focus。
   */
  useEffect(() => {
    const rescueWindowFocus = (): void => {
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) window.focus();
    };

    const ensureEditableFocus = (event: MouseEvent): void => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const editable =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (!editable) return;

      window.setTimeout(() => {
        if (document.activeElement === target) return;
        window.focus();
        target.focus();
      }, 0);
    };

    window.addEventListener('mouseup', rescueWindowFocus, true);
    window.addEventListener('pointerup', rescueWindowFocus, true);
    document.addEventListener('mousedown', ensureEditableFocus, true);
    return () => {
      window.removeEventListener('mouseup', rescueWindowFocus, true);
      window.removeEventListener('pointerup', rescueWindowFocus, true);
      document.removeEventListener('mousedown', ensureEditableFocus, true);
    };
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-paper text-ink">
      <RecoveryBanner />

      <div className="relative min-h-0 flex-1">
        {project ? <WorkspaceView /> : <BookshelfView />}
      </div>

      {loading ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-paper/60 text-sm text-ink-soft">
          载入中…
        </div>
      ) : null}

      <SearchPalette />
      <ConfirmDialog />

      {error ? (
        <div className="absolute inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-xl items-center gap-4 rounded-lg border border-line bg-white/95 px-4 py-2 text-sm shadow-lg">
          <span>{error}</span>
          <button className="text-accent underline" onClick={clearError} type="button">
            知道了
          </button>
        </div>
      ) : null}
    </div>
  );
}
