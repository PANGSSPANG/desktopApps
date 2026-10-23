/**
 * 打字机模式：让光标始终停在视口垂直中部附近。
 *
 * 返回需要滚动的增量（像素）。光标已经在死区内时返回 0，
 * 避免每敲一个字都触发滚动而抖动。
 */
export interface TypewriterInput {
  /** 光标在视口中的 y 坐标 */
  caretY: number;
  /** 视口（滚动容器）顶部 y 坐标 */
  viewTop: number;
  /** 视口高度 */
  viewHeight: number;
  /** 死区半高：光标偏离中线不超过它就不滚动 */
  deadZone?: number;
}

export function typewriterDelta({
  caretY,
  viewTop,
  viewHeight,
  deadZone = 48,
}: TypewriterInput): number {
  const center = viewTop + viewHeight / 2;
  const offset = caretY - center;
  if (Math.abs(offset) <= deadZone) return 0;
  // 只滚动超出死区的部分，滚动量更平滑
  return offset > 0 ? offset - deadZone : offset + deadZone;
}
