import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { importRecipeFromUrl } from "@/lib/recipes/importer";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import {
  assertCreatorMutationOrigin,
  isCreatorAccessDenied,
  requireCreatorAccess,
} from "@/lib/auth/creator-security";

export const runtime = "nodejs";

function parseAllowlist(): string[] {
  const raw = process.env.RECIPE_IMPORT_ALLOWLIST ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const recipeImportBodySchema = z.object({
  url: z.string().trim().url(),
});

export async function POST(request: NextRequest) {
  const originError = assertCreatorMutationOrigin(request);
  if (originError) return originError;
  const access = await requireCreatorAccess(request, { requireMfa: true });
  if (isCreatorAccessDenied(access)) return access;

  const allowlist = parseAllowlist();
  if (allowlist.length === 0) {
    return apiErrorResponse({
      request,
      status: 503,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Recipe import is not configured. Missing RECIPE_IMPORT_ALLOWLIST.",
    });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: recipeImportBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  try {
    const recipe = await importRecipeFromUrl({
      url: body.url,
      allowlist,
      enableClaudeFallback:
        process.env.RECIPE_IMPORT_ENABLE_CLAUDE_FALLBACK === "1",
    });
    return NextResponse.json({ recipe });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown import error";
    const status =
      message.toLowerCase().includes("allowlist") ||
      message.toLowerCase().includes("private ip") ||
      message.toLowerCase().includes("http:// and https://")
        ? 400
        : message.toLowerCase().includes("403") ||
            message.toLowerCase().includes("blocked automated access")
          ? 422
        : message.toLowerCase().includes("could not confidently")
          ? 422
          : 500;
    const code =
      status === 400
        ? API_ERROR_CODES.VALIDATION
        : status === 422
          ? API_ERROR_CODES.INVALID_REQUEST
          : API_ERROR_CODES.INTERNAL;
    return apiErrorResponse({
      request,
      status,
      code,
      message,
    });
  }
}

