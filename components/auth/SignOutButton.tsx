"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void signOut()}
      style={{
        background: "transparent",
        border: "1px solid #999",
        color: "#555",
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "0.62rem",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        padding: "0.2rem 0.5rem",
        cursor: busy ? "wait" : "pointer",
        marginLeft: "0.5rem",
      }}
    >
      {busy ? "…" : "Sign out"}
    </button>
  );
}
