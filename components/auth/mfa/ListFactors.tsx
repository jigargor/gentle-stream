"use client";

export interface MfaFactorRow {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string | null;
  phone?: string | null;
}

interface ListFactorsProps {
  factors: MfaFactorRow[];
  onUnenroll: (factorId: string) => Promise<void>;
  busyFactorId?: string | null;
}

function factorLabel(factor: MfaFactorRow): string {
  if (factor.factor_type === "totp") return "Authenticator app";
  if (factor.factor_type === "phone") return "Phone code";
  return factor.factor_type;
}

export function ListFactors({ factors, onUnenroll, busyFactorId }: ListFactorsProps) {
  if (factors.length === 0) {
    return (
      <p style={{ margin: "0.35rem 0 0", color: "#777", fontSize: "0.86rem" }}>
        No MFA factors enrolled yet.
      </p>
    );
  }

  return (
    <ul
      style={{
        listStyle: "none",
        margin: "0.5rem 0 0",
        padding: 0,
        display: "grid",
        gap: "0.45rem",
      }}
    >
      {factors.map((factor) => {
        const pending = busyFactorId === factor.id;
        const isPhoneFactor = factor.factor_type === "phone";
        const removeDisabled = pending || isPhoneFactor;
        return (
          <li
            key={factor.id}
            style={{
              border: "1px solid #d8d2c7",
              background: "#fff",
              padding: "0.6rem 0.65rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem" }}>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontWeight: 700,
                    fontSize: "0.88rem",
                    color: "#1a1a1a",
                  }}
                >
                  {factor.friendly_name?.trim() || factorLabel(factor)}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#666", marginTop: "0.15rem" }}>
                  Type: {factorLabel(factor)} · Status: {factor.status}
                  {factor.phone ? ` · ${factor.phone}` : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={removeDisabled}
                onClick={() => {
                  if (removeDisabled) return;
                  void onUnenroll(factor.id);
                }}
                style={{
                  alignSelf: "flex-start",
                  border: "1px solid #8b4513",
                  background: "#fff8f0",
                  color: "#8b4513",
                  padding: "0.35rem 0.55rem",
                  cursor: removeDisabled ? "not-allowed" : "pointer",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.72rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {isPhoneFactor ? "Disabled" : pending ? "Removing..." : "Remove"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

