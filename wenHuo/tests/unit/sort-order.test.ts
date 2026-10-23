import { describe, expect, it } from 'vitest';
import { MIN_GAP, needsRebalance, orderBetween, rebalanceOrder } from '@shared/sort-order';

describe('orderBetween', () => {
  it('空列表取基础间隔', () => {
    expect(orderBetween(null, null)).toBe(1000);
  });

  it('插入到最前', () => {
    expect(orderBetween(null, 1000)).toBe(0);
  });

  it('插入到最后', () => {
    expect(orderBetween(3000, null)).toBe(4000);
  });

  it('插入到中间取均值', () => {
    expect(orderBetween(1000, 2000)).toBe(1500);
  });

  it('多次插入后间隔收窄但不越界', () => {
    let prev = 1000;
    const next = 2000;
    for (let i = 0; i < 5; i += 1) {
      const inserted = orderBetween(prev, next);
      expect(inserted).toBeGreaterThan(prev);
      expect(inserted).toBeLessThan(next);
      prev = inserted;
    }
  });
});

describe('needsRebalance', () => {
  it('边界缺失时不需要重排', () => {
    expect(needsRebalance(null, 1000)).toBe(false);
    expect(needsRebalance(1000, null)).toBe(false);
  });

  it('间隔小于阈值需要重排', () => {
    expect(needsRebalance(1000, 1000 + MIN_GAP / 2)).toBe(true);
    expect(needsRebalance(1000, 2000)).toBe(false);
  });
});

describe('rebalanceOrder', () => {
  it('生成等距序号', () => {
    expect(rebalanceOrder(3)).toEqual([1000, 2000, 3000]);
  });
});
