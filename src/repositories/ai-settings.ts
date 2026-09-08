import "server-only";
import type { DatabaseSync } from "node:sqlite";
import type { AISettingsInput } from "../schemas/ai-settings.ts";

export function createAISettingsRepository(db: DatabaseSync) {
  return {
    read(): AISettingsInput | undefined {
      return db
        .prepare(
          "SELECT api_key AS apiKey, model FROM ai_settings WHERE id = 1",
        )
        .get() as AISettingsInput | undefined;
    },
    save(input: AISettingsInput) {
      // 空白密钥只保留原值，不把环境变量复制进数据库。
      db.prepare(
        `INSERT INTO ai_settings (id, api_key, model) VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          api_key = CASE WHEN excluded.api_key = '' THEN ai_settings.api_key ELSE excluded.api_key END,
          model = excluded.model`,
      ).run(input.apiKey, input.model);
    },
    reset() {
      db.prepare("DELETE FROM ai_settings WHERE id = 1").run();
    },
  };
}
