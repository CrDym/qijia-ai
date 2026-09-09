import { activitiesRepository } from "../../../repositories/activities.ts";
import { errorResponse } from "../../../lib/api.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(activitiesRepository().list(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
