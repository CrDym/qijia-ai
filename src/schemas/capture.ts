import { z } from "zod";
import { CATEGORIES, type DocumentInput } from "./document.ts";
import { healthFieldsSchema } from "./health.ts";

export const captureInputSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, "请粘贴需要收藏的原文")
      .max(20000, "正文最多 20,000 字，请拆分后整理"),
  })
  .strict();

export const captureMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    summary: z.string().trim().min(1).max(500),
    category: z.enum(CATEGORIES),
    tags: z.array(z.string().trim().min(1).max(20)).max(8),
    health: healthFieldsSchema.nullable(),
    uncertainties: z.array(z.string().max(300)).max(10),
  })
  .strict();

export const captureImageSchema = captureMetadataSchema
  .extend({
    content: z.string().max(20000),
  })
  .strict();

export const captureResultSchema = captureImageSchema
  .extend({
    source: z.string().max(500),
  })
  .strict()
  .refine(
    (result) => (result.category === "健康档案") === Boolean(result.health),
    {
      message: "AI 返回的分类与健康信息不一致，请重新整理",
    },
  );

export type CaptureResult = z.infer<typeof captureResultSchema>;

export function captureDraft(result: CaptureResult): DocumentInput {
  return {
    title: result.title,
    content: result.content,
    summary: result.summary,
    category: result.category,
    tags: result.tags,
    source: result.source,
    health: result.health ? { ...result.health, memberId: "" } : null,
  };
}
