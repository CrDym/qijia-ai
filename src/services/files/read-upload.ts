import "server-only";
import {
  AppError,
  checkMutationOrigin,
  readBody,
  readJson,
} from "../../lib/api.ts";
import { MAX_FILE_BYTES } from "../../schemas/attachment.ts";
import { documentSchema, type DocumentInput } from "../../schemas/document.ts";
import { validateFile, type AttachmentData } from "./validate-file.ts";

export async function readMultipart(request: Request): Promise<FormData> {
  checkMutationOrigin(request);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;"))
    throw new AppError("INVALID_CONTENT_TYPE", "请选择文件后上传", 415);
  const body = await readBody(
    request,
    MAX_FILE_BYTES + 256 * 1024,
    "上传内容过大，单个文件不能超过 10 MB",
  );
  try {
    return await new Response(Uint8Array.from(body), {
      headers: { "content-type": contentType },
    }).formData();
  } catch {
    throw new AppError("INVALID_UPLOAD", "上传内容不完整，请重新选择文件");
  }
}

export function singleFile(form: FormData, required = true): File | null {
  const files = form.getAll("file");
  if (files.length === 0 && !required) return null;
  if (files.length !== 1 || !(files[0] instanceof File))
    throw new AppError("INVALID_UPLOAD", "请一次选择一个文件");
  return files[0];
}

export async function readDocumentWrite(
  request: Request,
): Promise<{ data: DocumentInput; attachment?: AttachmentData | null }> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("multipart/form-data")
  )
    return { data: documentSchema.parse(await readJson(request)) };
  const form = await readMultipart(request);
  if (
    Array.from(form.keys()).some(
      (key) => !["document", "file", "removeAttachment"].includes(key),
    ) ||
    form.getAll("document").length !== 1 ||
    form.getAll("removeAttachment").length > 1
  )
    throw new AppError("INVALID_UPLOAD", "上传字段不正确，请重试");
  const raw = form.get("document");
  if (typeof raw !== "string" || raw.length > 128 * 1024)
    throw new AppError("INVALID_UPLOAD", "资料内容无效或过长");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AppError("INVALID_JSON", "资料内容不是有效的 JSON");
  }
  const data = documentSchema.parse(parsed);
  const file = singleFile(form, false);
  const remove = form.get("removeAttachment");
  if ((remove !== null && remove !== "true") || (file && remove))
    throw new AppError("INVALID_UPLOAD", "附件操作不正确，请重新选择");
  return {
    data,
    attachment: file
      ? await validateFile(file)
      : remove === "true"
        ? null
        : undefined,
  };
}
