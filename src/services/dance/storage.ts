import "server-only";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { AppError } from "../../lib/api.ts";
import { MAX_VIDEO_SIZE } from "../../schemas/dance.ts";
export function danceDirectory() {
  return join(
    dirname(
      resolve(
        /* turbopackIgnore: true */ process.env.DATABASE_PATH ||
          "./data/family.sqlite",
      ),
    ),
    "dance-videos",
  );
}
export function videoPath(id: string, poster = false) {
  return join(danceDirectory(), `${id}.${poster ? "jpg" : "mp4"}`);
}
// 逐块落盘，超限、取消或失败时清理临时文件；只有完整文件才进入资料列表。
export async function saveVideo(request: Request, id: string) {
  if (Number(request.headers.get("content-length")) > MAX_VIDEO_SIZE)
    throw new AppError("TOO_LARGE", "每段视频最大 1 GB", 413);
  if (!request.body) throw new AppError("EMPTY", "请选择视频");
  await mkdir(danceDirectory(), { recursive: true });
  const temporary = join(danceDirectory(), `${id}-${randomUUID()}.part`);
  const file = await open(temporary, "wx");
  const reader = request.body.getReader();
  let size = 0;
  let header = Buffer.alloc(0);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_VIDEO_SIZE)
        throw new AppError("TOO_LARGE", "每段视频最大 1 GB", 413);
      if (header.length < 12)
        header = Buffer.concat([
          header,
          Buffer.from(value.subarray(0, 12 - header.length)),
        ]);
      if (header.length >= 12 && header.toString("ascii", 4, 8) !== "ftyp")
        throw new AppError(
          "FORMAT",
          "请选择 MP4 视频；MOV / HEVC 请先转换为 H.264 MP4",
        );
      let offset = 0;
      while (offset < value.length) {
        const { bytesWritten } = await file.write(
          value,
          offset,
          value.length - offset,
        );
        offset += bytesWritten;
      }
    }
    if (size < 12) throw new AppError("EMPTY", "视频为空或格式无效");
    await file.close();
    await rename(temporary, videoPath(id));
    return size;
  } catch (error) {
    await reader.cancel().catch(() => {});
    await file.close().catch(() => {});
    await rm(temporary, { force: true });
    throw error;
  } finally {
    reader.releaseLock();
  }
}
export function byteRange(
  header: string | null,
  size: number,
): {
  start: number;
  end: number;
} | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]))
    throw new AppError("RANGE", "无效播放范围", 416);
  const start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const end =
    match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  )
    throw new AppError("RANGE", "无效播放范围", 416);
  return { start, end };
}
