import type { SearchHit, SearchPage, SearchRefType } from '@shared/types';
import type { Db } from '../db/connection';

/**
 * 中文全文搜索：双路。
 *
 * - ≥3 字：FTS5 trigram 短语匹配，只用来"找文档"；
 * - 1–2 字：trigram 是 3 字符滑窗命中不了，退回 LIKE 扫描。
 *
 * 命中后统一在纯文本里展开成"每处一处结果"，并给出可点击的上下文。
 * FTS 天生是文档级命中，如果不展开，一章写十次也只能看到一条。
 */
const FTS_MIN_CHARS = 3;
const MAX_OCCURRENCES_PER_DOC = 5;
const CONTEXT_RADIUS = 40;

interface DocRef {
  id: string;
  title: string;
  rank: number;
}

/** LIKE 里 % 和 _ 是通配符，查询词必须先转义，语句里配合 ESCAPE '\'。 */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function findOccurrences(text: string, query: string, max: number): number[] {
  const positions: number[] = [];
  if (!query) return positions;
  let index = text.indexOf(query);
  while (index !== -1 && positions.length < max) {
    positions.push(index);
    index = text.indexOf(query, index + query.length);
  }
  return positions;
}

function contextAround(text: string, index: number, query: string): string {
  const start = Math.max(0, index - CONTEXT_RADIUS);
  const end = Math.min(text.length, index + query.length + CONTEXT_RADIUS);
  const head = start > 0 ? '…' : '';
  const tail = end < text.length ? '…' : '';
  const before = text.slice(start, index);
  const hit = text.slice(index, index + query.length);
  const after = text.slice(index + query.length, end);
  return `${head}${before}[[${hit}]]${after}${tail}`.replace(/\s+/g, ' ');
}

/**
 * 把文档级命中展开成"逐处命中"。
 * 文本里找不到（例如只命中标题）时仍保留一条结果，避免搜索结果整条消失。
 */
function expandHits(
  db: Db,
  refs: DocRef[],
  refType: SearchRefType,
  query: string,
  limit: number,
): SearchHit[] {
  const hits: SearchHit[] = [];
  const statement =
    refType === 'chapter'
      ? db.prepare('SELECT plain_text AS text FROM chapters WHERE id = ?')
      : db.prepare('SELECT search_text AS text FROM entities WHERE id = ?');

  for (const ref of refs) {
    const row = statement.get(ref.id) as { text: string } | undefined;
    const text = row?.text ?? '';
    const positions = findOccurrences(text, query, MAX_OCCURRENCES_PER_DOC);

    if (positions.length === 0) {
      hits.push({
        id: `${refType}:${ref.id}:0`,
        refType,
        refId: ref.id,
        title: ref.title,
        context: '',
        occurrence: 0,
        score: ref.rank,
      });
      continue;
    }

    positions.forEach((position, index) => {
      hits.push({
        id: `${refType}:${ref.id}:${index}`,
        refType,
        refId: ref.id,
        title: ref.title,
        context: contextAround(text, position, query),
        occurrence: index,
        score: ref.rank,
      });
    });
  }

  return hits.slice(0, limit);
}

function findWithFts(
  db: Db,
  projectId: string,
  query: string,
): { chapters: DocRef[]; entities: DocRef[] } {
  // 包成短语，避免用户输入的 AND/OR/引号被当成 FTS 语法
  const phrase = `"${query.replace(/"/g, '""')}"`;
  const rows = db
    .prepare(
      `SELECT ref_type, ref_id, title, bm25(search_index, 0.0, 0.0, 0.0, 8.0, 1.0) AS rank
       FROM search_index
       WHERE search_index MATCH ? AND project_id = ?
       ORDER BY rank
       LIMIT 60`,
    )
    .all(phrase, projectId) as { ref_type: string; ref_id: string; title: string; rank: number }[];

  const chapters: DocRef[] = [];
  const entities: DocRef[] = [];
  for (const row of rows) {
    const ref: DocRef = { id: row.ref_id, title: row.title, rank: Number(row.rank) };
    if (row.ref_type === 'entity') entities.push(ref);
    else chapters.push(ref);
  }
  return { chapters, entities };
}

function findWithLike(
  db: Db,
  projectId: string,
  query: string,
): { chapters: DocRef[]; entities: DocRef[] } {
  const pattern = `%${escapeLike(query)}%`;

  const chapters = db
    .prepare(
      `SELECT id, title FROM chapters
       WHERE project_id = ? AND (title LIKE ? ESCAPE '\\' OR plain_text LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC LIMIT 60`,
    )
    .all(projectId, pattern, pattern) as { id: string; title: string }[];

  const entities = db
    .prepare(
      `SELECT id, name AS title FROM entities
       WHERE project_id = ? AND (name LIKE ? ESCAPE '\\' OR search_text LIKE ? ESCAPE '\\')
       ORDER BY updated_at DESC LIMIT 60`,
    )
    .all(projectId, pattern, pattern) as { id: string; title: string }[];

  const toRefs = (rows: { id: string; title: string }[]): DocRef[] =>
    rows.map((row, index) => ({ id: row.id, title: row.title, rank: index }));

  return { chapters: toRefs(chapters), entities: toRefs(entities) };
}

export function search(
  db: Db,
  input: { projectId: string; q: string; limit?: number },
): SearchPage {
  const query = input.q.trim();
  const limit = input.limit ?? 20;
  if (!query) return { query, chapters: [], entities: [] };

  const found =
    Array.from(query).length >= FTS_MIN_CHARS
      ? findWithFts(db, input.projectId, query)
      : findWithLike(db, input.projectId, query);

  return {
    query,
    chapters: expandHits(db, found.chapters, 'chapter', query, limit),
    entities: expandHits(db, found.entities, 'entity', query, limit),
  };
}
