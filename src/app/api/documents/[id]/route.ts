import { z } from "zod";
import { readDocumentWrite } from "@/services/files/read-upload";
import { documentsRepository } from "@/repositories/documents";
import { AppError, checkMutationOrigin, errorResponse } from "@/lib/api";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

async function getId(context: Context) {
  return z.uuid().parse((await context.params).id);
}
function notFound(): never {
  throw new AppError("NOT_FOUND", "这条资料已不存在，请刷新列表", 404);
}

export async function GET(_request: Request, context: Context) {
  try {
    const document = documentsRepository().find(await getId(context));
    return Response.json(document ?? notFound(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { data, attachment } = await readDocumentWrite(request);
    const document = documentsRepository().update(
      await getId(context),
      data,
      attachment,
    );
    return Response.json(document ?? notFound());
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    checkMutationOrigin(request);
    if (!documentsRepository().remove(await getId(context))) notFound();
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
