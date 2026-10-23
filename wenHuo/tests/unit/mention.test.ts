import { describe, expect, it } from 'vitest';
import { findMentionCandidates } from '@shared/mention';
import type { EntitySummary } from '@shared/types';

function entity(id: string, name: string, alias = ''): EntitySummary {
  return {
    id,
    projectId: 'p1',
    kind: 'character',
    name,
    alias,
    role: '',
    chapterCount: 0,
    updatedAt: 0,
  };
}

const entities = [entity('a', '玄清', '玄清道长'), entity('b', '青云观'), entity('c', '剑')];

describe('findMentionCandidates', () => {
  it('命中名称', () => {
    const hits = findMentionCandidates('玄清站在山门前。', entities, new Set());
    expect(hits.map((item) => item.id)).toEqual(['a']);
  });

  it('命中别名', () => {
    const hits = findMentionCandidates('玄清道长缓缓抬头。', entities, new Set());
    expect(hits.map((item) => item.id)).toEqual(['a']);
  });

  it('已关联的不再提示', () => {
    const hits = findMentionCandidates('玄清站在山门前。', entities, new Set(['a']));
    expect(hits).toHaveLength(0);
  });

  it('单字名不参与检测，避免误报', () => {
    expect(findMentionCandidates('他握紧了剑。', entities, new Set())).toHaveLength(0);
  });

  it('多个命中按顺序返回，且受上限约束', () => {
    const many = Array.from({ length: 8 }, (_, index) => entity(`e${index}`, `角色${index}`));
    const text = many.map((item) => item.name).join('、');
    expect(findMentionCandidates(text, many, new Set())).toHaveLength(5);
  });

  it('空文本返回空', () => {
    expect(findMentionCandidates('', entities, new Set())).toHaveLength(0);
  });
});
