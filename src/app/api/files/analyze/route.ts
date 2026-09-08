import { z } from "zod";
import { AppError, errorResponse, readJson } from "@/lib/api";
import { readMultipart, singleFile } from "@/services/files/read-upload";
import { documentsRepository } from "@/repositories/documents";
import { analyzeImage } from "@/services/ai/analyze-image";
import { runExclusiveAI } from "@/services/ai/run-exclusive";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    let file: File;
    if (
      request.headers.get("content-type")?.startsWith("multipart/form-data")
    ) {
      const form = await readMultipart(request);
      if (Array.from(form.keys()).some((key) => key !== "file"))
        throw new AppError("INVALID_UPLOAD", "请只上传一张图片");
      file = singleFile(form)!;
    } else {
      const { documentId } = z
        .object({ documentId: z.uuid() })
        .strict()
        .parse(await readJson(request));
      const attachment = documentsRepository().findAttachment(documentId);
      if (!attachment)
        throw new AppError("NOT_FOUND", "原文件已不存在，请重新选择图片", 404);
      file = new File([Uint8Array.from(attachment.data)], attachment.name, {
        type: attachment.mimeType,
      });
    }
    return Response.json(await runExclusiveAI(() => analyzeImage(file)), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
