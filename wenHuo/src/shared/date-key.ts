/**
 * 本地日期键与连续写作天数。
 *
 * 时间戳一律存 UTC 毫秒，但"今天"必须按用户本地时区切分，
 * 否则跨零点统计会错位（这是 A-11 的由来）。
 */
export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

export function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const base = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  base.setDate(base.getDate() + deltaDays);
  return toDateKey(base);
}

/**
 * 连续写作天数：今天写了就从今天往前数；今天还没写但昨天写了，从昨天往前数。
 * 断档即停。
 */
export function computeStreak(dateKeys: readonly string[], today: string): number {
  const written = new Set(dateKeys);
  let cursor = today;
  if (!written.has(cursor)) {
    cursor = shiftDateKey(today, -1);
    if (!written.has(cursor)) return 0;
  }
  let streak = 0;
  while (written.has(cursor)) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}
