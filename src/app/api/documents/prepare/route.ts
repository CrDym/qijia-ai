import { AppError, errorResponse, readJson } from "../../../../lib/api.ts";
import { captureInputSchema } from "../../../../schemas/capture.ts";
import {
  readMultipart,
  singleFile,
} from "../../../../services/files/read-upload.ts";
import { prepareDocument } from "../../../../services/ai/prepare-document.ts";
import { runExclusiveAI } from "../../../../services/ai/run-exclusive.ts";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  let response: Response;
  try {
    let input: { content: string } | { file: File };
    if (
      request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("multipart/form-data")
    ) {
      const form = await readMultipart(request);
      if (Array.from(form.keys()).some((key) => key !== "file"))
        throw new AppError(
          "INVALID_UPLOAD",
          "请提供一份原文或一个文件，不要同时提交多份内容",
        );
      input = { file: singleFile(form)! };
    } else {
      input = captureInputSchema.parse(await readJson(request));
    }
    response = Response.json(
      await runExclusiveAI(() => prepareDocument(input)),
    );
  } catch (error) {
    response = errorResponse(error);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
}
