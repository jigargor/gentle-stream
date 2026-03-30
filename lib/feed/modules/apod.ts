import type { NasaModuleData } from "@/lib/types";
import { picsumFallbackUrl } from "@/lib/article-image";

interface NasaApodJson {
  title?: string;
  explanation?: string;
  url?: string;
  hdurl?: string;
  media_type?: string;
  thumbnail_url?: string;
  date?: string;
}

/**
 * NASA Astronomy Picture of the Day. Uses NASA_API_KEY when set, otherwise DEMO_KEY (rate-limited).
 */
export async function getApodModuleData(): Promise<NasaModuleData> {
  const key = process.env.NASA_API_KEY?.trim() || "DEMO_KEY";
  const url = `https://api.nasa.gov/planetary/apod?api_key=${encodeURIComponent(key)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as NasaApodJson;
    const title = j.title?.trim() || "Astronomy Picture of the Day";
    const mediaType = j.media_type === "video" ? "video" : "image";
    const imageUrl =
      mediaType === "video"
        ? j.thumbnail_url?.trim() || j.url?.trim()
        : j.hdurl?.trim() || j.url?.trim();
    const explanation = j.explanation?.trim() ?? "";
    const subtitle =
      explanation.length > 260 ? `${explanation.slice(0, 257)}…` : explanation;
    return {
      mode: "nasa",
      title,
      subtitle: subtitle || "NASA Astronomy Picture of the Day.",
      imageUrl: imageUrl || undefined,
      sourceUrl: j.url?.trim() || "https://apod.nasa.gov/apod/",
      mediaType,
      date: j.date,
    };
  } catch {
    return {
      mode: "fallback",
      title: "Night sky",
      subtitle: "NASA APOD is unavailable right now — try again later.",
      imageUrl: picsumFallbackUrl("nasa-apod-fallback", 1200, 700),
      sourceUrl: "https://apod.nasa.gov/apod/",
    };
  }
}
