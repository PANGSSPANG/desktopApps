type Flush = () => Promise<void>;

let flush: Flush | null = null;

/** 编辑器挂载时注册"立即落盘"的能力，卸载时注销。 */
export function registerEditorFlush(fn: Flush): () => void {
  flush = fn;
  return () => {
    if (flush === fn) flush = null;
  };
}

/**
 * 立即把编辑器里的改动写进库。
 *
 * 快照恢复前必须先 flush：否则 800ms 的自动保存计时器会在恢复之后才触发，
 * 把刚恢复的旧版正文又覆盖回新版（表现为"恢复没生效"）。
 */
export async function flushEditor(): Promise<void> {
  await flush?.();
}
