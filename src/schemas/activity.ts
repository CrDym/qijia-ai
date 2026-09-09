import { z } from "zod";
import { optionalDate } from "./health.ts";
import type { AttachmentMeta } from "./attachment.ts";

export const activityFieldsSchema = z
  .object({
    kind: z.enum(["todo", "checklist"]),
    title: z.string().trim().min(1, "请填写事项名称").max(100, "名称最多100字"),
    notes: z.string().trim().max(2000, "备注最多2000字"),
    dueOn: optionalDate,
    items: z
      .array(
        z
          .object({
            id: z.uuid(),
            text: z.string().trim().min(1, "清单条目不能为空").max(200),
            completed: z.boolean(),
          })
          .strict(),
      )
      .max(40),
  })
  .strict();

export const activitySchema = activityFieldsSchema
  .refine(
    (value) =>
      value.kind === "todo" ? value.items.length === 0 : value.items.length > 0,
    { message: "待办无需清单条目，清单至少需要一项", path: ["items"] },
  )
  .refine(
    (value) =>
      new Set(value.items.map((item) => item.id)).size === value.items.length,
    { message: "清单条目不能重复编号", path: ["items"] },
  );
export const activityCreateSchema = activitySchema.safeExtend({
  source: z.string().max(500),
  sourceContent: z.string().max(20000),
});
export const activityToggleSchema = z
  .object({ completed: z.boolean(), itemId: z.uuid().optional() })
  .strict();
export type ActivityInput = z.infer<typeof activityCreateSchema>;
export type ActivityFields = z.infer<typeof activitySchema>;
export type Activity = ActivityInput & {
  id: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  attachment: AttachmentMeta | null;
};
