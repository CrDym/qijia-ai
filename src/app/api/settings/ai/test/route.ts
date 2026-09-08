import { checkMutationOrigin, errorResponse } from "../../../../../lib/api.ts";
import { runExclusiveAI } from "../../../../../services/ai/run-exclusive.ts";
import { testAIConnection } from "../../../../../services/ai/test-connection.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let response: Response;
  try {
    checkMutationOrigin(request);
    response = Response.json(await runExclusiveAI(testAIConnection));
  } catch (error) {
    response = errorResponse(error);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
