import { describe, expect, it } from 'vitest';
import { toChineseNumber } from '@shared/chinese-number';

describe('toChineseNumber', () => {
  it.each([
    [1, '一'],
    [2, '二'],
    [9, '九'],
    [10, '十'],
    [11, '十一'],
    [19, '十九'],
    [20, '二十'],
    [99, '九十九'],
    [100, '一百'],
    [101, '一百零一'],
    [110, '一百一十'],
    [111, '一百一十一'],
    [1000, '一千'],
    [1005, '一千零五'],
    [1010, '一千零一十'],
    [9999, '九千九百九十九'],
  ])('%i → %s', (input, expected) => {
    expect(toChineseNumber(input)).toBe(expected);
  });

  it('超出范围或非正整数退回阿拉伯数字', () => {
    expect(toChineseNumber(0)).toBe('0');
    expect(toChineseNumber(-3)).toBe('-3');
    expect(toChineseNumber(10000)).toBe('10000');
    expect(toChineseNumber(1.5)).toBe('1.5');
  });
});
