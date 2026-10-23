import { EditorContent, useEditor } from '@tiptap/react';
import { ScrollArea } from '@renderer/components/scroll-area';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { findTextRanges, parseDoc, type ProseMirrorDoc } from '@shared/editor-doc';
import { isChapterLocked, type ChapterDetail } from '@shared/types';
import { api, errorMessage, unwrap } from '@renderer/api';
import { useWorkspace } from '@renderer/store/workspace';
import { registerEditorFlush } from '@renderer/lib/editor-bridge';
import { typewriterDelta } from '@shared/typewriter';
import { FindPanel } from './find-panel';
import { FindHighlight } from './find-highlight';

const AUTOSAVE_DEBOUNCE_MS = 800;

type EditorInstance = NonNullable<ReturnType<typeof useEditor>>;

export interface EditorHighlight {
  query: string;
  /** 本章第几处命中（0 起） */
  occurrence: number;
  /** 每次点击搜索结果都会变，用来强制重新定位 */
  nonce: number;
}

interface ChapterEditorProps {
  /** 由父组件用 key={chapter.id} 控制重建，切章时组件整体重挂载 */
  chapter: ChapterDetail;
  /** 从搜索结果跳转过来时，选中并滚动到命中文字 */
  highlight?: EditorHighlight | null;
}

/**
 * 自动保存的三个硬约束（AGENTS A-01 / A-02 / A-03）：
 * 1. 拼音组合期间不保存、不重渲染；
 * 2. 保存只做「编辑器 → 数据库」单向写，绝不回灌 setContent；
 * 3. 卸载（切章）前先 flush，onDestroy 不再重复保存。
 */
