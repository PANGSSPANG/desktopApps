/**
 * 章节/卷序号的默认标题用中文数字，且必须与首章一致：
 * 「第一章 / 第二章 / 第十一章 / 第一百零五章」，不能一半汉字一半阿拉伯数字。
 *
 * 只覆盖 1–9999；超出范围（几乎不可能出现的篇幅）退回阿拉伯数字。
 */
const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const UNITS = ['', '十', '百', '千'];

export function toChineseNumber(value: number): string {
  if (!Number.isInteger(value) || value <= 0 || value >= 10_000) return String(value);

  const text = String(value);
  let result = '';
  let pendingZero = false;

  for (let index = 0; index < text.length; index += 1) {
    const digit = Number(text[index]);
    const unit = UNITS[text.length - 1 - index] ?? '';

    if (digit === 0) {
      pendingZero = true;
      continue;
    }

    if (pendingZero && result !== '') result += '零';
    pendingZero = false;
    result += `${DIGITS[digit]}${unit}`;
  }

  // 10–19 读作「十一」而不是「一十一」
  if (result.startsWith('一十')) result = result.slice(1);
  return result;
}

const NUMERALS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
const UNITS_MAP: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** 解析「12」「十二」「一百零五」这类序号；无法解析返回 0。 */
export function parseChineseNumber(input: string): number {
  const text = input.trim();
  if (!text) return 0;
  if (/^\d+$/.test(text)) return Number(text);

  let total = 0;
  let current = 0;
  for (const char of text) {
    if (char in NUMERALS) {
      current = NUMERALS[char] ?? 0;
      continue;
    }
    const unit = UNITS_MAP[char];
    if (unit === undefined) return 0;
    total += (current === 0 ? 1 : current) * unit;
    current = 0;
  }
  return total + current;
}

/** 从标题里抽出章号：`第一章 青云观` → 1，`第2章` → 2，抽不到返回 0。 */
export function chapterNumberFromTitle(title: string): number {
  const match = /第\s*([零一二三四五六七八九十百千万两0-9]+)\s*[章节回]/.exec(title);
  return match?.[1] ? parseChineseNumber(match[1]) : 0;
}
