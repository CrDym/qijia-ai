import { errorResponse, readJson } from "@/lib/api";
import { membersRepository } from "@/repositories/members";
import { memberSchema } from "@/schemas/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(membersRepository().list(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    return Response.json(
      membersRepository().create(memberSchema.parse(await readJson(request))),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
