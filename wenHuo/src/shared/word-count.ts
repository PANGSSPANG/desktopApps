/**
 * 字数统计的唯一实现。
 *
 * 口径（与 PRD §F-06 一致）：
 * - 汉字逐字计 1（含扩展 A、兼容区，\p{Script=Han} 覆盖）；
 * - 连续拉丁字母/数字串计 1 词；
 * - 标点、空白、换行、Emoji、控制字符不计。
 *
 * 先做 NFKC 归一化，避免全角「ＡＢＣ」被当成 0 个词。
 */
const HAN = /\p{Script=Han}/gu;
const LATIN = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

export function countWords(text: string): number {
  if (!text) return 0;
  const normalized = text.normalize('NFKC');
  const han = normalized.match(HAN)?.length ?? 0;
  const latin = normalized.match(LATIN)?.length ?? 0;
  return han + latin;
}
