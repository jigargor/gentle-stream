import { NextRequest, NextResponse } from "next/server";
import { internalErrorResponse } from "@/lib/api/errors";
import { isCreatorAccessDenied, requireCreatorAccess } from "@/lib/auth/creator-security";
import { listCreatorProviderKeys } from "@/lib/db/creatorStudio";

export async function GET(request: NextRequest) {
  try {
    const access = await requireCreatorAccess(request, { requireMfa: true });
    if (isCreatorAccessDenied(access)) return access;

    const keys = await listCreatorProviderKeys(access.userId);
    const providers = ["anthropic", "openai", "gemini"].map((provider) => {
      const key = keys.find((entry) => entry.provider === provider);
      return {
        provider,
        status: key?.status ?? "missing",
        configured: Boolean(key),
        lastUsedAt: key?.lastUsedAt ?? null,
      };
    });
    return NextResponse.json({ providers });
  } catch (error: unknown) {
    return internalErrorResponse({ request, error });
  }
}
