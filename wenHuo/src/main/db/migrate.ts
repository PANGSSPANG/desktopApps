import { AppError } from '@shared/errors';
import type { Db } from './connection';
import { MIGRATIONS, type Migration } from './migrations';

export interface MigrateReport {
  from: number;
  to: number;
  applied: number[];
}

export function currentVersion(db: Db): number {
  return Number(db.pragma('user_version', { simple: true }));
}

/**
 * 逐个应用未执行的迁移。
 *
 * 每个迁移单独一个事务：失败只回滚当前脚本，已成功的版本保持；
 * 迁移前由调用方备份库文件（见 recovery 目录），这里不重复做 IO。
 */
export function migrate(db: Db, migrations: readonly Migration[] = MIGRATIONS): MigrateReport {
  const from = currentVersion(db);
  const pending = migrations
    .filter((migration) => migration.version > from)
    .sort((a, b) => a.version - b.version);

  const applied: number[] = [];
  for (const migration of pending) {
    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    });
    try {
      run();
      applied.push(migration.version);
    } catch (error) {
      throw new AppError(
        'DB_MIGRATION_FAILED',
        `数据库迁移失败（v${migration.version} ${migration.name}）：${(error as Error).message}`,
      );
    }
  }

  return { from, to: currentVersion(db), applied };
}
