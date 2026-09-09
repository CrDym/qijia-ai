import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../lib/database.ts";
import { AppError } from "../lib/api.ts";
import type {
  Activity,
  ActivityInput,
  ActivityFields,
} from "../schemas/activity.ts";
import type { AttachmentData } from "../services/files/validate-file.ts";

export function createActivityRepository(db: DatabaseSync) {
  const select = `SELECT a.*, f.name AS file_name, f.mime_type AS file_type, f.size AS file_size FROM activities a LEFT JOIN activity_attachments f ON f.activity_id = a.id`;
  function decode(row: Record<string, unknown>): Activity {
    return {
      id: String(row.id),
      kind: row.kind as Activity["kind"],
      title: String(row.title),
      notes: String(row.notes),
      dueOn: String(row.due_on),
      items: JSON.parse(String(row.items)),
      completed: Boolean(row.completed),
      source: String(row.source),
      sourceContent: String(row.source_content),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      attachment: row.file_name
        ? {
            name: String(row.file_name),
            mimeType: String(row.file_type),
            size: Number(row.file_size),
          }
        : null,
    };
  }
  function find(id: string) {
    const row = db.prepare(`${select} WHERE a.id = ?`).get(id);
    return row ? decode(row) : null;
  }
  function transaction<T>(action: () => T) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = action();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
  function requireActivity(id: string) {
    const value = find(id);
    if (!value)
      throw new AppError("NOT_FOUND", "事项已不存在，请刷新列表", 404);
    return value;
  }
  return {
    find,
    list() {
      return db
        .prepare(
          `${select} ORDER BY a.completed, CASE WHEN a.due_on = '' THEN 1 ELSE 0 END, a.due_on, a.created_at DESC`,
        )
        .all()
        .map(decode);
    },
    create(
      input: ActivityInput,
      attachment?: AttachmentData | null,
      id: string = randomUUID(),
    ) {
      return transaction(() => {
        const existing = find(id);
        if (existing) return existing;
        const now = new Date().toISOString();
        const completed =
          input.kind === "checklist" &&
          input.items.every((item) => item.completed);
        db.prepare(
          "INSERT INTO activities (id, kind, title, notes, due_on, items, completed, source, source_content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          id,
          input.kind,
          input.title,
          input.notes,
          input.dueOn,
          JSON.stringify(input.items),
          Number(completed),
          input.source,
          input.sourceContent,
          now,
          now,
        );
        if (attachment)
          db.prepare(
            "INSERT INTO activity_attachments (activity_id, name, mime_type, size, data) VALUES (?, ?, ?, ?, ?)",
          ).run(
            id,
            attachment.name,
            attachment.mimeType,
            attachment.size,
            attachment.data,
          );
        return requireActivity(id);
      });
    },
    update(id: string, input: ActivityFields) {
      return transaction(() => {
        const existing = requireActivity(id);
        if (existing.kind !== input.kind)
          throw new AppError("INVALID_KIND", "请保留原事项类型");
        const completed =
          input.kind === "checklist"
            ? input.items.every((item) => item.completed)
            : existing.completed;
        db.prepare(
          "UPDATE activities SET title = ?, notes = ?, due_on = ?, items = ?, completed = ?, updated_at = ? WHERE id = ?",
        ).run(
          input.title,
          input.notes,
          input.dueOn,
          JSON.stringify(input.items),
          Number(completed),
          new Date().toISOString(),
          id,
        );
        return requireActivity(id);
      });
    },
    toggle(id: string, completed: boolean, itemId?: string) {
      return transaction(() => {
        const value = requireActivity(id);
        if (
          itemId &&
          (value.kind !== "checklist" ||
            !value.items.some((item) => item.id === itemId))
        )
          throw new AppError("NOT_FOUND", "清单条目已不存在，请刷新", 404);
        const items = value.items.map((item) =>
          !itemId || item.id === itemId ? { ...item, completed } : item,
        );
        const done =
          value.kind === "checklist"
            ? items.every((item) => item.completed)
            : completed;
        db.prepare(
          "UPDATE activities SET completed = ?, items = ?, updated_at = ? WHERE id = ?",
        ).run(
          Number(done),
          JSON.stringify(items),
          new Date().toISOString(),
          id,
        );
        return requireActivity(id);
      });
    },
    remove(id: string) {
      return (
        db.prepare("DELETE FROM activities WHERE id = ?").run(id).changes > 0
      );
    },
    attachment(id: string): AttachmentData | null {
      const row = db
        .prepare(
          "SELECT name, mime_type, size, data FROM activity_attachments WHERE activity_id = ?",
        )
        .get(id);
      return row
        ? {
            name: String(row.name),
            mimeType: String(row.mime_type),
            size: Number(row.size),
            data: Buffer.from(row.data as Uint8Array),
          }
        : null;
    },
  };
}
export const activitiesRepository = () =>
  createActivityRepository(getDatabase());
