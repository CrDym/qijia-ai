import "server-only";
import { getDatabase } from "../../lib/database.ts";
import { createAISettingsRepository } from "../../repositories/ai-settings.ts";
import {
  aiSettingsSchema,
  aiBaseURLSchema,
  DEFAULT_AI_BASE_URL,
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
  const environmentURL = process.env.OPENAI_BASE_URL?.trim() || "";
  const parsedURL = aiBaseURLSchema.safeParse(
    saved?.baseURL || environmentURL || DEFAULT_AI_BASE_URL,
  );
  // 无效环境地址不回显（可能误含凭据），也不阻断手动资料管理或设置修复。
  const baseURL = parsedURL.success ? parsedURL.data : "";
  const baseURLError = parsedURL.success
    ? null
    : "当前 API 地址配置无效，请填写不含凭据和查询参数的 HTTP(S) API 根地址。";
  return {
    apiKey,
    model,
    baseURL,
    baseURLError,
    baseURLSource: saved?.baseURL
      ? ("saved" as const)
      : environmentURL
        ? ("environment" as const)
        : ("default" as const),
    savedBaseURL: parsedURL.success ? saved?.baseURL || "" : "",
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
  const {
    apiKey,
    model,
    baseURL,
    baseURLSource,
    savedBaseURL,
    baseURLError,
    keySource,
    hasSavedSettings,
  } = getAIConfiguration();
  return {
    configured: Boolean(apiKey),
    model,
    baseURL,
    baseURLSource,
    savedBaseURL,
    baseURLError,
    keySource,
    hasSavedSettings,
  };
}

export function saveAISettings(input: unknown) {
  repository().save(aiSettingsSchema.parse(input));
  return getAISettingsStatus();
}

export function resetAISettings() {
  repository().reset();
  return getAISettingsStatus();
}
