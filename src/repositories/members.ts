import "server-only";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../lib/database.ts";
import { AppError } from "../lib/api.ts";
import type { FamilyMember, MemberInput } from "../schemas/health.ts";

export function createMemberRepository(db: DatabaseSync) {
  const select = `SELECT m.id, m.name, m.relationship, m.birth_date AS birthDate, m.allergies, m.conditions, m.notes,
    m.created_at AS createdAt, m.updated_at AS updatedAt, (SELECT count(*) FROM health_records h WHERE h.member_id = m.id) AS recordCount FROM family_members m`;
  return {
    list(): FamilyMember[] {
      return db
        .prepare(`${select} ORDER BY m.created_at, m.rowid`)
        .all() as FamilyMember[];
    },
    find(id: string): FamilyMember | null {
      return (
        (db.prepare(`${select} WHERE m.id = ?`).get(id) as
          FamilyMember | undefined) ?? null
      );
    },
    create(input: MemberInput): FamilyMember {
      const id = randomUUID(),
        now = new Date().toISOString();
      db.prepare(
        "INSERT INTO family_members (id, name, relationship, birth_date, allergies, conditions, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        id,
        input.name,
        input.relationship,
        input.birthDate,
        input.allergies,
        input.conditions,
        input.notes,
        now,
        now,
      );
      return this.find(id)!;
    },
    update(id: string, input: MemberInput): FamilyMember | null {
      db.prepare(
        "UPDATE family_members SET name = ?, relationship = ?, birth_date = ?, allergies = ?, conditions = ?, notes = ?, updated_at = ? WHERE id = ?",
      ).run(
        input.name,
        input.relationship,
        input.birthDate,
        input.allergies,
        input.conditions,
        input.notes,
        new Date().toISOString(),
        id,
      );
      return this.find(id);
    },
    remove(id: string): boolean {
      // 成员删除不会连带删除病历。外键也会拦截并发新增记录后的删除。
      if (this.find(id)?.recordCount)
        throw new AppError(
          "MEMBER_HAS_RECORDS",
          "该成员仍有健康记录，请先转移或删除记录后再移除成员",
          409,
        );
      try {
        return (
          db.prepare("DELETE FROM family_members WHERE id = ?").run(id)
            .changes > 0
        );
      } catch (error) {
        if (this.find(id)?.recordCount)
          throw new AppError(
            "MEMBER_HAS_RECORDS",
            "该成员仍有健康记录，无法移除",
            409,
          );
        throw error;
      }
    },
  };
}
export const membersRepository = () => createMemberRepository(getDatabase());
