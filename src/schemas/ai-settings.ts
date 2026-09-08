import { z } from "zod";

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
    model: z
      .string()
      .trim()
      .min(1, "请填写模型名称")
      .max(100, "模型名称过长")
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/, "请填写有效的模型名称"),
  })
  .strict();

export type AISettingsInput = z.infer<typeof aiSettingsSchema>;
export type AISettingsStatus = {
  configured: boolean;
  model: string;
  keySource: "saved" | "environment" | "none";
  hasSavedSettings: boolean;
};
