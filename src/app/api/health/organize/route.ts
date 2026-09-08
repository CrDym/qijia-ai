import { errorResponse, readJson } from "@/lib/api";
import { organizeHealth } from "@/services/ai/organize-health";
import { runExclusiveAI } from "@/services/ai/run-exclusive";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const input = await readJson(request);
    return Response.json(await runExclusiveAI(() => organizeHealth(input)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
