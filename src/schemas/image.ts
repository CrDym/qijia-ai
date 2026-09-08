import { z } from "zod";

export const imageAnalysisSchema = z
  .object({
    title: z.string().min(1).max(100),
    content: z.string().max(20000),
    uncertainties: z.array(z.string().max(300)).max(10),
  })
  .strict();
export type ImageAnalysis = z.infer<typeof imageAnalysisSchema>;
