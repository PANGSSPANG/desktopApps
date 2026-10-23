-- schema v1：项目 / 卷 / 章 / 设定 / 快照 / 写作会话 / 全文索引
-- 迁移只增不改，后续变更走 002、003……

PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  author        TEXT NOT NULL DEFAULT '',
  genre         TEXT NOT NULL DEFAULT 'webnovel'
                CHECK (genre IN ('webnovel', 'novel', 'nonfiction')),
  synopsis      TEXT NOT NULL DEFAULT '',
  target_words  INTEGER NOT NULL DEFAULT 0,
  daily_goal    INTEGER NOT NULL DEFAULT 0,
  cover_path    TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX idx_projects_recent ON projects (deleted_at, updated_at DESC);

CREATE TABLE volumes (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  sort_order REAL NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_volumes_project ON volumes (project_id, sort_order);

CREATE TABLE chapters (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  volume_id    TEXT NOT NULL REFERENCES volumes (id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
  plain_text   TEXT NOT NULL DEFAULT '',
  word_count   INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft', 'revising', 'done')),
  synopsis     TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL DEFAULT '',
  sort_order   REAL NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_chapters_volume ON chapters (volume_id, sort_order);
CREATE INDEX idx_chapters_recent ON chapters (project_id, updated_at DESC);

-- 人物 / 地点 / 组织 / 物品统一为实体表：四类字段同构，多态关联只需一种外键。
CREATE TABLE entities (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('character', 'location', 'organization', 'item')),
  name         TEXT NOT NULL,
  alias        TEXT NOT NULL DEFAULT '',
  role         TEXT NOT NULL DEFAULT '',
  profile_json TEXT NOT NULL DEFAULT '{}',
  search_text  TEXT NOT NULL DEFAULT '',
  avatar_path  TEXT,
  sort_order   REAL NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_entities_project ON entities (project_id, kind, name);

CREATE TABLE chapter_links (
  id          TEXT PRIMARY KEY,
  chapter_id  TEXT NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL DEFAULT 'entity',
  entity_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (chapter_id, entity_type, entity_id)
);
CREATE INDEX idx_links_entity ON chapter_links (entity_type, entity_id);

CREATE TABLE snapshots (
  id           TEXT PRIMARY KEY,
  chapter_id   TEXT NOT NULL REFERENCES chapters (id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('manual', 'auto', 'pre_restore')),
  content_json TEXT NOT NULL,
  plain_text   TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  word_count   INTEGER NOT NULL,
  note         TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL
);
CREATE INDEX idx_snapshots_chapter ON snapshots (chapter_id, created_at DESC);
-- 同章 + 同内容 + 同类型只允许一条自动快照：去重交给数据库本身
CREATE UNIQUE INDEX uq_snapshots_auto_dedupe ON snapshots (chapter_id, content_hash)
  WHERE kind = 'auto';

CREATE TABLE writing_sessions (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  date_key      TEXT NOT NULL,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER NOT NULL,
  words_written INTEGER NOT NULL DEFAULT 0,
  UNIQUE (project_id, date_key)
);
CREATE INDEX idx_sessions_project_date ON writing_sessions (project_id, date_key DESC);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 全文索引：trigram 分词对中文友好，1–2 字查询由应用层 LIKE 兜底。
CREATE VIRTUAL TABLE search_index USING fts5(
  ref_type   UNINDEXED,
  ref_id     UNINDEXED,
  project_id UNINDEXED,
  title,
  body,
  tokenize = 'trigram'
);

CREATE TRIGGER trg_chapters_ai AFTER INSERT ON chapters BEGIN
  INSERT INTO search_index (ref_type, ref_id, project_id, title, body)
  VALUES ('chapter', new.id, new.project_id, new.title, new.plain_text);
END;

CREATE TRIGGER trg_chapters_au AFTER UPDATE OF title, plain_text ON chapters BEGIN
  DELETE FROM search_index WHERE ref_type = 'chapter' AND ref_id = old.id;
  INSERT INTO search_index (ref_type, ref_id, project_id, title, body)
  VALUES ('chapter', new.id, new.project_id, new.title, new.plain_text);
END;

CREATE TRIGGER trg_chapters_ad AFTER DELETE ON chapters BEGIN
  DELETE FROM search_index WHERE ref_type = 'chapter' AND ref_id = old.id;
END;

CREATE TRIGGER trg_entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO search_index (ref_type, ref_id, project_id, title, body)
  VALUES ('entity', new.id, new.project_id, new.name, new.search_text);
END;

CREATE TRIGGER trg_entities_au AFTER UPDATE OF name, search_text ON entities BEGIN
  DELETE FROM search_index WHERE ref_type = 'entity' AND ref_id = old.id;
  INSERT INTO search_index (ref_type, ref_id, project_id, title, body)
  VALUES ('entity', new.id, new.project_id, new.name, new.search_text);
END;

CREATE TRIGGER trg_entities_ad AFTER DELETE ON entities BEGIN
  DELETE FROM search_index WHERE ref_type = 'entity' AND ref_id = old.id;
  DELETE FROM chapter_links WHERE entity_type = 'entity' AND entity_id = old.id;
END;
