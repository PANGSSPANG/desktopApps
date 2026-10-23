import { useEffect, useRef } from 'react';
import { useWorkspace } from '@renderer/store/workspace';

/**
 * 应用内确认框。
 *
 * 不用 window.confirm：原生模态关闭后 Electron 可能无法把键盘焦点交还渲染层，
 * 表现为"之后点任何输入框都打不进字"。
 */
export function ConfirmDialog() {
  const state = useWorkspace((store) => store.confirmState);
  const resolveConfirm = useWorkspace((store) => store.resolveConfirm);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!state) return;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        resolveConfirm(false);
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        resolveConfirm(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, resolveConfirm]);

  if (!state) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/30 p-6">
      <div className="w-[420px] rounded-xl border border-line bg-paper p-5 shadow-2xl">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{state.message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="rounded-md px-3 py-1.5 text-sm text-ink-soft hover:bg-paper-deep"
            onClick={() => resolveConfirm(false)}
            type="button"
          >
            取消
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm text-white ${
              state.danger ? 'bg-red-700 hover:bg-red-600' : 'bg-accent hover:bg-accent/90'
            }`}
            onClick={() => resolveConfirm(true)}
            ref={confirmRef}
            type="button"
          >
            {state.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
