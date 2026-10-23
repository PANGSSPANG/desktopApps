import { describe, expect, it } from 'vitest';
import { sanitizeFileName } from '@shared/file-name';

describe('sanitizeFileName', () => {
  it('普通书名原样保留', () => {
    expect(sanitizeFileName('青云志')).toBe('青云志');
  });

  it('替换 Windows 非法字符，保留中文全角标点', () => {
    expect(sanitizeFileName('第一部/上：开端')).toBe('第一部_上：开端');
  });

  it('结尾的问号不会留下悬挂下划线', () => {
    expect(sanitizeFileName('青云志？')).toBe('青云志？');
    expect(sanitizeFileName('青云志?')).toBe('青云志');
  });

  it('去掉结尾的点和空格', () => {
    expect(sanitizeFileName('青云志...  ')).toBe('青云志');
  });

  it('书名全为非法字符时保底', () => {
    expect(sanitizeFileName('///')).toBe('未命名');
  });

  it('空书名走兜底', () => {
    expect(sanitizeFileName('   ')).toBe('未命名');
  });

  it('超长书名按字符截断到 80', () => {
    const long = '云'.repeat(120);
    expect(Array.from(sanitizeFileName(long))).toHaveLength(80);
  });
});
