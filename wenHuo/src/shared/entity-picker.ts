import type { EntitySummary } from './types';

/**
 * 「可关联的设定卡」= 项目里全部卡片 - 本章已关联的。
 *
 * 早先的实现会在 allEntities 为空时退回 linked，结果新建的卡不出现、
 * 下拉里一个选项都没有；这里改成显式的集合差，并在调用方保证 allEntities 是最新的。
 */
export function pickableEntities(
  all: readonly EntitySummary[],
  linked: readonly EntitySummary[],
): EntitySummary[] {
  const linkedIds = new Set(linked.map((entity) => entity.id));
  return all
    .filter((entity) => !linkedIds.has(entity.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
