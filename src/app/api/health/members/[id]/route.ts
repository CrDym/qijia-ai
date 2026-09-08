import { z } from "zod";
import {
  AppError,
  checkMutationOrigin,
  errorResponse,
  readJson,
} from "@/lib/api";
import { membersRepository } from "@/repositories/members";
import { memberSchema } from "@/schemas/health";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  try {
    const id = z.uuid().parse((await context.params).id);
    const member = membersRepository().update(
      id,
      memberSchema.parse(await readJson(request)),
    );
    if (!member)
      throw new AppError("NOT_FOUND", "成员已不存在，请刷新页面", 404);
    return Response.json(member);
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    checkMutationOrigin(request);
    const id = z.uuid().parse((await context.params).id);
    if (!membersRepository().remove(id))
      throw new AppError("NOT_FOUND", "成员已不存在", 404);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
