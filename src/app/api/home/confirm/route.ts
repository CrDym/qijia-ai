import { AppError, errorResponse, readJson } from "../../../../lib/api.ts";
import { homeConfirmSchema } from "../../../../schemas/home.ts";
import {
  readMultipart,
  singleFile,
} from "../../../../services/files/read-upload.ts";
import { validateFile } from "../../../../services/files/validate-file.ts";
import { documentsRepository } from "../../../../repositories/documents.ts";
import { activitiesRepository } from "../../../../repositories/activities.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    let raw: unknown;
    let file: File | null = null;
    if (
      request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("multipart/form-data")
    ) {
      const form = await readMultipart(request);
      if (
        Array.from(form.keys()).some(
          (key) => !["card", "file"].includes(key),
        ) ||
        form.getAll("card").length !== 1
      )
        throw new AppError("INVALID_UPLOAD", "确认内容不正确，请重试");
      const card = form.get("card");
      if (typeof card !== "string" || card.length > 128 * 1024)
        throw new AppError("INVALID_UPLOAD", "确认内容无效或过长");
      try {
        raw = JSON.parse(card);
      } catch {
        throw new AppError("INVALID_JSON", "确认内容不是有效的 JSON");
      }
      file = singleFile(form, false);
    } else raw = await readJson(request);
    const card = homeConfirmSchema.parse(raw);
    const attachment = file ? await validateFile(file) : undefined;
    const value =
      card.kind === "document"
        ? documentsRepository().create(card.data, attachment, card.id)
        : activitiesRepository().create(card.data, attachment, card.id);
    return Response.json(value, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
