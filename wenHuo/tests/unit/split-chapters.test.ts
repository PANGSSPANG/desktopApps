import { describe, expect, it } from 'vitest';
import { splitChapters } from '@shared/split-chapters';

describe('splitChapters · 按标题拆章', () => {
  const text = ['第一章 青云观', '观上有一棵松。', '', '第二章 玄清', '观主法号玄清。'].join('\n');

  it('识别中文章节标题', () => {
    const result = splitChapters(text, 'chapter');
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters[0]?.title).toBe('第一章 青云观');
    expect(result.chapters[0]?.body).toContain('观上有一棵松');
    expect(result.chapters[1]?.title).toBe('第二章 玄清');
  });

  it('识别阿拉伯数字与大数字标题', () => {
    const result = splitChapters(
      ['第2章 风起', '正文', '第一百零一章 归途', '正文二'].join('\n'),
      'chapter',
    );
    expect(result.chapters.map((item) => item.title)).toEqual(['第2章 风起', '第一百零一章 归途']);
  });

  it('标题前的内容单独成章并给出提示', () => {
    const result = splitChapters(['楔子内容', '第一章 开始', '正文'].join('\n'), 'chapter');
    expect(result.chapters[0]?.title).toBe('开篇');
    expect(result.chapters[0]?.body).toBe('楔子内容');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('没有标题时整篇作为一章并提示', () => {
    const result = splitChapters('只是一段没有标题的正文。', 'chapter');
    expect(result.chapters).toHaveLength(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe('splitChapters · 其它规则', () => {
  it('Markdown 标题拆章', () => {
    const text = ['# 第一卷', '开篇正文', '## 第一章', '章节正文'].join('\n');
    const result = splitChapters(text, 'markdown');
    expect(result.chapters.map((item) => item.title)).toEqual(['第一卷', '第一章']);
  });

  it('按空行分段', () => {
    const result = splitChapters('第一段\n\n第二段\n\n第三段', 'blank-line');
    expect(result.chapters).toHaveLength(3);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('整篇作为一章', () => {
    const result = splitChapters('不管里面有\n\n多少空行', 'single', '我的稿子');
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0]?.title).toBe('我的稿子');
    expect(result.chapters[0]?.body).toContain('不管里面有');
  });

  it('去除 BOM 并统一换行符', () => {
    const result = splitChapters('\uFEFF第一章 开始\r\n正文\r\n', 'chapter');
    expect(result.chapters[0]?.title).toBe('第一章 开始');
    expect(result.chapters[0]?.body).toBe('正文');
  });
});
