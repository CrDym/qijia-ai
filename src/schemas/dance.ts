import { z } from "zod";
export const danceInputSchema = z.object({
  date: z.iso.date("请选择有效日期"),
  kind: z.enum(["showcase", "practice"]),
});
export type DanceInput = z.infer<typeof danceInputSchema>;
export type DanceVideo = DanceInput & {
  id: string;
  name: string;
  size: number;
  createdAt: string;
};
export const danceLabels = { showcase: "课后展示", practice: "练习打卡" };
export const MAX_VIDEO_SIZE = 1024 * 1024 * 1024;
