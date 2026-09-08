import { errorResponse, AppError } from "@/lib/api";
import { readMultipart, singleFile } from "@/services/files/read-upload";
import { extractFile } from "@/services/files/extract-text";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const form = await readMultipart(request);
    if (Array.from(form.keys()).some((key) => key !== "file"))
      throw new AppError("INVALID_UPLOAD", "请只上传一个文件");
    const file = singleFile(form);
    if (!file) throw new AppError("INVALID_UPLOAD", "请选择文件");
    return Response.json(await extractFile(file), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
