import { z } from "zod";
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";
import {
  AppError,
  checkMutationOrigin,
  errorResponse,
  readBody,
} from "../../../../../lib/api.ts";
import { danceRepository } from "../../../../../repositories/dance.ts";
import { videoPath } from "../../../../../services/dance/storage.ts";
export const runtime = "nodejs";
type Context = {
  params: Promise<{
    id: string;
  }>;
};
export async function PUT(request: Request, context: Context) {
  try {
    checkMutationOrigin(request);
    const id = z.uuid().parse((await context.params).id);
    if (!danceRepository().find(id))
      throw new AppError("NOT_FOUND", "视频已不存在", 404);
    const body = await readBody(request, 1024 * 1024, "封面过大");
    const jpg = await sharp(body, { limitInputPixels: 4000000 })
      .resize(640, 640, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    await writeFile(videoPath(id, true), jpg);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function GET(_request: Request, context: Context) {
  try {
    const id = z.uuid().parse((await context.params).id);
    if (!danceRepository().find(id))
      throw new AppError("NOT_FOUND", "视频已不存在", 404);
    const bytes = await readFile(videoPath(id, true)).catch(() => {
      throw new AppError("NOT_FOUND", "暂无封面", 404);
    });
    return new Response(bytes, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
