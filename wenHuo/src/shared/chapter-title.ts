import { toChineseNumber } from './chinese-number';

/**
 * 章号与标题分离：章号由排序位置派生，标题只存作者起的名字。
 *
 * 老数据里的标题常带「第一章 青云观」这种前缀，展示与保存时都先剥掉前缀，
 * 避免删章、拖章之后出现「第一章 第一章 …」。
 */
const TITLE_PREFIX = /^\s*第\s*[零一二三四五六七八九十百千万两0-9]+\s*[章节回][\s:：、.．·-]*/;

export function stripChapterNumber(title: string): string {
  return title.replace(TITLE_PREFIX, '').trim();
}

/** 树、顶栏、导出统一用这个格式：有名字就「第N章 名字」，没名字就只有「第N章」。 */
export function formatChapterTitle(number: number, title: string): string {
  const name = stripChapterNumber(title);
  return name ? `第${toChineseNumber(number)}章 ${name}` : `第${toChineseNumber(number)}章`;
}
