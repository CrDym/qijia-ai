import { z } from "zod";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { AppError, errorResponse } from "../../../../../lib/api.ts";
import { danceRepository } from "../../../../../repositories/dance.ts";
import { byteRange, videoPath } from "../../../../../services/dance/storage.ts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {
  params: Promise<{
    id: string;
  }>;
};
async function serve(request: Request, context: Context, head = false) {
  try {
    const id = z.uuid().parse((await context.params).id);
    if (!danceRepository().find(id))
      throw new AppError("NOT_FOUND", "视频已不存在", 404);
    const file = await open(videoPath(id), "r").catch(() => {
      throw new AppError("MISSING", "找不到本地视频文件，请检查备份", 404);
    });
    try {
      const { size } = await file.stat();
      let range;
      try {
        range = byteRange(request.headers.get("range"), size);
      } catch {
        await file.close();
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${size}` },
        });
      }
      const start = range?.start ?? 0,
        end = range?.end ?? size - 1;
      const headers: Record<string, string> = {
        "Content-Type": "video/mp4",
        "Content-Length": String(end - start + 1),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      };
      if (range) headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      if (head) {
        await file.close();
        return new Response(null, { status: range ? 206 : 200, headers });
      }
      return new Response(
        Readable.toWeb(
          file.createReadStream({ start, end }),
        ) as ReadableStream<Uint8Array>,
        { status: range ? 206 : 200, headers },
      );
    } catch (error) {
      await file.close();
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}
export const GET = (request: Request, context: Context) =>
  serve(request, context);
export const HEAD = (request: Request, context: Context) =>
  serve(request, context, true);
