import "server-only";
import { z } from "zod";
import { structuredWithOpenAI } from "./openai.ts";

export async function testAIConnection() {
  await structuredWithOpenAI({
    schema: z.object({ message: z.literal("ok") }).strict(),
    name: "connection_test",
    instructions: 'Return the JSON object {"message":"ok"}.',
    input: [{ role: "user", content: "Connection test." }],
    maxTokens: 1600,
  });
  return {
    message:
      "连接成功，模型已通过文字与结构化输出测试。图片识别请在实际使用时核对。",
  };
}
