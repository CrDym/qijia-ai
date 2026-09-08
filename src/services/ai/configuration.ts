import "server-only";
import { getDatabase } from "../../lib/database.ts";
import { createAISettingsRepository } from "../../repositories/ai-settings.ts";
import {
  aiSettingsSchema,
  type AISettingsStatus,
} from "../../schemas/ai-settings.ts";

function repository() {
  return createAISettingsRepository(getDatabase());
}

export function getAIConfiguration() {
  const saved = repository().read();
  const environmentKey = process.env.OPENAI_API_KEY?.trim() || "";
  const apiKey = saved?.apiKey || environmentKey;
  const model =
    saved?.model || process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  return {
    apiKey,
    model,
    keySource: saved?.apiKey
      ? ("saved" as const)
      : environmentKey
        ? ("environment" as const)
        : ("none" as const),
    hasSavedSettings: Boolean(saved),
  };
}

// 对页面和接口仅提供白名单字段，永远不回传密钥（含掩码、前后缀）。
export function getAISettingsStatus(): AISettingsStatus {
  const { apiKey, model, keySource, hasSavedSettings } = getAIConfiguration();
  return { configured: Boolean(apiKey), model, keySource, hasSavedSettings };
}

export function saveAISettings(input: unknown) {
  repository().save(aiSettingsSchema.parse(input));
  return getAISettingsStatus();
}

export function resetAISettings() {
  repository().reset();
  return getAISettingsStatus();
}
