import { z } from "zod";
import { activitiesRepository } from "../../../../../repositories/activities.ts";
import { AppError, errorResponse } from "../../../../../lib/api.ts";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const file = activitiesRepository().attachment(
      z.uuid().parse((await context.params).id),
    );
    if (!file) throw new AppError("NOT_FOUND", "原文件不存在或已被移除", 404);
    const filename = encodeURIComponent(file.name).replace(
      /[!'()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(Uint8Array.from(file.data), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Length": String(file.size),
        "Content-Disposition": `attachment; filename="activity"; filename*=UTF-8''${filename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
