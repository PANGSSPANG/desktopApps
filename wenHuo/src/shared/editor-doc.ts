/**
 * 编辑器文档结构：与 ProseMirror / Tiptap 的 JSONContent 结构兼容，
 * 但不依赖 @tiptap/* 的类型，主进程也能安全引用。
 */
export interface DocMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: DocMark[];
  text?: string;
}

export interface ProseMirrorDoc extends DocNode {
  type: 'doc';
}

export const EMPTY_DOC: ProseMirrorDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export const EMPTY_DOC_JSON = JSON.stringify(EMPTY_DOC);

/** 库里可能存着历史版本或损坏内容，解析失败时回退到空文档而不是让界面白屏。 */
export function parseDoc(json: string): ProseMirrorDoc {
  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { type?: string }).type === 'doc'
    ) {
      return parsed as ProseMirrorDoc;
    }
  } catch {
    // 落到下面的兜底
  }
  return EMPTY_DOC;
}

export interface TextRange {
  from: number;
  to: number;
}

/** 叶子节点（分割线、硬换行、图片）在 ProseMirror 里只占 1 个位置，没有开始/结束标记。 */
const LEAF_NODE_TYPES = new Set(['horizontalRule', 'hardBreak', 'image']);

function nodeSize(node: DocNode): number {
  if (typeof node.text === 'string') return node.text.length;
  if (node.type !== undefined && LEAF_NODE_TYPES.has(node.type)) return 1;
  let size = 2; // 开始 + 结束标记
  for (const child of node.content ?? []) size += nodeSize(child);
  return size;
}

/**
 * 把纯文本命中位置换算成 ProseMirror 文档位置，用于选中并滚动到命中处。
 *
 * 位置约定：doc 的内容从 0 开始排；其余节点的内容从 pos + 1 开始。
 */
export function findTextRanges(doc: ProseMirrorDoc, query: string): TextRange[] {
  const needle = query.trim();
  if (!needle) return [];

  const ranges: TextRange[] = [];

  function walk(node: DocNode, pos: number): void {
    if (typeof node.text === 'string') {
      let index = node.text.indexOf(needle);
      while (index !== -1) {
        ranges.push({ from: pos + index, to: pos + index + needle.length });
        index = node.text.indexOf(needle, index + needle.length);
      }
      return;
    }

    const contentStart = node.type === 'doc' ? pos : pos + 1;
    let childPos = contentStart;
    for (const child of node.content ?? []) {
      walk(child, childPos);
      childPos += nodeSize(child);
    }
  }

  walk(doc, 0);
  return ranges;
}

/**
 * 纯文本转 ProseMirror 文档：每个非空行一个段落。
 * 中文 TXT 基本是"一行一段"，这样导入后排版最接近原稿。
 */
export function textToDocJson(text: string): string {
  const paragraphs = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] }));

  return JSON.stringify({ type: 'doc', content: paragraphs });
}

/** 与编辑器 getText() 对齐的纯文本形态（段落之间空一行）。 */
export function textToPlainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n');
}
