import { z } from "zod";
import { rm } from "node:fs/promises";
import {
  AppError,
  checkMutationOrigin,
  errorResponse,
  readJson,
} from "../../../../lib/api.ts";
import { danceInputSchema } from "../../../../schemas/dance.ts";
import { danceRepository } from "../../../../repositories/dance.ts";
import { videoPath } from "../../../../services/dance/storage.ts";
export const runtime = "nodejs";
type Context = {
  params: Promise<{
    id: string;
  }>;
};
export async function PATCH(request: Request, context: Context) {
  try {
    const id = z.uuid().parse((await context.params).id);
    const video = danceRepository().update(
      id,
      danceInputSchema.parse(await readJson(request)),
    );
    if (!video) throw new AppError("NOT_FOUND", "视频已不存在", 404);
    return Response.json(video);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    checkMutationOrigin(request);
    const id = z.uuid().parse((await context.params).id);
    if (!danceRepository().find(id))
      throw new AppError("NOT_FOUND", "视频已不存在", 404);
    await rm(videoPath(id), { force: true });
    await rm(videoPath(id, true), { force: true });
    danceRepository().remove(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
