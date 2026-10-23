import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, type Db } from '@main/db/connection';
import { migrate } from '@main/db/migrate';

export interface TempDb {
  db: Db;
  dir: string;
  cleanup(): void;
}

/** 每个用例一个真实临时库：不 mock 数据库，迁移跑完整流程。 */
export function createTempDb(): TempDb {
  const dir = mkdtempSync(join(tmpdir(), 'wenhuo-test-'));
  const db = openDatabase(join(dir, 'wenhuo.db'));
  migrate(db);
  return {
    db,
    dir,
    cleanup() {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
