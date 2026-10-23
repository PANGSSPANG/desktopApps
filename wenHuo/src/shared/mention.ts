import type { EntitySummary } from './types';

/** 名字至少两个字才参与提及检测：单字名（如「清」）误报太多。 */
const MIN_NAME_LENGTH = 2;

/**
 * 正文里提到了哪些尚未关联的设定卡。
 *
 * 只做「包含」判断，不做分词——中文人名/地名本身就是字符串匹配，
 * 分词反而会把「青云观」拆散导致漏判。
 */
export function findMentionCandidates(
  text: string,
  entities: readonly EntitySummary[],
  linkedIds: ReadonlySet<string>,
  limit = 5,
): EntitySummary[] {
  if (!text) return [];
  return entities
    .filter((entity) => {
      if (linkedIds.has(entity.id)) return false;
      return [entity.name, entity.alias].some((name) => {
        const trimmed = name.trim();
        return trimmed.length >= MIN_NAME_LENGTH && text.includes(trimmed);
      });
    })
    .slice(0, limit);
}
