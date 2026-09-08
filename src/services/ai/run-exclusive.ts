import "server-only";
import { AppError } from "../../lib/api.ts";

const state = globalThis as typeof globalThis & { familyAiBusy?: boolean };
// 单机版本共享调用锁，避免多个 AI 入口同时触发请求。
export async function runExclusiveAI<T>(
  operation: () => Promise<T>,
): Promise<T> {
  if (state.familyAiBusy)
    throw new AppError("AI_BUSY", "AI 正在处理另一份资料，请稍后再试", 429);
  state.familyAiBusy = true;
  try {
    return await operation();
  } finally {
    state.familyAiBusy = false;
  }
}
