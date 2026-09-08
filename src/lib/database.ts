import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:")
    mkdirSync(dirname(resolve(path)), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '[]',
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS documents_updated ON documents(updated_at DESC);
    CREATE INDEX IF NOT EXISTS documents_category ON documents(category);
    CREATE TABLE IF NOT EXISTS attachments (
      document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      data BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS family_members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      relationship TEXT NOT NULL DEFAULT '',
      birth_date TEXT NOT NULL DEFAULT '',
      allergies TEXT NOT NULL DEFAULT '',
      conditions TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS health_records (
      document_id TEXT PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL REFERENCES family_members(id) ON DELETE RESTRICT,
      details TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS health_records_member ON health_records(member_id);
  `);
  return db;
}

const globalDb = globalThis as typeof globalThis & {
  familyDatabase?: DatabaseSync;
};

export function getDatabase(): DatabaseSync {
  // 数据库是运行时的可写数据，不能被打包器当成静态依赖扫描。
  globalDb.familyDatabase ??= openDatabase(
    resolve(
      /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
        "./data/family.sqlite",
    ),
  );
  return globalDb.familyDatabase;
}
