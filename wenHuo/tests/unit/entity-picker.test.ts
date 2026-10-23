import { describe, expect, it } from 'vitest';
import { pickableEntities } from '@shared/entity-picker';
import type { EntitySummary } from '@shared/types';

function entity(id: string, name: string): EntitySummary {
  return {
    id,
    projectId: 'p1',
    kind: 'character',
    name,
    alias: '',
    role: '',
    chapterCount: 0,
    updatedAt: 0,
  };
}

describe('pickableEntities', () => {
  it('排除本章已关联的卡', () => {
    const all = [entity('a', '玄清'), entity('b', '青云观')];
    const picked = pickableEntities(all, [entity('a', '玄清')]);
    expect(picked.map((item) => item.id)).toEqual(['b']);
  });

  it('全部已关联时返回空数组', () => {
    const all = [entity('a', '玄清')];
    expect(pickableEntities(all, all)).toHaveLength(0);
  });

  it('不依赖 linked 里是否有完整数据，只按 id 判断', () => {
    const all = [entity('a', '玄清'), entity('b', '青云观')];
    const linked = [{ ...entity('a', '别的名字'), name: '旧名' }];
    expect(pickableEntities(all, linked).map((item) => item.id)).toEqual(['b']);
  });

  it('按中文名称排序', () => {
    const all = [entity('c', '张三'), entity('a', '李四'), entity('b', '王五')];
    expect(pickableEntities(all, []).map((item) => item.name)).toEqual(['李四', '王五', '张三']);
  });

  it('空项目返回空', () => {
    expect(pickableEntities([], [])).toEqual([]);
  });
});
