"use client";

import { useMemo, useState } from "react";
import type { TodoModuleData } from "@/lib/types";

interface TodoCardProps {
  data: TodoModuleData;
  reason: "gap" | "interval" | "singleton";
}

export default function TodoCard({ data, reason }: TodoCardProps) {
  const [items, setItems] = useState(data.items);
  const [newItemLabel, setNewItemLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const reasonLabel =
    reason === "singleton" ? null : reason === "gap" ? "gap-fill" : "interval";
  const completion = useMemo(() => {
    if (items.length === 0) return 0;
    const done = items.filter((item) => item.done).length;
    return Math.round((done / items.length) * 100);
  }, [items]);

  async function syncAction(body: Record<string, unknown>) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    const res = await fetch("/api/feed/modules/todo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ timezone, ...body }),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      data?: TodoModuleData;
    };
    if (!res.ok || !payload.data) throw new Error("Todo sync failed");
    setItems(payload.data.items);
  }

  return (
    <section
      className="gs-card-lift"
      style={{
        borderTop: "3px double var(--gs-ink-strong)",
        borderBottom: "2px solid var(--gs-ink-strong)",
        borderLeft: "1px solid var(--gs-border)",
        borderRight: "1px solid var(--gs-border)",
        borderRadius: "var(--gs-radius-sm)",
        background: "var(--gs-surface-soft)",
        padding: "0.95rem 1rem",
        boxShadow: "0 8px 20px rgba(20, 15, 10, 0.08)",
      }}
      aria-label="Daily to-do module"
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
          borderBottom: "1px solid var(--gs-border)",
          paddingBottom: "0.4rem",
          marginBottom: "0.75rem",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            letterSpacing: "0.01em",
            fontSize: "1.03rem",
            color: "#1f1f1f",
          }}
        >
          {data.title}
        </h3>
        {reasonLabel ? (
          <span
            style={{
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.67rem",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#746a55",
            }}
          >
            {reasonLabel}
          </span>
        ) : null}
      </header>
      <p
        style={{
          margin: "0 0 0.5rem",
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          color: "#4f463b",
          fontSize: "0.9rem",
        }}
      >
        {data.subtitle} {completion}% complete.
      </p>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.35rem" }}>
        {items.map((item) => (
          <li key={item.id}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.42rem" }}>
              <input
                type="checkbox"
                checked={item.done}
                disabled={busyId === item.id}
                onChange={async (event) => {
                  setBusyId(item.id);
                  try {
                    await syncAction({
                      action: "toggle",
                      todoId: item.id,
                      done: event.target.checked,
                    });
                  } catch {
                    /* ignore transient failures */
                  } finally {
                    setBusyId(null);
                  }
                }}
              />
              <span
                style={{
                  textDecoration: item.done ? "line-through" : "none",
                  opacity: item.done ? 0.64 : 1,
                  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                  fontSize: "0.8rem",
                  color: "#3f3a30",
                }}
              >
                {item.label}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: "0.55rem", display: "flex", gap: "0.35rem" }}>
        <input
          value={newItemLabel}
          onChange={(event) => setNewItemLabel(event.target.value)}
          placeholder="Add a to-do..."
          style={{
            border: "1px solid var(--gs-border)",
            borderRadius: "var(--gs-radius-sm)",
            padding: "0.26rem 0.4rem",
            flex: 1,
            minWidth: 0,
          }}
        />
        <button
          type="button"
          onClick={async () => {
            const label = newItemLabel.trim();
            if (!label) return;
            try {
              await syncAction({
                action: "add",
                label,
              });
              setNewItemLabel("");
            } catch {
              /* ignore transient failures */
            }
          }}
          style={{
            border: "1px solid var(--gs-border-strong)",
            background: "var(--gs-surface-elevated)",
            borderRadius: "var(--gs-radius-pill)",
            cursor: "pointer",
            fontSize: "0.72rem",
            padding: "0.26rem 0.48rem",
          }}
        >
          Add
        </button>
      </div>
    </section>
  );
}
