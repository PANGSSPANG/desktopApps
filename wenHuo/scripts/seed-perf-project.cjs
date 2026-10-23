/**
 * 造一个 50 万字级别的演示库，给 UI 性能实测用。
 *
 * 用法：node scripts/seed-perf-project.cjs <userDataDir> [章节数]
 * 直接按 001_init.sql 建库，避免依赖 Electron。
 */
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const [userDataDir, countArg] = process.argv.slice(2);
const chapters = Number(countArg || 170);
if (!userDataDir) {
  console.error('用法：node scripts/seed-perf-project.cjs <userDataDir> [章节数]');
  process.exit(1);
}

const root = path.resolve(userDataDir);
fs.mkdirSync(root, { recursive: true });
const dbFile = path.join(root, 'wenhuo.db');
fs.rmSync(dbFile, { force: true });
fs.rmSync(`${dbFile}-wal`, { force: true });
fs.rmSync(`${dbFile}-shm`, { force: true });

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(
  fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main', 'db', 'migrations', '001_init.sql'),
    'utf8',
  ),
);
db.pragma('user_version = 1');

const POOL = '青云观上有一棵松玄清道长站在山门前望着远处的云雾缓缓开口说弟子们今日的功课可曾做完';
function text(length) {
  let out = '';
  while (out.length < length) out += POOL[Math.floor(Math.random() * POOL.length)];
  return out;
}

const now = Date.now();
db.prepare(
  `INSERT INTO projects (id, title, author, genre, target_words, daily_goal, created_at, updated_at)
   VALUES ('perf', '压测长篇', '测试', 'webnovel', 1000000, 4000, ?, ?)`,
).run(now, now);
db.prepare(
  `INSERT INTO volumes (id, project_id, title, sort_order, created_at, updated_at)
   VALUES ('v1', 'perf', '第一卷', 1000, ?, ?)`,
).run(now, now);

const insert = db.prepare(
  `INSERT INTO chapters
     (id, project_id, volume_id, title, content_json, plain_text, word_count,
      status, sort_order, created_at, updated_at)
   VALUES (?, 'perf', 'v1', ?, ?, ?, ?, 'draft', ?, ?, ?)`,
);
const doc = (body) =>
  JSON.stringify({
    type: 'doc',
    content: body
      .match(/.{1,60}/g)
      .map((line) => ({ type: 'paragraph', content: [{ type: 'text', text: line }] })),
  });

db.transaction(() => {
  for (let index = 0; index < chapters; index += 1) {
    const body = text(3000);
    insert.run(`c${index}`, '', doc(body), body, body.length, (index + 1) * 1000, now, now);
  }
})();

db.prepare(
  `INSERT INTO settings (key, value) VALUES ('lastProjectId', 'perf')
  ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
).run();

const total = chapters * 3000;
db.close();
console.log(`已生成 ${chapters} 章 / ${total} 字的演示库：${dbFile}`);
