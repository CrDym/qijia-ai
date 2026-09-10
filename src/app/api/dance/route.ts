import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import {
  AppError,
  checkMutationOrigin,
  errorResponse,
} from "../../../lib/api.ts";
import { danceInputSchema } from "../../../schemas/dance.ts";
import { danceRepository } from "../../../repositories/dance.ts";
import { saveVideo, videoPath } from "../../../services/dance/storage.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(danceRepository().list());
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    checkMutationOrigin(request);
    const query = new URL(request.url).searchParams;
    const input = danceInputSchema.parse({
      date: query.get("date"),
      kind: query.get("kind"),
    });
    const name = query.get("name") || "";
    if (
      !/\.mp4$/i.test(name) ||
      name.length > 255 ||
      request.headers.get("content-type") !== "video/mp4"
    )
      throw new AppError("FORMAT", "请上传 MP4 视频（推荐 H.264 + AAC）");
    const id = randomUUID();
    const size = await saveVideo(request, id);
    try {
      return Response.json(
        danceRepository().create({
          id,
          ...input,
          name,
          size,
          createdAt: new Date().toISOString(),
        }),
        { status: 201 },
      );
    } catch (error) {
      await rm(videoPath(id), { force: true });
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
