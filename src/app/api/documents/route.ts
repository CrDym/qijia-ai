import { z } from "zod";
import { CATEGORIES } from "@/schemas/document";
import { documentsRepository } from "@/repositories/documents";
import { errorResponse } from "@/lib/api";
import { readDocumentWrite } from "@/services/files/read-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = z
      .string()
      .max(200)
      .parse(params.get("q") || "")
      .trim();
    const category = z
      .enum(CATEGORIES)
      .optional()
      .parse(params.get("category") || undefined);
    const memberId = z
      .uuid()
      .optional()
      .parse(params.get("memberId") || undefined);
    return Response.json(
      documentsRepository().list(query, category, memberId),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { data, attachment } = await readDocumentWrite(request);
    return Response.json(documentsRepository().create(data, attachment), {
      status: 201,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
