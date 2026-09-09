import { z } from "zod";
import { captureMetadataSchema } from "./capture.ts";
import { documentSchema } from "./document.ts";
import { optionalDate } from "./health.ts";
import { activityCreateSchema } from "./activity.ts";

const actionSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    notes: z.string().max(2000),
    dueOn: optionalDate,
    clarification: z.string().max(300),
  })
  .strict();
export const homePlanSchema = z
  .object({
    document: captureMetadataSchema.nullable(),
    todos: z.array(actionSchema).max(8),
    checklists: z
      .array(
        actionSchema
          .extend({
            items: z.array(z.string().trim().min(1).max(200)).min(1).max(40),
          })
          .strict(),
      )
      .max(3),
    message: z.string().max(500),
  })
  .strict();
export const homeImagePlanSchema = homePlanSchema
  .extend({ content: z.string().max(20000) })
  .strict();
export const homeResultSchema = homeImagePlanSchema
  .extend({ source: z.string().max(500) })
  .strict()
  .refine(
    (value) =>
      !value.document ||
      (value.document.category === "健康档案") ===
        Boolean(value.document.health),
    { message: "资料分类与健康信息不一致" },
  );
export type HomeResult = z.infer<typeof homeResultSchema>;
export const homeConfirmSchema = z.discriminatedUnion("kind", [
  z
    .object({ id: z.uuid(), kind: z.literal("document"), data: documentSchema })
    .strict(),
  z
    .object({
      id: z.uuid(),
      kind: z.literal("activity"),
      data: activityCreateSchema,
    })
    .strict(),
]);
