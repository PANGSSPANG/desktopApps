import { randomUUID } from 'node:crypto';
import { AppError } from '@shared/errors';
import type { EntityDetail, EntityInput, EntityKind, EntitySummary } from '@shared/types';
import type { Db } from '../db/connection';

const ENTITY_KINDS: readonly EntityKind[] = ['character', 'location', 'organization', 'item'];

interface EntityRow {
  id: string;
  project_id: string;
  kind: string;
  name: string;
  alias: string;
  role: string;
  profile_json: string;
  search_text: string;
  updated_at: number;
  chapter_count: number;
}

interface Profile {
  description: string;
  relations: string;
}

function isEntityKind(value: string): value is EntityKind {
  return (ENTITY_KINDS as readonly string[]).includes(value);
}

function parseProfile(json: string): Profile {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return {
      description: typeof parsed['description'] === 'string' ? parsed['description'] : '',
      relations: typeof parsed['relations'] === 'string' ? parsed['relations'] : '',
    };
  } catch {
    return { description: '', relations: '' };
  }
}

/** 搜索文本要把别名、身份、描述、关系都拼进去，否则搜"玄清道长"这种别名会漏。 */
function buildSearchText(input: Required<Pick<EntityInput, 'name'>> & EntityInput): string {
  return [
    input.name,
    input.alias ?? '',
    input.role ?? '',
    input.description ?? '',
    input.relations ?? '',
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
}

function toSummary(row: EntityRow): EntitySummary {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: isEntityKind(row.kind) ? row.kind : 'character',
    name: row.name,
    alias: row.alias,
    role: row.role,
    chapterCount: Number(row.chapter_count ?? 0),
    updatedAt: Number(row.updated_at),
  };
}

const SUMMARY_COLUMNS = `
  e.id, e.project_id, e.kind, e.name, e.alias, e.role, e.profile_json, e.search_text,
  e.updated_at,
  (SELECT COUNT(*) FROM chapter_links l WHERE l.entity_type = 'entity' AND l.entity_id = e.id) AS chapter_count
`;

export function listEntities(db: Db, projectId: string, kind?: EntityKind): EntitySummary[] {
  const rows = kind
    ? (db
        .prepare(
          `SELECT ${SUMMARY_COLUMNS} FROM entities e
           WHERE e.project_id = ? AND e.kind = ?
           ORDER BY e.updated_at DESC, e.rowid DESC`,
        )
        .all(projectId, kind) as EntityRow[])
    : (db
        .prepare(
          `SELECT ${SUMMARY_COLUMNS} FROM entities e
           WHERE e.project_id = ?
           ORDER BY e.updated_at DESC, e.rowid DESC`,
        )
        .all(projectId) as EntityRow[]);
  return rows.map(toSummary);
}

export function getEntity(db: Db, entityId: string): EntityDetail {
  const row = db
    .prepare(`SELECT ${SUMMARY_COLUMNS} FROM entities e WHERE e.id = ?`)
    .get(entityId) as EntityRow | undefined;
  if (!row) throw new AppError('NOT_FOUND', '设定卡不存在或已被删除。');

  const chapters = db
    .prepare(
      `SELECT c.id, c.title FROM chapter_links l
       JOIN chapters c ON c.id = l.chapter_id
       WHERE l.entity_type = 'entity' AND l.entity_id = ?
       ORDER BY c.sort_order`,
    )
    .all(entityId) as { id: string; title: string }[];

  const profile = parseProfile(row.profile_json);
  return {
    ...toSummary(row),
    description: profile.description,
    relations: profile.relations,
    chapters,
  };
}

/** 新建或更新设定卡；同时重建 search_text，让全文搜索立刻能命中。 */
export function saveEntity(db: Db, input: EntityInput): EntityDetail {
  const name = input.name.trim();
  if (!name) throw new AppError('INVALID_ARGUMENT', '名称不能为空。');

  const now = Date.now();
  const profileJson = JSON.stringify({
    description: input.description?.trim() ?? '',
    relations: input.relations?.trim() ?? '',
  });
  const searchText = buildSearchText({ ...input, name });

  if (input.id) {
    const result = db
      .prepare(
        `UPDATE entities
           SET kind = ?, name = ?, alias = ?, role = ?, profile_json = ?, search_text = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.kind,
        name,
        input.alias?.trim() ?? '',
        input.role?.trim() ?? '',
        profileJson,
        searchText,
        now,
        input.id,
      );
    if (result.changes === 0) throw new AppError('NOT_FOUND', '设定卡不存在。');
    return getEntity(db, input.id);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO entities
       (id, project_id, kind, name, alias, role, profile_json, search_text,
        avatar_path, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
  ).run(
    id,
    input.projectId,
    input.kind,
    name,
    input.alias?.trim() ?? '',
    input.role?.trim() ?? '',
    profileJson,
    searchText,
    now,
    now,
  );
  return getEntity(db, id);
}

export function deleteEntity(db: Db, entityId: string): void {
  const result = db.prepare('DELETE FROM entities WHERE id = ?').run(entityId);
  if (result.changes === 0) throw new AppError('NOT_FOUND', '设定卡不存在。');
}

export function listChapterEntities(db: Db, chapterId: string): EntitySummary[] {
  const rows = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM chapter_links l
       JOIN entities e ON e.id = l.entity_id
       WHERE l.chapter_id = ? AND l.entity_type = 'entity'
       ORDER BY e.name`,
    )
    .all(chapterId) as EntityRow[];
  return rows.map(toSummary);
}

export function linkEntity(db: Db, chapterId: string, entityId: string): EntitySummary[] {
  const exists = db.prepare('SELECT 1 FROM chapters WHERE id = ?').get(chapterId);
  if (!exists) throw new AppError('NOT_FOUND', '章节不存在。');
  const entity = db.prepare('SELECT 1 FROM entities WHERE id = ?').get(entityId);
  if (!entity) throw new AppError('NOT_FOUND', '设定卡不存在。');

  db.prepare(
    `INSERT INTO chapter_links (id, chapter_id, entity_type, entity_id, created_at)
     VALUES (?, ?, 'entity', ?, ?)
     ON CONFLICT (chapter_id, entity_type, entity_id) DO NOTHING`,
  ).run(randomUUID(), chapterId, entityId, Date.now());

  return listChapterEntities(db, chapterId);
}

export function unlinkEntity(db: Db, chapterId: string, entityId: string): EntitySummary[] {
  db.prepare(
    `DELETE FROM chapter_links
     WHERE chapter_id = ? AND entity_type = 'entity' AND entity_id = ?`,
  ).run(chapterId, entityId);
  return listChapterEntities(db, chapterId);
}

export function listBacklinks(db: Db, entityId: string): { id: string; title: string }[] {
  return db
    .prepare(
      `SELECT c.id, c.title FROM chapter_links l
       JOIN chapters c ON c.id = l.chapter_id
       WHERE l.entity_type = 'entity' AND l.entity_id = ?
       ORDER BY c.updated_at DESC`,
    )
    .all(entityId) as { id: string; title: string }[];
}
