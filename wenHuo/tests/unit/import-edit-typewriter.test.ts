import { describe, expect, it } from 'vitest';
import { mergeChapterUp, renameChapter } from '@shared/import-edit';
import { typewriterDelta } from '@shared/typewriter';

describe('导入预览：修正拆章', () => {
  const chapters = [
    { title: '第一章', body: '甲' },
    { title: '第二章', body: '乙' },
    { title: '第三章', body: '丙' },
  ];

  it('并入上一章后章数减一、内容拼接', () => {
    const merged = mergeChapterUp(chapters, 1);
    expect(merged).toHaveLength(2);
    expect(merged[0]?.title).toBe('第一章');
    expect(merged[0]?.body).toBe('甲\n乙');
    expect(merged[1]?.title).toBe('第三章');
  });

  it('第一章不能并入上一章，原样返回', () => {
    expect(mergeChapterUp(chapters, 0)).toEqual(chapters);
  });

  it('越界索引原样返回', () => {
    expect(mergeChapterUp(chapters, 9)).toEqual(chapters);
    expect(mergeChapterUp(chapters, -1)).toEqual(chapters);
  });

  it('不修改传入数组', () => {
    mergeChapterUp(chapters, 1);
    expect(chapters[0]?.body).toBe('甲');
    expect(chapters).toHaveLength(3);
  });

  it('改标题只动目标章', () => {
    const renamed = renameChapter(chapters, 1, '  新标题  ');
    expect(renamed[1]?.title).toBe('新标题');
    expect(renamed[0]?.title).toBe('第一章');
  });

  it('标题可以清空（回退成无标题）', () => {
    expect(renameChapter(chapters, 0, '   ')[0]?.title).toBe('');
  });
});

describe('打字机模式滚动量', () => {
  it('光标在中线死区内不滚动', () => {
    expect(typewriterDelta({ caretY: 520, viewTop: 100, viewHeight: 800 })).toBe(0);
  });

  it('光标偏下时向上滚，并扣掉死区', () => {
    // 中线 = 100 + 400 = 500，光标 700，偏移 200，死区 48 → 152
    expect(typewriterDelta({ caretY: 700, viewTop: 100, viewHeight: 800 })).toBe(152);
  });

  it('光标偏上时向下滚', () => {
    // 中线 500，光标 300，偏移 -200 → -152
    expect(typewriterDelta({ caretY: 300, viewTop: 100, viewHeight: 800 })).toBe(-152);
  });

  it('自定义死区生效', () => {
    expect(typewriterDelta({ caretY: 560, viewTop: 100, viewHeight: 800, deadZone: 100 })).toBe(0);
  });
});
