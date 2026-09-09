import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AttachmentData } from "../services/files/validate-file.ts";
import { getDatabase } from "../lib/database.ts";
import { AppError } from "../lib/api.ts";
import type { HealthRecord } from "../schemas/health.ts";
import {
  CATEGORIES,
  type Category,
  type DocumentInput,
  type FamilyDocument,
  type LibraryData,
} from "../schemas/document.ts";

type DocumentRow = {
  id: string;
  title: string;
  content: string;
  summary: string;
  category: Category;
  tags: string;
  source: string;
  created_at: string;
  updated_at: string;
  attachment_name: string | null;
  attachment_mime_type: string | null;
  attachment_size: number | null;
  health_details: string | null;
};

function fromRow(row: DocumentRow): FamilyDocument {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    summary: row.summary,
    category: row.category,
    tags: JSON.parse(row.tags),
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    health: row.health_details ? JSON.parse(row.health_details) : null,
    attachment: row.attachment_name
      ? {
          name: row.attachment_name,
          mimeType: row.attachment_mime_type!,
          size: row.attachment_size!,
        }
      : null,
  };
}

export function createDocumentRepository(db: DatabaseSync) {
  const selectDocument = `SELECT d.*, a.name AS attachment_name, a.mime_type AS attachment_mime_type, a.size AS attachment_size, h.details AS health_details
    FROM documents d LEFT JOIN attachments a ON a.document_id = d.id LEFT JOIN health_records h ON h.document_id = d.id`;
  function writeHealth(id: string, health: HealthRecord | null) {
    if (!health) {
      db.prepare("DELETE FROM health_records WHERE document_id = ?").run(id);
      return;
    }
    if (
      !db
        .prepare("SELECT id FROM family_members WHERE id = ?")
        .get(health.memberId)
    )
      throw new AppError(
        "MEMBER_NOT_FOUND",
        "所选成员已不存在，请重新选择",
        404,
      );
    db.prepare(
      "INSERT INTO health_records (document_id, member_id, details) VALUES (?, ?, ?) ON CONFLICT(document_id) DO UPDATE SET member_id = excluded.member_id, details = excluded.details",
    ).run(id, health.memberId, JSON.stringify(health));
  }
  function transaction<T>(operation: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function writeAttachment(id: string, attachment: AttachmentData | null) {
    if (!attachment) {
      db.prepare("DELETE FROM attachments WHERE document_id = ?").run(id);
      return;
    }
    db.prepare(
      `INSERT INTO attachments (document_id, name, mime_type, size, data) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(document_id) DO UPDATE SET name = excluded.name, mime_type = excluded.mime_type, size = excluded.size, data = excluded.data`,
    ).run(
      id,
      attachment.name,
      attachment.mimeType,
      attachment.size,
      attachment.data,
    );
  }
  return {
    list(query = "", category?: Category, memberId?: string): LibraryData {
      // instr 按字面匹配，避免 LIKE 将用户输入中的 % 和 _ 当成通配符。
      const rows = db
        .prepare(
          `
        ${selectDocument}
        WHERE (? = '' OR instr(lower(d.title || char(10) || d.content || char(10) || d.summary || char(10) || d.tags || char(10) || d.source || char(10) || coalesce(a.name, '') || char(10) || coalesce(h.details, '')), lower(?)) > 0)
          AND (? IS NULL OR d.category = ?)
          AND (? IS NULL OR h.member_id = ?)
        ORDER BY CASE WHEN ? = '健康档案' THEN json_extract(h.details, '$.occurredOn') END DESC, d.updated_at DESC, d.rowid DESC
      `,
        )
        .all(
          query,
          query,
          category ?? null,
          category ?? null,
          memberId ?? null,
          memberId ?? null,
          category ?? null,
        ) as DocumentRow[];
      const counts = Object.fromEntries(
        CATEGORIES.map((key) => [key, 0]),
      ) as Record<Category, number>;
      const grouped = db
        .prepare(
          "SELECT category, count(*) as count FROM documents GROUP BY category",
        )
        .all() as { category: Category; count: number }[];
      for (const group of grouped) counts[group.category] = group.count;
      return {
        documents: rows.map((row) => {
          const { content, ...document } = fromRow(row);
          return { ...document, excerpt: content.slice(0, 160) };
        }),
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        counts,
      };
    },
    find(id: string): FamilyDocument | null {
      const row = db.prepare(`${selectDocument} WHERE d.id = ?`).get(id) as
        DocumentRow | undefined;
      return row ? fromRow(row) : null;
    },
    findAttachment(id: string): AttachmentData | null {
      const row = db
        .prepare(
          "SELECT name, mime_type, size, data FROM attachments WHERE document_id = ?",
        )
        .get(id) as
        | { name: string; mime_type: string; size: number; data: Uint8Array }
        | undefined;
      return row
        ? {
            name: row.name,
            mimeType: row.mime_type,
            size: row.size,
            data: Buffer.from(row.data),
          }
        : null;
    },
    create(
      input: DocumentInput,
      attachment?: AttachmentData | null,
      id: string = randomUUID(),
    ): FamilyDocument {
      return transaction(() => {
        // 首页卡片携带稳定编号，响应丢失后重试不会重复创建。
        const existing = this.find(id);
        if (existing) return existing;
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO documents (id, title, content, summary, category, tags, source, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          input.title,
          input.content,
          input.summary,
          input.category,
          JSON.stringify(input.tags),
          input.source,
          now,
          now,
        );
        if (attachment) writeAttachment(id, attachment);
        writeHealth(id, input.health);
        return this.find(id)!;
      });
    },
    update(
      id: string,
      input: DocumentInput,
      attachment?: AttachmentData | null,
    ): FamilyDocument | null {
      return transaction(() => {
        const now = new Date().toISOString();
        const result = db
          .prepare(
            `UPDATE documents SET title = ?, content = ?, summary = ?, category = ?, tags = ?, source = ?, updated_at = ? WHERE id = ?`,
          )
          .run(
            input.title,
            input.content,
            input.summary,
            input.category,
            JSON.stringify(input.tags),
            input.source,
            now,
            id,
          );
        if (!result.changes) return null;
        if (attachment !== undefined) writeAttachment(id, attachment);
        writeHealth(id, input.health);
        return this.find(id);
      });
    },
    remove(id: string): boolean {
      return (
        db.prepare("DELETE FROM documents WHERE id = ?").run(id).changes > 0
      );
    },
  };
}

export function documentsRepository() {
  return createDocumentRepository(getDatabase());
}
