import "server-only";
import {
  organizeInputSchema,
  type Organization,
} from "../../schemas/document.ts";
import { organizeWithOpenAI } from "./openai.ts";

// API Route 只依赖此入口；以后替换 Provider 时只更换这里的适配函数。
export async function organizeDocument(input: unknown): Promise<Organization> {
  const { content } = organizeInputSchema.parse(input);
  return organizeWithOpenAI(content);
}
