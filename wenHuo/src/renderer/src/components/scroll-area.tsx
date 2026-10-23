import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

interface ScrollAreaProps {
  children: ReactNode;
  /** 内层滚动元素的类（padding 等） */
  className?: string;
  /** 外层容器类（flex 尺寸等） */
  wrapperClassName?: string;
}

interface ThumbState {
  top: number;
  height: number;
}

/**
 * 自带滚动条的滚动容器。
 *
 * 不用原生滚动条的原因：Chromium 在拖拽被中断时会残留"拖拽中"状态，
 * 之后点击输入框全部失效，只能重启应用（KDE #495846，VS Code / Discord 同类问题）。
 * 这里的滚动条是普通 DOM + pointer 事件，拖拽不会进 Chromium 的滚动条实现。
 */
export function ScrollArea({ children, className = '', wrapperClassName = '' }: ScrollAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<ThumbState | null>(null);
  const [active, setActive] = useState(false);
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null);

  const update = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const { scrollHeight, clientHeight, scrollTop } = element;
    if (scrollHeight <= clientHeight + 1) {
      setThumb(null);
      return;
    }
    const height = Math.max(28, (clientHeight * clientHeight) / scrollHeight);
    const travel = clientHeight - height;
    const top = (scrollTop / Math.max(1, scrollHeight - clientHeight)) * travel;
    setThumb({ top, height });
  }, []);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  }, [update]);

  useEffect(() => {
    update();
  }, [children, update]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    const element = scrollRef.current;
    if (!element) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, startScroll: element.scrollTop };
    setActive(true);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const element = scrollRef.current;
    const drag = dragRef.current;
    if (!element || !drag || !thumb) return;
    const travel = element.clientHeight - thumb.height;
    if (travel <= 0) return;
    const ratio = (element.scrollHeight - element.clientHeight) / travel;
    element.scrollTop = drag.startScroll + (event.clientY - drag.startY) * ratio;
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>): void {
    dragRef.current = null;
    setActive(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      className={`relative h-full min-h-0 overflow-hidden ${wrapperClassName}`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => {
        if (!dragRef.current) setActive(false);
      }}
    >
      <div className={`h-full overflow-y-auto ${className}`} data-scroll-container ref={scrollRef}>
        {children}
      </div>

      {thumb ? (
        <div
          aria-hidden
          className={`absolute right-0.5 w-1.5 cursor-grab rounded-full bg-ink/25 transition-opacity duration-150 active:cursor-grabbing ${
            active ? 'opacity-100' : 'opacity-0'
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ top: thumb.top, height: thumb.height }}
        />
      ) : null}
    </div>
  );
}
