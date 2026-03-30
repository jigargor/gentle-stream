import { NextResponse } from "next/server";
import { getApodModuleData } from "@/lib/feed/modules/apod";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

export async function GET(request: Request) {
  try {
    const data = await getApodModuleData();
    return NextResponse.json({ data });
  } catch (e) {
    const message = e instanceof Error ? e.message : "APOD fetch failed";
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
