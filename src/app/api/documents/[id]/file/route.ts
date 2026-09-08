import { z } from "zod";
import { AppError, errorResponse } from "@/lib/api";
import { documentsRepository } from "@/repositories/documents";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const id = z.uuid().parse((await context.params).id);
    const attachment = documentsRepository().findAttachment(id);
    if (!attachment)
      throw new AppError("NOT_FOUND", "原文件不存在或已被移除", 404);
    const filename = encodeURIComponent(attachment.name).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(Uint8Array.from(attachment.data), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(attachment.size),
        "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${filename}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
