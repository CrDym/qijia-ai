import { z } from "zod";
import type { AttachmentMeta } from "./attachment.ts";
import { healthRecordSchema } from "./health.ts";

export const CATEGORIES = [
  "家庭事务",
  "物品资料",
  "实用知识",
  "重要安排",
  "健康档案",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const documentSchema = z
  .object({
    title: z.string().trim().min(1, "请填写标题").max(100, "标题最多 100 字"),
    content: z
      .string()
      .trim()
      .min(1, "请填写正文")
      .max(20000, "正文最多 20,000 字"),
    summary: z.string().trim().max(500, "摘要最多 500 字").default(""),
    category: z.enum(CATEGORIES),
    tags: z
      .array(z.string().trim().min(1).max(20, "每个标签最多 20 字"))
      .max(8, "最多 8 个标签")
      .transform((tags) => [...new Set(tags)])
      .default([]),
    source: z.string().trim().max(500, "来源最多 500 字").default(""),
    health: healthRecordSchema.nullable().default(null),
  })
  .strict()
  .refine(
    (value) => (value.category === "健康档案") === Boolean(value.health),
    {
      message: "健康档案需要选择家庭成员，普通资料不能附带健康记录",
      path: ["health"],
    },
  );

// 同一份 schema 同时用于提供给 AI 的 JSON Schema 和服务端结果校验。
export const organizationSchema = z
  .object({
    title: z.string().min(1).max(100),
    summary: z.string().min(1).max(500),
    category: z.enum(["家庭事务", "物品资料", "实用知识", "重要安排"]),
    tags: z.array(z.string().min(1).max(20)).max(8),
  })
  .strict();

export const organizeInputSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(10, "至少填写 10 个字，AI 才能更好地整理")
      .max(20000),
  })
  .strict();

export type DocumentInput = z.infer<typeof documentSchema>;
export type Organization = z.infer<typeof organizationSchema>;
export type FamilyDocument = DocumentInput & {
  id: string;
  createdAt: string;
  updatedAt: string;
  attachment: AttachmentMeta | null;
};
export type DocumentPreview = Omit<FamilyDocument, "content"> & {
  excerpt: string;
};
export type LibraryData = {
  documents: DocumentPreview[];
  total: number;
  counts: Record<Category, number>;
};
