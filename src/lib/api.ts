import "server-only";
import { z } from "zod";

export class AppError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function checkMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) {
    throw new AppError("FORBIDDEN", "请求来源不正确，请在本站重新操作", 403);
  }
}

export async function readBody(
  request: Request,
  limit: number,
  tooLargeMessage: string,
): Promise<Buffer> {
  if (Number(request.headers.get("content-length")) > limit) {
    throw new AppError("TOO_LARGE", tooLargeMessage, 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("INVALID_JSON", "请求内容为空");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new AppError("TOO_LARGE", tooLargeMessage, 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export async function readJson(request: Request): Promise<unknown> {
  checkMutationOrigin(request);
  if (!request.headers.get("content-type")?.includes("application/json")) {
    throw new AppError("INVALID_CONTENT_TYPE", "请使用 JSON 格式提交资料", 415);
  }
  const body = await readBody(request, 128 * 1024, "提交内容过大，请缩短正文");
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new AppError("INVALID_JSON", "请求内容不是有效的 JSON");
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: error.issues[0]?.message || "请检查填写内容",
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof AppError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  // 不记录正文、模型响应、SDK 对象或 API Key。
  console.error(
    "[family-library]",
    error instanceof Error ? error.name : "UnknownError",
  );
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "暂时无法完成操作，请稍后重试",
      },
    },
    { status: 500 },
  );
}
