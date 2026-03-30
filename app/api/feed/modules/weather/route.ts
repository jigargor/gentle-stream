import { NextRequest, NextResponse } from "next/server";
import { getWeatherFillerData } from "@/lib/feed/modules/weather";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  try {
    const location = request.nextUrl.searchParams.get("location");
    const category = request.nextUrl.searchParams.get("category");
    const latRaw = request.nextUrl.searchParams.get("lat");
    const lonRaw = request.nextUrl.searchParams.get("lon");
    const debug = request.nextUrl.searchParams.get("debug") === "1";
    const lat = latRaw != null ? Number.parseFloat(latRaw) : undefined;
    const lon = lonRaw != null ? Number.parseFloat(lonRaw) : undefined;
    const data = await getWeatherFillerData({
      location,
      category,
      lat: Number.isFinite(lat ?? Number.NaN) ? lat : undefined,
      lon: Number.isFinite(lon ?? Number.NaN) ? lon : undefined,
    });
    if (debug) {
      return NextResponse.json({
        data,
        debug: {
          mode: data.mode,
          hasWeatherPayload:
            data.mode === "weather" &&
            typeof data.temperatureC === "number" &&
            typeof data.humidity === "number" &&
            typeof data.windKph === "number",
        },
      });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to resolve weather module.",
      },
      { status: 500 }
    );
  }
}
