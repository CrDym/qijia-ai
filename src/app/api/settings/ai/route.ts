import {
  checkMutationOrigin,
  errorResponse,
  readJson,
} from "../../../../lib/api.ts";
import {
  getAISettingsStatus,
  resetAISettings,
  saveAISettings,
} from "../../../../services/ai/configuration.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function GET() {
  try {
    return noStore(Response.json(getAISettingsStatus()));
  } catch (error) {
    return noStore(errorResponse(error));
  }
}

export async function PUT(request: Request) {
  try {
    return noStore(Response.json(saveAISettings(await readJson(request))));
  } catch (error) {
    return noStore(errorResponse(error));
  }
}

export function DELETE(request: Request) {
  try {
    checkMutationOrigin(request);
    return noStore(Response.json(resetAISettings()));
  } catch (error) {
    return noStore(errorResponse(error));
  }
}
