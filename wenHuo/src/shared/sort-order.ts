/**
 * 稀疏排序号：卷与章都用 REAL 的 sort_order。
 *
 * 拖拽只更新被移动项（必要时再更新被跨越项），避免"插一条改一片"。
 * 当相邻间隔小于 MIN_GAP 时，调用方需对该父级重排为 SORT_GAP 的整数倍。
 */
export const SORT_GAP = 1000;
export const MIN_GAP = 1e-4;

export function orderBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return SORT_GAP;
  if (prev === null && next !== null) return next - SORT_GAP;
  if (prev !== null && next === null) return prev + SORT_GAP;
  return ((prev as number) + (next as number)) / 2;
}

export function needsRebalance(prev: number | null, next: number | null): boolean {
  if (prev === null || next === null) return false;
  return next - prev < MIN_GAP;
}

export function rebalanceOrder(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * SORT_GAP);
}
