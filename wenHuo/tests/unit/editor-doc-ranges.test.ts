import { describe, expect, it } from 'vitest';
import { findTextRanges, type ProseMirrorDoc } from '@shared/editor-doc';

function doc(children: unknown[]): ProseMirrorDoc {
  return { type: 'doc', content: children } as ProseMirrorDoc;
}

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: text ? [{ type: 'text', text }] : [],
});
const horizontalRule = { type: 'horizontalRule' };
const hardBreak = { type: 'hardBreak' };

describe('findTextRanges 位置换算', () => {
  it('单段命中：第一段文字从位置 1 开始', () => {
    expect(findTextRanges(doc([paragraph('ab')]), 'ab')).toEqual([{ from: 1, to: 3 }]);
  });

  it('第二段命中：位置含前一段的 2 个标记位', () => {
    // 段落 "x" 占 3 位（1 开 + 1 字 + 1 闭），第二段文字从 4 开始
    expect(findTextRanges(doc([paragraph('x'), paragraph('ab')]), 'ab')).toEqual([
      { from: 4, to: 6 },
    ]);
  });

  it('分割线只占 1 位，其后命中位置不能偏移', () => {
    // 段落 "x" = 3 位，分割线 = 1 位，第三段文字从 5 开始
    const ranges = findTextRanges(doc([paragraph('x'), horizontalRule, paragraph('ab')]), 'ab');
    expect(ranges).toEqual([{ from: 5, to: 7 }]);
  });

  it('硬换行同样只占 1 位', () => {
    const ranges = findTextRanges(
      doc([
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'a' }, hardBreak, { type: 'text', text: 'b' }],
        },
      ]),
      'b',
    );
    expect(ranges).toEqual([{ from: 3, to: 4 }]);
  });

  it('同一段内多次命中都会返回', () => {
    expect(findTextRanges(doc([paragraph('ab ab')]), 'ab')).toEqual([
      { from: 1, to: 3 },
      { from: 4, to: 6 },
    ]);
  });

  it('跨段落不误匹配', () => {
    expect(findTextRanges(doc([paragraph('a'), paragraph('b')]), 'ab')).toEqual([]);
  });
});
