import { z } from "zod";

export const DEFAULT_AI_BASE_URL = "https://api.openai.com/v1";

export const aiBaseURLSchema = z
  .string()
  .trim()
  .max(2048, "API 地址过长")
  .refine((value) => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (
        /^https?:\/\//i.test(value) &&
        !/[\s\\]/.test(value) &&
        !url.username &&
        !url.password &&
        !value.includes("?") &&
        !value.includes("#") &&
        !/\/(responses|chat\/completions)\/?$/i.test(url.pathname)
      );
    } catch {
      return false;
    }
  }, "请填写 HTTP(S) API 根地址（如 https://api.example.com/v1），不要包含账号、密码、查询参数、片段或 /responses、/chat/completions")
  .transform((value) => (value ? new URL(value).href.replace(/\/+$/, "") : ""));

export const aiSettingsSchema = z
  .object({
    apiKey: z
      .string()
      .trim()
      .max(512, "API Key 过长")
      .refine(
        (value) => !/\s|[^\x21-\x7e]/.test(value),
        "API Key 不能包含空白或非英文字符",
      )
      .default(""),
    // 省略字段兼容旧客户端；空字符串明确清除地址覆盖值。
    baseURL: aiBaseURLSchema.optional(),
    model: z
      .string()
      .trim()
      .min(1, "请填写模型名称")
      .max(100, "模型名称过长")
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/, "请填写有效的模型名称"),
  })
  .strict();

export type AISettingsInput = z.infer<typeof aiSettingsSchema>;
export type AISettingsStatus = {
  configured: boolean;
  model: string;
  baseURL: string;
  baseURLSource: "saved" | "environment" | "default";
  savedBaseURL: string;
  baseURLError: string | null;
  keySource: "saved" | "environment" | "none";
  hasSavedSettings: boolean;
};
