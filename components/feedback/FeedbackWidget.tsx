"use client";

import { useCallback, useState } from "react";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const submit = useCallback(async () => {
    const trimmed = message.trim();
    if (trimmed.length < 1) return;
    setStatus("sending");
    try {
      const pageUrl =
        typeof window !== "undefined" ? window.location.href.slice(0, 2000) : undefined;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          message: trimmed,
          pageUrl: pageUrl ?? undefined,
          contactEmail: contactEmail.trim() || null,
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("sent");
      setMessage("");
      setContactEmail("");
    } catch {
      setStatus("error");
    }
  }, [message, contactEmail]);

  return (
    <div
      className="pointer-events-none fixed right-3 top-3 z-[100] flex max-w-[min(100vw-1.5rem,18rem)] flex-col items-end gap-2 sm:right-4 sm:top-4"
      aria-live="polite"
    >
      {open ? (
        <div
          className="pointer-events-auto w-full rounded-lg border border-[#c8d8c8] bg-[#fafcf8] p-3 shadow-md"
          style={{ fontFamily: "system-ui, sans-serif" }}
        >
          <p
            className="mb-2 text-[0.7rem] uppercase tracking-wide text-[#555]"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Send feedback
          </p>
          <label htmlFor="gs-feedback-msg" className="sr-only">
            Message
          </label>
          <textarea
            id="gs-feedback-msg"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (status === "sent" || status === "error") setStatus("idle");
            }}
            rows={4}
            maxLength={4000}
            placeholder="What would help?"
            className="mb-2 w-full resize-y rounded border border-[#d0ddd0] bg-white px-2 py-1.5 text-[0.85rem] text-[#1a1a1a] placeholder:text-[#888]"
          />
          <label htmlFor="gs-feedback-email" className="sr-only">
            Email (optional)
          </label>
          <input
            id="gs-feedback-email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Email (optional, for follow-up)"
            autoComplete="email"
            className="mb-2 w-full rounded border border-[#d0ddd0] bg-white px-2 py-1 text-[0.8rem] text-[#1a1a1a] placeholder:text-[#888]"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={status === "sending" || message.trim().length < 1}
              className="rounded bg-[#1a472a] px-3 py-1.5 text-[0.8rem] font-semibold text-white disabled:opacity-50"
            >
              {status === "sending" ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setStatus("idle");
              }}
              className="text-[0.75rem] text-[#555] underline underline-offset-2"
            >
              Close
            </button>
          </div>
          {status === "sent" ? (
            <p className="mt-2 text-[0.75rem] text-[#1a472a]">Thanks — we received it.</p>
          ) : null}
          {status === "error" ? (
            <p className="mt-2 text-[0.75rem] text-[#8b2942]">Could not send. Try again later.</p>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (status === "sent") setStatus("idle");
        }}
        className="pointer-events-auto rounded-full border border-[#b8c8b8] bg-[#f4f8f4]/95 px-3 py-1.5 text-[0.72rem] font-medium text-[#2a3d2a] shadow-sm backdrop-blur-sm transition hover:bg-[#eaf2ea]"
        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        aria-expanded={open}
      >
        Feedback
      </button>
    </div>
  );
}
