import { errorResponse, readJson } from "@/lib/api";
import { organizeDocument } from "@/services/ai/organize-document";
import { runExclusiveAI } from "@/services/ai/run-exclusive";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const input = await readJson(request);
    return Response.json(await runExclusiveAI(() => organizeDocument(input)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
