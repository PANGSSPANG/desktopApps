/**
 * 开发期用：伪造一份"崩溃时未保存的草稿"，方便验证恢复条。
 *
 * 用法：pnpm simulate:crash
 * 前提：应用至少已经建过一个项目并写过一章（用的是 .appdata 数据目录）。
 * 行为：取最近更新的章节，在 drafts 下写一份比库里更新的草稿，重启应用即出现恢复提示。
 */
const path = require('node:path');
const { existsSync, mkdirSync, writeFileSync } = require('node:fs');

const repo = path.resolve(__dirname, '..');
const dataDir = process.env.WENHUO_USER_DATA
  ? path.resolve(process.env.WENHUO_USER_DATA)
  : path.join(repo, '.appdata');
const dbFile = path.join(dataDir, 'wenhuo.db');

if (!existsSync(dbFile)) {
  console.error(`找不到数据库：${dbFile}`);
  console.error('先跑一次 pnpm dev:local 并新建一个项目、写几句话。');
  process.exit(1);
}

const Database = require('better-sqlite3');
const db = new Database(dbFile, { readonly: true });

const chapter = db
  .prepare(
    `SELECT id, project_id, title, content_json, plain_text, word_count
     FROM chapters ORDER BY updated_at DESC LIMIT 1`,
  )
  .get();

if (!chapter) {
  console.error('库里还没有章节，先在应用里建一章并写点内容。');
  process.exit(1);
}

const doc = JSON.parse(chapter.content_json);
doc.content = Array.isArray(doc.content) ? doc.content : [];
doc.content.push({
  type: 'paragraph',
  content: [{ type: 'text', text: '【模拟崩溃时尚未保存的一段】' }],
});

const draftsDir = path.join(dataDir, 'drafts');
mkdirSync(draftsDir, { recursive: true });

const record = {
  chapterId: chapter.id,
  projectId: chapter.project_id,
  contentJson: JSON.stringify(doc),
  plainText: `${chapter.plain_text}\n【模拟崩溃时尚未保存的一段】`,
  wordCount: chapter.word_count + 12,
  // 比库里的 updated_at 更新，才会被识别为恢复候选
  savedAt: Date.now() + 60_000,
};

writeFileSync(path.join(draftsDir, `${chapter.id}.json`), JSON.stringify(record), 'utf8');
db.close();

console.log(`已写入恢复候选：${chapter.title}（${record.wordCount} 字）`);
console.log('重启应用（pnpm dev:local），顶部会出现"检测到 1 份未保存的草稿"。');
