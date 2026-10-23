/**
 * 50 万字数据层性能基线。
 *
 * 用法：node scripts/perf-baseline.cjs [章节数]
 * 说明：这里量的是真实 SQLite 链路（与主进程同一套 SQL），
 * UI 层的启动/切章手感需要在应用内用 DevTools 量，脚本只兜数据层。
 */
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const Database = require('better-sqlite3');

const CHAPTERS = Number(process.argv[2] || 170);
const CHARS_PER_CHAPTER = 3000;

const POOL = '青云观上有一棵松玄清道长站在山门前望着远处的云雾缓缓开口说弟子们今日的功课可曾做完';

function randomText(length) {
  let text = '';
  while (text.length < length) {
    text += POOL[Math.floor(Math.random() * POOL.length)];
  }
  return text;
}

function ms(start) {
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wenhuo-perf-'));
  const db = new Database(path.join(dir, 'perf.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'db', 'migrations', '001_init.sql'),
    'utf8',
  );

  let start = process.hrtime.bigint();
  db.exec(schema);
  db.pragma('user_version = 1');
  const schemaMs = ms(start);

  const now = Date.now();
  db.prepare(
    `INSERT INTO projects (id, title, author, genre, target_words, daily_goal, created_at, updated_at)
     VALUES ('p1', '压测书', '测试', 'webnovel', 1000000, 4000, ?, ?)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO volumes (id, project_id, title, sort_order, created_at, updated_at)
     VALUES ('v1', 'p1', '第一卷', 1000, ?, ?)`,
  ).run(now, now);

  const insert = db.prepare(
    `INSERT INTO chapters
       (id, project_id, volume_id, title, content_json, plain_text, word_count,
        status, sort_order, created_at, updated_at)
     VALUES (?, 'p1', 'v1', ?, ?, ?, ?, 'draft', ?, ?, ?)`,
  );

  start = process.hrtime.bigint();
  const seed = db.transaction(() => {
    for (let index = 0; index < CHAPTERS; index += 1) {
      const text = randomText(CHARS_PER_CHAPTER);
      const doc = JSON.stringify({
        type: 'doc',
        content: text
          .match(/.{1,60}/g)
          .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
      });
      insert.run(
        `c${index}`,
        `第${index + 1}章`,
        doc,
        text,
        text.length,
        (index + 1) * 1000,
        now,
        now,
      );
    }
  });
  seed();
  const seedMs = ms(start);

  const totalChars = CHAPTERS * CHARS_PER_CHAPTER;

  start = process.hrtime.bigint();
  const tree = db
    .prepare(
      `SELECT c.id, c.title, c.sort_order, c.updated_at FROM chapters c
       JOIN volumes v ON v.id = c.volume_id WHERE c.project_id = ?
       ORDER BY v.sort_order, c.sort_order`,
    )
    .all('p1');
  const treeMs = ms(start);

  start = process.hrtime.bigint();
  db.prepare('SELECT content_json FROM chapters WHERE id = ?').get('c80');
  const chapterReadMs = ms(start);

  start = process.hrtime.bigint();
  const fts = db
    .prepare(
      `SELECT ref_id, bm25(search_index, 0, 0, 0, 8, 1) AS rank FROM search_index
       WHERE search_index MATCH ? AND project_id = ? ORDER BY rank LIMIT 20`,
    )
    .all('"青云观"', 'p1');
  const ftsMs = ms(start);

  start = process.hrtime.bigint();
  const like = db
    .prepare(
      `SELECT id FROM chapters WHERE project_id = ?
       AND (title LIKE ? ESCAPE '\\' OR plain_text LIKE ? ESCAPE '\\') LIMIT 50`,
    )
    .all('p1', '%青云%', '%青云%');
  const likeMs = ms(start);

  start = process.hrtime.bigint();
  const stats = db
    .prepare(
      `SELECT COALESCE(SUM(word_count), 0) AS total, COUNT(*) AS chapters,
              COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done
       FROM chapters WHERE project_id = ?`,
    )
    .get('p1');
  const statsMs = ms(start);

  const rows = [
    ['建库 + 迁移', schemaMs, null],
    [`灌入 ${CHAPTERS} 章 / ${totalChars} 字（含 FTS 索引）`, seedMs, null],
    ['读卷章树', treeMs, 100],
    ['读单章正文（~3k 字）', chapterReadMs, 20],
    ['搜索 3 字（FTS trigram）', ftsMs, 300],
    ['搜索 2 字（LIKE 兜底）', likeMs, 300],
    ['全书字数聚合', statsMs, 50],
  ];

  console.log(`\n数据量：${CHAPTERS} 章 / ${totalChars} 字符\n`);
  console.log('| 操作 | 耗时 | 阈值 | 结果 |');
  console.log('| --- | --- | --- | --- |');
  let failed = 0;
  for (const [name, value, threshold] of rows) {
    const verdict = threshold === null ? '—' : value <= threshold ? 'PASS' : 'FAIL';
    if (verdict === 'FAIL') failed += 1;
    console.log(
      `| ${name} | ${value.toFixed(1)}ms | ${threshold === null ? '—' : `${threshold}ms`} | ${verdict} |`,
    );
  }

  console.log(
    `\n命中：FTS ${fts.length} 条、LIKE ${like.length} 条、树 ${tree.length} 章、字数 ${stats.total}`,
  );

  db.close();
  fs.rmSync(dir, { recursive: true, force: true });

  if (failed > 0) {
    console.error(`\n${failed} 项超出阈值`);
    process.exit(1);
  }
  console.log('\n全部在阈值内');
}

main();
