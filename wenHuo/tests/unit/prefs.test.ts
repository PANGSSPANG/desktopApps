import { describe, expect, it } from 'vitest';
import { readPrefs, writePrefs } from '@main/modules/prefs';
import { createTempDb } from './helpers/temp-db';

describe('应用偏好', () => {
  it('默认关闭提及提示', () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(readPrefs(db).mentionHint).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('写入后可读回，并且可以关掉', () => {
    const { db, cleanup } = createTempDb();
    try {
      expect(writePrefs(db, { mentionHint: true }).mentionHint).toBe(true);
      expect(readPrefs(db).mentionHint).toBe(true);
      expect(writePrefs(db, { mentionHint: false }).mentionHint).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('不传字段时保持原值', () => {
    const { db, cleanup } = createTempDb();
    try {
      writePrefs(db, { mentionHint: true });
      expect(writePrefs(db, {}).mentionHint).toBe(true);
    } finally {
      cleanup();
    }
  });
});
