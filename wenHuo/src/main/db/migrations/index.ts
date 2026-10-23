import initSql from './001_init.sql?raw';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

/** 迁移清单：只追加，不修改已发布的脚本。 */
export const MIGRATIONS: readonly Migration[] = [{ version: 1, name: 'init', sql: initSql }];
