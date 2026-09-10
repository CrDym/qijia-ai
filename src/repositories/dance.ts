import "server-only";
import type { DatabaseSync } from "node:sqlite";
import { getDatabase } from "../lib/database.ts";
import type { DanceInput, DanceVideo } from "../schemas/dance.ts";
export function createDanceRepository(db: DatabaseSync) {
  const select =
    "SELECT id, date, kind, name, size, created_at AS createdAt FROM dance_videos";
  return {
    list(): DanceVideo[] {
      return db
        .prepare(`${select} ORDER BY date DESC, created_at DESC, id`)
        .all() as DanceVideo[];
    },
    find(id: string): DanceVideo | undefined {
      return db.prepare(`${select} WHERE id = ?`).get(id) as
        DanceVideo | undefined;
    },
    create(video: DanceVideo) {
      db.prepare(
        "INSERT INTO dance_videos (id, date, kind, name, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        video.id,
        video.date,
        video.kind,
        video.name,
        video.size,
        video.createdAt,
      );
      return video;
    },
    update(id: string, input: DanceInput) {
      db.prepare("UPDATE dance_videos SET date = ?, kind = ? WHERE id = ?").run(
        input.date,
        input.kind,
        id,
      );
      return this.find(id);
    },
    remove(id: string) {
      return (
        db.prepare("DELETE FROM dance_videos WHERE id = ?").run(id).changes > 0
      );
    },
  };
}
export const danceRepository = () => createDanceRepository(getDatabase());
