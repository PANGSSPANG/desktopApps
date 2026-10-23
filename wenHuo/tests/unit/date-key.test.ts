import { describe, expect, it } from 'vitest';
import { computeStreak, shiftDateKey, toDateKey } from '@shared/date-key';

describe('date-key', () => {
  it('按本地时区生成日期键', () => {
    expect(toDateKey(new Date(2026, 9, 22, 23, 59))).toBe('2026-10-22');
  });

  it('跨月减一天', () => {
    expect(shiftDateKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('跨年加一天', () => {
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('computeStreak', () => {
  it('今天写了，从今天往前数', () => {
    expect(computeStreak(['2026-10-22', '2026-10-21', '2026-10-20'], '2026-10-22')).toBe(3);
  });

  it('今天没写但昨天写了，从昨天往前数', () => {
    expect(computeStreak(['2026-10-21', '2026-10-20'], '2026-10-22')).toBe(2);
  });

  it('断档即停', () => {
    expect(computeStreak(['2026-10-22', '2026-10-20'], '2026-10-22')).toBe(1);
  });

  it('两天以上没写归零', () => {
    expect(computeStreak(['2026-10-19'], '2026-10-22')).toBe(0);
  });

  it('重复日期不重复计数', () => {
    expect(computeStreak(['2026-10-22', '2026-10-22', '2026-10-21'], '2026-10-22')).toBe(2);
  });
});
