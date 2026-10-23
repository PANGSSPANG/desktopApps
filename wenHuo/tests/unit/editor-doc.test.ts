import { describe, expect, it } from 'vitest';
import { findTextRanges } from '@shared/editor-doc';
import { emptyDoc, paragraphDoc } from './helpers/docs';

describe('findTextRanges', () => {
  it('单段落命中位置正确', () => {
    const doc = paragraphDoc(['青云观上有一棵松']);
    // 段落内容从位置 1 开始
    expect(findTextRanges(doc, '青云观')).toEqual([{ from: 1, to: 4 }]);
  });

  it('第二段的命中位置要算上前面段落的节点大小', () => {
    const doc = paragraphDoc(['一二', '青云观']);
    // 第一段大小 = 2 + 2 = 4，第二段内容从 5 开始
    expect(findTextRanges(doc, '青云观')).toEqual([{ from: 5, to: 8 }]);
  });

  it('同一段多处命中全部返回', () => {
    const doc = paragraphDoc(['剑，剑，还是剑']);
    expect(findTextRanges(doc, '剑')).toHaveLength(3);
  });

  it('无命中返回空数组', () => {
    expect(findTextRanges(paragraphDoc(['青云观']), '少林')).toEqual([]);
  });

  it('空查询不返回任何结果', () => {
    expect(findTextRanges(paragraphDoc(['青云观']), '   ')).toEqual([]);
  });

  it('空文档不报错', () => {
    expect(findTextRanges(emptyDoc(), '青云')).toEqual([]);
  });
});
