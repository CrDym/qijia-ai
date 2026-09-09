import { z } from "zod";
import { activitiesRepository } from "../../../../repositories/activities.ts";
import {
  activitySchema,
  activityToggleSchema,
} from "../../../../schemas/activity.ts";
import {
  AppError,
  checkMutationOrigin,
  errorResponse,
  readJson,
} from "../../../../lib/api.ts";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  try {
    const id = z.uuid().parse((await context.params).id);
    return Response.json(
      activitiesRepository().update(
        id,
        activitySchema.parse(await readJson(request)),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const id = z.uuid().parse((await context.params).id);
    const input = activityToggleSchema.parse(await readJson(request));
    return Response.json(
      activitiesRepository().toggle(id, input.completed, input.itemId),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    checkMutationOrigin(request);
    const id = z.uuid().parse((await context.params).id);
    if (!activitiesRepository().remove(id))
      throw new AppError("NOT_FOUND", "事项已不存在", 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
