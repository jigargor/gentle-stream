export interface AdminIdentity {
  userId: string;
  email: string | null;
}

function parseCsvEnv(value: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!value) return out;
  for (const part of value.split(",")) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;
    out.add(trimmed);
  }
  return out;
}

export function isAdmin(identity: AdminIdentity): boolean {
  const adminUserIds = parseCsvEnv(process.env.ADMIN_USER_IDS);
  const adminEmails = parseCsvEnv(process.env.ADMIN_EMAILS);
  if (adminUserIds.has(identity.userId.toLowerCase())) return true;
  if (identity.email && adminEmails.has(identity.email.toLowerCase())) return true;
  return false;
}
