import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";

const RECIPE_IMAGES_BUCKET = "recipe-images";
const RECIPE_IMAGE_MAX_BYTES = 2 * 1024 * 1024; // 2MB each
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

function isAllowedMime(mime: string): mime is (typeof ALLOWED_MIME)[number] {
  return (ALLOWED_MIME as readonly string[]).includes(mime);
}

function extFromMime(mime: string): string {
  const part = mime.split("/")[1] ?? "jpg";
  if (part === "jpeg") return "jpg";
  return part;
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const all = form.getAll("files");
  const files = all.filter((v): v is File => v instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: "Missing files" }, { status: 400 });
  }
  if (files.length > 3) {
    return NextResponse.json({ error: "Up to 3 images are allowed." }, { status: 400 });
  }

  const uploadedUrls: string[] = [];
  const now = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!isAllowedMime(file.type)) {
      return NextResponse.json(
        { error: "Use JPEG, PNG, WebP, or GIF images." },
        { status: 400 }
      );
    }
    if (file.size > RECIPE_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        { error: `Image must be under ${Math.floor(RECIPE_IMAGE_MAX_BYTES / (1024 * 1024))} MB.` },
        { status: 400 }
      );
    }

    const ext = extFromMime(file.type);
    const path = `${userId}/recipes/${now}-${i}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await db.storage
      .from(RECIPE_IMAGES_BUCKET)
      .upload(path, buffer, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600",
      });

    if (uploadError) {
      const hint = uploadError.message?.toLowerCase().includes("bucket")
        ? ' Create a public bucket named "recipe-images" in Supabase Storage.'
        : "";
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}.${hint}` },
        { status: 500 }
      );
    }

    const { data: pub } = db.storage.from(RECIPE_IMAGES_BUCKET).getPublicUrl(path);
    uploadedUrls.push(pub.publicUrl);
  }

  return NextResponse.json({
    ok: true,
    urls: uploadedUrls,
    bustUrls: uploadedUrls.map((u) => `${u}?t=${Date.now()}`),
  });
}

