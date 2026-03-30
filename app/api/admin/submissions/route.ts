import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { listSubmissionsForAdmin } from "@/lib/db/creator";
import type { ArticleSubmissionStatus } from "@/lib/types";

function parseStatus(value: string | null): ArticleSubmissionStatus | undefined {
  if (
    value === "pending" ||
    value === "changes_requested" ||
    value === "approved" ||
    value === "rejected" ||
    value === "withdrawn"
  ) {
    return value;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
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

  const status = parseStatus(new URL(request.url).searchParams.get("status"));
  const submissions = await listSubmissionsForAdmin(status);
  return NextResponse.json({ submissions });
}
