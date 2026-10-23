import { describe, expect, it } from 'vitest';
import { countWords } from '@shared/word-count';

describe('countWords', () => {
  it('纯中文按字计数', () => {
    expect(countWords('青云观上有一棵松')).toBe(8);
  });

  it('中文标点、引号不计', () => {
    expect(countWords('他说：“走。”')).toBe(3);
  });

  it('英文按词计数', () => {
    expect(countWords('hello world again')).toBe(3);
  });

  it('中英混排分别计数', () => {
    expect(countWords('他打开 MacBook 写代码')).toBe(7);
  });

  it('全角字母按一个词计（NFKC 归一化）', () => {
    expect(countWords('ＡＢＣ')).toBe(1);
  });

  it('数字串计一个词', () => {
    expect(countWords('第2章')).toBe(3);
  });

  it('Emoji 与空白不计', () => {
    expect(countWords('写完啦 🎉\n\n  ')).toBe(3);
  });

  it('空串与纯标点为零', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('，。！？——……')).toBe(0);
  });

  it('连字符英文计一个词', () => {
    expect(countWords('state-of-the-art')).toBe(1);
  });
});
