import Database from 'better-sqlite3';

export type Db = Database.Database;

/**
 * 打开数据库并设置连接参数。
 * WAL + synchronous=NORMAL 是本项目写入性能与崩溃安全的基础组合。
 */
export function openDatabase(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -16000');
  return db;
}
