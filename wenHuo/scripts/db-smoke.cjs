/**
 * Electron 内的数据库冒烟脚本。
 *
 * 目的：验证 better-sqlite3 的 Electron ABI 构建可用、schema 能建、FTS 能查。
 * 用法：pnpm smoke:db（等价 electron scripts/db-smoke.cjs）
 */
const path = require('node:path');
const { readFileSync } = require('node:fs');

function fail(message, error) {
  console.error(`SMOKE FAIL: ${message}`);
  if (error) console.error(error);
  process.exit(1);
}

function main() {
  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (error) {
    fail('better-sqlite3 加载失败（多半是 ABI 不匹配，先跑 pnpm rebuild:native）', error);
    return;
  }

  const sql = readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'db', 'migrations', '001_init.sql'),
    'utf8',
  );

  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.exec(sql);
  db.pragma('user_version = 1');

  const version = db.pragma('user_version', { simple: true });
  if (version !== 1) fail(`user_version 期望 1，实际 ${version}`);

  const now = Date.now();
  db.prepare(
    `INSERT INTO projects (id, title, author, genre, target_words, daily_goal, created_at, updated_at)
     VALUES ('p1', '冒烟项目', '测试', 'webnovel', 100000, 4000, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO volumes (id, project_id, title, sort_order, created_at, updated_at)
     VALUES ('v1', 'p1', '第一卷', 1000, ?, ?)`,
  ).run(now, now);

  const doc = JSON.stringify({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '青云观上有一棵松' }] }],
  });
  db.prepare(
    `INSERT INTO chapters
       (id, project_id, volume_id, title, content_json, plain_text, word_count, status, sort_order, created_at, updated_at)
     VALUES ('c1', 'p1', 'v1', '第一章', ?, '青云观上有一棵松', 8, 'draft', 1000, ?, ?)`,
  ).run(doc, now, now);

  const ftsRows = db
    .prepare('SELECT ref_id FROM search_index WHERE search_index MATCH ?')
    .all('青云观');
  if (ftsRows.length !== 1) fail(`FTS trigram 查询期望 1 行，实际 ${ftsRows.length}`);
  if (ftsRows[0].ref_id !== 'c1') fail('FTS 命中的章节 id 不正确');

  const total = db.prepare('SELECT SUM(word_count) AS total FROM chapters').get();
  if (total.total !== 8) fail(`字数聚合期望 8，实际 ${total.total}`);

  db.prepare("DELETE FROM projects WHERE id = 'p1'").run();
  const remaining = db.prepare('SELECT COUNT(*) AS count FROM chapters').get();
  if (remaining.count !== 0) fail('级联删除未生效');
  const indexLeft = db.prepare('SELECT COUNT(*) AS count FROM search_index').get();
  if (indexLeft.count !== 0) fail('删除章节后全文索引未清理');

  db.close();
  console.log('SMOKE OK: schema、FTS5(trigram)、聚合、级联删除均正常');
  process.exit(0);
}

main();
