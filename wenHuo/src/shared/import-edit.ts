import type { SplitChapter } from './split-chapters';

/**
 * 把第 index 章并入它前面那一章。
 * 拆章规则多切了一刀时，用户可以手动把碎片并回去。
 */
export function mergeChapterUp(chapters: readonly SplitChapter[], index: number): SplitChapter[] {
  if (index <= 0 || index >= chapters.length) return [...chapters];

  const result = chapters.map((chapter) => ({ ...chapter }));
  const previous = result[index - 1];
  const current = result[index];
  if (!previous || !current) return [...chapters];

  previous.body = `${previous.body}${previous.body.endsWith('\n') ? '' : '\n'}${current.body}`;
  return result.filter((_, position) => position !== index);
}

/** 改一章的标题，空标题回退成「未命名」。 */
export function renameChapter(
  chapters: readonly SplitChapter[],
  index: number,
  title: string,
): SplitChapter[] {
  return chapters.map((chapter, position) =>
    position === index ? { ...chapter, title: title.trim() } : { ...chapter },
  );
}
