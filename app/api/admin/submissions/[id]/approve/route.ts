import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { reviewSubmission } from "@/lib/db/creator";

export async function POST(
  request: NextRequest,
  context: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin({ userId: user.id, email: user.email ?? null })) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    adminNote?: unknown;
  };
  const adminNote =
    typeof body.adminNote === "string" && body.adminNote.trim()
      ? body.adminNote.trim().slice(0, 500)
      : null;

  try {
    const reviewed = await reviewSubmission({
      submissionId: context.params.id,
      reviewerUserId: user.id,
      action: "approve",
      adminNote,
      rejectionReason: null,
    });
    return NextResponse.json(reviewed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("pending")
      ? 409
      : message.includes("not found")
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