export function ChapterEditor({ chapter, highlight = null }: ChapterEditorProps) {
  const locked = isChapterLocked(chapter.status);
  const detectMentions = useWorkspace((state) => state.detectMentions);
  const typewriter = useWorkspace((state) => state.prefs.typewriter);
  const setSaveState = useWorkspace((state) => state.setSaveState);
  const markSaved = useWorkspace((state) => state.markSaved);

  const [findOpen, setFindOpen] = useState(false);
  const [findRevision, setFindRevision] = useState(0);
  const updateRef = useRef<() => void>(() => {});

  const editorRef = useRef<EditorInstance | null>(null);
  const dirtyRef = useRef(false);
  const composingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const save = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !dirtyRef.current || locked) return;
    dirtyRef.current = false;
    setSaveState('saving');
    const contentJson = JSON.stringify(editor.getJSON());
    const plainText = editor.getText();
    try {
      const result = unwrap(
        await api.chapter.save({
          chapterId: chapter.id,
          contentJson,
          plainText,
        }),
      );
      markSaved(result.savedAt, result.wordCount);
      detectMentions(plainText);
      // 落库成功就没必要再留草稿
      void api.draft.clear(chapter.id);
    } catch (error) {
      dirtyRef.current = true;
      setSaveState('error');
      // 保存失败时把内容写进草稿日志，重启后可以恢复
      void api.draft.stash({ chapterId: chapter.id, contentJson, plainText });
      console.error('autosave failed:', errorMessage(error));
    }
  }, [chapter.id, detectMentions, locked, markSaved, setSaveState]);

  const schedule = useCallback(() => {
    if (composingRef.current || locked) return;
    dirtyRef.current = true;
    setSaveState('dirty');
    clearTimer();
    timerRef.current = setTimeout(() => {
      void save();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [clearTimer, locked, save, setSaveState]);

  const editor = useEditor({
    editable: !locked,
    extensions: [StarterKit, FindHighlight],
    content: parseDoc(chapter.contentJson),
    editorProps: {
      attributes: { class: 'wh-prose', spellcheck: 'false' },
    },
    onUpdate: () => updateRef.current(),
  });

  updateRef.current = () => {
    schedule();
    if (findOpen) setFindRevision((value) => value + 1);
  };

  // Ctrl/Cmd+F 打开查找替换；Esc 关闭
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFindOpen(true);
        return;
      }
      if (event.key === 'Escape' && findOpen) setFindOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [findOpen]);

  // 状态从「可编辑」切到「已完成」时，已挂载的编辑器也要立刻变成只读
  useEffect(() => {
    editor?.setEditable(!locked);
  }, [editor, locked]);

  // 让快照恢复等操作能在覆盖正文前把当前编辑内容落盘
  useEffect(() => registerEditorFlush(save), [save]);

  // 打字机模式：光标偏离视口中线超过死区时，把滚动位置拉回来
  useEffect(() => {
    if (!editor || !typewriter) return;
    const scrollToCaret = (): void => {
      if (composingRef.current) return;
      const dom = editor.view.dom;
      const scroller = dom.closest('[data-scroll-container]');
      if (!(scroller instanceof HTMLElement)) return;

      const { from } = editor.state.selection;
      const caret = editor.view.coordsAtPos(from);
      const box = scroller.getBoundingClientRect();
      const delta = typewriterDelta({
        caretY: caret.top,
        viewTop: box.top,
        viewHeight: box.height,
      });
      if (delta !== 0) scroller.scrollTop += delta;
    };

    editor.on('selectionUpdate', scrollToCaret);
    return () => {
      editor.off('selectionUpdate', scrollToCaret);
    };
  }, [editor, typewriter]);

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

  useEffect(() => {
    const dom = editor?.view.dom;
    if (!dom) return;
    const onCompositionStart = (): void => {
      composingRef.current = true;
    };
    const onCompositionEnd = (): void => {
      composingRef.current = false;
      // 组合结束后再判断是否要保存，否则拼音上屏会被当成普通输入
      schedule();
    };
    dom.addEventListener('compositionstart', onCompositionStart);
    dom.addEventListener('compositionend', onCompositionEnd);
    return () => {
      dom.removeEventListener('compositionstart', onCompositionStart);
      dom.removeEventListener('compositionend', onCompositionEnd);
    };
  }, [editor, schedule]);

  useEffect(() => {
    const onWindowBlur = (): void => {
      clearTimer();
      void save();
    };
    const onBeforeUnload = (): void => {
      void save();
    };
    window.addEventListener('blur', onWindowBlur);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearTimer();
      // 切章/关窗时把最后一次输入落库
      void save();
    };
  }, [clearTimer, save]);

  // 有未保存内容时每 5 秒写一次草稿日志：强杀进程也不至于丢整段
  useEffect(() => {
    const timer = setInterval(() => {
      const editor = editorRef.current;
      if (!editor) return;
      detectMentions(editor.getText());
      if (!dirtyRef.current) return;
      void api.draft.stash({
        chapterId: chapter.id,
        contentJson: JSON.stringify(editor.getJSON()),
        plainText: editor.getText(),
      });
    }, 5000);
    return () => clearInterval(timer);
  }, [chapter.id, detectMentions]);

  // 从搜索结果跳转：选中命中文字并滚动到可见位置
  const highlightQuery = highlight?.query ?? '';
  const highlightOccurrence = highlight?.occurrence ?? 0;
  const highlightNonce = highlight?.nonce ?? 0;
  useEffect(() => {
    if (!editor || !highlightQuery) return;
    const ranges = findTextRanges(editor.state.doc.toJSON() as ProseMirrorDoc, highlightQuery);
    const target = ranges[highlightOccurrence] ?? ranges[0];
    if (!target) {
      // 没找到（正文改过或只命中标题）也要把焦点交给编辑器，避免键盘失灵
      editor.commands.focus('start');
      return;
    }
    editor.chain().focus().setTextSelection(target).run();
    editor.commands.scrollIntoView();
  }, [editor, highlightQuery, highlightOccurrence, highlightNonce]);

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-1 border-b border-line/60 px-10 py-2">
        <ToolbarButton
          active={editor?.isActive('bold') ?? false}
          disabled={locked}
          label="加粗"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          active={editor?.isActive('italic') ?? false}
          disabled={locked}
          label="斜体"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          active={editor?.isActive('blockquote') ?? false}
          disabled={locked}
          label="引用"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          disabled={locked}
          label="分隔线"
          onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        />
        <button
          className="rounded px-2 py-1 text-xs text-ink-soft transition hover:bg-paper-deep"
          onClick={() => setFindOpen(true)}
          title="查找替换（Ctrl+F）"
          type="button"
        >
          查找
        </button>
        <span className="ml-auto text-xs text-ink-soft">
          {locked ? '本章已完成，正文只读' : '中文输入法组合期间不会触发保存'}
        </span>
      </div>

      {findOpen ? (
        <FindPanel
          editor={editor}
          onClose={() => setFindOpen(false)}
          readOnly={locked}
          revision={findRevision}
        />
      ) : null}
      <ScrollArea className="px-10 py-8" wrapperClassName="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-[680px]">
          <EditorContent editor={editor} />
        </div>
      </ScrollArea>
    </div>
  );
}

function ToolbarButton(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { label, active = false, disabled = false, onClick } = props;
  return (
    <button
      aria-label={label}
      className={`rounded px-2 py-1 text-xs transition disabled:opacity-40 ${
        active ? 'bg-paper-deep text-ink' : 'text-ink-soft hover:bg-paper-deep'
      }`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {label}
    </button>
  );
}
