import type { AppPrefs } from '@shared/types';
import type { Db } from '../db/connection';

const MENTION_HINT_KEY = 'pref.mentionHint';
const AUTO_BACKUP_KEY = 'pref.autoBackup';
const AUTO_BACKUP_KEEP_KEY = 'pref.autoBackupKeep';
const TYPEWRITER_KEY = 'pref.typewriter';

export const DEFAULT_AUTO_BACKUP_KEEP = 7;

function readSetting(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    { value: string } | undefined;
  return row?.value ?? null;
}

function writeSetting(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

function clampKeep(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_AUTO_BACKUP_KEEP;
  return Math.min(30, Math.max(1, Math.round(value)));
}

/** 应用级偏好存进 settings 表，key 带 pref. 前缀，避免和 lastProjectId 之类混在一起。 */
export function readPrefs(db: Db): AppPrefs {
  const keep = Number(readSetting(db, AUTO_BACKUP_KEEP_KEY));
  const autoBackup = readSetting(db, AUTO_BACKUP_KEY);

  return {
    mentionHint: readSetting(db, MENTION_HINT_KEY) === '1',
    // 缺省视为开启：备份应当默认保护用户，而不是等用户自己去开
    autoBackup: autoBackup === null ? true : autoBackup === '1',
    autoBackupKeep: Number.isFinite(keep) && keep > 0 ? clampKeep(keep) : DEFAULT_AUTO_BACKUP_KEEP,
    typewriter: readSetting(db, TYPEWRITER_KEY) === '1',
  };
}

export function writePrefs(db: Db, prefs: Partial<AppPrefs>): AppPrefs {
  if (typeof prefs.mentionHint === 'boolean') {
    writeSetting(db, MENTION_HINT_KEY, prefs.mentionHint ? '1' : '0');
  }
  if (typeof prefs.autoBackup === 'boolean') {
    writeSetting(db, AUTO_BACKUP_KEY, prefs.autoBackup ? '1' : '0');
  }
  if (typeof prefs.typewriter === 'boolean') {
    writeSetting(db, TYPEWRITER_KEY, prefs.typewriter ? '1' : '0');
  }
  if (typeof prefs.autoBackupKeep === 'number') {
    writeSetting(db, AUTO_BACKUP_KEEP_KEY, String(clampKeep(prefs.autoBackupKeep)));
  }
  return readPrefs(db);
}
